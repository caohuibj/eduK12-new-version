# C16–C17: course-scoped numeric analysis and independent quality review

Implementation in progress; no dynamic qualification or deployment claim.

Base: `825170d223e23aac4093c7a1513b541b0a9b67a7`, tree `28d0424d4382ce8f6646c700b3d17eab25b2cb7d`.
Worktree: independent same-node `eduk12_c16_20261018`, branch `training-c16-c17-20261018`.

## Frozen scope and integration

- Explicit course selector identifies logical waves, tasks, exact publication/configuration/variant and metrics. No new TrainingProject/Wave runtime, scoring system or export queue.
- Authorized historical course facts are read in a consistent database snapshot. Exact attempt/epoch/source hashes, dictionary, real authorization snapshot and quality revisions form a server-derived manifest. A cutoff alone never freezes a sample.
- API returns bounded aggregate results and a compact manifest summary. Full source manifest stays in original ExportBatch options and strict artifact provenance. Worker and download revalidate exact selected sources; later participants cannot expand that manifest.
- An export request supplies the compact summary including its original cutoff. The server reconstructs all authorized facts and checks the resulting manifest hash; client hashes and source identities are not authority.
- Only an actual stable user or existing study-local identity may pair. Duplicate observations are rejected, not silently ranked. Distinct logical wave aliases cannot make one observation into two timepoints.
- Numeric statistics reuse finite/overflow-checked reporting operations and Type 7 quantiles. Matched selection is extracted from the organization wrapper without changing its public output. Comparability, privacy floors and publication/configuration/variant strata remain explicit.
- Quality decisions are separate rows keyed by course/attempt/epoch/source hash with CAS revision, reason and reviewer. Append-only audit is a separate table. No source FINAL/hash/score/task updates or rescoring.
- Current course membership is not used to manufacture historical attribution or remove departed participants. Course sharing and template grants do not grant participant/raw access. Standalone historical facts without trustworthy course binding remain unscoped.
- Long/wide/dictionary use one normalized source and column dictionary. Exclusion, incomparability, non-assignment, unanswered and missing FINAL remain distinct; suppression does not fabricate zero scores.

## Checks, execution location and budget

All execution is on the current assistant cloud node. No external task, Mac, production, PR or CI execution. Independent official-registry dependencies and fresh Prisma Client use the pinned Node 24.21 executable. Heavy tests/build/SQL measurements serialize on the shared measurement lock.

Changes → failure checks:
- Shared pure core → hand-derived numeric/matched/overflow/duplicate/missing/exclusion/compatibility tests.
- Source and authorization adapter → selected-only poison fixtures, exact identity, current permission revocation, historical course scope and batch query shape.
- Quality schema/service → additive migration, immutable audit, CAS and generation/download races; old accepted rows unchanged.
- Original queue adapter → strict manifest preservation, per-source authorization, CSV/ZIP lifecycle and stale artifact rejection.
- Course UI → source selectors, stale/suppressed/ambiguous states, explicit quality vs completion and bounded paging.

Existing C14 four-tool accepted facts are reused read-only from an independent stopped-state clone. New larger fixtures are explicitly synthetic, not browser completions. SQL counts and timings at 10/20/50 participants qualify absence of N+1 in this path only, not capacity or C26 throughput. Browser/native/media remain C25.

First recoverable source checkpoint target is 20–30 minutes. Initial implementation/integration budget 60–90 minutes and targeted real PG/HTTP qualification 20–40 minutes. Prior failures remain archived; only invalidated/missing checks run. Evidence status must distinguish source review, unit tests, real PG/HTTP and full capacity qualification.

## First recoverable checkpoint (13:21 UTC, WIP)

Models/migration, source adapter, shared core, original queue integration, course API/UI and initial harness are present. Independent dependencies and fresh Prisma succeeded on Node 24.21. Core/source/service/export and frontend targeted checks have passed in their documented input boundaries. Original build prerequisites passed; prior TypeScript integration errors remain recorded and a final consolidated type build is pending at this checkpoint. Test results without persisted raw logs are explicitly reported as execution-tool stdout only in `c16-evidence/checkpoint-01/summary.json`.

This checkpoint is recoverable source, not C16/C17 acceptance. Real PG upgrade/HTTP/CAS/queue/download/10–50 participant measurements and old-row invariants remain unexecuted. Harness is being extended with explicitly synthetic two-wave four-tool facts; original C14 Form is nonnumeric and cannot be falsely presented as a numeric longitudinal observation. Browser/native/media and capacity remain separate C25/C26 work.
