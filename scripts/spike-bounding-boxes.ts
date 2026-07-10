/**
 * THROWAWAY SPIKE — Phase 03 Plan 01, Task 2 (checkpoint:human-verify).
 *
 * DELETE THIS FILE after 03-BOUNDING-BOX-CONTRACT.md is confirmed. It lives
 * under scripts/ (NOT src/) intentionally: it is not part of the server build
 * (tsconfig.server.json includes only src/server) and never ships.
 *
 * Purpose: drive the two new OnshapeClient methods (getBoundingBoxes and
 * getAssemblyBoundingBoxes) against a REAL Onshape document so a human can
 * confirm the live-unverified assumptions this phase's perimeter/height
 * checks rest on (03-RESEARCH.md Open Questions 1/2, Assumptions A1/A2/A3/A4):
 *
 *   A1. The per-part getBoundingBoxes endpoint returns corners in the Part
 *       Studio's LOCAL coordinate system, requiring Fact.transform to be
 *       applied to reach the part's true assembly (world) position.
 *   A2. The assembly-level getAssemblyBoundingBoxes endpoint is already in
 *       world space (the assembly IS the top-level/world coordinate frame)
 *       -- no transform needed.
 *   A3. The transform array is row-major with translation in column 3 of
 *       each row (world = m[0..2]*[x,y,z] + m[3], etc.).
 *   A4. Bounding-box coordinate values are SI meters (same convention as
 *       mass-properties' kg/m^3), so a *39.37007874 conversion is required
 *       to compare against inch-based season limits.
 *
 * ── How to run ────────────────────────────────────────────────────────────
 * This reuses Phase 1's OAuth plumbing (createOnshapeClient + callWithRefresh).
 * You need a live Onshape access token for an account that can open the target
 * document, and a document that contains AT LEAST ONE FRAME_-tagged part
 * positioned OFF the assembly origin (so a coordinate-frame mistake is
 * numerically obvious, not masked by coincidental symmetry).
 *
 *   1. Get an access token. Easiest: run the app (`npm run dev`), connect via the
 *      OAuth flow in the panel, then read `req.session.accessToken` (e.g. add a
 *      temporary console.log in check.routes.ts, or inspect the session store).
 *   2. Export the values and run with Node's TS stripping (same flags as `dev`):
 *
 *      ONSHAPE_ACCESS_TOKEN=<token> \
 *      ONSHAPE_REFRESH_TOKEN=<optional-refresh-token> \
 *      SPIKE_DOCUMENT_ID=<did> \
 *      SPIKE_WORKSPACE_ID=<wid> \
 *      SPIKE_ELEMENT_ID=<optional-assembly-element-id> \
 *      SPIKE_FRAME_PART_ID=<optional-specific-FRAME_-partid> \
 *      node --experimental-strip-types scripts/spike-bounding-boxes.ts
 *
 *   ONSHAPE_CLIENT_ID / ONSHAPE_CLIENT_SECRET are read from .env (via dotenv)
 *   so the 401->refresh path works if the access token has expired.
 * ───────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import {
  createOnshapeClient,
  type OnshapeClientEnv,
  type BoundingBoxResponse,
} from "../src/server/onshape-client/client.ts";
import type { RefreshableSession } from "../src/server/auth/refresh.ts";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

/** Source: 03-RESEARCH.md Code Examples "Enumerating the 8 corners of a
 * BTBoundingBoxInfo". All fields are optional -- an absent field must be
 * treated as UNRESOLVED, never defaulted to 0. */
function cornersOf(box: BoundingBoxResponse): Array<[number, number, number]> | undefined {
  const { lowX, lowY, lowZ, highX, highY, highZ } = box;
  if ([lowX, lowY, lowZ, highX, highY, highZ].some((v) => v === undefined)) return undefined;
  const xs = [lowX!, highX!];
  const ys = [lowY!, highY!];
  const zs = [lowZ!, highZ!];
  const corners: Array<[number, number, number]> = [];
  for (const x of xs) for (const y of ys) for (const z of zs) corners.push([x, y, z]);
  return corners;
}

/** Source: 03-RESEARCH.md Code Examples "Applying the occurrence transform
 * to a bounding-box corner" (forum.onshape.com/discussion/19505, row-major,
 * translation in column 3 of each row). VERIFY against this spike's output
 * before trusting in production (Assumption A3). */
function transformPoint(m: number[], [x, y, z]: [number, number, number]): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ];
}

const M_TO_IN = 39.37007874;

async function main(): Promise<void> {
  const accessToken = requireEnv("ONSHAPE_ACCESS_TOKEN");
  const documentId = requireEnv("SPIKE_DOCUMENT_ID");
  const workspaceId = requireEnv("SPIKE_WORKSPACE_ID");
  const refreshToken = process.env.ONSHAPE_REFRESH_TOKEN;
  const explicitElementId = process.env.SPIKE_ELEMENT_ID;
  const explicitFramePartId = process.env.SPIKE_FRAME_PART_ID;

  const env: OnshapeClientEnv = {
    clientID: process.env.ONSHAPE_CLIENT_ID ?? "",
    clientSecret: process.env.ONSHAPE_CLIENT_SECRET ?? "",
  };

  // Reuse the exact Phase 1/2 session shape + client factory. The session is
  // a plain object here (no express-session) -- createOnshapeClient only
  // needs the RefreshableSession structural contract.
  const session: RefreshableSession = {
    accessToken,
    refreshToken,
    needsReconnect: false,
  };
  const client = createOnshapeClient(session, env);

  console.log("=== 1. Assembly definition (find a FRAME_ part + its transform) ===");
  const elements = await client.getElementsInDocument(documentId, workspaceId);
  const assembly = explicitElementId
    ? elements.find((el) => el.id === explicitElementId)
    : elements.find((el) => el.elementType === "ASSEMBLY");

  if (!assembly?.id) {
    console.error(
      "No ASSEMBLY element found in this document (or SPIKE_ELEMENT_ID did not match). " +
        "This spike requires an assembly with at least one occurrence.",
    );
    process.exit(1);
  }
  const elementId = assembly.id;
  console.log(`Assembly element: ${elementId} (${assembly.name ?? "unnamed"})`);

  const definition = await client.getAssemblyDefinition(documentId, "w", workspaceId, elementId);
  const parts = (definition as { parts?: Array<Record<string, unknown>> }).parts ?? [];
  const occurrences =
    (definition as { rootAssembly?: { occurrences?: Array<{ path?: string[]; transform?: number[] }> } })
      .rootAssembly?.occurrences ?? [];

  console.log(`definition.parts[] length: ${parts.length}`);
  console.log(`rootAssembly.occurrences[] length: ${occurrences.length}`);

  // Pick a FRAME_-tagged part if one exists in this document's part metadata,
  // falling back to any part with a clear off-origin occurrence transform.
  let framePartId: string | undefined = explicitFramePartId;
  let frameElementId: string | undefined;
  let frameDocumentId: string | undefined;
  let frameConfiguration: string | undefined;

  if (!framePartId) {
    for (const p of parts) {
      const pid = p.partId as string | undefined;
      const pElementId = p.elementId as string | undefined;
      const pDocumentId = (p.documentId as string | undefined) ?? documentId;
      if (!pid || !pElementId) continue;
      try {
        const metadata = await client.getPartsMetadata(pDocumentId, "w", workspaceId, pElementId);
        const meta = metadata.find((m) => m.partId === pid);
        const name = (meta as { name?: string } | undefined)?.name ?? "";
        if (name.startsWith("FRAME_")) {
          framePartId = pid;
          frameElementId = pElementId;
          frameDocumentId = pDocumentId;
          frameConfiguration = p.configuration as string | undefined;
          console.log(`Found FRAME_-tagged part: partId=${pid} name=${name} elementId=${pElementId}`);
          break;
        }
      } catch (e) {
        console.log(`  (could not read metadata for partId=${pid}: ${(e as Error).message})`);
      }
    }
  }

  if (!framePartId) {
    // Fall back to the first part with a clear off-origin transform.
    const first = parts[0];
    if (first) {
      framePartId = first.partId as string | undefined;
      frameElementId = first.elementId as string | undefined;
      frameDocumentId = (first.documentId as string | undefined) ?? documentId;
      frameConfiguration = first.configuration as string | undefined;
      console.warn(
        `WARNING: No FRAME_-tagged part found -- falling back to first part in definition.parts[] ` +
          `(partId=${framePartId}). Results are still useful for confirming the coordinate frame, ` +
          `but re-run against a properly tagged document before finalizing the contract.`,
      );
    }
  }

  if (!framePartId || !frameElementId || !frameDocumentId) {
    console.error("Could not identify any part to test against. Aborting.");
    process.exit(1);
  }

  // Find this part's occurrence transform (RESEARCH: occurrences[].transform
  // is already-absolute/world-space, per official Onshape docs).
  const occurrence = occurrences.find((o) => o.path?.[o.path.length - 1] === framePartId);
  const transform = occurrence?.transform;
  if (!transform) {
    console.warn(
      "WARNING: could not find a matching occurrence transform for this part -- " +
        "the A1 world-space comparison below will be skipped.",
    );
  } else {
    console.log(`Occurrence transform (16 elements): ${JSON.stringify(transform)}`);
  }

  console.log(`\n=== 2. Per-part bounding box (getBoundingBoxes) for partId=${framePartId} ===`);
  const partBox = await client.getBoundingBoxes(
    frameDocumentId,
    "w",
    workspaceId,
    frameElementId,
    framePartId,
    frameConfiguration,
  );
  console.log("  raw box:", JSON.stringify(partBox));

  const corners = cornersOf(partBox);
  if (!corners) {
    console.error("  Box has undefined fields -- cannot proceed with corner/transform comparison.");
  } else {
    console.log(`  8 raw corners (local?): ${JSON.stringify(corners)}`);

    if (transform) {
      const worldCorners = corners.map((c) => transformPoint(transform, c));
      console.log(`  8 corners AFTER applying Fact.transform (world?): ${JSON.stringify(worldCorners)}`);
      console.log(
        "  => COMPARE these transformed corners against Onshape's UI-reported part position " +
          "(right-click part > 'Show bounding box' or read its origin in the Part Studio). " +
          "If they match the true assembly-space location, A1 (LOCAL, apply transform) is CONFIRMED. " +
          "If instead the RAW (untransformed) corners already match, the endpoint is already world-space " +
          "and A1 is WRONG -- do not apply the transform in production code.",
      );

      // Sanity-check A4 (units): print both meters and a plausible-inches
      // conversion so the human can eyeball which one matches the real part
      // size as displayed in Onshape's UI (which may show inches/mm/etc).
      const rawExtentIn = {
        x: Math.abs((partBox.highX ?? 0) - (partBox.lowX ?? 0)) * M_TO_IN,
        y: Math.abs((partBox.highY ?? 0) - (partBox.lowY ?? 0)) * M_TO_IN,
        z: Math.abs((partBox.highZ ?? 0) - (partBox.lowZ ?? 0)) * M_TO_IN,
      };
      console.log(
        `  Raw box extent, converted meters->inches (*${M_TO_IN}): ` +
          `x=${rawExtentIn.x.toFixed(3)}in y=${rawExtentIn.y.toFixed(3)}in z=${rawExtentIn.z.toFixed(3)}in ` +
          "-- compare against the part's real-world dimensions to confirm A4 (SI meters).",
      );
    } else {
      console.log("  (skipping transform comparison -- no occurrence transform found for this part)");
    }
  }

  console.log(`\n=== 3. Assembly-level bounding box (getAssemblyBoundingBoxes) ===`);
  const assemblyBox = await client.getAssemblyBoundingBoxes(documentId, "w", workspaceId, elementId);
  console.log("  raw box:", JSON.stringify(assemblyBox));
  if (assemblyBox.highZ !== undefined) {
    const highZIn = assemblyBox.highZ * M_TO_IN;
    console.log(
      `  highZ = ${assemblyBox.highZ} (meters?) => ${highZIn.toFixed(3)}in ` +
        "-- compare against the robot's real starting-configuration height to confirm A2 (already world-space) and A4 (SI meters).",
    );
  } else {
    console.log("  highZ is undefined -- cannot evaluate A2/A4 from this document.");
  }

  console.log(
    "\n=== DONE ===\n" +
      "Record into 03-BOUNDING-BOX-CONTRACT.md:\n" +
      "  - A1: per-part endpoint = LOCAL (apply transform) OR already world\n" +
      "  - A2: is the assembly-level box already world-space?\n" +
      "  - A3: is the transform row-major with translation in column 3 (indices 3,7,11)?\n" +
      "  - A4: are box values SI meters (matches *39.37 -> plausible inches)?\n" +
      "If A1/A3 differ from the inferred layout, write the CORRECTED formula prominently\n" +
      "so Plan 02's transform-point.ts implements the confirmed version.\n" +
      "Then mark 03-RESEARCH.md Open Questions 1/2 resolved in place.",
  );
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});
