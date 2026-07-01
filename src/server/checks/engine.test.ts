import { describe, expect, it } from "vitest";
import { CheckEngine } from "./engine.ts";
import { occurrenceCountCheck } from "./occurrence-count.check.ts";
import { frameTagPresenceCheck } from "./frame-tag-presence.check.ts";
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

function buildEngine(): CheckEngine {
  const engine = new CheckEngine();
  engine.register(occurrenceCountCheck);
  engine.register(frameTagPresenceCheck);
  return engine;
}

describe("CheckEngine", () => {
  it("returns exactly one Verdict per registered check", () => {
    const engine = buildEngine();
    const verdicts = engine.runAll(facts, config);
    expect(verdicts).toHaveLength(2);
  });

  it("occurrence-count Verdict.measured equals fact count", () => {
    const engine = buildEngine();
    const [occurrenceVerdict] = engine.runAll(facts, config);
    expect(occurrenceVerdict?.measured).toBe(facts.length);
  });

  it("frame-tag Verdict.measured equals the count of FRAME_-prefixed facts", () => {
    const engine = buildEngine();
    const [, frameVerdict] = engine.runAll(facts, config);
    expect(frameVerdict?.measured).toBe(2);
  });

  it("both checks receive the identical Fact[] reference", () => {
    const engine = new CheckEngine();
    const receivedArrays: Fact[][] = [];
    engine.register((f, c) => {
      receivedArrays.push(f);
      return occurrenceCountCheck(f, c);
    });
    engine.register((f, c) => {
      receivedArrays.push(f);
      return frameTagPresenceCheck(f, c);
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
    expect(verdicts.every((v) => v.pass === true)).toBe(true);
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
    expect(verdicts.some((v) => v.pass === false)).toBe(true);
  });
});
