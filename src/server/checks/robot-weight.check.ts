import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator, KG_TO_LB } from "./engine.ts";

const BUMPER_PREFIX = "BUMPER_";
const BATTERY_PREFIX = "BATTERY_";

/**
 * R103: Robot Weight (excluding bumpers and battery), WGHT-03.
 *
 * An independently-filtered occurrence computation (D-05) -- NOT R408's
 * total with bumpers subtracted out after the fact. Excludes every
 * BUMPER_- and BATTERY_-prefixed part from the sum.
 *
 * Per-verdict gating (D-09/D-10, WGHT-02): if any part in THIS check's own
 * included set has a KNOWN-missing material (`materialAssigned === false`)
 * OR an unresolved mass (`massKg === undefined` -- covers both an
 * UNRESOLVED referenced part per contract F3, where materialAssigned is
 * also undefined, and the narrower case of a materialed part whose mass
 * failed to enrich), the verdict is UNKNOWN and the weight number is
 * suppressed entirely -- never silently summed as 0 kg. A BUMPER_/BATTERY_
 * part with the same problem does NOT affect this verdict, since it is not
 * in R103's included set (per-verdict isolation).
 */
export const robotWeightCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R103");
  if (!entry) {
    throw new Error("robotWeightCheck requires an R103 entry in the season config");
  }

  const included = facts.filter(
    (f) => !f.name.startsWith(BUMPER_PREFIX) && !f.name.startsWith(BATTERY_PREFIX),
  );

  const caveats: string[] = [];
  if (!facts.some((f) => f.name.startsWith(BUMPER_PREFIX))) {
    caveats.push("no BUMPER_ part found — bumper mass may be included in this total.");
  }
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
