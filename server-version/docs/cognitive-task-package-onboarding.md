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
