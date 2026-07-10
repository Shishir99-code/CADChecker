import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator, M_TO_IN } from "./engine.ts";

/**
 * The D-04/D-06 caveats every resolved (PASS/FAIL) height verdict MUST
 * carry: the +Z-up assumption and the measured-configuration disclosure.
 * Mirrors `framePerimeterCheck`'s STANDARD_CAVEATS discipline
 * (frame-perimeter.check.ts).
 */
const STANDARD_CAVEATS = [
  "assumes the robot is modeled with +Z up.",
  "measured the Default configuration — verify this is your starting configuration.",
];

/**
 * R104: Starting Configuration Height (GEOM-03).
 *
 * The whole-robot maximum +Z extent (ALL occurrences, D-05 -- NOT just
 * FRAME_ parts; bumpers/battery are never subtracted) read directly from the
 * single assembly-level bounding box's `highZ` (03-BOUNDING-BOX-CONTRACT.md
 * G3/A2 -- already world-space, no transform, no per-part enumeration),
 * converted meters->inches via the single `M_TO_IN` boundary (A4) and
 * compared against the R104 season limit.
 *
 * Gating (D-02 "prefer false FAIL over false PASS"): the route's 5d
 * enrichment copies the SAME `robotMaxZWorld` scalar onto every fact. If
 * it's undefined on every fact (including the empty-facts case), the
 * assembly-level box could not be read at all -- the verdict is UNKNOWN,
 * NEVER a substituted 0 height (T-03-08). The check stays pure/synchronous
 * -- all bbox fetching happens in check.routes.ts's 5d block before facts
 * arrive here.
 */
export const startingHeightCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R104");
  if (!entry) {
    throw new Error("startingHeightCheck requires an R104 entry in the season config");
  }

  if (facts.every((f) => f.robotMaxZWorld === undefined)) {
    return {
      rule: entry.rule,
      title: entry.title,
      limit: entry.limit,
      unit: entry.unit,
      status: "UNKNOWN",
      caveats: [
        "whole-robot height could not be measured — the assembly-level bounding box was unreadable.",
      ],
    };
  }

  // All facts carry the SAME whole-robot scalar (route 5d enrichment) --
  // read it from the first fact that has it.
  const robotMaxZWorld = facts.find((f) => f.robotMaxZWorld !== undefined)!.robotMaxZWorld as number;
  const heightInches = robotMaxZWorld * M_TO_IN;

  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: passesOperator(entry, heightInches) ? "PASS" : "FAIL",
    measuredCount: heightInches,
    caveats: STANDARD_CAVEATS,
  };
};
