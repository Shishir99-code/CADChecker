import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator } from "./engine.ts";
import { floorHull, hullPerimeterInches } from "../geometry/convex-hull.ts";

const FRAME_PREFIX = "FRAME_";

/**
 * The three caveats every non-empty-state perimeter verdict MUST carry
 * (D-02/D-04/D-06). Attached to PASS/FAIL and the "insufficient geometry"
 * UNKNOWN branch -- NOT the SC4 empty-state branch, which has its own exact
 * wording and no hull was attempted.
 */
const STANDARD_CAVEATS = [
  "perimeter measured from part bounding boxes and may read slightly high; a FAIL just over the limit warrants a manual re-check.",
  "assumes the robot is modeled with +Z up.",
  "measured the Default configuration — verify this is your starting configuration.",
  "limit value per R104 (STARTING CONFIGURATION — max size); R101 defines the ROBOT PERIMETER measurement method.",
];

/**
 * R101: Frame Perimeter (GEOM-01).
 *
 * Builds the 2D convex hull of the floor-projected (D-04: drop Z) world-
 * space bounding-box corners of every `FRAME_`-tagged part occurrence
 * (D-01 -- per-part bbox corners, never a single whole-robot bounding box)
 * and compares its perimeter (converted meters->inches) against the
 * R101/R104 season limit (RESEARCH Pitfall 5: R101 defines the measurement,
 * R104 states the number).
 *
 * Gating (D-02 "prefer false FAIL over false PASS", mirrors WGHT-02):
 *   1. Zero FRAME_ facts -> UNKNOWN, SC4-exact wording, before any hull math
 *      (RESEARCH Pitfall 8 -- distinct from the "insufficient geometry"
 *      branch below).
 *   2. Any FRAME_ fact with `bboxCornersWorld === undefined` -> UNKNOWN --
 *      a dropped/unresolved part would otherwise SHRINK the hull and risk a
 *      false PASS (RESEARCH Pitfall 4).
 *   3. `floorHull` returns `null` (<3 unique projected points, RESEARCH
 *      Pitfall 7) -> a distinct UNKNOWN, "insufficient frame geometry".
 * The check stays pure/synchronous -- all bbox fetching + transform
 * enrichment happens in check.routes.ts's 5c block before facts arrive here.
 */
export const framePerimeterCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R101");
  if (!entry) {
    throw new Error("framePerimeterCheck requires an R101 entry in the season config");
  }

  const frameFacts = facts.filter((f) => f.name.startsWith(FRAME_PREFIX));

  if (frameFacts.length === 0) {
    return {
      rule: entry.rule,
      title: entry.title,
      limit: entry.limit,
      unit: entry.unit,
      status: "UNKNOWN",
      caveats: ["not yet checkable — no frame parts tagged"],
    };
  }

  const unresolved = frameFacts.filter((f) => f.bboxCornersWorld === undefined);
  if (unresolved.length > 0) {
    return {
      rule: entry.rule,
      title: entry.title,
      limit: entry.limit,
      unit: entry.unit,
      status: "UNKNOWN",
      affectedPartCount: unresolved.length,
      affectedParts: unresolved.map((f) => ({ name: f.name, path: f.path })),
      caveats: [
        `perimeter geometry could not be read for ${unresolved.length} part(s) — see affected parts`,
      ],
    };
  }

  const floorPoints = frameFacts.flatMap((f) => f.bboxCornersWorld as Array<[number, number, number]>);
  const hull = floorHull(floorPoints);
  if (!hull) {
    return {
      rule: entry.rule,
      title: entry.title,
      limit: entry.limit,
      unit: entry.unit,
      status: "UNKNOWN",
      caveats: ["insufficient frame geometry to compute a hull"],
    };
  }

  const perimeterInches = hullPerimeterInches(hull);

  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: passesOperator(entry, perimeterInches) ? "PASS" : "FAIL",
    measuredCount: perimeterInches,
    geometry: { hullVertices: hull },
    caveats: STANDARD_CAVEATS,
  };
};
