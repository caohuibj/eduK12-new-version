# START throughput follow-up to #723

Base: main `1ff8d4bcb` (merged #723). Selectively reuse #721 `488ab853f`, #722 `5f4614077`, and #720's fresh-parent reuse idea. Every commit and PR title uses `[skip ci]`; no CI activation, main merge or deployment.

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
| Sealed receipt | Reuse #722's bounded 5-minute cache; check owner, epoch, slot-set, submission and payload hash. Cache miss adds no query, but first submission still performs required header/seal work. Variants and relational/consent-bound seals retain authority checks; the latter are excluded from cache population. |

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
