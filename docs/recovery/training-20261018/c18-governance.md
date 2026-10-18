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
