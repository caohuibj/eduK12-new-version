# Current-main performance results

Status: **ISOLATED_PG_BASELINE; CAPACITY_VERIFIED=false**. PERF-01 measured one first-attempt fresh HTTP FINAL per 14 registered templates and two additional policy-domain branches. All 16 completed durably in the one-second steady window and after drain, without replay, dropped iteration, HTTP failure or retry. This is a low-speed cost and accounting baseline, not a rated throughput or percentile latency result.

The runtime candidate was `c91456d7f3c9c1b7e0a27b8351731acf2bdd7774`, based on `main@68afbe63672b42c9a2086f834d5ae46794c3c013`. P1-C05 changes only tooling, fixtures and evidence; it does not alter the measured service path. One Node API process used task-owned PostgreSQL 14.24 and Redis 7, with `NODE_ENV=test`, opt-in SQL event counting, default admission/pool parameters, one offered request/s for one second per group, and one no-work `/metrics` control scrape subtracted from SQL and Prisma totals. API and k6 shared a Mac with unrelated workloads. The fixture checksum, 13-table PostgreSQL cardinality/index/ANALYZE snapshots, per-route model/action distribution, phase means, raw/corrected SQL and network bytes are in [route-baseline.json](../../server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.json). The concise route table is in [route-baseline.md](../../server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.md); the comparison template is [query-budgets.csv](query-budgets.csv). K6 `data_received` includes protocol overhead and is labelled network bytes.

| Representative baseline | Generic SQL events | Relational / organization SQL events | Interpretation |
| --- | ---: | ---: | --- |
| Standalone Scale | 9 | N/A | One fresh generic request |
| Standalone Cognitive authenticated / public | 11 / 8 | N/A | Separate auth and public paths |
| Standalone SJT | 10 | N/A | Linear 10-scene fixture |
| Embedded Composite Scale authenticated / public | 12 / 9 | 13 / 13 | Legacy course and organization assignment policy branches measured separately |
| Embedded Composite SJT authenticated / public | 24 / 21 | N/A | Includes parent access and child completion |
| Questionnaire Form authenticated / public | 20 / 21 | N/A | Same-parent and public recovery paths |

The remaining route cases and their exact counts appear in the linked table. A single request duration per case cannot support p95/p99 or an A/B improvement claim. The organization sample exercises a real `ORGANIZATION_RUN` assignment policy branch with a `STUDENT`/`SELF` respondent; it does not cover a full organization campaign, observer path, or consent-required run. Unknown policy status is not assumed generic: the fixture seeder sets explicit domain and the baseline rollup rejects missing/failed domain samples. The production-scale table-cardinality gate, 4C4G target, independent load generator, 15-minute repetitions, mixed soak and burst remain unverified.

## Candidate decisions from the before baseline

| Planned item | Baseline signal | Decision |
| --- | --- | --- |
| P2-C02 SJT validation index | SJT validation phase is observed in the phase evidence; correctness corpus includes 10/30/60 scenes and branching. | Required by plan; measure deterministic CPU reduction on the same corpus. |
| P2-C03 SJT UNIT/aggregate recovery | Embedded SJT uses 21–24 SQL events; committed-child response-loss recovery was tested separately. | Required correctness and admission change; preserve durable identity. |
| P2-C04 child binding | Auth and public embedded paths have different full HTTP costs, including guards. | Required; attribute duplicate binding reads within the service before claiming savings. |
| P2-C05 narrow SJT reads | Standalone and embedded SJT costs are 10 and 21–24 SQL events. | Required; narrow read is in scope, lock-read shortcut remains conditional on evidence. |
| P2-C06 Cognitive prepared scoring | Auth/public full HTTP costs are 11/8 SQL events; profile corpus covers all 29 current identities and 87 cases. | Required; verify decoded output equality and end-to-end effect. |
| P2-C07 reference freeze/load | Current executable Scale registry declares no HTTP reference policy; isolated PostgreSQL multi-selection test passes. | Required compatibility work; HTTP reference benchmark remains unsupported until a real policy exists. |
| P2-C08 aggregate indexing | Non-last embedded samples expose child/parent costs but do not measure last-unit aggregate. | Required; add last-unit baseline before asserting aggregate savings. |
| PERF-04 worker/cache/CDN/multi-API | No qualified post-PERF-03 bottleneck evidence exists. | Deferred; conditional PR not triggered. |

The full-request reporter's failure fixtures include all replay, only 503, scheduler drops, response lost after commit, retry recovery and missing metrics. A one-second lost-response run failed closed because the scheduler ended before its retry; a separate four-second run reconciled four durable writes, including one retry-recovered replay. These are retained in [full-request evidence](../../server-version/perf/current-main-v1/evidence/full-request-20260923/README.md), rather than discarded as inconvenient runs. Historical Gate-E rates are background only and are not reproduced as current results.

## Phase 0 / P2-C01 exploratory baseline

Environment: GitHub-hosted Ubuntu, 2 logical CPUs / ~8 GiB, disposable PostgreSQL 14 + Redis 7, API and k6 on the same runner. **PRE-CAPACITY only; not CAP-2C4G/CAP-4C4G.**

### 10 fresh FINAL/s × 5 s

| Workload | Durable | p50 | p95 |
| --- | ---: | ---: | ---: |
| Scale typical | 50/50 | 17.23 ms | 30.67 ms |
| Cognitive N-back standard | 50/50 | 20.95 ms | 33.62 ms |
| Cognitive CPT standard | 50/50 | 27.67 ms | 42.80 ms |
| SJT linear 30 | 50/50 | 34.22 ms | 55.09 ms |
| SJT linear 60 | 50/50 | 51.50 ms | 77.78 ms |

At this point the SJT `sjt.validation_index` phase mean was ~2.06 ms for 30 scenes and ~6.52 ms for 60 scenes, which is consistent with the existing per-response full-index rebuild.

### 25 fresh FINAL/s × 5 s

After fixing k6 duration-boundary accounting (allow an already-started +1 scheduler-boundary iteration to finish), the representative result was:

| Workload | Result | p50 | p95 |
| --- | --- | ---: | ---: |
| Scale typical | 126 fresh/durable (125 configured + 1 recorded boundary arrival) | 18.93 ms | 32.20 ms |
| Cognitive N-back standard | 126 fresh/durable | 18.95 ms | 28.52 ms |
| Cognitive CPT standard | 125/125 fresh/durable | 23.28 ms | 64.05 ms |
| SJT linear 30 | 126 fresh/durable | 30.66 ms | 129.88 ms |
| SJT linear 60 | **overload: 121 fresh/durable, 5 dropped** | 876.50 ms | 1086.83 ms |

The SJT-60 overload is retained as a failure point, not converted into a green capacity result. Artifact evidence: workflow run `35824011273`, 10-rate artifact `10734172166`, 25-rate artifact `10735135174`.


## Phase 0 / P2-C02 SJT validation-index A/B

Decision: **KEEP**. The comparison is GitHub-hosted PRE-CAPACITY evidence, not CAP-2C4G/CAP-4C4G.

P2-C02 replaces per-response reconstruction of the full scene/channel/options validation lookup with one request-local immutable index. Public validation codes, duplicate-answer rejection, authoritative branching trajectory, scorer output and persistence semantics remain unchanged; ordinary CI and the P2-C01 PostgreSQL/privacy invariant gate are green.

### 25 fresh FINAL/s × 5 s

| Workload / metric | Before P2-C02 | After P2-C02 |
| --- | ---: | ---: |
| SJT-30 `sjt.validation_index` mean | 1.709 ms | 0.128 ms |
| SJT-30 fresh durable | 126/126 | 125/125 |
| SJT-30 retries / drops | 0 / 0 | 0 / 0 |
| SJT-30 p50 / p95 | 30.66 / 129.88 ms | 29.14 / 113.39 ms |
| SJT-60 `sjt.validation_index` mean | 6.052 ms | 0.137 ms |
| SJT-60 fresh durable | 121 | 125/125 |
| SJT-60 retries | 24 | 7 |
| SJT-60 dropped iterations | 5 | 0 |
| SJT-60 p50 / p95 | 876.50 / 1086.83 ms | 714.12 / 1041.48 ms |

The deterministic validation-phase reduction is about 92.5% for the 30-scene sample and 97.7% for the 60-scene sample. End-to-end latency is noisier across separate hosted runners and is not used as the sole KEEP criterion.

The after-run SJT-60 job was marked failed by the exploratory workflow because `PERF_REQUIRE_ALL_FRESH=1` also forbids legal capacity retries. Artifact inspection shows the accounting itself is valid: 125 configured/started, 125 fresh, 125 durable, 0 replay, 0 drop, 0 eventual failure, with 7 UNIT-busy 503 attempts followed by successful retry. The strict all-fresh rule remains intact for baseline gates; the exploratory workflow now runs with that strict option disabled so retry/drop can be retained as overload evidence instead of being mislabeled as invalid accounting.

Before evidence: artifact `10735135174` (P2-C01 / `8e1885e2`). After evidence: artifact `10734177804` (P2-C02 / `f72c142`), plus 10-rate artifact `10735135753`.
