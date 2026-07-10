import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig, RuleEntry } from "../config/schema.ts";

/**
 * Verdict is the structured, rule-cited output of a single check function.
 *
 * Tri-state per D-11: `status` is PASS/FAIL/UNKNOWN rather than a boolean, so
 * a check can honestly report "not enough trustworthy data" instead of a
 * misleading pass/fail. `measured` (dual lb/kg) is ONLY for weight-flavored
 * checks and MUST be absent when status is UNKNOWN (D-10 -- never show a
 * partial/floor number). `measuredCount` is for non-weight numeric checks
 * (e.g. Phase-1's occurrence-count / frame-tag-presence proof-of-plumbing
 * checks) that have a real integer measurement which is not a weight.
 * `affectedPartCount`/`affectedParts` surface the full offending-part list
 * (D-08) for audits/gated checks. `caveats` is always present (possibly
 * empty) per D-06.
 */
export interface Verdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  /** Dual-figure weight measurement (D-02); absent entirely when UNKNOWN. */
  measured?: { lb: number; kg: number };
  /** Non-weight numeric measurement (e.g. occurrence/tag counts). */
  measuredCount?: number;
  affectedPartCount?: number;
  affectedParts?: Array<{ name: string; path: string[] }>;
  caveats: string[];
  /**
   * Hull geometry for the SVG render (perimeter only), D-07. Vertices are
   * world-space XY points in METERS (unit conversion for the LABEL happens
   * separately via `measuredCount`/M_TO_IN -- the panel renders these raw
   * for auto-scaled SVG mapping, never re-deriving hull math client-side).
   * Absent entirely for non-geometry checks and for UNKNOWN geometry
   * verdicts (no hull to show).
   */
  geometry?: {
    hullVertices: Array<[number, number]>;
    framePartFootprints?: Array<[number, number]>[];
  };
}

/**
 * Single documented kg->lb conversion boundary (D-02). No other file may
 * hardcode this ratio -- checks compute in kg (Onshape's canonical SI unit)
 * and convert once here for the dual-figure `measured` display value.
 */
export const KG_TO_LB = 2.20462;

/**
 * Single documented meters->inches conversion boundary (03-BOUNDING-BOX-
 * CONTRACT.md A4: Onshape bounding-box/transform values are SI meters
 * regardless of document display units) -- mirrors KG_TO_LB's placement and
 * "one documented conversion boundary" discipline. No other file may
 * hardcode this ratio.
 */
export const M_TO_IN = 39.37007874;

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
