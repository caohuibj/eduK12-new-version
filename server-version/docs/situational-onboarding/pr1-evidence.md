# PR1 implementation and acceptance evidence

Analysis base: `a3098d845c0b3b30cea747f26d7491d11d0489c0` (main after Cognitive #149).
Branch: `feat/sjt-zero-core-onboarding`. Status: implementation/local validation; draft PR, not authorized for merge or deployment. Final remote head and CI runs are recorded on the PR.

## Commit map

- C01: capture main compatibility baseline before edits.
- C02: data-only source schema and content path boundary.
- C03: deterministic static discovery/generation.
- C04: technical publication, content-bound review and immutable identity gates; extract existing package validation without changing scoring.
- C05: migrate the three production sources, preserve compatibility exports, replace handwritten registry, expose the real V1/V2 union.
- C06: CLI/scaffold, CI review authority, unknown-task DB lifecycle, frozen Bundle read fix, acceptance tests and runbooks.

## Acceptance map

| Plan ID | Evidence | Status |
|---|---|---|
| A01/A02 | onboarding.test.ts + unknown-onboarding.postgres.integration.test.ts: unknown V1/V2 discovered, schema/goldens/compile/published registry, real standalone/resume/replay/history/report and Bundle FINAL | PASS locally |
| A03 | onboarding-cli.test.ts: temporary Git repository; scaffold + actual generated import loading; only three owned JSON files and generated manifest differ | PASS locally |
| A04/A05 | onboarding tests: schema errors, duplicate identity, symlink/executable rejection, drift; two identical JSON CLI outputs, actual generated module load | PASS locally |
| A06/A07 | onboarding tests: DRAFT/PUBLISHED/RETIRED, invalid publication, stale digest, forged migration, changed/deleted published identity; review-authority transport tests | PASS locally; live GitHub approval requests are performed by CI for future new publications |
| A08 | existing definition/scoring/media suites plus golden key/value/quality, channel/branch/terminal coverage negatives | PASS locally |
| A09 | onboarding-baseline.test.ts: all three original definitions, goldens, compiled runtime, runner, results and published states exactly match pre-edit main | PASS locally |
| A10 | frontend SJT suites and real Chrome text/static IMAGE+COMIC/branching/VIDEO scripts | Local browser results recorded below |
| A11 | real unknown-task DB tests: retired source blocks new admission; frozen in-progress Bundle state, embedded FINAL and completed report still work; existing snapshot/branching tests | PASS locally; binary downgrade is not claimed |
| A12 | existing PostgreSQL standalone/branching/Bundle tests: concurrent/replayed FINAL, mixed Scale+Cognitive+SJT parent, frozen identities and canonical result | PASS locally |

## Local commands/results

Run from backend unless a path is given. PostgreSQL 15 used a newly created isolated database with all 76 migrations; no developer/production database was used. Integration URL and feature flags must be explicitly supplied; do not substitute a real database URL.

- `npm run build`: PASS.
- `npm run situational:contracts`: PASS, all three source packages PUBLISHED and technically eligible; no source status mutation.
- `npm run cognitive:contracts`: PASS (manifests and 228-module dependency guard).
- `npm test -- src/__tests__/situational src/__tests__/assessment-bundle/situational-bundle.test.ts src/__tests__/assessment-governance src/__tests__/composite/situational-bundle.postgres.integration.test.ts`: final relevant regression PASS with `--no-file-parallelism`, 167 tests/31 files. In-test 10/30/60 concurrent FINAL requests remain unchanged. One earlier run alongside browser workloads hit transaction-acquisition contention; stopping browser services and isolating file execution resolved it without changing transaction/test limits.
- Frontend `npm test -- --run src/modules/situational src/modules/composite/__tests__/CompositeSituationalReport.test.tsx`: PASS, 41 tests/11 files.
- `situational-branching-browser-e2e.cjs`: ALL PASS, real Chrome; long/early paths, diagnostics, ambiguous-final recovery, history/export, authenticated/anonymous Bundle.
- `situational-bundle-browser-e2e.cjs`: ALL PASS, real Chrome; IMAGE/COMIC, refresh, zero draft writes, one final/canonical snapshot, stable frozen identities, anonymous recovery, aggregate-safe report.
- `situational-video-browser-e2e.cjs`: ALL PASS, real Chrome; full-view readiness, synthetic-ended rejection, refresh, answer-controlled branching, no playback telemetry in FINAL, embedded/authenticated/public completion.
- `situational-text-pilot-browser-e2e.cjs`: ALL PASS, real Chrome; published catalog, response/refresh resume, FINAL/result refresh, JSON export, loaded history, mobile layout.

Initial failures were retained as findings, not ignored: cwd/feature-flag omissions in the local regression invocation were corrected; the unknown V2 fixture was made data-only TEXT for asset-independent lifecycle tests; the independent media browser lanes exercise real media. Retirement exposed and fixed a frozen Bundle read defect. The generator entry guard was fixed to work with macOS realpath aliases. Text E2E locators were updated for the previously merged generic UI. Local video generation uses explicit libopus override because this machine lacks libvorbis; the default fixture behavior remains unchanged.

## Merge/deployment prerequisites

1. Run and inspect the complete remote ready-PR gate on final head. Draft compile checks are not a Full Gate substitute.
2. Main ruleset currently requires `merge gate / ready PR`. New publication authority verification is inside backend CI. Require the independent publication workflow check before opening future new-content publication, so a later review dismissal cannot leave an earlier aggregate success sufficient. Repository rules were inspected, not silently changed.
3. Media availability is deployment-specific. Existing StoredAsset readiness/hash and browser checks remain authoritative; an offline content gate does not certify remote bytes exist. New media content must include deployment asset verification evidence.
4. Keep old identities/scorers/frozen readers on rollback; do not claim an arbitrary pre-PR binary can read new identities. The runbook specifies forward-fix/compatibility retention.
5. PR2 scientific source ownership, promotion and historical labels are deliberately not implemented here. The legacy Composite PILOT marker remains, apart from the publication check removed from frozen state reads.
