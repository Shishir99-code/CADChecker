/**
 * Applies an occurrence's world transform to a single LOCAL bounding-box
 * corner.
 *
 * Source of truth: 03-BOUNDING-BOX-CONTRACT.md A3 (live-verified against a
 * real Onshape document on 2026-07-10) -- the 16-element occurrence
 * transform is row-major, 4x4, with translation in column 3 of each row
 * (indices 3, 7, 11). This is NOT merely the community-forum inference the
 * formula was originally derived from (03-RESEARCH.md A3) -- the contract
 * confirms the inferred formula is correct AS-IS, including a genuinely
 * rotated (~90 degree) real-world example, so the FULL 3x4 (rotation +
 * translation) must be applied, never a translation-only shortcut.
 *
 *   world = R * local + T
 *   worldX = m[0]*x + m[1]*y + m[2]*z + m[3]
 *   worldY = m[4]*x + m[5]*y + m[6]*z + m[7]
 *   worldZ = m[8]*x + m[9]*y + m[10]*z + m[11]
 */
export function transformPoint(m: number[], p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ];
}
