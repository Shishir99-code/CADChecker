import { describe, expect, it } from "vitest";
import { floorHull, hullPerimeterInches } from "./convex-hull.ts";

// Four world corners of a 1m x 1m square, Z varying (floor-projection must
// drop Z per D-04) -- mirrors four FRAME_ bounding-box corners collected
// from different occurrences.
const SQUARE_CORNERS: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0.5],
  [1, 1, 1],
  [0, 1, 0.25],
];

describe("floorHull", () => {
  it("returns a 4-vertex hull for a 1m x 1m square projected to XY", () => {
    const hull = floorHull(SQUARE_CORNERS);
    expect(hull).not.toBeNull();
    expect(hull).toHaveLength(4);
  });

  it("returns null for fewer than 3 unique projected points", () => {
    expect(floorHull([[0, 0, 0]])).toBeNull();
    expect(
      floorHull([
        [0, 0, 0],
        [1, 1, 5],
      ]),
    ).toBeNull();
  });

  it("does not crash on duplicate projected points and still resolves a hull once >=3 unique points exist", () => {
    const withDuplicates: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 0, 9], // duplicate XY (0,0), different Z -- collapses on projection
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 3], // duplicate XY (1,1), different Z
    ];
    expect(() => floorHull(withDuplicates)).not.toThrow();
    expect(floorHull(withDuplicates)).not.toBeNull();
  });

  it("returns null for duplicate points that collapse to fewer than 3 unique XY locations", () => {
    const allSamePoint: Array<[number, number, number]> = [
      [2, 2, 0],
      [2, 2, 5],
      [2, 2, -3],
    ];
    expect(floorHull(allSamePoint)).toBeNull();
  });

  it("does not crash on collinear projected points", () => {
    const collinear: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];
    expect(() => floorHull(collinear)).not.toThrow();
  });
});

describe("hullPerimeterInches", () => {
  it("converts a 1m x 1m square hull's perimeter to ~157.48 inches", () => {
    const hull = floorHull(SQUARE_CORNERS)!;
    expect(hullPerimeterInches(hull)).toBeCloseTo(4 * 39.37007874, 2);
  });
});
