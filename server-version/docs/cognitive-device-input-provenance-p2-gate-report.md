# COG-P2 Device & Input Provenance V1 — Cloud Validation Gate Report

Date: 2026-09-07
Base: main@6033384d7db7af3294922b5f07d1a88f8749a3bb
PR: #62 feat/cognitive-device-input-provenance-v1

## 1. Validation scope and current status

This report records executed evidence, not a plan.

Code changes were made only on the COG-P2 branch. No merge was performed. No COG-P3, PR #54, or runtime/scoring performance work was started.

At report time, the latest code head before this documentation update was:
1f835485c77260b1d09e7ce0b6d575f66e43f4d9

The latest CI run for that head was run #369, id 34078548290:
- CodeQL: success
- backend: queued
- frontend: queued
- docker: queued

Therefore the four-job latest-head gate is not complete.

## 2. Cloud environment

Work shell observations:
- Node: v24.19.0; Node 20.20.2 was available through an npx probe, but no repository-local install could be run.
- Docker and Docker Compose: unavailable in the Work shell.
- PostgreSQL client/server and Redis server: unavailable in the Work shell.
- Chromium application: unavailable in the Work shell.

The authenticated GitHub connector could inspect and update the PR, but a shell git clone was not authorized in this session. The code/test commits were therefore applied through the authenticated GitHub repository interface. No local repository, node_modules, database, Redis instance, Docker container, or browser app stack was fabricated.

The formal CI workflow targets Node 20, postgres:14-alpine, and redis:7-alpine. Run #357 proved that its backend clean-room services can start on the GitHub runner.

## 3. Git and PR state

- origin/main: 6033384d7db7af3294922b5f07d1a88f8749a3bb
- PR head at handoff: 10b4a35fad6674e07b4bf5ffd695cc2c805cfc89
- PR head after code/test fixes: 1f835485c77260b1d09e7ce0b6d575f66e43f4d9
- mergeability: true
- PR state: open, not merged
- new commits: lint fix; non-blocking metadata persistence fix; frontend persistence test; final-submit provenance input typing; authenticated/public/raw durability tests; frontend event/resume tests; hook-test import fixes; constrained-runner Docker build serialization.

The branch remained based directly on origin/main. No force reset, rebase, or unrelated branch-history rewrite was used.

## 4. GitHub CI evidence

Run #357, id 34074457069, was the first validation run after handoff:
- backend: success, including npm ci, audit, Prisma generate/migrate, seed, backfill, release preflight, build, full regression, and critical integration no-skip assertion;
- frontend: failed at lint because administration-provenance.ts used let where const was required; fixed in 7aa92787;
- CodeQL: success;
- Docker: failed during the production image build with failed to execute bake: signal: killed after the frontend Vite build transformed 5569 modules. Compose/topology/monitoring configuration checks passed.

Run #368 for the intermediate code head was superseded by the next commit. CodeQL passed; the other jobs were queued.

Run #369 is the latest run for the code-fix head at report time. Only CodeQL has completed successfully; the three self-hosted jobs remain queued. No current-head backend/frontend/Docker result is available yet.

The Docker failure was investigated against the source: the frontend Dockerfile is byte-for-byte the same on the PR branch and main. No main workflow run was available, and the connected GitHub capability cannot dispatch a temporary main run, so pre-existing status could not be proven by A/B. A minimal CI-only workaround was added in 1f835485: COMPOSE_BAKE=false and COMPOSE_PARALLEL_LIMIT=1 on the existing production image command. Image definitions and runtime topology are unchanged.

## 5. Backend COG-P2 gates

Implemented coverage on the branch:
- strict AdministrationProvenanceV1 contract;
- canonical replay identity with optional provenance;
- legacy no-provenance canonical shape remains trials-only;
- authenticated unified FINAL raw-envelope durability;
- changed-provenance replay conflict;
- public unified recovery FINAL propagation;
- result/trial isolation;
- encrypted raw payload round-trip.

The existing instrument-final-submit.postgres.integration.test.ts was extended rather than creating a separate framework. It asserts one encrypted CognitiveRawSubmission write, no CognitiveTrial provenance duplication, exact decrypted provenance, same-provenance replay, changed-provenance conflict, and legacy hash compatibility.

Execution status:
- clean install/audit: current head pending in run #369; local Work execution blocked;
- Prisma generate/migrate, seed, backfill, release preflight: current head pending; run #357 baseline succeeded;
- backend build: current head pending; run #357 baseline succeeded;
- focused provenance tests: added and included in CI; current result pending;
- full regression and critical DB integration no-skip gate: current result pending;
- skipped: no-skip result for the current head is not yet available. Run #357 baseline reported success.

## 6. Frontend COG-P2 gates

Implemented/tested in source:
- O(1) modality aggregation;
- touch, mouse, keyboard, mixed, pen/unknown semantics;
- editable input keydown exclusion;
- control clicks excluded from measurement modality;
- event listener cleanup;
- stored PHONE x TOUCH resume followed by keyboard becomes PHONE x MIXED;
- final metadata persistence failure is non-blocking and FINAL still submits provenance.

Execution status:
- npm ci/audit, lint, typecheck, full tests, and Vite build for the current head: pending in run #369;
- initial lint failure was fixed and covered by a follow-up test commit;
- local Work frontend execution: blocked because no shell clone/dependencies were available.

## 7. Browser and IndexedDB smoke

Not executed in this Work session:
- desktop mouse and desktop keyboard app smoke;
- Chromium touch/mobile emulation;
- IndexedDB refresh/resume;
- mixed-input browser smoke;
- cross-context public recovery.

Reason: the Work shell had no runnable application stack because Docker, PostgreSQL, and Redis were unavailable, and the authenticated browser session had no repository/app context. No physical iPhone, Android phone, or tablet smoke was executed. Browser emulation must not be reported as physical-device validation.

## 8. Durable-storage and architecture review

Static source/diff review confirms:
- Prisma migration: none;
- CognitiveSession provenance columns/index: none;
- second provenance truth: none;
- per-trial provenance duplication: none;
- scorer impact: none;
- report impact: none;
- Bundle impact: none;
- raw user-agent, fingerprint, GPU/canvas, persistent device ID, location, IMEI, MAC, or serial capture: none;
- Trail Making historical device fields were not deleted;
- Trail Making provenance warnings remain non-degrading;
- provenance persistence uses the existing encrypted CognitiveRawSubmission FINAL write.

The new integration assertions are designed to prove extra DB query/write count remains zero for provenance, but current-head runtime evidence is pending run #369. No local query-budget test could run in the Work shell.

## 9. Review closure

The Copilot concern about IndexedDB metadata failure aborting FINAL was addressed by catching metadata-storage errors and retaining FINAL submission behavior. The original inline thread is outdated after the fix; it remains unresolved pending human review.

## 10. Remaining blockers and limitations

1. Latest-head run #369 has backend, frontend, and Docker jobs queued; the required 4/4 latest-head CI gate is not green.
2. Work-shell clean-room execution could not be performed because authenticated shell clone access, Docker, PostgreSQL, Redis, and repository dependencies were unavailable.
3. Cloud browser / IndexedDB / public-recovery smoke was not executed.
4. Physical mobile/tablet smoke was not executed; this is an expected non-blocker and must be run separately if needed.

STOP before merge and wait for human review.
