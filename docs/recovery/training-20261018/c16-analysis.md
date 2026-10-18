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

## Review-hardening checkpoint (13:30 UTC, WIP)

Required FINAL plan/slot evidence now fails closed; legitimate optional skips retain NOT_ASSIGNED. ADMIN follows the existing teacher disclosure capability contract. Canonical NOT_CALCULABLE remains null through valid/paired counts, long/wide/dictionary and UI. The organization wrapper preserves prior early-null short-circuit behavior. Export preparation performs one authorized frozen graph read, retaining independent after-generation and download revalidation. Quality uses Serializable CAS, translating only expected Prisma serialization/unique conflicts to 409 while unknown database errors propagate and roll back. Selected-cell and bind budgets reject oversized source requests before expensive reads.

Frontend final typecheck and Vite build pass; 40 distinct focused cases are covered across documented incremental runs. Targeted backend review fixes pass their recorded tests. Two-wave four-tool synthetic fixture scripts are complete and statically checked, using accepted frozen scientific facts without rescoring. Full real-PG/HTTP/queue/10–50-participant validation is still pending. Form snapshot duplicate reading/decryption is a remaining bounded performance opportunity, not removed at the cost of provenance validation.

## First real PostgreSQL run and V1 policy metadata correction

HTTP01 verified the pinned C14 dump against all 205 old tables and preserved every old column/row across 171→172 migrations; only the two quality tables were added. Restricted-role checks passed, and CourseStudent columns stayed unchanged. The first four-tool numeric request then failed closed with 404. An independent actual-dist probe isolated Scale policy resolution: V1 CUSTOM_DESCRIPTIVE required authoritative instrumentClass omitted by the narrow child projection. Form, Cognitive and SJT each yielded 20 observations in the probe. No numeric/queue/CAS/performance acceptance is claimed from this failed run.

The correction reuses already-authorized batch-loaded Scale metadata after exact child/item/relation Scale-ID and frozen scientific identity checks. It adds no query and preserves teacher capabilities and UNKNOWN/V2 restrictions. Six targeted tests pass; final dynamic recheck remains pending. HTTP01 services were stopped and source/input invariants passed. Its verified migration phase is eligible for reuse by the separately bound continuation, avoiding a needless repeat of the old suite.

## Compact source identity and representation compatibility

HTTP02 passed the prior V1 capability boundary but failed before any HTTP acceptance check: canonical hashing correctly rejected a Symbol-marked narrow Scale report view. The adapter now obtains the original result digest from the same transaction's verified compact facts, keyed by the exact bound child, and checks the accepted envelope bridge. It does not remove markers, hash a partial permission view as if original, or read raw answers.

The accepted canonical loader is reused for all existing representations: inline envelope, SCF2 reference, and legacy SCALE_FACTS_CANONICAL_REF. Before reference lookup, the adapter validates selected parent/epoch/slot, Scale unit, child ID, submission and applicable payload binding. Equivalent forms retain identical source hashes/fingerprints; missing/wrong references and immutable canonical hash drift reject. Shared runtime helpers and their default behavior are unchanged. Reference inputs add one bounded immutable-fact batch and the existing canonical validator may expand scored item facts internally; these are explicit SQL/memory costs to measure, not zero-cost claims. No raw answers or item-score details are exposed in analysis, logs or exports.

The independent boundary seed checks also exposed and corrected synthetic organization-role and canonical-reference fixture assumptions. HTTP01/02 failure history, input hashes, process exits and invariants remain recorded in the checkpoint-04 summary; neither run qualifies statistics, CAS, exports or performance. The next frozen runtime continues from HTTP01's verified additive upgrade, whose schema/ACL/package inputs are unchanged.

## HTTP03 partial dynamic qualification and alias admission

On frozen 94d2a1fb, real production-dist HTTP two-wave four-tool hand-derived numeric checks passed at 10/20/50 participants. Actual PG event counts were 25 cold and 25 hot at every size, with zero CourseStudent reads. Cold elapsed times were approximately 130/201/358 ms and hot 108/141/283 ms. These are single observations at each size, not p95, throughput or C26 capacity evidence. Owner access and nonowner/student/share-only denial also passed.

The next same-source logical-wave alias check expected 409 but received 500. That original failure is preserved; its precise original-dist exception stack was not captured (a later diagnostic attempt stopped at the measurement lock). A pure selector preflight now rejects identical task/publication/configuration/variant/item/metric selections across logical waves before any transaction. Different tasks or variants remain valid. Two focused tests and the final type build pass. The source/statistical implementation is unchanged, so the three accepted dynamic phases are retained; the continuation begins at the failed alias boundary rather than replaying those phases. Remaining full-case, quality/CAS, original queue/export/download, disclosure, poison and restore checks are still pending.
