import { describe, expect, it } from "vitest";
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

describe("robotWeightCheck (R103)", () => {
  it("computes PASS/FAIL from the sum of trusted included parts, dual lb/kg (WGHT-03)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "MECH_gearbox", materialAssigned: true, massKg: 5 }),
    ];

    const verdict = robotWeightCheck(facts, config);

    expect(verdict.status).not.toBe("UNKNOWN");
    expect(verdict.measured?.kg).toBe(15);
    expect(verdict.measured?.lb).toBeCloseTo(15 * KG_TO_LB);
  });

  it("excludes both BUMPER_ and BATTERY_ prefixed parts from the total (D-05)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: true, massKg: 3 }),
      fact({ partId: "p3", name: "BATTERY_main", materialAssigned: true, massKg: 2 }),
    ];

    const verdict = robotWeightCheck(facts, config);

    expect(verdict.measured?.kg).toBe(10);
  });

  it("returns UNKNOWN with affectedParts when an included part lacks material (WGHT-02, D-09/D-10)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: false, massKg: 10 }),
      fact({ partId: "p2", name: "MECH_gearbox", materialAssigned: true, massKg: 5 }),
    ];

    const verdict = robotWeightCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.measured).toBeUndefined();
    expect(verdict.affectedPartCount).toBe(1);
    expect(verdict.affectedParts).toEqual([{ name: "FRAME_rail", path: ["p1"] }]);
  });

  it("does NOT change status when a BUMPER_ part lacks material -- per-verdict isolation (D-09)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BUMPER_front", materialAssigned: false, massKg: 3 }),
    ];

    const verdict = robotWeightCheck(facts, config);

    expect(verdict.status).not.toBe("UNKNOWN");
    expect(verdict.measured?.kg).toBe(10);
  });

  it("returns UNKNOWN when an included, materialed part has an unresolved (undefined) mass -- integrity gate", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: undefined }),
      fact({ partId: "p2", name: "MECH_gearbox", materialAssigned: true, massKg: 5 }),
    ];

    const verdict = robotWeightCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.measured).toBeUndefined();
    expect(verdict.affectedParts).toEqual([{ name: "FRAME_rail", path: ["p1"] }]);
  });

  it("emits missing-tag caveats when no BUMPER_/BATTERY_ part is present, and omits the battery caveat when one is (D-06)", () => {
    const noTags: Fact[] = [fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 })];
    const noTagsVerdict = robotWeightCheck(noTags, config);
    expect(noTagsVerdict.caveats).toContain("no BUMPER_ part found — bumper mass may be included in this total.");
    expect(noTagsVerdict.caveats).toContain("no BATTERY_ part found — battery mass may be included in this total.");

    const withBattery: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 10 }),
      fact({ partId: "p2", name: "BATTERY_main", materialAssigned: true, massKg: 2 }),
    ];
    const withBatteryVerdict = robotWeightCheck(withBattery, config);
    expect(withBatteryVerdict.caveats).not.toContain(
      "no BATTERY_ part found — battery mass may be included in this total.",
    );
  });

  it("reads limit/unit/title from the config R103 entry, not literals (config-driven)", () => {
    const facts: Fact[] = [fact({ partId: "p1", name: "FRAME_rail", materialAssigned: true, massKg: 1 })];
    const verdict = robotWeightCheck(facts, config);

    expect(verdict.rule).toBe("R103");
    expect(verdict.title).toBe("Robot Weight (excluding bumpers and battery)");
    expect(verdict.limit).toBe(115);
    expect(verdict.unit).toBe("lb");
  });
});
