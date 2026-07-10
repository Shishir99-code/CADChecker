import { describe, expect, it } from "vitest";
import { transformPoint } from "./transform-point.ts";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function translationOnly(tx: number, ty: number, tz: number): number[] {
  return [1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1];
}

describe("transformPoint", () => {
  it("returns the same point unchanged under the identity matrix", () => {
    expect(transformPoint(IDENTITY, [2, 3, 4])).toEqual([2, 3, 4]);
  });

  it("applies a pure translation to every axis", () => {
    expect(transformPoint(translationOnly(10, 20, 30), [1, 1, 1])).toEqual([11, 21, 31]);
  });

  it("applies rotation AND translation together (03-BOUNDING-BOX-CONTRACT.md A3)", () => {
    // 90-degree rotation about Z (x -> y, y -> -x) plus a translation --
    // mirrors the contract's observed genuinely-rotated real-world example.
    const rotateZ90PlusTranslate = [0, -1, 0, 5, 1, 0, 0, 7, 0, 0, 1, 2, 0, 0, 0, 1];
    expect(transformPoint(rotateZ90PlusTranslate, [1, 0, 0])).toEqual([5, 8, 2]);
  });
});
