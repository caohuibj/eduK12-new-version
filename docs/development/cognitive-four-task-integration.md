# Four-task cognitive revision — integration handoff

Base: PR #477, `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`, branch
`content/cognitive-intake-public-review-20261031`. Candidate source #441 is
`16d9bbaa5fffb424ce463220d6f9f7d3a7280db5`; only four local tasks and their direct
dependencies are extracted. The other eight bank tasks are not included.

| Task | Current recommendation | Experience / research | Source handoff |
| --- | --- | --- | --- |
| icarmatrix | Project matrix pilot, engine 2.1.0 / scoring 1.1.0; seven reviewed 3×3 items | 4 / 7, same seven-item pool | Initial independent implementation `3f0c5900146ba343bc727aad25478a54e6215df2`; name clarification `0c8ec8b4dae436d6ee17d9d9c31a2cb9bec97588`; review follow-up/source records `5df5da26fac7baf26daf0d60611f61398490ded1` |
| lineangle | Unoriented axes modulo 180°, engine/scoring 2.0.0 | 12 / 60 | `c60e54a7425e92c0de144c6114888f4158394b77` |
| sharegame | Explicit choice including zero vs timeout/omitted, engine/scoring 2.0.0 | 3 / 8 | `63f5b8443e6caee8b02ed65d8782c187edef6a57`, including preservation across failed save/retry |
| embeddedfigures | Original seven-choice line-context matching, engine/scoring 1.1.0 | 6 / 16 | Initial `6a319ba4f761a52d685ac124e32df61bb1cace8e`; recovery follow-up pending |

## Integration changes

- Preserve explicit old engine/scoring identities and original scoring; new
  recommendations use separately versioned stimulus/response semantics.
- Generate backend execution/catalog/seeds/presentation/scientific identities
  and frontend runner entries from the four task packages together.
- Add only the two missing shared Lineangle frontend type declarations. Other
  tasks use their provided local types; no blanket #441 type replacement.
- Explicitly suppress the product index in new Lineangle/Embeddedfigures
  frontend/definition fallbacks. Sharegame and the project matrix pilot also
  suppress the index. Natural values remain available under existing quality
  and public-projection rules.
- Materialize eight existing declaration modules into data literals to satisfy
  the existing declaration-only contract. Exported values before/after are
  deeply equal; old presentation values are not rewritten. All sixteen task
  seed/catalog/scientific/presentation modules pass the existing AST check.
- New sharegame professional report formulas explicitly use answered-only
  denominators. Zero is a valid choice; timeout/omitted are not preference zeros.

## Evidence and limits

Each source team's targeted tests and synthetic component browser evidence are
retained in its handoff document; they are not replayed as a combined full suite.
The matrix task records 36 tests, Lineangle 19, Sharegame 19 plus its one new retry
case, Embeddedfigures 23 initial tests plus its pending recovery evidence. These
are development evidence, not independent formal release qualification.

New integration checks (four tests) pass for generated frontend/backend exact
identity registration, unknown-version rejection, encrypted profile/report
freeze, actual experience/research FINAL budgets, current technical definition
readiness, authoritative scorer/report bindings and missing-value projection.
For all-missing share decisions, the existing V2 adapter classifies quality as
limited; preference metrics remain null, preference headline/chart are absent,
and completion/coverage counts may remain. An initial integration-test assertion
incorrectly expected invalid rather than testing this existing contract; it was
corrected without changing quality/scoring implementation.

Backend task dependency type checking passes for all four task/schema/scorer
closures. Whole-backend compilation is not claimed: this environment's stale
Prisma client lacks current schema fields and the attempted full check produced
68 diagnostics in ten unchanged modules. No database/client generation was done.
Frontend combined type checking is deferred until the pending renderer fix is
integrated to avoid repeating the same component check.

The matrix user name is 项目矩阵推理试测版（七题范围）. It uses only 3×3 figures and
three simple rule families; item 009 is mandatory, forms overlap, and no parallel
form equivalence, age/child adaptation, norms, reliability, validity or stable
sub-ability scores are claimed. Low-RT/missing flags use neutral operational
labels, not psychological explanations. See the task AUDIT.md and provenance
records for missing historical R/dependency versions and output-rights evidence.
matRiks' MIT software license and DescTools' GPL>=2 program license do not by
themselves establish that every SVG is a MIT-licensed image. Output rights remain
independently unverified and must stay disclosed; no new permission framework
or gate has been introduced for the other tasks.

At this checkpoint Embeddedfigures is not a full GO: restoring at a nonzero
trialIndex and retrying failed final completion are under source-team repair.
No task is installed/published by this PR. HTTP-persisted FINAL, installed four
entry flows, native devices and formal CI qualification are NOT_RUN. Viewport
screenshots are not native-device certification. No CI activation, production
access, Ready conversion, approval, merge or deployment is authorized by these
local results. The final handoff must replace this pending entry when the new
source head and review arrive.
