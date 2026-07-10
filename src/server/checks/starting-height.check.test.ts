import { describe, expect, it } from "vitest";
import { startingHeightCheck } from "./starting-height.check.ts";
import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig } from "../config/schema.ts";

const config: SeasonConfig = {
  season: "2026",
  rules: [{ rule: "R104", title: "Starting Configuration Height", limit: 30, unit: "in", operator: "max" }],
};

function fact(overrides: Partial<Fact> & Pick<Fact, "partId" | "name">): Fact {
  return {
    transform: [],
    path: [overrides.partId],
    ...overrides,
  };
}

describe("startingHeightCheck", () => {
  it("returns UNKNOWN when every fact has robotMaxZWorld undefined (no silent 0)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "MECH_gear", robotMaxZWorld: undefined }),
      fact({ partId: "p2", name: "FRAME_rail", robotMaxZWorld: undefined }),
    ];

    const verdict = startingHeightCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.measuredCount).toBeUndefined();
    expect(verdict.caveats.length).toBeGreaterThan(0);
  });

  it("returns UNKNOWN when facts is empty", () => {
    const verdict = startingHeightCheck([], config);

    expect(verdict.status).toBe("UNKNOWN");
  });

  it("PASSes when the inch-converted height is at or under the limit", () => {
    // 0.75m -> ~29.53in, under the 30in limit.
    const facts: Fact[] = [
      fact({ partId: "p1", name: "MECH_gear", robotMaxZWorld: 0.75 }),
      fact({ partId: "p2", name: "FRAME_rail", robotMaxZWorld: 0.75 }),
    ];

    const verdict = startingHeightCheck(facts, config);

    expect(verdict.status).toBe("PASS");
    expect(verdict.measuredCount).toBeCloseTo(0.75 * 39.37007874, 2);
  });

  it("FAILs when the inch-converted height exceeds the limit", () => {
    // 0.80m -> ~31.5in, over the 30in limit.
    const facts: Fact[] = [fact({ partId: "p1", name: "MECH_gear", robotMaxZWorld: 0.8 })];

    const verdict = startingHeightCheck(facts, config);

    expect(verdict.status).toBe("FAIL");
    expect(verdict.measuredCount).toBeCloseTo(0.8 * 39.37007874, 2);
  });

  it("attaches the D-04 (+Z-up) and D-06 (configuration disclosure) caveats on every resolved verdict", () => {
    const facts: Fact[] = [fact({ partId: "p1", name: "MECH_gear", robotMaxZWorld: 0.75 })];

    const verdict = startingHeightCheck(facts, config);

    expect(verdict.caveats.some((c) => c.includes("+Z up"))).toBe(true);
    expect(verdict.caveats.some((c) => c.includes("configuration"))).toBe(true);
  });

  it("throws if the season config has no R104 entry", () => {
    const badConfig: SeasonConfig = { season: "2026", rules: [] };
    expect(() => startingHeightCheck([], badConfig)).toThrow();
  });
});
