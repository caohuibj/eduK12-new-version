# Situational standardized assessment VNext

Authority: main `f70078adcd7c1220f205559e34cd3d719b3b6ce4`, fetched 2026-10-01 (Asia/Tokyo).

Development branch: `feat/situational-standardized-vnext`. Isolated worktree `/Users/Qiang/projects/eduk12-situational-vnext`. Main's other development stays untouched. User instructed: develop now, no PR, no CI; integrate after preceding work merges. No production deployment or real research export is authorized. Research endpoint implementation and synthetic testing explicitly authorized in this chat.

## Baseline and integration dependencies

Latest baseline contains #210 journey/delivery/disclosure, #211 inbox, #212 result authority, #213 anonymous study waves. New raw/trial RESEARCH permission remains deferred there. Do not restore an implicit admin/teacher access path. Reconcile incoming Scale/main work before opening one integration PR. The user explicitly requested one future PR during the local review; the earlier 2–3 PR split is superseded.

Source review confirmed: V1/V2 scenes limited to three channels; channels bound one scoredConstruct; V2 frozen channel policy already separates requiredness and routing; DAG deterministic; FINAL writes one encrypted raw payload. Runner renders all channels together. Reachability-only pruning retained common-node responses after changing an upstream decision.

## Before / after

Before: scene → all channels on one page → scalar construct × channel mean → FINAL.

After: same Unified Assessment UNIT → bounded V2 measurement bundle → frozen choice/probe stages → raw option/value once plus bounded exposure journal → versioned pure scorer → rich Situational metrics → existing bounded canonical projection → one FINAL transaction.

No fourth runtime, loop engine, worker, per-step PostgreSQL persistence, model training, AI scoring, shared FINAL or global CanonicalUnitResult schema change. The only assessment-runtime file touched is Situational's own snapshot validator: it must accept the six-channel V2 runner projection it already authenticates. Shared compiler, finalizer and canonical contracts remain intact.

## Measurement bundle

V1 retains its structural three-channel limit. V2 supports one to six channels, with an explicit `measurementBundle` above three. Bundle declares `contractVersion`, maxRequiredResponses (≤4), maxOptionalDiagnosticResponses (≤4), maxTotalResponses (≤6), estimatedSeconds. Actual required/optional counts must fit these limits. Optional bundle responses require DIAGNOSTIC interaction role.

Purpose includes professional judgment, self efficacy, role legitimacy, felt responsibility, state emotion and social perception; historical purpose names remain valid. V2 policy separates interactionRole DECISION/DIAGNOSTIC, measurementRole SCORED/ROUTING_ONLY/RAW_ONLY/DESCRIPTIVE, and requiredness. Non-scored channels need no scoredConstruct and cannot retain choiceScores. Routing must remain required single choice.

## Option → construct evidence

Optional `evidence` carries a semanticVersion, a closed observable coding vocabulary and bounded opportunities. Roles: primary/secondary candidate, competing construct, external explanation and forbidden inference. No numeric weights in semantic/opportunity layers. Candidate coding never produces a score. Expert key contradicting an explicit forbidden inference is rejected.

## Scoring models

Legacy packages omit `scoring.model` and retain exact scalar output. Explicit `PROVISIONAL_SCALAR@1` and `EXPERT_KEY@1` run online. Expert contributions explicitly map scene × channel × option × metric; one response remains one raw observation even when several metrics use its evidence. Every SCORED channel must back at least one published expert metric, and every option of each backed channel needs an explicit key; no hidden zero contribution. Unscored expert probes require RAW_ONLY/DESCRIPTIVE policy. Non-scalar models require V2; V1 preserves legacy scalar semantics and cannot claim latent parameters or expert keys. Both scalar and expert mappings reject an explicit forbidden inference.

Nominal uni/multidimensional, consensus and criterion model identifiers are contract-only. Unsupported model/version fails closed, never falls back to scalar; publication rejects unavailable scorers. Parameter sets carry id/version/hash, calibration artifact/hash/method/population/date, option × construct references and optional uncertainty artifact. Offline artifact loading/training and future statistical scorers remain future work.

Rich metrics optionally carry estimate, precision (currently NOT_ESTIMATED, null SE/interval), opportunity coverage, independent mother-scene count and PROVISIONAL maturity. Canonical result stays bounded; no invented uncertainty or research-grade claim.

## Research assignment

Frozen assignmentVersion and bounded groups, one group per node. Variant weights define a reproducible draw from attempt ID plus exact frozen definition hash, without participant PII. Manifest records eligible set, selected variant, probability and seed/assignment identity.

Planned missingness only removes optional non-scored diagnostic channels. Timing variants can place explicitly staged probes before or after choice. Compatible consequence variants currently support TEXT_V1 and replace stimulus only, keep response surface/graph fixed and require one compatibility group. Compatibility still requires human scientific review; the schema cannot prove psychological equivalence. Assignment does not alter definitions after an attempt starts.

## Stages, edits and resume

Frozen stages partition channels exactly once: optional pre-probe stages, exactly one choice stage, post-probe stages. Runner displays current and already-confirmed stages, never future probe prompts. Confirmation locks the stage. Back navigation is view-only for confirmed stages; changing a core choice after probe disclosure requires a new attempt.

Meaningful events are persisted in the existing local final draft journal. Each logical interaction is one immutable event-batch write; old single-event journal rows remain readable. Interrupted local answer-cache writes recover values, revisions and stage confirmation from the journal. Cache timing is reused only for the exact same revision. Durable confirmations remain locked even when the cache write fails; FINAL waits for queued writes and reconstructs answers/stages from the sealed journal snapshot. The sealed FINAL preserves events, assignment identity and answers; retries replay identical content. Existing unstaged packages retain editing behavior with downstream history invalidation.

## Research events and history binding

Capture v1 records NODE_EXPOSED, RESPONSE_FIRST_COMMITTED, RESPONSE_CHANGED, PROBE_EXPOSED, STAGE_CONFIRMED, NODE_CONFIRMED and RESPONSE_INVALIDATED. Node/channel/stage identity, raw value, monotonic relative time, response revision and compact SHA-256 history identity bind evidence to the information condition. Maximum 4096 meaningful events, 400 KiB event journal budget plus existing 512 KiB FINAL limit; exhaustion fails visibly instead of silently dropping evidence. Continuous controls commit on pointer completion, blur or Enter, not every movement/keystroke. No mouse/focus/playhead monitoring.

History identity includes ordered ancestors and upstream response revisions. Same reachable node is not same history. Editing upstream invalidates the whole suffix, including common nodes and old staged confirmations. Fingerprint binding also rejects stale recovered responses after interruption between local writes. Server rebuilds trajectory and event state from the frozen definition and checks latest final values, stage order, exposure and immutable assignment identity. Client-reported exposure is consistency evidence, not trusted proof of what a human read.

## Missingness / opportunities

Structural not reached and planned not administered are derived server-side. Participant skipped is restricted to administered optional surfaces. Technical failure must be explicitly recorded; it cannot be inferred from absence. Invalidated old answers stay in historical event evidence and do not count as current observations. Export distinguishes first-ever response from first response in the final measurement history. Historical-only evidence cannot mark the final history as answered; an eligible optional answer lost to an upstream change is INVALIDATED_BY_HISTORY_CHANGE unless the final history has an explicit omission/failure reason. Unreached implementation opportunity never becomes zero score. Legacy first/exposure data is unavailable, not fabricated.

## Research export

Separate authenticated resource endpoint; never included in participant JSON/CSV. Requires exact-attempt, exact-definition, expiring researcher grant with approval reference and fixed pseudonymous projection. Roles do not imply grants. Default empty grant configuration denies all. No real grants installed during this work.

Export is built from encrypted frozen attempt definition and immutable encrypted raw submission, with digest/epoch checks. It includes pseudonymous attempt identity, model/definition/runtime hashes, scientific context, path, assignment, raw responses, first/final distinctions, events, opportunity missingness and option coding. No userId, username, participantKey, parent recovery credentials or ciphertext.

Embedded Bundle/public export remains denied because current parent RESEARCH raw/trial authorization is closed. Opening it requires source-owned permission integration, consent and resource grant checks in a later integration review; do not bypass current #212/#213 restrictions.

## Scientific governance

Existing scientific.json evidence can optionally bind metric keys, exact model version, parameter-set hash and content-addressed calibration/external-validity/invariance/subgroup/holdout/provenance artifacts. Existing executionRef, scope, evidence digest, governance revision and human review remain authoritative. Metric artifacts are bound to exact model/parameter identities. Their metric-specific evidence IDs remain inspectable; they contribute to whole-instrument eligibility only when they cover every published metric. Metadata cannot automatically promote maturity. Production packages remain unchanged.

## Compatibility and authoring

Old package schema/version/model omission preserves hashes and execution. Existing assertiveness, responsibility and anxiety prototypes keep their provisional scoring. TEXT/IMAGE/COMIC/VIDEO stay presentation-only. No new teacher content or media is authored.

Future authors define mother scenes, graph, bounded bundles, safe prompt stages and response roles first; then independently code observable options/candidate hypotheses. Select an explicit provisional key only where justified. Declare randomization and missingness before data collection. Frozen versions require fresh release review on change. Empirical parameter sets require exact provenance and an implemented scorer before publication. Never duplicate an answer to simulate independent constructs or treat coverage as validity.

## Single-PR integration / commits

Target: one feature branch and one PR to main after preceding main work merges. Keep semantic commits for review; do not create stacked PRs or rewrite the already-published commits during this local review.

Read the single PR in this order:

1. Scientific contract, scoring and frozen assignment foundation: initial commits 1–6.
2. Participant stages, capture and history invalidation: initial commits 7–10.
3. Research export, governance, acceptance and runbook: initial commits 11–16.
4. Local review corrections and regression evidence follow these commits.

These are sections inside one PR, not separate delivery branches. Frozen assignment, stage capture, server validation and runner disclosure must be reviewed together: enabling one side without the other can produce an unusable response surface or a rejected FINAL. The entire scope remains one Situational upgrade; there are no new database migrations, no production content changes and no new shared runtime/FINAL contracts. Default-denied research export is part of the same bounded feature, not a permission rollout.

No PR created. CI not requested or triggered. Implementation acceptance head: `28105bba71f57f1ed85e82bee6b2e342fe552b63` (the documentation-only tip follows it). Rechecked remote main before publishing the isolated branch: still `f70078adcd7c1220f205559e34cd3d719b3b6ce4`. No incoming main changes were integrated. Re-fetch main and compare permissions/frozen runtime dependencies after preceding main work merges; integrate without rewriting prior shared runtime changes.

## Acceptance matrix / known limitations

Local acceptance (2026-10-01):

| Gate | Result / evidence |
| --- | --- |
| Situational + authenticated Bundle PostgreSQL regressions | 31 files / 207 tests exercised: 204 passed in the broad run, 3 legacy PostgreSQL timeouts under concurrent host/build pressure. Both affected suites then passed serially (11 tests), including 60 concurrent FINAL and unknown onboarding. No assertion or source timeout was removed. Includes V1, V2, early terminal, diagnostics, standalone/embedded, replay and frozen raw/canonical separation. |
| New exact-grant export and FINAL PostgreSQL | 4 tests passed, including anonymous embedded recovery/FINAL/replay and denied embedded export; concurrent FINAL creates exactly one encrypted raw row, stale histories/assignments rejected before mutation, default deny/expiration/revocation/frozen principals tested. Separate capture/export contracts also passed (19 tests). |
| Frontend Situational | 12 files / 50 tests passed: staged disclosure and locked choice, optional/raw-only responses, continuous commit boundaries, converged history invalidation, sealed retry, result, JSON/CSV and old media surfaces. |
| Shared snapshot/canonical/Bundle/access regression | 26 files / 193 tests passed; 23 PostgreSQL opt-in cases skipped in that unit-only run. Existing shared core schemas/compiler/finalizer unchanged. |
| Main result/journey/disclosure policy | 24 files / 125 tests passed. |
| Main anonymous-study PostgreSQL | 2 tests passed in dedicated synthetic database, including exact-wave isolation, replay/admission and closed research/disclosure permissions. |
| Production onboarding | Manifest check and all three unchanged prototype packages passed publication/golden checks. Content digests remain anxiety `b77f282466eee822cd92f74987f5055828ae03ef032de5c09ca751d5d1d7a38f`, assertiveness `ecb1ec38d236e6fd4aeaff4964cc70df5901d0ac468c1a269216e9afa4359db8`, responsibility `f92428f35fa47b048d3529277950fe9714bf2e9ee053339d9eefe64a8468111a`. |
| Desktop/mobile real Chromium | 4 interaction cases passed: hidden future probe prompts, Enter commit, stage lock/resume, branch A → answered common → B → common answer invalidated/reload, FINAL/result, research HTTP 403. No per-answer Situational writes. |
| Browser capacity | 10/30/60 scenes, six channels per scene and 40/120/240 actual answers, real IndexedDB and FINAL; all passed. Final bodies 19,886 / 58,753 / 117,545 bytes. Heap growth <100 MiB smoke limit, not a production envelope guarantee. |
| Scorer/event smoke | 10/30/60 staged six-channel definitions; 40/120/240 raw answers, 170/510/1020 events; 38,510 / 115,650 / 231,380 bytes. Final measured scoring 1.95 / 1.02 / 11.01 ms; capture validation 25.57 / 115.63 / 507.05 ms on the busy local host. Compile/freeze 90.80 / 110.13 / 337.04 ms; serialization 5.10 / 3.12 / 16.90 ms; encryption 6.02 / 0.99 / 5.45 ms. Encrypted payload 77,142 / 231,422 / 462,882 bytes (existing hex AES envelope). |
| Compile/build | Backend and frontend pinned Node 24.21.0 type-check; frontend production build passed (existing large-chunk warnings remain). Browser helper API/frontend used host Node 25; all repository type-check/unit/PostgreSQL/build commands used pinned Node 24.21.0. |

These are local acceptance checks, not a claim that CI or a production release gate has run. An earlier broad run used host Node 25, missing Cognitive flag and concurrent database workers; it hit connection/admission timeouts. Required flag, pinned Node and serial post-build reruns resolved those setup failures; the new public suite allows a bounded 120-second cold shared-service setup and 60-second cleanup on this busy host, while its assertions remain unchanged; no tests were deleted. A browser run interrupted by frontend hot reload was repeated successfully on the stable implementation.


Required later: full current-head CI after integration, production resource envelope measurement, real screen-reader acceptance, calibrated statistical scorers and research permission for embedded/public attempts. No common norms, content maturity promotion or batch teacher content production. Framework success alone is not approval to publish Research Ready/Research Grade content.


## Local review and corrections (2026-10-01, no push)

Review baseline: published feature head `d76e5e70f55a9ec88c0c787a677564ccf6624e11`; compare against main baseline `f70078adcd7c1220f205559e34cd3d719b3b6ce4`. Review corrections stay local; no PR creation, branch push, workflow dispatch, real participant export or production grant configuration.

| Finding | Reproduction and correction |
| --- | --- |
| P1: partial journal operations and answer-cache failures can corrupt revision/stage/FINAL consistency | Sequential event writes can leave half an invalidation or confirmation; after a durable journal commit, cache failure leaves in-memory revisions behind or a confirmed stage editable. Resume displays recovered answers but the old seal uses cache rows only. Four injected-failure regressions reproduced these paths. Logical operations now use one immutable local batch, UI follows durable evidence, and sealing replays the journal. Shared finalDraftStore is unchanged. |
| P2: expert/scalar publication contract gaps | A V1 expert model bypasses V2 checks; an expert SCORED probe without a key is silently excluded; scalar scoring can contradict an option's explicit FORBIDDEN_INFERENCE. Three synthetic definition regressions reproduced the gaps. Non-scalar V1 models fail validation, every expert SCORED channel needs a published-metric key, and scalar forbidden-inference checks now apply. Production legacy definitions omit these fields and keep their hashes/outputs. |
| P2: historical-only optional responses misclassified in export | A → common optional answer → B → common without re-answer reports RECORDED/PARTICIPANT_SKIPPED despite an invalidated history. The regression validates the complete synthetic journal before export. Export now derives first-response status from the final history and distinguishes history invalidation. Default denial, embedded denial, exact resource/hash/expiry and principal rechecks are retained. |

Local correction commits (not pushed):

- `b2bf5cf7` fix(situational): recover atomic research journals across cache failures
- `fad37421` fix(situational): require complete and coherent scoring model evidence
- `37ba439e` fix(situational): distinguish invalidated histories in research exports

Review validation:

- Backend: 24 files / 180 tests passed, including definition/model/capture/export/governance/legacy media and 10/30/60-scene performance checks. The 20 PostgreSQL opt-in tests in five files were skipped in this review run; earlier integration acceptance is recorded above and is not represented as a new database run.
- Frontend: 13 files / 61 tests passed, including the full Situational module and shared finalDraftStore regression. Four new fault-injection tests cover revision recovery, confirmation locking, journal-only sealing and atomic multi-event operations.
- Backend and frontend Node 24.21.0 type checks passed; diff whitespace check passed.
- Real Chromium with real IndexedDB: injected answer-cache failure during choice and confirmation, stage-lock reload, deleted answer cache, and journal-derived FINAL passed. The actual browser-generated FINAL also passed the backend authoritative capture validator. This browser check used a synthetic local runner harness/API stub and did not claim a new PostgreSQL or authentication end-to-end run.
- Temporary harness/evidence lives in ignored local directories and `/tmp/eduk12-situational-vnext-evidence`; no synthetic credentials, production grants or test-only browser routes are shipped.

The local review found no additional unresolved blocker in the inspected change after these corrections. It does not replace integration conflict review, full current-main CI, PostgreSQL/browser release gates, production capacity checks or scientific approval. Before the one PR is opened, re-fetch main after the preceding work merges, reconcile permissions and frozen runtime interfaces, and rerun the full release checks on the integrated head.

## Semantic commit ledger

1. `695190c9` feat(situational): define bounded scientific measurement contracts
2. `4ee8b782` feat(situational): validate V2 bundles and response evidence
3. `b70e924f` feat(situational): resolve versioned pure provisional scorers
4. `1919c714` fix(situational): freeze VNext surfaces and reject unavailable scorers
5. `be21f9f3` test(situational): verify model and legacy contract compatibility
6. `a899638b` feat(situational): derive immutable research assignments
7. `3943492f` feat(situational): validate and encrypt bounded research capture
8. `cb0aa43e` fix(situational): bind draft answers to ancestor histories
9. `3ebbc852` feat(situational): stage choice confirmation and probe disclosure
10. `c651dc09` test(situational): cover history recovery and staged FINAL
11. `7e393920` feat(situational): authorize frozen research exports by exact resource
12. `1b85a739` feat(situational): scope scientific evidence to models and metrics
13. `10faec31` feat(situational): report bounded precision and evidence coverage
14. `e5f75b0e` test(situational): verify PostgreSQL authority and performance bounds
15. `28105bba` test(situational): complete browser public and capacity acceptance
16. Documentation-only acceptance/runbook commit; exact branch tip is reported in the task and discoverable with `git rev-parse HEAD`.

## Local reproduction and integration runbook

- Use a dedicated disposable PostgreSQL database and Redis instance. The browser helpers intentionally reject URLs outside localhost database `situational_vnext` at port 55473; API/frontend use 31473/51473 and Redis 55474. Apply existing migrations only; no new migration was added.
- Install locked backend/frontend dependencies, generate Prisma and use Node 24.21.0 for repository checks. Synthetic fixture registry requires both `NODE_ENV=test` and `SITUATIONAL_VNEXT_E2E_FIXTURE=true`; production discovery cannot load these packages.
- Set `SITUATIONAL_VNEXT_DATABASE_URL` to the dedicated database and run `server-version/e2e/situational-vnext-local-services.cjs`; run the seed helper with the same `DATABASE_URL`, then `server-version/e2e/situational-vnext-browser.cjs`. Seed credentials and disposable service keys are private temporary files, never committed. Browser helpers use real Chromium/Chrome and existing session/CSRF middleware.
- PostgreSQL suites accept `V32_3_INTEGRATION_DATABASE_URL` (and the new suite also `SITUATIONAL_VNEXT_INTEGRATION_DATABASE_URL`). Include `COGNITIVE_MODULE_ENABLED=true` for mixed Bundle regressions; use serial local workers on constrained hosts. Main anonymous suite uses `RELEASE_INTEGRATION_DATABASE_URL`.
- Research export is `GET /api/situational/attempts/:attemptId/research-export`. `SITUATIONAL_RESEARCH_EXPORT_GRANTS` is empty by default. Grant schema has exact researcher user, attempt IDs, frozen definition hash, expiry, approval reference and fixed projection `PSEUDONYMOUS_RAW_V1`. Never install a production grant as part of this change. Review actual consent/resource authority before a later approved rollout; embedded/public resources remain denied.
- Local artifacts are saved under ignored `server-version/tmp/situational-vnext-acceptance/` (allowlisted logs, synthetic screenshots and browser summaries; no keys/credentials). Synthetic infrastructure is stopped after acceptance.
- After the preceding main development merges, fetch main, review conflicts in Situational snapshot/FINAL/routes, disclosure/journey/anonymous authority and shared report surfaces, then integrate the whole feature in one PR, using the sections above as the review order. Run the repository's full current-head gate and browser/PostgreSQL suites before making any PR ready. This task creates no PR and dispatches no workflow.

Framework is ready for synthetic/pilot authoring against the contract after integration review. Batch formal teacher content production and Research Ready/Grade claims still require a separate content task, implemented calibrated scorer where needed, empirical artifacts and human scientific review. New statistical training, nominal/consensus/criterion computation, media consequence randomization and embedded research raw permissions are intentionally deferred.
