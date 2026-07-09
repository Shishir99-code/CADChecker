/**
 * THROWAWAY SPIKE — Phase 02 Plan 01, Task 2 (checkpoint:human-verify).
 *
 * DELETE THIS FILE after 02-MASS-PROPERTIES-CONTRACT.md is confirmed. It lives
 * under scripts/ (NOT src/) intentionally: it is not part of the server build
 * (tsconfig.server.json includes only src/server) and never ships.
 *
 * Purpose: drive the two new OnshapeClient methods (getPartStudioMassProperties
 * and getPartsMetadata), plus getAssemblyDefinition, against a REAL Onshape
 * document so a human can confirm the four live-unverified assumptions the whole
 * phase rests on (02-RESEARCH.md Open Questions 1-3, Assumptions A1/A2/A3,
 * Pitfalls 1 & 4):
 *
 *   1. definition.parts[] exists and each entry carries the join key
 *      (documentId / elementId / partId / configuration).
 *   2. bodies[partId].mass is a 3-element [nominal, +tol, -tol] array whose
 *      mass[0] is the nominal value (A1 / Open Q1).
 *   3. That nominal magnitude is SI kilograms regardless of document display
 *      units (A2 / Open Q2).
 *   4. getPartsMetadata returns each part with `material` PRESENT when assigned
 *      and ABSENT/undefined when unassigned — absence, not a substituted default
 *      density, is the unmaterialized signal (Pitfall 1).
 *
 * ── How to run ────────────────────────────────────────────────────────────
 * This reuses Phase 1's OAuth plumbing (createOnshapeClient + callWithRefresh).
 * You need a live Onshape access token for an account that can open the target
 * document, and a document that contains AT LEAST ONE part with NO material
 * assigned (in Onshape, leave a part's material unset or delete its assignment).
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
 *      node --experimental-strip-types scripts/spike-mass-properties.ts
 *
 *   ONSHAPE_CLIENT_ID / ONSHAPE_CLIENT_SECRET are read from .env (via dotenv)
 *   so the 401->refresh path works if the access token has expired.
 * ───────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import {
  createOnshapeClient,
  type OnshapeClientEnv,
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

async function main(): Promise<void> {
  const accessToken = requireEnv("ONSHAPE_ACCESS_TOKEN");
  const documentId = requireEnv("SPIKE_DOCUMENT_ID");
  const workspaceId = requireEnv("SPIKE_WORKSPACE_ID");
  const refreshToken = process.env.ONSHAPE_REFRESH_TOKEN;

  const env: OnshapeClientEnv = {
    clientID: process.env.ONSHAPE_CLIENT_ID ?? "",
    clientSecret: process.env.ONSHAPE_CLIENT_SECRET ?? "",
  };

  // Reuse the exact Phase 1 session shape + client factory. The session is a
  // plain object here (no express-session) — createOnshapeClient only needs the
  // RefreshableSession structural contract.
  const session: RefreshableSession = {
    accessToken,
    refreshToken,
    needsReconnect: false,
  };
  const client = createOnshapeClient(session, env);

  console.log("=== 1. Assembly definition (join key) ===");
  const elements = await client.getElementsInDocument(documentId, workspaceId);
  const assembly = elements.find((el) => el.elementType === "ASSEMBLY");
  const byElement = new Map<string, Array<Record<string, unknown>>>();
  if (!assembly?.id) {
    console.log(
      "No ASSEMBLY element in this document — skipping the assembly join-key section " +
        "(that's fine for a simple Part Studio test doc). See section 3 below.",
    );
  } else {
    const elementId = assembly.id;
    console.log(`Assembly element: ${elementId} (${assembly.name ?? "unnamed"})`);

    const definition = await client.getAssemblyDefinition(documentId, "w", workspaceId, elementId);

    // definition.parts[] is the ONLY source that carries documentId + elementId +
    // partId + configuration together. Confirm it exists and print each entry.
    const parts = (definition as { parts?: Array<Record<string, unknown>> }).parts ?? [];
    console.log(`\ndefinition.parts[] length: ${parts.length}`);
    for (const p of parts) {
      console.log(
        `  partId=${p.partId} documentId=${p.documentId} elementId=${p.elementId} ` +
          `configuration=${JSON.stringify(p.configuration)}`,
      );
    }
    if (parts.length === 0) {
      console.warn(
        "WARNING: definition.parts[] is empty — Open Q3 join-key assumption cannot be confirmed from this document.",
      );
    }

    // Group parts[] by owning Part Studio element ({documentId}:{elementId}), the
    // same grouping 02-02's merge step will use.
    for (const p of parts) {
      const key = `${p.documentId}:${p.elementId}`;
      const list = byElement.get(key) ?? [];
      list.push(p);
      byElement.set(key, list);
    }
  }

  console.log(`\n=== 2. Mass properties per Part Studio element (${byElement.size} element(s)) ===`);

  // Real assemblies reference parts from MANY documents. The assembly's own
  // workspace id only addresses part studios in the ASSEMBLY's document; using
  // it against a referenced document returns 403. Split accordingly.
  const sameDoc: Array<[string, Array<Record<string, unknown>>]> = [];
  const referenced: Array<[string, Array<Record<string, unknown>>]> = [];
  for (const entry of byElement) {
    const [did] = entry[0].split(":");
    (did === documentId ? sameDoc : referenced).push(entry);
  }
  console.log(
    `  same-document elements (workspace-addressable): ${sameDoc.length}  |  ` +
      `referenced (other documents): ${referenced.length}`,
  );

  // Reveal whether definition.parts[] carries a per-part version/microversion
  // that 02-02 could use to address referenced parts (m/{microversion}).
  if (referenced.length > 0) {
    const sample = referenced[0]![1][0]!;
    console.log("\n  [referenced-part raw keys]:", Object.keys(sample).join(", "));
    console.log("  [referenced-part sample json]:", JSON.stringify(sample));
  }

  const statusOf = (e: unknown): string => {
    const s = (e as { status?: number }).status;
    return s !== undefined ? `HTTP ${s}` : (e as { message?: string }).message ?? String(e);
  };

  let sawNominalMass = false;
  let sawUnmaterialized = false;

  console.log(`\n-- SAME-DOCUMENT part studios (should succeed) --`);
  for (const [key, groupParts] of sameDoc) {
    const [did, eid] = key.split(":");
    const partIds = groupParts.map((p) => String(p.partId));
    const config = groupParts[0]?.configuration as string | undefined;
    console.log(`\n-- element ${key} (partIds: ${partIds.join(", ")}) --`);
    try {
      const massInfo = await client.getPartStudioMassProperties(did!, "w", workspaceId, eid!, partIds, config);
      for (const partId of partIds) {
        const body = massInfo.bodies?.[partId];
        if (body?.mass) sawNominalMass = true;
        console.log(
          `  partId=${partId} mass=${JSON.stringify(body?.mass)} ` +
            `hasMass=${body?.hasMass} massMissingCount=${body?.massMissingCount}` +
            (body?.mass ? `  => mass[0] (nominal kg?) = ${body.mass[0]}` : ""),
        );
      }
      const metadata = await client.getPartsMetadata(did!, "w", workspaceId, eid!);
      for (const partId of partIds) {
        const meta = metadata.find((m) => m.partId === partId);
        const hasMaterial = !!meta?.material;
        if (!hasMaterial) sawUnmaterialized = true;
        console.log(
          `  partId=${partId} materialPresent=${hasMaterial} ` +
            `material=${JSON.stringify(meta?.material?.displayName ?? meta?.material?.id ?? null)}`,
        );
      }
    } catch (e) {
      console.log(`  SKIPPED — ${statusOf(e)}`);
    }
  }

  console.log(`\n-- REFERENCED-DOCUMENT part studios via v/{documentVersion} (probe first 5) --`);
  for (const [key, groupParts] of referenced.slice(0, 5)) {
    const [did, eid] = key.split(":");
    const partIds = groupParts.map((p) => String(p.partId));
    const version = String(groupParts[0]?.documentVersion ?? "");
    const config = groupParts[0]?.configuration as string | undefined;
    const shown = partIds.slice(0, 6);
    console.log(`\n-- element ${key} via v/${version} (partIds: ${shown.join(", ")}${partIds.length > 6 ? ", …" : ""}) --`);
    if (!version) {
      console.log("  no documentVersion on this part — skipping");
      continue;
    }
    try {
      const massInfo = await client.getPartStudioMassProperties(did!, "v", version, eid!, partIds, config);
      for (const partId of shown) {
        const body = massInfo.bodies?.[partId];
        if (body?.mass) sawNominalMass = true;
        console.log(
          `  partId=${partId} mass=${JSON.stringify(body?.mass)} hasMass=${body?.hasMass}` +
            (body?.mass ? `  => mass[0] (nominal kg?) = ${body.mass[0]}` : ""),
        );
      }
      const metadata = await client.getPartsMetadata(did!, "v", version, eid!);
      for (const partId of shown) {
        const meta = metadata.find((m) => m.partId === partId);
        console.log(
          `  partId=${partId} materialPresent=${!!meta?.material} ` +
            `material=${JSON.stringify(meta?.material?.displayName ?? meta?.material?.id ?? null)}`,
        );
      }
    } catch (e) {
      console.log(`  ${statusOf(e)} (version-addressed read failed too)`);
    }
  }

  console.log(`\n=== 3. Direct Part Studios in THIS document (owned same-doc test) ===`);
  const partStudios = elements.filter((el) => el.elementType === "PARTSTUDIO");
  console.log(`Found ${partStudios.length} Part Studio element(s) in this document.`);
  for (const ps of partStudios) {
    if (!ps.id) continue;
    console.log(`\n-- Part Studio ${ps.id} (${ps.name ?? "unnamed"}) --`);
    try {
      // No partId filter -> Onshape returns every body in the studio.
      const massInfo = await client.getPartStudioMassProperties(documentId, "w", workspaceId, ps.id);
      const bodies = massInfo.bodies ?? {};
      const bodyIds = Object.keys(bodies);
      console.log(`  mass bodies returned: ${bodyIds.length} [${bodyIds.join(", ")}]`);
      for (const bid of bodyIds) {
        const body = bodies[bid];
        if (body?.mass) sawNominalMass = true;
        console.log(
          `  partId=${bid} mass=${JSON.stringify(body?.mass)} hasMass=${body?.hasMass} ` +
            `massMissingCount=${body?.massMissingCount}` +
            (body?.mass ? `  => mass[0] (nominal kg?) = ${body.mass[0]}` : ""),
        );
      }
      const metadata = await client.getPartsMetadata(documentId, "w", workspaceId, ps.id);
      for (const m of metadata) {
        const hasMat = !!m.material;
        if (!hasMat) sawUnmaterialized = true;
        console.log(
          `  partId=${m.partId} materialPresent=${hasMat} ` +
            `material=${JSON.stringify(m.material?.displayName ?? m.material?.id ?? null)}`,
        );
      }
    } catch (e) {
      console.log(`  ${statusOf(e)}`);
    }
  }

  console.log(`\n=== 4. ASSEMBLY-level mass properties (whole-assembly total; Onshape resolves refs server-side) ===`);
  if (assembly?.id) {
    const url = `https://cad.onshape.com/api/assemblies/d/${documentId}/w/${workspaceId}/e/${assembly.id}/massproperties`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) {
        console.log(`  HTTP ${res.status} — assembly-level massproperties failed (even the server-side total was denied)`);
      } else {
        const body = (await res.json()) as {
          mass?: number[];
          hasMass?: boolean;
          massMissingCount?: number;
          centroid?: number[];
        };
        console.log("  raw (truncated):", JSON.stringify(body).slice(0, 500));
        if (body.mass) {
          sawNominalMass = true;
          console.log(`  => TOTAL assembly mass[0] (nominal kg?) = ${body.mass[0]}   full array: ${JSON.stringify(body.mass)}`);
          console.log(`     ~ ${(Number(body.mass[0]) * 2.2046226218).toFixed(2)} lb`);
        }
        console.log(`  hasMass=${body.hasMass} massMissingCount=${body.massMissingCount}` +
          (body.massMissingCount ? `  <- ${body.massMissingCount} part(s) had NO mass and are EXCLUDED from this total` : ""));
      }
    } catch (e) {
      console.log(`  ${statusOf(e)}`);
    }
  } else {
    console.log("  (no assembly element in this document — skipped)");
  }

  console.log(
    `\n  SUMMARY: nominal mass[] observed = ${sawNominalMass}; ` +
      `unmaterialized part found = ${sawUnmaterialized}`,
  );

  console.log(
    "\n=== DONE ===\n" +
      "Record into 02-MASS-PROPERTIES-CONTRACT.md:\n" +
      "  - nominal mass index (mass[0] or corrected)\n" +
      "  - mass unit (kg confirmed or corrected)\n" +
      "  - join key path (definition.parts[] -> partId)\n" +
      "  - material-absence rule (material present => assigned; absent => unmaterialized)\n" +
      "Then mark 02-RESEARCH.md Open Questions 1-3 resolved in place.",
  );
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});
