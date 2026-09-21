# Cognitive task package authoring (PR1 boundary)

This is the structural migration. The full onboarding decision/blocker CLI and
standard-only PILOT publication remain PR2. Currently both standard and research
are still required for publication. No AI service participates in these checks.

## Add a task using existing runtime capabilities

1. Create `backend/src/modules/cognitive/tasks/<task>/task-package.json`. Follow an
   existing package: declare exact backend identities, one runner binding for each
   engine, catalog, seed and participant-presentation exports. Omit legacy `order`
   values for new tasks; new identities sort deterministically after existing ones.
2. Add `package.ts`, task-owned execution definitions and explicit `semantics.ts`.
   Bind schemas, pure scorer and FINAL budget. Declare protocol phases, every
   quality effect and metric category. A new engine may have multiple scorers but
   must not have ambiguous runners. Existing schema/scorer modules may be reused.
3. Add the runner under `frontend/src/modules/cognitive/tasks/<task>/`. Runtime
   primitives and task-local files are permitted; backend scoring is authoritative.
4. Add catalog/source/provenance in `governance.ts`, DRAFT seed data in `seeds.ts`,
   and exact-identity participant wording in `participant-presentation.ts`.
   Seed `orders` has one element per seed; use `null` for new seeds. New seeds must
   remain DRAFT and pass the existing explicit publication review.
5. From `server-version/backend`, with locked backend/frontend dependencies installed:

   ```sh
   npm run cognitive:manifest:generate
   npm run cognitive:contracts
   npm test -- src/__tests__/cognitive
   npm run build
   ```

   Also run frontend typecheck and task/runner/report tests. Generation performs
   no network or runtime filesystem discovery. A second generate has no diff.
6. Review changed paths and generated output. `content-policy.cjs` exposes the
   TASK_OWNED / GENERATED / TEST / SHARED_CORE classifier foundation. Classification
   alone is not approval: generated files must pass exact drift checking and task
   fixtures must exercise behavior. PR2 will expose this through onboarding-check.
7. Submit for human content/scientific review. Create DRAFT configuration and use
   explicit publish only after the current readiness gates pass.

A missing file/export, duplicate identity/runner, missing runner, generated drift,
or forbidden import produces a stable `COG_*` diagnostic. Full versioned JSON
blockers, evidence-scope qualification and content-only CLI are PR2 deliverables.

## Presentation and historical reports

Execution definitions retain their existing compiler representation and hashes.
Participant labels, explanations, titles, tips, profile wording, visibility and
headline selection belong to the display-only sidecar. Change its
`presentationVersion` when changing wording. Do not change execution metric/report
metadata just to edit participant wording; those historical fields are hashed.

New assignment snapshots freeze the sidecar and report/metric/quality definitions
inside the existing encrypted report snapshot. V2 completion consumes that snapshot.
An absent optional field in a versioned snapshot never reads live presentation.
Legacy adapters only serve historical formats without a presentation version; do
not extend them for new tasks. Stored completed V2 result snapshots stay immutable.

## Scope and ownership

The package descriptor is build metadata. Generated execution, frontend, catalog,
seed and presentation projections are consumers, not a second hand-maintained
business source. Runtime imports are static. `task-manifests.test.ts` verifies the
actual export identities and counts against descriptors; frontend tests verify
actual runner exports. Dependency checks follow transitive runtime imports and
reject backend/UI, runner/backend, execution/governance and cyclic dependencies.

The fixture `TEST_ONBOARDING_UNKNOWN_V1` lives only in test roots. Its structural
test generates and imports real projections, scores a result and projects the
report. It is never part of production catalog or manifests. Full DRAFT → PUBLISH
→ attempt → FINAL → report acceptance is explicitly deferred to PR2.

New hardware, input modalities, timing contracts, adaptive engines or other
unsupported execution models require a separate platform capability change.
Scientific maturity and evidence qualification remain independent from execution
profile and publication lifecycle. Human review retains scientific authority.

## PR2 offline onboarding gate

Install locked dependencies in both `server-version/backend` and
`server-version/frontend`. From the backend run:

```sh
npm run cognitive:manifest:generate
npm run cognitive:onboarding-check -- reaction
npm run --silent cognitive:onboarding-check -- reaction --json
npm run --silent cognitive:onboarding-check -- --all --json
npm run cognitive:onboarding-check -- reaction --content-only --base <full-commit-sha>
```

JSON output is newline-delimited: one strict schema-version-1 decision per exact
scoring identity. Text uses the same decisions. Exit 1 means technical/Pilot errors
or a scientific declaration above eligibility; next-tier evidence gaps alone do
not prohibit Pilot release. A passing diagnostic is not a publication operation.
No command publishes a config or promotes scientific maturity.

A new package must supply `scientific.ts` (declared through the descriptor), exact
identity fixtures at `fixtures/<engineVersion>-<scoringVersion>.json`, and
`acceptance.frontendSuites` paths relative to the frontend. Normal fixtures must
produce outputs; empty and insufficient cases must pin outputs or exact errors.
Keep independent golden tests as the source of truth. The CLI executes the
scorer, authoritative envelope validation, report projection and declared DOM
suites. Those suites must cover the task's practice/formal transition, seeded
stimuli and balance constraints, applicable all-wrong/timeout/invalid boundaries,
and FINAL handoff. Do not substitute a placeholder or irrelevant passing suite.
Real-browser behavior is separately required by the normal CI/browser lane.

Review diagnostic `code`, `file`, `fieldPath` and remediation. Repair malformed
configs, missing profiles/metrics/assets and generated drift before repeating the
check. Content-only mode requires a pinned commit SHA; shared compiler, scoring
infrastructure, registries, workflows and unknown paths cannot claim content-only
status. Deletions and untracked files are included. This PR itself changes shared
core and is deliberately not content-only.

For Pilot, declare `PILOT` with no unsupported claim. To request Research Ready or
Research Grade, a human author supplies applicability and evidence references in
`scientific.ts`. Scope every claim/evidence item to the exact task/engine/scorer,
profiles, protocol signature, stimulus version and population. The evaluator
requires matching scope and uses the shared cross-family evidence tiers; it does
not certify the scientific quality of a reference. Unscoped catalog citations are
not eligibility. Evidence for one version/profile/population must not be copied as
proof for another. Review the declaration explicitly, regenerate, run all gates,
and use the existing config publication workflow only after human release review.

Historical presentation is frozen with the assignment and used by both FINAL
paths. To alter execution semantics or repair a historical metric type declaration,
create a new execution identity; never regenerate the old baseline to conceal drift.
