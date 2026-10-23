# Simon Survey pilot acceptance

## Scope and release boundary

The native package is a DRAFT / PILOT research tool, not a normed or diagnostic test. Its working Chinese instructions are not a validated translation. Software frame timestamps do not establish hardware-calibrated stimulus or response timing. The target administration is a desktop or laptop with physical left/right arrow keys.

The first shared prerequisite commit adds explicit native-v2 registration and a closed Survey protocol dispatcher. The second prerequisite is database migration `20261023170000_survey_cognitive_exact_protocols`. Simon content and its Survey wiring follow these prerequisites. Do not deploy only content against the historical 120-only database constraint.

No existing publication, version, session, or FINAL may be overwritten to install Simon. Any later protocol/configuration/scoring change needs a new frozen identity. Existing Go/No-Go identity and measurement digest are preserved. Pilot catalogue eligibility is not equivalent to production approval or participant access authorization.

## Data and protocol boundaries

- The backend owns the exact fixed configuration and recomputes all scores from 100 ordered formal trial envelopes. The 20 practice trials remain outside persisted scoring.
- Condition derives from stimulus side versus required response side under the seed-selected mapping, never from the actual response.
- Omission and technical invalidity remain distinguishable. Missing condition-specific valid RT yields null, not zero. Signed differences have no automatic good/bad interpretation.
- The database binds count to the unique frozen COGNITIVE parent slot, publication, measurement digest and template. The application additionally validates complete frozen identity, config hash, protocol signature, seeded sequence and trial evidence.
- Parent FINAL stores bound child references, not duplicated raw trials. Participant feedback remains the selected frozen allowlist. Authorized trial export describes mapping, color, stimulus side, required response side and technical validity.
- Historical result UPDATE/DELETE protection and scope foreign keys remain unchanged. After any Simon FINAL exists, rollback must stop new admissions while preserving the additive schema, not restore the historical 120-only constraint.

## Reproducible local checks

Use only an isolated synthetic database with the existing integration safety guard. Never point these commands at a shared or production database. No account/permission change or publication on a live system is part of these checks.

1. Apply migrations in the isolated database.
2. Run `psql -v ON_ERROR_STOP=1 -f src/__tests__/survey/cognitive-protocol-migration.sql` from backend. It creates a transaction-local test schema and rolls back all objects. It checks both accepted protocol counts and eight rejected parent/count/slot/digest cases against the actual migration source.
3. Run affected cognitive manifest, native registry, Simon scorer, Survey protocol, FINAL/parent-reference and export tests.
4. Run the isolated `research-cognitive.postgres.integration.test.ts` selected Simon FINAL and existing Go/No-Go FINAL/reference cases. These exercise real persistence, concurrent replay, server recomputation and immutable results.
5. Run frontend trial envelope, Simon runner, editor and Survey measurement/preview tests. Previews must prepare the exact deferred runner before mounting it; they must not create official sessions or scores.
6. Run scoped cognitive types and backend type checking, one memory-heavy process at a time. Run the Simon onboarding checker using `node --import tsx src/scripts/cognitive-onboarding-check.ts simon --json` where a tsx IPC socket is not supported.

## Remaining human release gates

A passing synthetic suite does not substitute for a real desktop keyboard/browser walkthrough, timing calibration, independent scientific review, Chinese instruction review, or public-library production approval. Review speed and accuracy together. Do not add unverified norms, percentile conversions, diagnosis cutoffs, or the upstream heuristic as a clinical threshold. Keep the package DRAFT/PILOT until the applicable gates are deliberately accepted.

## Local verification record (2026-10-23)

- Backend affected suite: 6 files, 41 tests passed. Additional export tolerance regression: 3 tests passed.
- Frontend affected suite: 4 files, 22 tests passed, including repeated loss of focus across formal trials and deferred preview runner preparation.
- Isolated PostgreSQL FINAL suite: 3 selected tests passed; 12 unrelated cases were not selected. The migration-only transaction test accepted 2 valid rows and rejected all 8 invalid protocol/parent rows.
- Backend TypeScript check passed. Cognitive manifest check and dependency guard passed (246 modules).
- Onboarding reports technical ready and pilotPublish ready, with no blockers in those two gates. Scientific declaration remains valid PILOT, with explicit human-evidence blockers for RESEARCH_READY.
- Independent code review confirmed mandatory observed timing, seeded ISI, matching envelope clocks, persistent focus invalidation, and consistent scorer/export duration tolerance. This is code review, not human scientific or hardware-timing validation.
- Frontend application TypeScript check passed with a 2048 MiB heap cap, run alone after backend checking. Earlier concurrent unbounded runs were killed and are not counted as passes.
