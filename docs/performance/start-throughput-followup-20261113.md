# START throughput follow-up to #723

Base: main `1ff8d4bcb` (merged #723). Selectively reuse #721 `488ab853f`, #722 `5f4614077`, and #720's fresh-parent reuse idea. The candidate was initially held as Draft without formal CI. It is now Ready for Review and a full required-CI pass is requested before any merge. Deployment remains out of scope.

## Document implementation decisions

| Requested item | Implementation |
| --- | --- |
| Fresh START memory projection | Reuse #721 for new untimed, scale-only, non-Flow/non-Variant Whole attempts. Timing policy/snapshot, forms, other products, stepped delivery, resume and raced existing attempts retain the original path. First-unit admission joins the existing Definition batch; PostgreSQL verifies all nine admissions are persisted there. |
| Eliminate child rereads | Reuse the successful createMany input rows. No extra SELECT is introduced inside the Gate. Retain the transaction's authoritative composite privately, so a publication fallback cannot project the older pre-gate tree. |
| Available cache | Revised #721 PUBLISHED+ARCHIVED superset, separate summary/detail keys, TTL 30s and bounded cold-fill single-flight. Membership and attempts stay live; preserve archived/Cognitive-disabled historical visibility. |
| Scale CPU caches | Enable the existing bounded content-verified compiler and frozen-artifact caches in Compose defaults/env examples. Do not add another cache of encrypted or authorization-bearing freeze results. Existing caches validate content/bindings; independent attempts still have randomized ciphertext. |
| Eligibility reuse | Retain in-transaction membership verification. A pre-transaction boolean cannot prove eligibility is still current after Gate queuing. |
| ACTIVE cache | Retain #723's current batched transaction read. Retirement and emergency-stop are separate states; emergency-stop checks cannot make a 30s ACTIVE cache authoritative. |
| Report-status 5s TTL | Retain one authoritative SQL. Q=1-h describes query counts, not permission/Epoch correctness. A cached Epoch key cannot reveal the current Epoch; worker-local invalidation misses other API processes, and 5s PENDING can delay READY. |
| Worker 12 | Code default and Compose fallback become 12; preserve explicit overrides and align env example. This is the requested candidate setting, not a newly measured optimum. |
| Inline parent | Supply the transaction's exact parent/children only for newly created eligible attempts. Existing/resumed attempts never fabricate fresh state. |
| Sealed receipt | **Excluded from the merge candidate after formal CI.** The cross-request zero-SQL replay shortcut did not revalidate live parent epoch/variant/authorization; backend regression showed stale receipts accepted after reset. Retain #723's in-gate authoritative replay and idempotency. |

## Configuration

Training concurrency is capped at floor(60% of the effective API pool), minimum 1; URL connection_limit takes precedence. The reported 30/25 configuration becomes 15; an explicitly budgeted 20/35 profile remains 20. This cap leaves headroom; it does not reserve exclusive sockets or coordinate multiple API processes/gates.

Training default queue wait becomes 25s with explicit overrides retained. More waiting time is not evidence of shorter service time/E2E or zero 503s. Whole-submit admission remains unchanged. Survey/Anonymous retain Training-variable fallbacks, which must be budgeted together for mixed load.

Do not unconditionally enlarge pools on the assumption that PostgreSQL has 100 connections. API count * API pool + worker count * worker pool + listener/maintenance headroom must fit the actual budget. The env example includes an optional connection_limit=35, START=20, wait=25000 profile; production settings are not edited. API pool default stays 10 and worker Compose pool stays 4. Worker concurrency 12 does not mean 12 private DB connections.

## Validation

The supplied ABBA/arrival-rate summaries motivate this candidate. Their raw Drive packages and code-to-data mapping were not independently read here; the Drive connector remains unavailable. No fresh 150/200 VU or 50/s result is claimed.

- Initial Available, receipt, defaults and existing immutable Scale cache suites: 40 passed.
- Expanded Available, effective-pool cap and timing suites: 41 passed.
- Expanded receipt/default suites: 13 passed (consent exclusion and explicit Worker overrides included).
- Isolated PostgreSQL fresh nine-scale START/Definition, inline parent reuse and Scale+Form Submit->Worker->READY closure: 4 passed. After eliminating the child reread, fresh tests passed 2/2; the final cache-enabled run also passed 2/2 and verified ciphertext differs between attempts.
- First PG setup ran migration before the disposable server was ready. After readiness all 280 migrations applied and the tests were rerun; no schema constraints were weakened.
- Final fixed-code `tsc --noEmit`: passed (exit 0).

Controlled performance qualification and formal CI remain separate follow-up work. Measure Available+START+Definition+Submit+READY totals, failures/retries, Gate wait/service time and actual pool wait under matched processes/pools/polling. No numerical speedup is established by the correctness tests.

## Arrival-rate qualification provided for the candidate

- With identical stated gate/pool configuration (Prisma pool 40, START 20/100/5000, Submit 12/100/5000), the reported 10/s × 30s trial completed 295/300 (98.3%) versus 272/300 (90.7%) for the comparison; pool-wait sum dropped from 189,995ms to 3,457ms. Report READY p50 grew from 9,407ms to 12,091ms.
- At 20/s × 30s, the reported candidate completed 542/600 (90.3%) versus 473/600 (78.8%); pool-wait sum dropped from 732,472ms to 30,114ms, but 58 START admission rejections remained.
- These are **user-supplied matched-configuration observations, not a fully isolated causal A/B**: the comparison runs used different database warm-up/rebuild histories. The candidate is not demonstrated to sustain 10/s indefinitely, nor to complete 100% of a 1,500-person burst.
- Archives: [10/s candidate](https://drive.google.com/file/d/1hNlXw1IGAcnJWf7bTPY0tp7OzslQi2c3/view), [20/s candidate](https://drive.google.com/file/d/1B5QL_QUuH_T6wKfjrpxSUIdN2o3qwRli/view).

### Merge gate

The requested next step is an ordinary, non-skipped GitHub Actions run on the exact candidate HEAD. Merge only if the repository's required checks, including `merge gate / ready PR`, pass; this documentation-only commit starts that validation without changing runtime behavior.

## Formal CI fixes (release candidate)

- Restored #723's transactional Whole receipt replay instead of the process-local sealed-receipt shortcut: preserve live attempt epoch and variant-scoped authority after reset. Removed its module and shortcut-only tests.
- In production the 30s shared Available template cache remains enabled by default; `COMPOSITE_AVAILABLE_CACHE_ENABLED=false` restores the original per-student SQL for emergency rollback. In `NODE_ENV=test`, the test harness defaults to the original read because its fixtures directly mutate publication rows; the dedicated cache suite opts in explicitly to verify single-flight and per-student isolation.
- Updated the strict text fixture for the START private-reference final fence: the check still executes before returning from the transaction, even when an in-memory projection carrier is attached after the fence.
- Earlier CI attempt 43408467420 identified these issues; the final HEAD must run a fresh complete CI and pass `merge gate / ready PR` before merging. No production deployment is part of this PR.
