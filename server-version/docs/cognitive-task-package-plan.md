# Cognitive task packages — reviewed implementation plan

Base: `01f5a46ac21235a9d5fefb950e89ef68b7e82be4` (2026-09-21).
PR #140 is merged. Target: `content/cognitive-expansion`. No merge is authorized.

## Review corrections to v3

1. PR1 owns structural migration, including catalog/seed/presentation ownership. PR2 owns evidence scope, eligibility and maturity enforcement. PILOT remains the existing default; structural discovery must not require central maturity edits.
2. Existing compiler hashes include metric/report wording. Preserve those legacy execution definitions byte-for-byte in meaning. Participant wording belongs to a separate versioned presentation sidecar, frozen in the existing encrypted report snapshot; do not add it to compiler inputs or change hash algorithms. Media presentation is a different existing contract and must remain untouched.
3. Absence in a newly frozen presentation is authoritative. It must never trigger lookup of live wording. Only historical snapshots lacking a presentation version use the legacy adapter. Freeze before completion, not merely when a result is rendered.
4. Frontend identity is (testType, engineVersion); multiple backend scoring identities may deliberately share one runner. Duplicate *runner bindings*, not multiple scoring versions, are invalid.
5. Discover declarative package descriptors at build time, validate paths/exports/identity/parity, then generate static imports. No production filesystem scan. Generated catalog and seeds must be consumed by production code, not unused proof artifacts.
6. Runtime metric categories currently consult analysis evidence. Materialize the existing categories in task execution semantics so future governance edits cannot alter runtime hashes.
7. Keep schema/scorer locations where useful. Task package boundaries are logical, with explicit owned files. Use npm scripts consistent with the repository's package-lock files; introducing pnpm is unnecessary.
8. Preserve registry/catalog/seed ordering explicitly with a legacy order value; new packages use deterministic identity ordering. Sorting existing registries alphabetically would otherwise alter API and UI order.
9. A synthetic package must exercise the same discovery/generation/adapter functions as production, from a separate fixture root, and must never enter production manifests. Changed-path policy must reject unknown paths and forged generated output.
10. CI currently does not automatically target cognitive-expansion. Add a focused PR workflow for this base, then verify a run exists for the pushed head. Stop after triggering CI; do not wait for completion or merge.

## PR1 sequence and checks

- Commit 1: immutable compatibility capture at the base above; existing normal/scoring golden fixtures remain independently maintained. Capture all identities/profiles/configs, compiler payloads/hashes, protocol signatures, per-flag quality outcomes, empty scorer behavior, and publication readiness.
- Commit 2: task-owned definitions and execution assembly, preserving scoring algorithms and protocols.
- Commit 3: deterministic backend/frontend/catalog/seed projections and drift/dependency/parity checks.
- Commit 4: task-owned phase/quality/category semantics; remove central inference.
- Commit 5: task-owned participant presentation and freezing; historical adapter and isolation tests.
- Commit 6: unknown-task structural proof, content path classification, CI and onboarding instructions.

PR1 must retain standard **and research** publication requirements. No AI integration, DB migration, lifecycle change, scientific promotion, or automatic publishing.

## PR2 retained scope

Add a versioned deterministic onboarding decision/blocker contract; standard-only PILOT publication with absent-profile rejection; executable completeness and negative matrix; exact-identity/profile/protocol/stimulus/population-scoped evidence and declared <= eligible checks; full unknown-task DRAFT → explicit publish → attempt → FINAL → report proof. Expensive browser checks remain CI-only. Human review and explicit publication remain authoritative.

## Validation interpretation

Local database integration requires an isolated database and is not replaced by mocked tests. Mark unavailable checks explicitly. CI completion is a merge prerequisite, not a prerequisite for ending this requested implementation task.
