# Backend group4: retained fixture contracts

Base: `d14b14f50f074f2b60a8013446dd7706665212da` (actual main when this work started).
Original CI: #462 / run41233875089. Scope: 8 failing files,12 failed cases.

Only the8 assigned test files change. No product/schema/permission/feature flag,
workflow, dependency, new gate, evidence verifier or report-engine changes.

| Failure | Actual cause and minimal correction | Verification |
|---|---|---|
| Teacher enhanced history vs new Standard (1) | The adult adapter now batches exact historical FINAL contributor counts (`n`,`shared`) in one query; the mock returned obsolete two-query run/user rows. Supply9 real-count contributors shared with the current10. The original rejection code remains required. | Original local FAIL retained; repaired targeted PASS. |
| School generation and overlap unit boundaries (2) | Principal now carries explicit ORGANIZATION audience; unrelated optional hooks do not make an arbitrary cohort selector. Keep exact audience and undefined selector/leaf assertions. The isolated overlap unit now supplies the explicit10-person leaf contract required by the current reader. | Two original local FAIL retained; two targeted PASS. |
| Compact/outbox partial receipt recovery (2) | Manual worker calls omitted required whole-receipt `payloadHash`; the production worker already supplies it. Pass the actual accepted hash, retaining lease token, receipt time, immutable per-unit identities, raw-answer references and stale-owner rejection. | Two isolated real PG PASS; no lease or identity check changed. |
| Whole receipt header budget (1) | Actual5 SQL statements are: one owner/header SELECT, transaction-local job upsert/lock returning current receipt status and validation hash, current scale-release SHARE read, emergency-stop read, atomic parent/receipt CAS. The extra work is not another consent-header read. Assert exactly one parent SELECT, one atomic receipt statement, and zero parent findUnique. | Real SQL captured; repaired isolated PG PASS. |
| WorkC first admission/current-unit budgets (2) | First delivery now locks and re-reads the child/epoch before freezing admission. Its lock-time context read cannot consume an outside-transaction projection. Bound cold child reads at2; retain the original strict cached/frozen B/C reuse budgets, and explicitly assert subsequent attempt-state loads remain one parent/one child. | Original unchanged assertions failed with SQL observation;2 repaired real PG PASS. No product lock removed, no cache added. |
| School leaf/class/tag fixture (1) | A random synthetic leaf had no released content contract. Supply an exact synthetic registry declaration with only ORGANIZATION aggregate `score`, minimum10; keep real cohort/source/member/snapshot SQL. This does not publish content or claim a real registry-publication E2E. | One isolated real PG PASS, including historical members, staff de-duplication and immutable cohort. |
| School retained personal changes (1) | The preceding test creates T1/T2, not T3. Read its retained T2 and require `[1,2]`; keep the student-vs-Teacher reader rejection. | Corrected fixture and collected; no replay of native T1/T2 FINAL. |
| Training standalone/archived history (2) | The index returns history only for its selected first task. Read actual standalone pointers through existing task-scoped history, traverse catalogue cursors instead of assuming the first page is complete. | Corrected and collected; no replay of5 Cognitive FINALs. Compatible with pending453 typed source cursors. |

## Execution boundary

9 distinct original failing cases passed:3 targeted unit cases +6 isolatedPG
cases. Counts are unique cases, not summed retries or nested suites. The remaining
3 lifecycle-dependent cases were collected only and are NOT claimed executed.
The successful original full-suite cases were not rerun, nor were10391 cases,
all tools, browser journeys, full frontend/backend types or a production workflow.
Only test files change; backend production compilation is not a test-file check.

Runtime: official Node24.21.0, existing Vitest4.1.11 and Prisma5.22.0.
Private Prisma client generated against this exact schema in this worktree;
shared installed clients/dependencies were not regenerated or installed.
Own temporary PG16.15/Redis7.4.11 used loopback ephemeral ports32769/32768 and
`group4_test`; no production/shared database URL or credential was read.

First failures remain in raw reporters. `pg-header-trace.json` is a transient
SQL-diagnostic ASI helper error; `pg-header-and-leaf-fixed.json` retains an initial
SQL-predicate spelling mismatch. They are not product failures or successful
qualification. The final header predicate was checked against the captured SQL
before its single successful continuation. Diagnostic-only instrumentation was
removed from tests. SQL evidence contains only synthetic query shapes/selections,
no real participants, answer values or production data.

## Dependencies

#453 (empty waves, School history, Training all-source cursor) and #456 (actual
per-metric School contributors/differencing) remain separate pending changes.
No source or privacy fix from either was copied here. Their own completed
application/PG observations remain separate evidence; these fixture corrections
do not implement or supersede them. In particular actual contributor privacy
cannot be inferred from a class roster. The adult Teacher SQL continues to use
frozen cohort execution contributors or historical FINAL rows and retains an
enhanced historical policy even when the new request is Standard.

Draft only; no CI activation, APPROVE, merge, production configuration or deploy.
