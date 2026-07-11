# Live Verification: Frame Perimeter (R101) & Starting Height (R104)

**Audience:** A non-CAD user (e.g. a mentor or student who does not model in Onshape). No CAD skill or modeling is required to complete this runbook.

**Purpose:** Confirm — against a REAL, public FRC team Onshape document — that the CR-01 (instance-id vs. CAD-partId join) and CR-02 (reused FRAME_ occurrence collapse) bugs described in `03-VERIFICATION.md` and `03-04-SUMMARY.md` stay fixed. The offline harness (`npm run verify:frame`) proves this against a synthetic assembly; this runbook proves it against real Onshape data, which is the only way to catch a live-API-shape surprise the synthetic fixture couldn't anticipate.

**Before you start:** Run the fast offline pre-check first — `npm run verify:frame`. It should print `ALL GUARDS PASSED` and exit 0 in a few seconds, with no Onshape account or network access needed. If it fails, stop here and report that failure — the live check below assumes the offline harness is already green.

---

## 1. No modeling required — tag a few parts by RENAMING them

You do **not** need to know how to model anything in Onshape for this. A "FRAME_" tag is not CAD work — it is simply **renaming an assembly instance** in the assembly's feature tree so its name begins with `FRAME_` (e.g. rename a drivetrain side rail to `FRAME_rail_left`).

Steps:

1. Open a **public** FRC team Onshape document in your own Onshape account (the project only validates against public team CAD documents — do not use private/proprietary documents). Search "FRC" or a specific team number on Onshape's public documents if you don't already have one.
2. Open the main robot **Assembly** (not a Part Studio) — it's usually the top-level tab that shows the whole robot.
3. In the assembly's feature-tree / parts list (left sidebar), find a few parts that visually form the OUTER PERIMETER of the robot's drivetrain frame (the rails/tubes that trace the robot's floor-level footprint) — ideally including one part type that appears in more than one place (e.g. left and right side rails of the same tube stock), since that's exactly the CR-02 scenario this runbook checks.
4. Double-click (or right-click → Rename) each chosen instance's name in the tree and prefix it with `FRAME_` — e.g. rename `Tube, 1x1, 28in (1)` to `FRAME_rail_left` and rename its mirrored counterpart to `FRAME_rail_right`. This is a plain rename, not a modeling operation — it does not move, resize, or modify the part in any way.
5. Note: the **R104 height check needs NO tagging at all**. It measures the whole assembly's bounding box regardless of any `FRAME_` naming, so it will produce a real result even before you tag anything.

## 2. Run the app locally and click "check now"

1. Start the app locally: `npm run dev`.
2. Open the Onshape panel/extension for your document (follow the app's normal connect flow — open the document, launch the CADChecker tab).
3. Connect via OAuth if prompted (one-time per session).
4. Click **"check now"** — this fires the same `POST /api/check` flow the offline harness drives, but against your REAL document and REAL Onshape data. The panel re-derives live context (document/workspace/assembly) fresh on every click — you do not need to reopen or reconnect between clicks.

## 3. Exactly what to look for

Look at the panel's rendered results (or the raw `/api/check` JSON `verdicts` array if you're inspecting directly):

- **The R101 verdict** — the one row carrying a drawn hull polygon (a `geometry` field in the JSON) — should show a REAL **PASS** or **FAIL**, with:
  - A measured perimeter number (in inches) compared against the 110in limit.
  - A drawn hull polygon (SVG) that visibly traces around the outside of your tagged frame parts.
- **The R104 verdict** should show a measured whole-robot height (in inches) compared against the 30in limit — this should populate even without any tagging.
- **Sanity check for CR-02:** if you tagged a reused part type at multiple locations (e.g. left AND right side rails), the drawn hull should visibly **enclose the FULL frame footprint**, touching or containing every tagged placement — not collapse down to a shape that only reflects one rail's position. If one side of your frame is visibly missing from the hull while the other side is present, that is a live CR-02 regression.

**What good looks like:** a real number (not blank/dashes), a status of PASS or FAIL (never stuck), and a hull shape that visually matches your tagged parts' actual layout — including every reused-rail placement.

**What a regression looks like:** the R101 row perpetually shows UNKNOWN, or a hull that's missing a rail you know you tagged, or a hull that only spans half your frame's actual width/depth.

## 4. The CR-01 smoking-gun signature

This is the exact symptom that means the live instance→CAD-partId resolution assumption is wrong for this document — even though the offline harness (`npm run verify:frame`) is green.

**Signature:** EVERY `FRAME_`-tagged part comes back unresolved, and the R101 verdict is permanently stuck at **UNKNOWN**, with a caveat reading something like:

> "perimeter geometry could not be read for N part(s) — see affected parts"

or the zero-tagged-parts variant:

> "not yet checkable — no frame parts tagged"

(the second variant is only a real bug if you already renamed parts to `FRAME_` — double-check your renames actually saved and the assembly was re-opened/re-checked after renaming).

**If you see this despite parts being correctly renamed to `FRAME_`:** this is the exact failure the offline harness (`scripts/verify-frame-perimeter.ts`) guards against with a synthetic fixture — but seeing it LIVE while the offline harness stays green means the REAL Onshape `instances[].partId` shape differs from what the synthetic fixture assumes for this document. That is a genuine finding to report back (e.g. "CR-01 re-open: live document X shows every FRAME_ part unresolved despite correct tagging"), **not** something to fix by changing anything in your CAD model. Do not re-tag, re-model, or otherwise try to work around it — just capture the document link and report it.

---

## Quick reference

| Check | Command / Action | Needs tagging? |
|-------|-------------------|-----------------|
| Offline pre-check (fast, no Onshape needed) | `npm run verify:frame` | No — synthetic fixture |
| Live perimeter (R101) | Panel "check now" against a public tagged document | Yes — rename parts to `FRAME_` |
| Live starting height (R104) | Panel "check now" | No — whole-assembly measurement |
| CR-01 regression signature | R101 permanently UNKNOWN despite correct `FRAME_` tags | N/A — report, don't fix in CAD |
| CR-02 regression signature | Hull visibly omits one placement of a reused frame part | N/A — report, don't fix in CAD |
