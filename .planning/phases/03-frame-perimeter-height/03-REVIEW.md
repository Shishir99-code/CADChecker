---
phase: 03-frame-perimeter-height
reviewed: 2026-07-10T12:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/server/traversal/flatten-assembly.ts
  - src/server/traversal/flatten-assembly.test.ts
  - src/server/routes/check.routes.ts
  - src/server/routes/check.routes.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 03: Code Review Report (Gap Closure 03-04 — CR-01/CR-02)

**Reviewed:** 2026-07-10T12:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This review covers gap-closure plan 03-04, which was meant to fix two Critical
defects (CR-01: broken instance-id → CAD-partId join; CR-02: occurrence
collapse in the 5c FRAME_ bbox enrichment) found in the original phase 03
review. I traced both fixes against `03-BOUNDING-BOX-CONTRACT.md`'s G1
guidance (live-verified against a real 81-instance Onshape document), read
every consuming check (`frame-perimeter.check.ts`, `robot-weight.check.ts`,
`material-audit.check.ts`, `engine.ts`), and ran the test suite and
`tsc --noEmit` locally to confirm the claimed green state.

**Both CR-01 and CR-02 are correctly and completely fixed as scoped.**

- CR-01: `flattenAssembly` now resolves `instance?.partId ?? leafId`, matching
  the live-verified G1 contract exactly. The fallback to `leafId` is safe
  (no-throw) and, combined with the route's `groups`-derived CAD-partId keys,
  the 5b/5c joins now genuinely match on real documents where instance id !=
  CAD partId. I confirmed this also un-breaks the pre-existing 5b mass/
  material join for `robotWeightCheck`/`materialAuditCheck` as a side effect
  (previously *always* UNKNOWN regardless of document content — see the
  prior review's CR-01 note that this bug also affected Phase 2's weight
  checks).
- CR-02: the split into `localCornersByPartId` (fetched once per unique
  partId, cached LOCAL corners) + `bboxByOccurrence` (per-occurrence
  transform, keyed by `fact.path.join("/")`) correctly gives every occurrence
  of a reused `FRAME_` part its own transformed footprint. I traced the new
  `stubTwoOccurrenceAssembly()` test end to end and it genuinely exercises
  the fix (fails against the pre-fix `bboxByPartId`-keyed code, per the
  described mechanics).
- `frame-perimeter.check.ts`'s per-occurrence UNKNOWN gating (any FRAME_ fact
  with `bboxCornersWorld === undefined`) correctly consumes the new
  one-Fact-per-occurrence enrichment shape without modification.
- `npx vitest run` (both files) and `npx tsc -p tsconfig.server.json --noEmit`
  both pass cleanly in this environment, matching the plan's claimed state.

No Critical issues found in the 03-04 diff itself. Two Warnings describe
residual/inherited correctness risk not fully closed by this gap-closure
(worth tracking, not blocking), and two Info items are documentation-accuracy
nits.

## Warnings

### WR-01: `flattenAssembly`'s new fallback branch is only half covered by regression tests

**File:** `src/server/traversal/flatten-assembly.test.ts:88-93` (covering `src/server/traversal/flatten-assembly.ts:107`)

**Issue:** The CR-01 fix introduces `partId: instance?.partId ?? leafId`, which
has two distinct ways to reach the `leafId` fallback:
1. `instance` itself is `undefined` (leaf id not found in the merged
   instance map) — covered by the `"ghost-part-99"` fixture case.
2. `instance` **is** found, but `instance.partId` is itself `undefined`
   (e.g. a malformed API response, or a stray non-Part-type instance
   incorrectly appearing as a path leaf) — **not covered by any test.**

Both arms exercise the same line of production code but are logically
distinct failure modes, and only one is guarded against regression. A future
refactor that accidentally changes behavior for case 2 only (e.g.
`instance?.partId ?? instance?.id ?? leafId`, or a typo that drops the `??`
short-circuit) would not be caught by the current suite.

**Fix:** Add a fixture instance that has an `id` but no `partId` field (e.g.
an `Assembly`-type instance mistakenly present at a path leaf, or a
Part-type instance from a malformed response), and assert the resulting
Fact still falls back to the leaf id rather than throwing or resolving
`undefined`:
```ts
{ id: "malformed-leaf", name: "MECH_odd", type: "Part", suppressed: false /* no partId */ }
// occurrence: { path: ["malformed-leaf"], ... }
// expect(fact.partId).toBe("malformed-leaf");
```

### WR-02: 5b/5c enrichment maps are keyed by CAD `partId` alone, not `documentId:elementId:partId` — a residual join-collision risk the same class as CR-01

**File:** `src/server/routes/check.routes.ts:125-126, 200` (`massByPartId`, `materialByPartId`, `localCornersByPartId`)

**Issue:** This codebase's own `AssemblyPartInfo` doc comment
(`src/server/traversal/flatten-assembly.ts:43-46`) states `partId`
uniqueness is guaranteed only "within the same
`documentId:elementId:configuration` context" — i.e. a CAD `partId` string is
**not** guaranteed globally unique across different Part Studio elements
referenced by the same assembly. Despite this, `massByPartId`,
`materialByPartId` (pre-existing, unchanged by 03-04) and the new
`localCornersByPartId` (CR-02) are all `Map<string, ...>` keyed by `partId`
alone, aggregated across **every** group in `groups.values()`:

```ts
const localCornersByPartId = new Map<string, Array<[number, number, number]>>();
for (const parts of groups.values()) {
  ...
  localCornersByPartId.set(partId, corners); // no documentId/elementId in the key
}
```

If two different Part Studio elements referenced by the same assembly happen
to emit a part with an identical `partId` string (not disallowed by the
contract's own scoping statement), the second group processed will silently
overwrite the first group's cached corners (or mass/material) in the shared
map, and `Fact.partId`-based lookups in `enrichedFacts` will attach the
**wrong part's geometry/mass** to whichever occurrences share that partId
string. This is architecturally the same "silent wrong join" failure mode
CR-01 was written to eliminate — just moved from the instance-id axis to the
cross-element-partId axis.

This is **not newly introduced** by 03-04 (the partId-only-keyed map pattern
predates this plan in the 5b block, and 5c's predecessor `bboxByPartId` had
the identical scoping gap before CR-02 too), so it does not block this
specific gap-closure. However, `03-04-SUMMARY.md` explicitly claims CR-01
closes "the permanently-broken 5b/5c enrichment join on any real
multi-instance Onshape document" — that claim overstates completeness while
this residual scoping gap is untracked and unaddressed.

**Fix:** Either (a) key these maps by a composite `${documentId}:${elementId}:${partId}` string and change the final `enrichedFacts.map()` lookup to build the same composite key per fact (facts would need to carry `documentId`/`elementId`, which `flattenAssembly` currently does not attach), or (b) if partId is confirmed to be Onshape-document-wide unique in practice (contrary to the doc comment's own scoping statement), update the `AssemblyPartInfo` comment to say so and drop this concern. At minimum, log this as a tracked item in `deferred-items.md` alongside the other out-of-scope findings from this plan.

## Info

### IN-01: `flattenAssembly`'s fallback comment overclaims "can never cause a false-positive downstream join"

**File:** `src/server/traversal/flatten-assembly.ts:101-107`

**Issue:** The comment states:
> A fallback to the leaf id can never cause a false-positive downstream join: it simply fails to match any real CAD partId and stays UNRESOLVED (CR-01).

This is true only probabilistically, not absolutely. If an occurrence's
unresolvable leaf **instance id** string happens to coincide with a genuine,
different part's **CAD partId** string elsewhere in the same document
(different id namespaces, but nothing in the code enforces they can't
collide), the fallback would silently attach that unrelated part's mass,
material, or bounding box to the wrong occurrence — a real false-positive
join, just extremely low-probability given Onshape's differing id formats
(`M182`-style instance ids vs. short alphanumeric partIds like `JHD`).

**Fix:** Soften the comment to state the guarantee is probabilistic given
the two id namespaces' differing formats, not absolute — e.g. "...in
practice will not match a real CAD partId, since instance ids and CAD
partIds use distinct formats, though this is not structurally enforced."

### IN-02: 5c's comment claims wvm/wvmid derivation is "reused... not re-derived" from 5b, but it is duplicated inline

**File:** `src/server/routes/check.routes.ts:186-189` (comment), `212-228` (the actual duplicated logic)

**Issue:** The comment above the 5c block states:

> Reuses the SAME `groups` map and the SAME wvm/wvmid derivation as 5b (not re-derived)

`groups` is indeed the same `Map` instance reused from 5b. The wvm/wvmid
derivation, however, is **not** literally shared code — it's the identical
`if (groupDocumentId === assemblyDocumentId) {...} else if (first.documentVersion) {...}`
branch duplicated verbatim in both the 5b loop (lines 138-152) and the 5c
loop (lines 212-228). This predates 03-04 (the duplication already existed
between the pre-fix 5b/5c blocks) and wasn't introduced by this diff, but the
comment's wording ("not re-derived") is misleading about the current code
structure and could cause a future maintainer to update one copy's logic
(e.g. adding a new addressing fallback) and forget the other, silently
diverging the two enrichment paths' addressing behavior.

**Fix:** Either extract the wvm/wvmid derivation into a small shared helper
(e.g. `resolveGroupAddressing(first, assemblyDocumentId, workspaceId)`) used
by both 5b and 5c, or reword the comment to say the *derivation logic* is
duplicated-but-identical rather than implying it's a single shared code path.

---

_Reviewed: 2026-07-10T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
