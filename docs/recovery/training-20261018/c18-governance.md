# C18 anonymous study governance — checkpoint 01

This is an implementation checkpoint, not a PostgreSQL/HTTP qualification, CI result, deployment, C25 browser result or C26 capacity claim.

## Frozen contract

- Legacy `joinStudy(consent:true)` only creates a study-local recovery identity. It never backfills research consent/version/time. Legacy identities and education admission/recovery remain usable when research consent is unknown.
- The original study, wave, identity, attempt and scientific runtime are reused. No new project, runtime or scorer is introduced. Weighted variants remain incompatible with anonymous study.
- First publication fixes a study-local purpose scope: study ID, purpose, selected FORM/SCALE/COGNITIVE/SJT categories and existing/future waves of that same study. Canonical scope hash is server-owned. A subsequent version may clarify its explanatory body but cannot change the scope; a changed purpose or data category requires another study. Scope is the authorization boundary even when later prose changes.
- Explanation and acceptance facts are append-only. Server verifies current version and exact UTF-8 body hash for a new acceptance. Exact request replay does not create or re-enable anything. Previously accepted versions remain valid in their original fixed scope: a new explanation neither invalidates the old acceptance nor changes its research fingerprint. Individual metrics outside accepted categories remain excluded.
- Participant governance requires the original ACTIVE full study credential, never a short display code, foreign-study credential or cookie. Revoked credentials remain invalid for every new governance interface; no post-revoke exception is introduced. UI explains withdrawing research use before stopping identity, and contacting the original publisher if identity is already revoked; it creates no display-code proxy workflow.
- Research withdrawal changes only independent governance state plus matching audit. PENDING is immediately excluded; review can only confirm EXCLUDED. Neither quality INCLUDE nor a new acceptance restores participation. Education FINAL, scores, completion counts and recovery credentials are unchanged. Original identity revoke still invalidates recovery separately. Previously downloaded files cannot be recalled by this interface.
- Existing wave CSV is explicitly labelled educational completion records, not a research sample; its original authorized content contract is retained. Research analysis/export uses the original C16–17 queue, worker, long/wide/dictionary/ZIP and download revalidation. No client purpose label can select the applicable governance policy: actual database study-wave linkage does.

## Manifests and transaction boundaries

Education-only manifests retain the original V1 schema/hash interpretation. Study-linked sources use explicit V2 with governance hash and bounded frozen research source IDs, including an unlinked visitor/no governance record. Visitor sources never acquire a cross-wave participant key. Acceptance/version/hash/scope/status/revision changes invalidate research artifacts; explanatory version publication alone does not.

A write locks study then participant, rechecks ACTIVE capability after the participant lock, and writes state/audit atomically. The named deferred audit constraint is made IMMEDIATE inside the awaited callback, avoiding the previously observed Prisma deferred-COMMIT false-success behavior. Unknown DB errors remain errors.

Analysis uses its existing RepeatableRead snapshot. Research eligibility is read in the same existing bounded identity batch, not as per-person or audit-history queries. Its authorization linearization point is the database snapshot, not the end of HTTP streaming. A withdrawal already committed before a fresh authorization snapshot must invalidate the artifact. An overlapping download authorized before withdrawal commits may complete; no promise is made to recall emitted bytes. Start/withdraw share the study/participant order, while education start remains allowed after research withdrawal.

## Checkpoint checks and budget

Backend Node 24.21.0: independent official-registry install, fresh Prisma 5.22.0 client, all original build prerequisites followed by one TypeScript build, then governance plus Training-analysis targeted tests: 10 files / 152 tests passed. Existing 500 kB frontend chunk warning is retained, not suppressed. Frontend independent install, 33 targeted tests, app types, changed-file lint and one Vite production build passed. Inputs/logs are compacted in `c18-evidence/`; failed/earlier evidence is retained rather than relabelled.

The 10/20/50 real SQL, returned-row/plan costs, bytes and timings are **not yet measured** at this checkpoint. User-identity-only sources skip the study identity batch; selected study sources merge governance in the prior identity batch. A fixed query count is not a claim of zero join/CPU cost. Actual PostgreSQL/HTTP, immutable role guards, race tests and nonempty dump/restore remain pending on a new isolated copy of the stopped C16 HTTP07 state. Private databases, credentials and large artifacts are never committed.

No full-platform test, browser bypass, CI, push, merge or production action is authorized by this checkpoint. Root handles remote backup after each recoverable commit.

## Checkpoint 02 corrections before real upgrade

The first real PG run stopped before migration: the pinned dump restored the same visible columns but PostgreSQL compressed historical dropped-column ordinal gaps (73 columns; for example `scales.estimated_time` 8→7). A separate read-only diagnostic clone confirmed all other column properties and visible order match, then stopped; the failed state's original PG file hashes remained unchanged. Original failure and full column differences are retained in compact evidence. Cross-dump comparisons now explicitly record physical ordinal differences and compare all logical properties plus visible order; same-database upgrade comparisons still require exact original physical ordinals.

Review also found the four new tables absent from the official runtime-table policy. They now use its existing RUNTIME_RW classification with database immutable/audit guards. No harness-only privilege exception is introduced. Actual policy application/verification and governance HTTP remain pending on the corrected frozen source.

## Checkpoint 03: actual PG and partial HTTP qualification

The second baseline attempt stopped on three historical CHECK deparser differences (nested AND grouping). All 1166 constraint identities/attributes and the other 1163 definitions matched; all 86 original user trigger/function definitions matched. The correction permits only three exact table/name plus original/restored text SHA pairs, reparses both with PostgreSQL on a temporary LIKE table, demands identical resulting definitions and rolls back. It checks validated/deferrable/deferred/NO INHERIT, inheritance, FK actions and column-name mappings. Changed constants and semantic-attribute negative cases reject. Same-database comparisons remain exact. Original failures, full differences and parser evidence are retained.

Run 03 passed the additive upgrade, 211-table official restricted-role verification, all old rows/physical columns and six rollback-only database guards. Eight HTTP scenario groups passed with 198 recorded HTTP requests (not 198 independent tests): consent/version/idempotency; mixed governance and quality N=40/mean=30.5; original queued long/wide/dictionary/ZIP and PROCESSING/READY invalidation; education V1; unlinked visitor; publication/acceptance PG contention; and real audit-fault HTTP500 with independent rollback/guard restoration.

It then stopped on a synthetic fixture error: a newly requested public link expired milliseconds after its new task's expiry. This valid application rejection is retained. The final education join/start/withdraw/revoke scenario and overlapping download scenario, plus nonempty restore, remain pending. No old task or accepted facts will be edited to accommodate the fixture. A targeted continuation will reuse the eight passed groups with explicit evidence binding, not replay them.

One frozen cold observation at 10/20/50 synthetic participants (two fixed waves, four tool sources) used 26 queries each. The existing anonymous identity query contains the additional governance LEFT JOINs; there is one merged identity/governance query, no additional standalone governance statement, and no audit-history query. It returned 20/40/100 rows; its EXPLAIN execution was 0.353/0.564/1.639 ms, while total analysis wall time was 119.47/154.91/314.61 ms. Plan relation rows/loops, SQL time and response sizes are retained, including growing join costs. A separate education user-only fixture used 19 queries, no governance join/query, and 24.44 ms; this different-source scenario is not a before/after performance comparison. These observations prove bounded query shape, not zero overhead, throughput or C26 capacity.

Run 03 stopped all services and verified original source unchanged and frozen backend/recovery/client/runtime/tool inputs unchanged. These input claims do not cover frontend. Frontend wording now accurately says “研究有效同意人数” rather than implying the count is an eligible statistical sample; its separate targeted validation is recorded independently.

The wording-only frontend increment passed the affected manager suite (13/13), two-file lint and a fresh Vite production build (14.48 s), with before/after app input hashes checked. Existing import/chunk warnings remain visible; no other UI behavior was changed.
