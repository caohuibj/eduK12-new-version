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
