import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SeasonConfigSchema, type SeasonConfig } from "./schema.ts";

// Resolve the repo root relative to this module's own location so the loader
// works regardless of process.cwd() at call time.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * Loads and validates a season's rule config by season key.
 *
 * The literal "rules/{season}.json" filename pattern must appear ONLY in
 * this function (RESEARCH Pitfall 5) — never inline a season filename
 * elsewhere, so year-over-year updates remain a data change, not a code
 * change.
 */
export function loadSeasonConfig(season: string): SeasonConfig {
  const path = join(REPO_ROOT, "rules", `${season}.json`);

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      `Season config not found for season "${season}" (expected file at rules/${season}.json)`,
    );
  }

  const parsed: unknown = JSON.parse(raw);
  return SeasonConfigSchema.parse(parsed);
}
