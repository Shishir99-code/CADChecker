import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig, RuleEntry } from "../config/schema.ts";

/**
 * Verdict is the structured, rule-cited output of a single check function.
 */
export interface Verdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  measured: number;
  pass: boolean;
}

/**
 * A CheckFn consumes the SAME shared Fact[] path every other registered
 * check consumes (Success Criterion 5) plus the season config, and returns
 * one Verdict.
 */
export type CheckFn = (facts: Fact[], config: SeasonConfig) => Verdict;

/**
 * Shared operator comparator: used by every check so no per-rule branching
 * leaks into individual check bodies.
 *   max -> pass when measured <= limit
 *   min -> pass when measured >= limit
 */
export function passesOperator(entry: Pick<RuleEntry, "operator" | "limit">, measured: number): boolean {
  return entry.operator === "max" ? measured <= entry.limit : measured >= entry.limit;
}

/**
 * Pluggable registry: register(fn) then runAll(facts, config) maps every
 * registered check over the identical facts/config arguments.
 */
export class CheckEngine {
  private checks: CheckFn[] = [];

  register(fn: CheckFn): void {
    this.checks.push(fn);
  }

  runAll(facts: Fact[], config: SeasonConfig): Verdict[] {
    return this.checks.map((fn) => fn(facts, config));
  }
}
