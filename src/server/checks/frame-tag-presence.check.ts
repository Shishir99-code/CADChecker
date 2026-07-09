import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator } from "./engine.ts";

const FRAME_PREFIX = "FRAME_";

/**
 * Proof-of-plumbing check B: FRAME_-tag presence count.
 * Cites the second entry of the supplied season config's rules array.
 * Consumes the SAME Fact[] path as every other registered check.
 */
export const frameTagPresenceCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules[1];
  if (!entry) {
    throw new Error("frameTagPresenceCheck requires at least two rule entries in the season config");
  }

  const measured = facts.filter((f) => f.name.startsWith(FRAME_PREFIX)).length;

  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: passesOperator(entry, measured) ? "PASS" : "FAIL",
    measuredCount: measured,
    caveats: [],
  };
};
