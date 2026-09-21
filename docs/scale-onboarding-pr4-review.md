# Scale onboarding PR1–4 review

Reviewed the merged PR1–3 baseline and PR4 head `a79a1cdb0ad946702cc394da7a6adc7ceb97ee16` in an isolated worktree. This patch belongs to PR4; it does not execute production backfill or merge the PR.

## Corrections

- Shared authorization resolution no longer resurrects an approved version superseded by a revocation in the same authorization lineage. Independent valid grants and newer drafts retain their existing semantics.
- Publish preview rejects DRAFT/RETIRED executable sources and empty deployment modes. Install dry-run checks all persisted revisions, including retired revisions, so apply cannot discover an immutable revision conflict after an apparently successful preview.
- Library launch availability respects rights and localization diagnostics independently of product publication status. Package ordering remains compatible and evidence summaries derive population limitations from the instrument source. Old test imports now exercise the source-owned catalog and localization rather than deleted overlays.
- Questionnaire/public questionnaire/composite context preflight reads the policy from the actual frozen V2 runtime. The explicit V1 compatibility path is not accidentally subjected to newly migrated policy requirements; managed V2 attempts still require context collection before question delivery.
- Backfill verifies completed checkpoints against live scale identity, active revision and policy hash. It journals PREPARED state before committing deployment changes, so a failure writing the post-commit checkpoint does not turn an applied change into an unowned NOOP. Resume reconciles that state; rollback verifies the policy hash and is idempotent after an interrupted checkpoint write. Corrupt checkpoint files and rollback plan-hash mismatches fail closed.

## Backfill operation

Use a durable, writable checkpoint path and retain the plan and checkpoint together. A PREPARED entry may mean either that the database transaction rolled back or that the transaction committed before final checkpoint persistence; resume or rollback reconciles it with the database. Do not delete or manually alter the checkpoint to force continuation. Changes to the active deployment cause a stop for reconciliation. After rollback, use a new deployment revision for another activation: historical retired revisions remain immutable.

## Validation

- Fresh isolated PostgreSQL 14 database: migrations and generic source seeding passed.
- Backend generated-index check and TypeScript build passed.
- Focused Scale + V32-2 + run-start + questionnaire concurrency regression: 51 files, 308 tests passed.
- Frontend: lint (0 errors, 100 pre-existing warnings), typecheck, 125 test files / 469 tests, and production build passed.
- Six original definition/scoring digests and literal historical V1 frozen hashes remain pinned by compatibility tests. V2 HTTP/PostgreSQL tests cover context collection, age boundaries, revocation, concurrent activation, replay, restart, audience-safe projection and backfill interruption recovery.

The first concurrent whole-backend run exposed the corrected migration failures plus contention between independent database pressure suites. The affected pressure suites passed when run serially; final full-suite results are recorded below. GitHub CI is dispatched after pushing, without waiting for completion.

Final whole-backend run: **324 files, 2018 tests passed, zero skipped** (`npm test -- --maxWorkers=1`), with all integration database variables pointing only to the isolated PostgreSQL instance.
