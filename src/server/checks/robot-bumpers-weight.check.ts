import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator, KG_TO_LB } from "./engine.ts";

const BATTERY_PREFIX = "BATTERY_";

/**
 * R408: Robot Weight (including bumpers), WGHT-04.
 *
 * An independently-filtered occurrence computation (D-05) -- deliberately a
 * near-duplicate of robotWeightCheck (R103) with a narrower exclusion set,
 * NOT R103's number relabeled. Only BATTERY_-prefixed parts are excluded;
 * BUMPER_ parts are intentionally INCLUDED.
 *
 * Per-verdict gating (D-09/D-10, WGHT-02) mirrors R103: any part in THIS
 * check's own included set (which now includes bumpers) with a
 * KNOWN-missing material or an unresolved mass forces UNKNOWN. A BUMPER_
 * part with a material problem DOES affect this verdict -- the mirror
 * image of R103's per-verdict isolation, since bumpers are in R408's set.
 */
export const robotBumpersWeightCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R408");
  if (!entry) {
    throw new Error("robotBumpersWeightCheck requires an R408 entry in the season config");
  }

  const included = facts.filter((f) => !f.name.startsWith(BATTERY_PREFIX));

  const caveats: string[] = [];
  if (!facts.some((f) => f.name.startsWith(BATTERY_PREFIX))) {
    caveats.push("no BATTERY_ part found — battery mass may be included in this total.");
  }

  const untrusted = included.filter((f) => f.materialAssigned === false || f.massKg === undefined);

  if (untrusted.length > 0) {
    return {
      rule: entry.rule,
      title: entry.title,
      limit: entry.limit,
      unit: entry.unit,
      status: "UNKNOWN",
      affectedPartCount: untrusted.length,
      affectedParts: untrusted.map((f) => ({ name: f.name, path: f.path })),
      caveats,
    };
  }

  const totalKg = included.reduce((sum, f) => sum + (f.massKg as number), 0);
  const totalLb = totalKg * KG_TO_LB;

  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: passesOperator(entry, totalLb) ? "PASS" : "FAIL",
    measured: { lb: totalLb, kg: totalKg },
    caveats,
  };
};
