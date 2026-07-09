import { describe, expect, it } from "vitest";
import { robotBumpersWeightCheck } from "./robot-bumpers-weight.check.ts";
import { robotWeightCheck } from "./robot-weight.check.ts";
import { KG_TO_LB } from "./engine.ts";
import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig } from "../config/schema.ts";

const config: SeasonConfig = {
  season: "2026",
  rules: [
    { rule: "R103", title: "Robot Weight (excluding bumpers and battery)", limit: 115, unit: "lb", operator: "max" },
    { rule: "R408", title: "Robot Weight (including bumpers)", limit: 135, unit: "lb", operator: "max" },
  ],
};

function fact(overrides: Partial<Fact> & Pick<Fact, "partId" | "name">): Fact {
  return {
    transform: [],
    path: [overrides.partId],
    ...overrides,
  };
}

describe("robotBumpersWeightCheck (R408)", () => {
  it("includes BUMPER_ parts and excludes only BATTERY_ parts (D-05)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: true, massKg: 3 }),
      fact({ partId: "p3", name: "BATTERY_main", materialAssigned: true, massKg: 2 }),
    ];

    const verdict = robotBumpersWeightCheck(facts, config);

    expect(verdict.measured?.kg).toBe(13);
  });

  it("is distinctly filtered from R103 -- R408 exceeds R103 by exactly the bumper mass (WGHT-04)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: true, massKg: 3 }),
    ];

    const r103 = robotWeightCheck(facts, config);
    const r408 = robotBumpersWeightCheck(facts, config);

    expect(r408.measured!.kg).toBeGreaterThan(r103.measured!.kg);
    expect(r408.measured!.kg).toBe(r103.measured!.kg + 3);
  });

  it("returns UNKNOWN when a BUMPER_ part lacks material -- bumper IS in R408's set (D-09)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: false, massKg: 3 }),
    ];

    const verdict = robotBumpersWeightCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.measured).toBeUndefined();
    expect(verdict.affectedParts).toEqual([{ name: "BUMPER_front", path: ["p2"] }]);
  });

  it("emits only the BATTERY_ caveat when battery is absent, never a BUMPER_ caveat (D-06)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: true, massKg: 3 }),
    ];

    const verdict = robotBumpersWeightCheck(facts, config);

    expect(verdict.caveats).toContain("no BATTERY_ part found — battery mass may be included in this total.");
    expect(verdict.caveats.some((c) => c.includes("BUMPER_"))).toBe(false);
  });

  it("computes measured.lb from measured.kg via KG_TO_LB and reads limit/unit/title from R408 config", () => {
    const facts: Fact[] = [fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 })];

    const verdict = robotBumpersWeightCheck(facts, config);

    expect(verdict.measured?.lb).toBeCloseTo(verdict.measured!.kg * KG_TO_LB);
    expect(verdict.rule).toBe("R408");
    expect(verdict.title).toBe("Robot Weight (including bumpers)");
    expect(verdict.limit).toBe(135);
    expect(verdict.unit).toBe("lb");
  });
});
