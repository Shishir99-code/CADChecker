import { describe, expect, it } from "vitest";
import { CheckEngine, passesOperator, type CheckFn, type Verdict } from "./engine.ts";
import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig } from "../config/schema.ts";

const facts: Fact[] = [
  { partId: "p1", name: "FRAME_rail_1", transform: [], path: ["p1"] },
  { partId: "p2", name: "FRAME_rail_2", transform: [], path: ["p2"] },
  { partId: "p3", name: "MECH_gear_1", transform: [], path: ["p3"] },
];

const config: SeasonConfig = {
  season: "2026",
  rules: [
    { rule: "R101", title: "Frame Perimeter", limit: 110, unit: "in", operator: "max" },
    { rule: "R103", title: "Robot Weight", limit: 115, unit: "kg", operator: "max" },
  ],
};

/**
 * Two small inline trivial CheckFns standing in for real registered checks
 * (Phase-1's two proof-of-plumbing checks were retired in 04-01, D-01) --
 * these exercise the identical engine mechanics (register / runAll /
 * identical-facts-reference / operator pass-fail) with zero dependency on
 * any retired or real check module.
 */
const totalCountCheck: CheckFn = (facts: Fact[], config: SeasonConfig): Verdict => {
  const entry = config.rules[0];
  if (!entry) {
    throw new Error("totalCountCheck requires at least one rule entry in the season config");
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

const framePrefixCountCheck: CheckFn = (facts: Fact[], config: SeasonConfig): Verdict => {
  const entry = config.rules[1];
  if (!entry) {
    throw new Error("framePrefixCountCheck requires at least two rule entries in the season config");
  }
  const measured = facts.filter((f) => f.name.startsWith("FRAME_")).length;
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

function buildEngine(): CheckEngine {
  const engine = new CheckEngine();
  engine.register(totalCountCheck);
  engine.register(framePrefixCountCheck);
  return engine;
}

describe("CheckEngine", () => {
  it("returns exactly one Verdict per registered check", () => {
    const engine = buildEngine();
    const verdicts = engine.runAll(facts, config);
    expect(verdicts).toHaveLength(2);
  });

  it("total-count Verdict.measuredCount equals fact count", () => {
    const engine = buildEngine();
    const [totalVerdict] = engine.runAll(facts, config);
    expect(totalVerdict?.measuredCount).toBe(facts.length);
  });

  it("frame-prefix-count Verdict.measuredCount equals the count of FRAME_-prefixed facts", () => {
    const engine = buildEngine();
    const [, frameVerdict] = engine.runAll(facts, config);
    expect(frameVerdict?.measuredCount).toBe(2);
  });

  it("both checks receive the identical Fact[] reference", () => {
    const engine = new CheckEngine();
    const receivedArrays: Fact[][] = [];
    engine.register((f, c) => {
      receivedArrays.push(f);
      return totalCountCheck(f, c);
    });
    engine.register((f, c) => {
      receivedArrays.push(f);
      return framePrefixCountCheck(f, c);
    });

    engine.runAll(facts, config);

    expect(receivedArrays).toHaveLength(2);
    expect(receivedArrays[0]).toBe(facts);
    expect(receivedArrays[1]).toBe(facts);
  });

  it("passes a max-operator entry when measured <= limit", () => {
    const roomyConfig: SeasonConfig = {
      season: "2026",
      rules: [
        { rule: "R101", title: "Frame Perimeter", limit: 100, unit: "count", operator: "max" },
        { rule: "R103", title: "Robot Weight", limit: 100, unit: "count", operator: "max" },
      ],
    };
    const engine = buildEngine();
    const verdicts = engine.runAll(facts, roomyConfig);
    expect(verdicts.every((v) => v.status === "PASS")).toBe(true);
  });

  it("fails a max-operator entry when measured exceeds limit", () => {
    // Build a config whose limit is deliberately below the fact count.
    const tightConfig: SeasonConfig = {
      season: "2026",
      rules: [
        { rule: "R101", title: "Frame Perimeter", limit: 1, unit: "count", operator: "max" },
        { rule: "R103", title: "Robot Weight", limit: 1, unit: "count", operator: "max" },
      ],
    };
    const engine = buildEngine();
    const verdicts = engine.runAll(facts, tightConfig);
    expect(verdicts.some((v) => v.status === "FAIL")).toBe(true);
  });
});
