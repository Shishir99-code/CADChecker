import { describe, expect, it } from "vitest";
import { framePerimeterCheck } from "./frame-perimeter.check.ts";
import type { Fact } from "../traversal/facts.ts";
import type { SeasonConfig } from "../config/schema.ts";

const config: SeasonConfig = {
  season: "2026",
  rules: [{ rule: "R101", title: "Frame Perimeter", limit: 110, unit: "in", operator: "max" }],
};

function fact(overrides: Partial<Fact> & Pick<Fact, "partId" | "name">): Fact {
  return {
    transform: [],
    path: [overrides.partId],
    ...overrides,
  };
}

// A 1m x 1m square's 4 corners (world-space, Z varying) -- perimeter
// converts to 4 * 39.37007874 ~= 157.48 inches, which exceeds the 110in
// limit (FAIL case).
const ONE_METER_SQUARE: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0.5],
  [1, 1, 1],
  [0, 1, 0.25],
];

// A ~0.5m x 0.5m square -- perimeter converts to 2m * 39.37007874 ~= 78.74
// inches, comfortably under the 110in limit (PASS case).
const HALF_METER_SQUARE: Array<[number, number, number]> = [
  [0, 0, 0],
  [0.5, 0, 0],
  [0.5, 0.5, 0],
  [0, 0.5, 0],
];

describe("framePerimeterCheck", () => {
  it("returns UNKNOWN with the SC4-exact caveat when there are zero FRAME_ facts", () => {
    const facts: Fact[] = [fact({ partId: "p1", name: "MECH_gear", bboxCornersWorld: ONE_METER_SQUARE })];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.caveats).toEqual(["not yet checkable — no frame parts tagged"]);
    expect(verdict.geometry).toBeUndefined();
  });

  it("gates to UNKNOWN when any FRAME_ part's bboxCornersWorld is unresolved (never a shrunk hull)", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail_1", bboxCornersWorld: ONE_METER_SQUARE }),
      fact({ partId: "p2", name: "FRAME_rail_2", bboxCornersWorld: undefined }),
    ];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.affectedPartCount).toBe(1);
    expect(verdict.affectedParts).toEqual([{ name: "FRAME_rail_2", path: ["p2"] }]);
    expect(verdict.geometry).toBeUndefined();
  });

  it("PASSes when the hull perimeter is at or under the limit and carries hull geometry", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail_1", bboxCornersWorld: HALF_METER_SQUARE }),
    ];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.status).toBe("PASS");
    expect(verdict.measuredCount).toBeCloseTo(2 * 39.37007874, 2);
    expect(verdict.geometry?.hullVertices).toHaveLength(4);
  });

  it("FAILs when the hull perimeter exceeds the limit", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail_1", bboxCornersWorld: ONE_METER_SQUARE }),
    ];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.status).toBe("FAIL");
    expect(verdict.measuredCount).toBeCloseTo(4 * 39.37007874, 2);
  });

  it("returns a distinct UNKNOWN when floorHull returns null (insufficient frame geometry)", () => {
    const facts: Fact[] = [
      fact({
        partId: "p1",
        name: "FRAME_sliver",
        bboxCornersWorld: [
          [0, 0, 0],
          [0, 0, 1],
        ],
      }),
    ];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.status).toBe("UNKNOWN");
    expect(verdict.caveats).toEqual(["insufficient frame geometry to compute a hull"]);
  });

  it("attaches the D-02/D-04/D-06 standard caveats on every PASS/FAIL verdict", () => {
    const facts: Fact[] = [
      fact({ partId: "p1", name: "FRAME_rail_1", bboxCornersWorld: HALF_METER_SQUARE }),
    ];

    const verdict = framePerimeterCheck(facts, config);

    expect(verdict.caveats.length).toBeGreaterThanOrEqual(3);
  });

  it("throws if the season config has no R101 entry", () => {
    const badConfig: SeasonConfig = { season: "2026", rules: [] };
    expect(() => framePerimeterCheck([], badConfig)).toThrow();
  });
});
