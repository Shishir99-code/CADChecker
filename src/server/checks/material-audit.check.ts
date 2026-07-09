import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";

const BATTERY_PREFIX = "BATTERY_";

/**
 * WGHT-01: Material Assignment Audit -- a CADChecker-internal trust gate,
 * not an FRC Game-Manual numeric limit, so it does NOT read a limit entry
 * from the season config (nothing in rules/2026.json varies per season for
 * it). Lists every weight-contributing part (all facts EXCLUDING
 * BATTERY_-prefixed names, D-07 -- the union of R103's and R408's included
 * sets, since R408 includes bumpers) with a KNOWN-missing material
 * (`materialAssigned === false`, strict). An UNRESOLVED part
 * (`materialAssigned === undefined` -- its group could not be read, contract
 * F3) is NOT known-missing and is deliberately NOT reported here; it becomes
 * UNKNOWN downstream via the weight verdicts' `massKg === undefined` gate
 * (02-03), not via this audit.
 */
export const materialAuditCheck: CheckFn = (facts: Fact[]) => {
  const weightContributing = facts.filter((f) => !f.name.startsWith(BATTERY_PREFIX));
  const missing = weightContributing.filter((f) => f.materialAssigned === false);

  return {
    rule: "MAT-AUDIT",
    title: "Material Assignment Audit",
    limit: 0,
    unit: "parts",
    status: missing.length > 0 ? "FAIL" : "PASS",
    affectedPartCount: missing.length,
    affectedParts: missing.map((f) => ({ name: f.name, path: f.path })),
    caveats: [],
  };
};
