# START / Report convergence candidate (2026-11-13)

Base: `6d51d8c8337f0b4b070d07d10dcb4016786f6190` (main, including #714).
Reviewed PR heads: #720 `8fcfe211998e87ac57566bb53f393d214e0fd669`, #721 `488ab853fbb77f65241dbdf8e2283cef8c54a510`, #722 `5f46140778a6a2c9612609bf704c6b3b746a639c`.
This branch is a selective integration; none of those PRs is merged wholesale.

## Changes and expected work reduction

- #722 Scale Admission persistence: keep one guarded CASE UPDATE for N admissions, with first-writer hash guard, conflict readback and binding validation. This is distinct from main's existing Whole Submit batch update. Shared admission storage still runs per snapshot; no claim that every write becomes one SQL.
- Participant report status: one narrow joined SELECT for current owner, epoch and current-epoch job, rather than separate authorization + status + job reads. No process-local status/READY cache. Existing waitMs notifications, cancellation, reauthorization and timeout fallback remain. Full report materialization and teacher authorization retain their existing paths.
- #721 START: prefetch immutable releases/legacy artifact maps before the Gate/transaction, retain locked publication version/status and exact release hash/revocation checks. When publication identity differs, use the complete authoritative reloaded snapshot, including its blob.
- Reuse #721 version-keyed caches, with at most 32 single-flight identities per cache to combine simultaneous cold loads. Overflow executes uncached in-flight work normally. Only publications with a frozen content hash enter the shared tree cache; legacy live graphs are read fresh because related Scale edits need not change the composite timestamp. Request clones isolate mutable publication trees. No user eligibility or authorization decision is cached.
- ACTIVE deployment status is never cached across STARTs. One current SELECT per 50 distinct scales inside the transaction; both present and absent results are reused for that transaction's freeze. Retiring a deployment is observed by the next START.
- Keep #721 P2028 retryable mapping, bounded anonymous transaction timeout and shared study START locks, with PostgreSQL quota/resume tests. No Gate lock-order changes.
- Exclude #721 fresh projection that skips admission activation; START still performs the original activation. No work is moved to Definition to claim a faster START.

## #720 comparison and merge recommendation

Do not merge #720 as a package. Its version caching overlaps #721; main already has request-local runtime reuse. Its compiled-hash cache returns before validating the current encrypted snapshot, so it is excluded. Its resume-before-eligibility path, optional lock removal and default Gate >=40 are excluded. Its cross-course Available superset cache is also excluded: keep main's scoped SQL and Cognitive historical-attempt semantics. No second START cache framework is introduced.

Do not merge #721/#722 as originally submitted. Review this consolidated branch after performance verification and selected formal checks. #722 worker default 12 and stale status cache are excluded; its sealed receipt shortcut/extraction is not needed for the bounded changes here.

## Fresh correctness evidence

Disposable PostgreSQL 16 and Redis were used; all 280 current migrations applied. No production database or credentials used.

- Initial batch admission + report-view suites: 34 passed.
- START cache/prefetch/transient/Available, report-view, anonymous lock and gate suites: 107 passed; changed cache/report tests subsequently passed 29 tests (including 150 simultaneous same-version loads invoking one loader and failed-loader retry).
- PostgreSQL initial run: 16 passed, 2 skipped (Whole Form Closure variable missing). It covered complete-snapshot reload after a deterministic post-prefetch publication change, published artifact integrity, resume eligibility/retirement and 8 anonymous concurrent STARTs with token quota 3.
- Subsequent PostgreSQL run: 9 passed, none skipped. It covered the updated artifact suite including ACTIVE->RETIRED between transactions (5), Whole Scale+Form Submit->Worker->READY with replay (2), and bounded START transaction timeout (2). Earlier skipped tests are covered by this run.
- Legacy no-hash tree bypass: real-PostgreSQL resume/eligibility suite rerun, 3/3 passed.
- TypeScript `tsc --noEmit`: passed (exit 0) on the final code/test inputs.

These are correctness tests, not HTTP E2E load results or evidence of production latency improvement. Local evidence is not a substitute for a required formal CI gate. No formal CI, main merge or production deployment is authorized by this report.

## Performance evidence and configuration

The Drive folder and Runbook require authentication. The user tagged Google Drive, but this chat's exposed tools still contain no Drive search/list/download capability. No latest package or historical metric-to-SHA mapping has been verified. Repository capacity scripts require their original private fixture/profile/certificate files and isolated stack; those inputs are absent here. They were not modified to bypass isolation.

| Metric (p50/p95 where applicable) | main 150/200 VU | candidate 150/200 VU |
| --- | --- | --- |
| START pre-gate / gate_wait / in_tx / post_gate | Not measured | Not measured |
| Definition / START + Definition | Not measured | Not measured |
| Submit / Report READY / E2E | Not measured | Not measured |
| START 503 / P2028 / failures / retries | Not measured | Not measured |
| Prisma wait / PostgreSQL execution / Event Loop | Not measured | Not measured |
| Fixed-total Survey + Anonymous + Training load | Not measured | Not measured |

No 15% E2E claim or best concurrency setting is justified yet. The concrete change removes transaction-side immutable reads and repeated deployment round trips; only the controlled load run can establish whether pool waiting or Gate service time actually improves.

Source configuration (not verified live settings): Prisma API pool default 10, worker Compose pool default 4, Training Gate default floor(0.75 * effective API pool), explicit URL connection_limit takes precedence. Compose report concurrency default 2; code-only default 1. Historical 24/6 or 24/12 settings must be verified against the load package. Survey `SURVEY_ADMISSION_*` and Anonymous `ANONYMOUS_START_*` fall back to `TRAINING_START_*`; raising Training alone can widen all three gates unless independently configured. Connection budget is API processes * API pool + worker processes * worker pool + migration/monitoring headroom. Do not increase a single process's pool without the actual database connection budget.

Frontend polling is profile-specific: FAST_START 400/400/800/1600 ms, QUEUED initially 2500 ms then 4000 ms, LEGACY initially 2000 ms then 5000/10000 ms, with existing server wait hints. A universal 400 ms poll assumption is incorrect. No TTL is extended to force hits.

Pending: read latest package, run same-environment main/candidate 150 VU twice with fixed fixtures/processes/pools/polling, then 200 VU and fixed-total mixed load. Compare Gate 24/32/40 and Worker 6/8/12 only after measuring pool headroom and service-time reduction; record failures/retries as well as successful latency. Retain current defaults until then.

## Merge blockers

1. Latest Drive package/Runbook and corresponding raw baseline evidence have not been read.
2. Controlled 150/200 VU E2E and mixed load, including actual pool/process budget and worker selection, remain unexecuted.
3. Exact-candidate review and selected formal CI remain outstanding; no production merge recommendation until these pass.
