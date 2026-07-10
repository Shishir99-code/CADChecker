import { Router } from "express";
import { z } from "zod";
import { createOnshapeClient, OnshapeApiError, type OnshapeClient, type OnshapeClientEnv } from "../onshape-client/client.ts";
import { ReconnectRequiredError } from "../auth/refresh.ts";
import { flattenAssembly, groupPartsByElement } from "../traversal/flatten-assembly.ts";
import { loadSeasonConfig } from "../config/load-season.ts";
import { CheckEngine } from "../checks/engine.ts";
import { occurrenceCountCheck } from "../checks/occurrence-count.check.ts";
import { frameTagPresenceCheck } from "../checks/frame-tag-presence.check.ts";
import { materialAuditCheck } from "../checks/material-audit.check.ts";
import { robotWeightCheck } from "../checks/robot-weight.check.ts";
import { robotBumpersWeightCheck } from "../checks/robot-bumpers-weight.check.ts";
import { framePerimeterCheck } from "../checks/frame-perimeter.check.ts";
import { transformPoint } from "../geometry/transform-point.ts";

const CURRENT_SEASON = "2026";

const CheckRequestSchema = z.object({
  documentId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export interface CheckRouterOptions {
  onshapeEnv: OnshapeClientEnv;
  /**
   * Builds the session-scoped Onshape client. Defaults to
   * createOnshapeClient; overridable so tests can inject a fake client with
   * no network dependency (RESEARCH: keep the route handler's Onshape-facing
   * seam testable offline).
   */
  clientFactory?: (session: { accessToken?: string; refreshToken?: string; needsReconnect?: boolean }, env: OnshapeClientEnv) => OnshapeClient;
}

function buildEngine(): CheckEngine {
  const engine = new CheckEngine();
  engine.register(occurrenceCountCheck);
  engine.register(frameTagPresenceCheck);
  engine.register(materialAuditCheck);
  engine.register(robotWeightCheck);
  engine.register(robotBumpersWeightCheck);
  engine.register(framePerimeterCheck);
  return engine;
}

/**
 * POST /api/check -- re-derives live context, walks the assembly through the
 * shared traversal + engine + config, and returns a structured report (or a
 * distinct needsReconnect signal). CONN-02/CONN-03/RUN-01.
 */
export function createCheckRouter(options: CheckRouterOptions): Router {
  const router = Router();
  const clientFactory = options.clientFactory ?? createOnshapeClient;

  router.post("/api/check", async (req, res, next) => {
    // (1) Require an authenticated session.
    if (!req.session.accessToken) {
      res.status(401).json({ error: "Not authenticated. Connect to Onshape first." });
      return;
    }

    // (3, T-01-12) Validate the panel-supplied documentId/workspaceId shape
    // before using them in Onshape API path interpolation. The ELEMENT to
    // check is re-derived server-side below -- never trusted from the client
    // (T-01-11 / CONN-02).
    const parsed = CheckRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "documentId and workspaceId are required." });
      return;
    }
    const { documentId, workspaceId } = parsed.data;

    try {
      const client = clientFactory(req.session, options.onshapeEnv);

      // (3) Live context re-derivation at click time (CONN-02) -- this call
      // happens fresh on THIS request, never from a value cached at mount.
      const elements = await client.getElementsInDocument(documentId, workspaceId);
      const assembly = elements.find((el) => el.elementType === "ASSEMBLY");
      if (!assembly?.id) {
        res.status(404).json({ error: "No assembly found in the document." });
        return;
      }
      const elementId = assembly.id;

      // (4) Fetch the live assembly definition for the re-derived element.
      const definition = await client.getAssemblyDefinition(documentId, "w", workspaceId, elementId);
      if (!definition.rootAssembly) {
        res.status(502).json({ error: "Onshape returned an assembly definition with no rootAssembly." });
        return;
      }

      // (5) Shared traversal (Plan 02 core, reused as-is). The generated
      // Onshape schema types every field optional; the shared
      // flattenAssembly() utility declares its own minimal, non-optional
      // structural type (Plan 02, network-free by design) -- cast through
      // `unknown` at this one integration seam rather than loosening either
      // module's own type for the other's sake.
      const facts = flattenAssembly(definition as unknown as Parameters<typeof flattenAssembly>[0]);

      // (5b, NEW) Per-group (cross-document-aware) mass + material fetch and
      // merge onto facts BEFORE the engine runs -- checks stay pure/sync
      // (D-11 discretion). Every id used below (documentId/elementId/partIds,
      // including per-group documentVersion/documentMicroversion) is derived
      // exclusively from the server-fetched `definition.parts[]`, never from
      // req.body (continues T-01-11/CONN-02, T-02-01).
      //
      // The assembly's OWN document uses w/{workspaceId}; a referenced
      // document (part.documentId !== assemblyDocumentId) cannot be read via
      // the assembly's workspace and needs v/{documentVersion} (or
      // m/{documentMicroversion} fallback) addressing -- and may still 403 on
      // an other-owner's library (02-MASS-PROPERTIES-CONTRACT.md F3). Each
      // group's fetch pair is isolated in its own try/catch: a 401 is
      // re-thrown (never swallowed, so a wrapping refresh-and-retry still
      // gets a chance to fire); a ReconnectRequiredError (the session's
      // refresh itself failed) is also re-thrown -- swallowing it would hide
      // a genuinely broken session behind a misleading "unresolved parts"
      // result; any OTHER error (e.g. 403 on an unreadable referenced
      // document) is swallowed and the group's parts are left UNRESOLVED
      // (massKg/materialAssigned stay undefined -- NEVER 0/false) rather than
      // failing the whole /api/check (T-02-03).
      const assemblyDocumentId = documentId;
      const groups = groupPartsByElement(definition as unknown as Parameters<typeof groupPartsByElement>[0]);
      const massByPartId = new Map<string, number>();
      const materialByPartId = new Map<string, boolean>();

      for (const parts of groups.values()) {
        const first = parts[0];
        if (!first) continue;

        const { elementId: groupElementId, configuration } = first;
        const groupDocumentId = first.documentId;
        const partIds = parts.map((p) => p.partId);

        let wvm: string;
        let wvmid: string;
        if (groupDocumentId === assemblyDocumentId) {
          wvm = "w";
          wvmid = workspaceId;
        } else if (first.documentVersion) {
          wvm = "v";
          wvmid = first.documentVersion;
        } else if (first.documentMicroversion) {
          wvm = "m";
          wvmid = first.documentMicroversion;
        } else {
          // Referenced document with no addressable version -- reading it
          // through w/{workspaceId} would 403 anyway (F3); skip the fetch and
          // leave this group's parts UNRESOLVED.
          continue;
        }

        try {
          const [massInfo, metadata] = await Promise.all([
            client.getPartStudioMassProperties(groupDocumentId, wvm, wvmid, groupElementId, partIds, configuration),
            client.getPartsMetadata(groupDocumentId, wvm, wvmid, groupElementId),
          ]);
          for (const partId of partIds) {
            // Nominal index 0 of the [nominal, -tol, +tol] mass array
            // (contract rule 1). A part omitted from `bodies` (unmaterialized,
            // F1) yields `undefined` here -- do NOT `?? 0` this.
            const mass = massInfo.bodies?.[partId]?.mass?.[0];
            if (mass !== undefined) {
              massByPartId.set(partId, mass);
            }
            materialByPartId.set(partId, !!metadata.find((m) => m.partId === partId)?.material);
          }
        } catch (err) {
          if (err instanceof ReconnectRequiredError) {
            throw err;
          }
          if (err instanceof OnshapeApiError && err.status === 401) {
            throw err;
          }
          // Any other error (e.g. 403 on an unreadable other-owner referenced
          // document, F3) -- swallow it and leave this group's parts
          // UNRESOLVED. Never fail the whole /api/check for one bad group.
          continue;
        }
      }

      // (5c, NEW) Per-part FRAME_-tagged bounding-box fetch, transformed into
      // world space, merged onto facts BEFORE the engine runs (mirrors 5b's
      // enrichment-in-route pattern so framePerimeterCheck stays pure/sync).
      // Reuses the SAME `groups` map and the SAME wvm/wvmid derivation as 5b
      // (not re-derived) -- every id used below comes from
      // `definition`/`groups`, never `req.body` (continues T-01-11/CONN-02,
      // now T-03-03).
      const frameFactsById = new Map(
        facts.filter((f) => f.name.startsWith("FRAME_")).map((f) => [f.partId, f]),
      );
      const bboxByPartId = new Map<string, Array<[number, number, number]>>();

      for (const parts of groups.values()) {
        const first = parts[0];
        if (!first) continue;

        const framePartIds = parts.map((p) => p.partId).filter((id) => frameFactsById.has(id));
        if (framePartIds.length === 0) continue; // no FRAME_ parts in this group

        const { elementId: groupElementId, configuration } = first;
        const groupDocumentId = first.documentId;

        let wvm: string;
        let wvmid: string;
        if (groupDocumentId === assemblyDocumentId) {
          wvm = "w";
          wvmid = workspaceId;
        } else if (first.documentVersion) {
          wvm = "v";
          wvmid = first.documentVersion;
        } else if (first.documentMicroversion) {
          wvm = "m";
          wvmid = first.documentMicroversion;
        } else {
          // Referenced document with no addressable version -- same
          // discipline as 5b: skip the fetch, leave these FRAME_ parts
          // UNRESOLVED (never a substituted zero-size footprint).
          continue;
        }

        try {
          const boxes = await Promise.all(
            framePartIds.map((partId) =>
              client.getBoundingBoxes(groupDocumentId, wvm, wvmid, groupElementId, partId, configuration),
            ),
          );
          framePartIds.forEach((partId, i) => {
            const box = boxes[i];
            const fact = frameFactsById.get(partId);
            if (!box || !fact) return;
            // G4 (03-BOUNDING-BOX-CONTRACT.md): any absent lowX..highZ field
            // is UNRESOLVED -- never defaulted to 0 (a 0 would silently
            // shrink the hull). Leave this part's bboxByPartId entry unset.
            const { lowX, lowY, lowZ, highX, highY, highZ } = box;
            if (
              lowX === undefined ||
              lowY === undefined ||
              lowZ === undefined ||
              highX === undefined ||
              highY === undefined ||
              highZ === undefined
            ) {
              return;
            }
            const xs = [lowX, highX];
            const ys = [lowY, highY];
            const zs = [lowZ, highZ];
            const corners: Array<[number, number, number]> = [];
            for (const x of xs) for (const y of ys) for (const z of zs) corners.push([x, y, z]);
            // A1/A3 (contract): the per-part endpoint returns LOCAL
            // coordinates -- apply the FULL occurrence transform (rotation +
            // translation), never a translation-only shortcut.
            bboxByPartId.set(
              partId,
              corners.map((corner) => transformPoint(fact.transform, corner)),
            );
          });
        } catch (err) {
          if (err instanceof ReconnectRequiredError) {
            throw err;
          }
          if (err instanceof OnshapeApiError && err.status === 401) {
            throw err;
          }
          // Any other error (e.g. 403 on an unreadable other-owner referenced
          // document, mirrors F3) -- swallow it and leave this group's
          // FRAME_ parts UNRESOLVED. Never fail the whole /api/check.
          continue;
        }
      }

      // A Map.get miss yields undefined, so a part whose group was skipped or
      // failed gets massKg: undefined / materialAssigned: undefined --
      // UNRESOLVED, never a silent 0 kg / false (02-MASS-PROPERTIES-CONTRACT.md
      // F1/F2/F3). bboxCornersWorld follows the identical discipline (G4).
      const enrichedFacts = facts.map((f) => ({
        ...f,
        massKg: massByPartId.get(f.partId),
        materialAssigned: materialByPartId.get(f.partId),
        bboxCornersWorld: bboxByPartId.get(f.partId),
      }));

      // (6) Config + engine (Plan 02 core, reused as-is) -- now over
      // enrichedFacts.
      const config = loadSeasonConfig(CURRENT_SEASON);
      const engine = buildEngine();
      const verdicts = engine.runAll(enrichedFacts, config);

      // (8) Structured, rule-cited report.
      res.status(200).json({
        measuredContext: { documentId, workspaceId, elementId },
        verdicts,
      });
    } catch (err) {
      if (err instanceof ReconnectRequiredError) {
        // D-05: a refresh failure must be distinct from a check-failure
        // verdict and must never surface as a 500.
        res.status(200).json({ needsReconnect: true });
        return;
      }
      next(err);
    }
  });

  return router;
}
