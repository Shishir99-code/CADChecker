import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator } from "./engine.ts";

/**
 * Proof-of-plumbing check A: occurrence/part-inventory count.
 * Cites the first entry of the supplied season config's rules array.
 * Consumes the SAME Fact[] path as every other registered check.
 */
export const occurrenceCountCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules[0];
  if (!entry) {
    throw new Error("occurrenceCountCheck requires at least one rule entry in the season config");
  }

  const measured = facts.length;

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
