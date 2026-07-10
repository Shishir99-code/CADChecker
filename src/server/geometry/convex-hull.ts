import { polygonHull, polygonLength } from "d3-polygon";
import { M_TO_IN } from "../checks/engine.ts";

/**
 * Floor-projects world-space bounding-box corners onto the XY plane (D-04:
 * assume world +Z is up, drop Z) and computes their 2D convex hull via
 * d3-polygon's Andrew's-monotone-chain implementation (RESEARCH "Don't
 * Hand-Roll" -- collinear/duplicate-point pruning is exactly the edge case
 * a hand-rolled hull is most likely to get wrong).
 *
 * Points are de-duplicated BEFORE being handed to `polygonHull` so that
 * "fewer than 3 UNIQUE projected points" (e.g. every FRAME_ corner
 * collapsing onto the same couple of XY locations) reliably returns `null`,
 * not just d3-polygon's own raw "<3 points" check (RESEARCH Pitfall 7).
 * Pure and independently testable -- no Onshape/network dependency.
 */
export function floorHull(worldPoints: Array<[number, number, number]>): Array<[number, number]> | null {
  const seen = new Set<string>();
  const uniqueXY: Array<[number, number]> = [];
  for (const [x, y] of worldPoints) {
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueXY.push([x, y]);
  }
  if (uniqueXY.length < 3) return null;
  return polygonHull(uniqueXY);
}

/**
 * Converts a closed hull's perimeter length from meters (Onshape's
 * canonical SI unit, 03-BOUNDING-BOX-CONTRACT.md A4) to inches, applying
 * the M_TO_IN conversion exactly once at this single documented boundary
 * (mirrors engine.ts's KG_TO_LB discipline). `polygonLength` auto-closes
 * the loop (RESEARCH "Don't Hand-Roll" -- confirmed via source read of
 * d3-polygon's length.js), so no manual wraparound index math is needed
 * here.
 */
export function hullPerimeterInches(hull: Array<[number, number]>): number {
  return polygonLength(hull) * M_TO_IN;
}
