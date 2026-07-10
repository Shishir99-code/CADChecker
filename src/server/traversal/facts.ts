/**
 * Fact is the single shared shape produced by flattenAssembly() and consumed
 * by every check function. All checks read from this same Fact[] path
 * (Success Criterion 5) — no divergent per-check traversal logic.
 */
export interface Fact {
  partId: string;
  name: string;
  /** Already-absolute (world-space) 16-element transform — never composed further. */
  transform: number[];
  path: string[];
  /**
   * Nominal mass in kg (02-MASS-PROPERTIES-CONTRACT.md rule 1: index 0 of the
   * 3-element [nominal, -tol, +tol] mass array). `undefined` means UNRESOLVED
   * -- the part was unmaterialized (omitted from `bodies`, contract F1) or
   * lived in a document/group the token could not read (contract F3). NEVER
   * treat `undefined` as `0`.
   */
  massKg?: number;
  /**
   * `true` when the part's BTPartMetadataInfo.material is present (assigned);
   * `false` when the part's group was read successfully and no material is
   * assigned (contract rule 4 / RESEARCH Pitfall 1: absence, not a
   * substituted default density, is the signal); `undefined` means
   * UNRESOLVED -- the part's group could not be read. NEVER treat
   * `undefined` as `false`.
   */
  materialAssigned?: boolean;
  /**
   * World-space corners of the part's bounding box (8 corners, `FRAME_`
   * parts only), each already run through the occurrence transform
   * (03-BOUNDING-BOX-CONTRACT.md A1/A3). `undefined` means UNRESOLVED --
   * the part's bounding box could not be read (referenced-document 403,
   * mirrors contract F3) or the box's fields were partially absent
   * (G4 -- an absent lowX..highZ field is UNRESOLVED, never defaulted to
   * 0). NEVER treat `undefined` as a substituted zero-size footprint --
   * doing so would silently shrink the perimeter hull (RESEARCH Pitfall 4).
   */
  bboxCornersWorld?: Array<[number, number, number]>;
}
