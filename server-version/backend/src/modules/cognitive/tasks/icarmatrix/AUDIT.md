# icarmatrix current recommendation — 2026-10-31

Base: PR #477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`.
Candidate source: PR #441 `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5`.
Only this task and its direct asset/schema dependencies are imported; the rest
of #441 is not part of the four-task change.

## Decision

Participant-facing name: **项目矩阵推理试测版（七题范围）**. This is the
project pilot, not an age-adapted ICAR standard test.

Recommend **engine 2.1.0 / scoring 1.1.0 / config 2.1.0 / report 1.1.0**, using
`matgen-reviewed-v1.0.0`, a seven-item 3×3 pilot subset of the existing procedural
matRiks bank. Experience/standard/research use 4/6/7 distinct formal items,
respectively, and each includes shape, rotation, and shading/rotation items.
One independent practice item precedes formal items. The seven-item selection
focuses on explicit shape cycles, Pacman rotations and shading; it is not a
claim that all other generated items are invalid. A wrong practice choice
requires the full instructions and practice again. Estimated durations are
2–3 / 3–5 / 4–6 minutes, including preparation; these are estimates, not norms.

The stable key remains `icarmatrix`; this is **not the original ICAR full test**,
Raven, MaRs-IB, a validated age-adapted test, or an equivalent short form. Choosing
a small, inspectable scope is preferable to silently adding external items whose
rights, answer key or rendering have not been checked. The existing `standard`
profile is retained for protocol compatibility, not as a standardization claim.

## Comparison and item selection

| Candidate | Observed evidence | Decision |
| --- | --- | --- |
| v1 frozen 8 + seed-generated extension | Frozen items 7 and 8 are alternating grids whose missing cells match option 0, while both answer keys say 1. Practice displays formal item 1 and praises option 1 although its stored key is 0. Generated variants lack calibrated difficulty; more trials do not ensure new unique forms. | Preserve exact old runner/generator/scorer and frozen identities; remove new-create recommendation. Do not repair historical scores in place. |
| v2 bank, 10 × 3×3 + 8 × 2×2 | Concrete SVGs and deterministic server-derived option order; separate author-owned practice; traceable matRiks source. Original inline SVGs retain intrinsic 110.4px dimensions inside 56/64px containers. Both v1 and v2 previously recommended creation; seeds have simulated K7–9 reference metadata. | Use source material for a separately versioned current pilot. Preserve old assets/configs/scoring for historical compatibility. |
| 3×3 IDs 001, 002, 003 | Shape cycles, repeated rows or repeated columns. The missing shape has one matching displayed answer. | Retain. |
| 3×3 IDs 006, 007, 008 | Pacman rotation across both dimensions, rows or columns; the inferred missing orientation matches response 0. | Retain. |
| 3×3 ID 009 | Shading progresses across columns; orientation across rows. The bottom-right black, upward-opening figure matches response 0. | Retain. |
| 3×3 IDs 004, 005 | Small multi-part Maltese-cross figures rely on subtle shading at the original display size. No local difficulty/perceptual calibration. | Exclude from current recommendation; retain frozen source assets. |
| 3×3 ID 010 | Inspecting actual polygon vertices confirms a −45° rotation per row; response 0 is compatible. Symmetric squares/circles make the orientation change less explicit than the retained Pacman figures. | Valid candidate retained in the old bank, outside this bounded pilot; it is not classified as an erroneous answer key. |
| 2×2 IDs 011–018 | Three visible cells supply less constraint; child/adolescent/adult labels lack local age calibration. Seven retained 3×3 items already supply a bounded pilot. | No current 2×2/age recommendation. Not a claim that all 2×2 items are intrinsically invalid. |
| Original ICAR, MaRs-IB, regenerated/larger external banks | No pinned original standard-item payload, answer-key verification or rights evidence sufficient to expand this change. MaRs-IB paper distinguishes open-access paper from non-commercial-use forms. | Do not add external items. See THIRD_PARTY_NOTICES.md. |

The source SVG bank blob and the old generator/scorer semantics remain frozen.
Only recommendation flags, local type imports/test typing, and task registration
metadata change for old identities. `recommendedForCreate: false` is advice to
the existing catalog, not a new blanket prohibition on legacy configurations.
No database, stored report, already published configuration, or frozen profile is
rewritten. This repository change does not prove any version is installed in a
production database.

## Current behavior and contracts

- New runner uses isolated SVG images with a namespace and explicit 80px matrix /
  64px option sizes. The old images are unchanged. Mobile uses three choices per
  row; desktop six. Correctness is not indicated during formal trials.
- The server requires the exact stimulus version, nonempty seed, 4–7 distinct
  planned 3×3 items, contiguous indices including payload index, and matching
  seed-derived item IDs. Extra/missing/duplicate observations are rejected.
- Real option index 0 remains 0; timeout remains `responseIndex:null, rtMs:null`.
  Late clicks become timeout; retry preserves the original response and RT.
- Accuracy = correct / planned formal trials, including timeouts. Report counts
  distinguish answered, correct and unanswered. The median is over noninterrupted
  responses at/above the RT floor (including wrong answers), never over practice.
  No valid RT yields null. All-timeout runs have no interpretable performance.
- Rule maps remain research-only. No simulated reference, IQ, percentiles or
  0–100 ability index is exposed by the new report. Existing transport `score`
  remains accuracy ×100 for API compatibility; it is not an ability measure.
- Seven items cannot support item calibration, robust domain subscores, repeated
  parallel forms, age norms, reliability/validity or version equivalence claims.
  Those limitations are in the current catalog, profile caveats and report.

## Verification

Recorded after implementation: targeted scorer/schema/plan tests, all three
runner identities' DOM tests, actual Chromium with 375/768/1440px layouts, and
synthetic browser → raw observations → scorer → participant-report projection.
36 targeted tests pass: 9 historical scorer/schema tests, 5 current plan/scorer/
report tests, and 22 frontend runner/generator tests across v1/v2/v2.1. All three
identities' executable fixture validation passes. The seven retained answer keys
also have independent polygon geometry/size/fill uniqueness assertions.

Chromium synthetic captures: experience has 3 answered/3 correct/1 timeout
(accuracy .75); research has 7 answered/7 correct/0 timeout. The real zero-index
choice remains 0. Browser-generated data pass the authoritative envelope scorer
and participant report projection. Mobile/tablet/desktop here mean viewport
simulation in desktop Chromium, not native-device certification.

Frontend cognitive type checking and the backend task dependency type check pass.
The attempted whole-backend type check is **not passing** in this workspace:
its pre-existing generated Prisma client lacks current schema fields such as
`personalTracking*` used by 10 unchanged bundle/composite/survey/training modules
(68 diagnostics). No database
or Prisma client regeneration was done. This is not a claim of full build/CI
qualification. Only directly affected local checks were rerun after repairs.
Manifest/dependency checks are local source checks, not formal Actions approval.
No database install, production access, publication, merge or deployment occurs.
