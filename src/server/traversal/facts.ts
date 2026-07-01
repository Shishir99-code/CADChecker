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
}
