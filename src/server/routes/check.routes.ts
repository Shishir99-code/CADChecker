import { Router } from "express";
import { z } from "zod";
import { createOnshapeClient, type OnshapeClient, type OnshapeClientEnv } from "../onshape-client/client.ts";
import { ReconnectRequiredError } from "../auth/refresh.ts";
import { flattenAssembly } from "../traversal/flatten-assembly.ts";
import { loadSeasonConfig } from "../config/load-season.ts";
import { CheckEngine } from "../checks/engine.ts";
import { occurrenceCountCheck } from "../checks/occurrence-count.check.ts";
import { frameTagPresenceCheck } from "../checks/frame-tag-presence.check.ts";

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

      // (5-7) Shared traversal + config + engine (Plan 02 core, reused as-is).
      // The generated Onshape schema types every field optional; the shared
      // flattenAssembly() utility declares its own minimal, non-optional
      // structural type (Plan 02, network-free by design) -- cast through
      // `unknown` at this one integration seam rather than loosening either
      // module's own type for the other's sake.
      const facts = flattenAssembly(definition as unknown as Parameters<typeof flattenAssembly>[0]);
      const config = loadSeasonConfig(CURRENT_SEASON);
      const engine = buildEngine();
      const verdicts = engine.runAll(facts, config);

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
