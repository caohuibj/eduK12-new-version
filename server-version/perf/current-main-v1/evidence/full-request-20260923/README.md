# PERF-01 / P1-C04 isolated HTTP accounting evidence

Date: 2026-09-23 JST. One local API process, task-owned PostgreSQL 14 on
port 55439 and Redis 7 on port 56379. The load generator and API shared this
Mac, which was also running unrelated workloads. Every included report marks
`UNQUALIFIED_FOR_CAPACITY`; none establishes rated throughput or latency.

The linked JSON files are sanitized `summary.json` outputs. Raw manifests,
k6 logs, metric snapshots, fixture rows and credentials remain private under
`/tmp/huisurvey-perf01-c04-*`. The fixtures came from the isolated seeder;
all FINAL groups used unique child/epoch/submission identities.

| Case | HTTP logical result | Database reconciliation | Evidence |
| --- | --- | --- | --- |
| SJT linear10 FINAL | 1/1 fresh, no replay or retry | window 1, drain 1 | [sjt-fresh.json](sjt-fresh.json) |
| Mixed SJT/Cognitive/Scale FINAL | 9/9 fresh, no replay or retry | window 9, drain 9 | [mixed-fresh.json](mixed-fresh.json) |
| Same-parent questionnaire Form | 1/1 fresh from a two-sibling pool | window 1, drain 1 | [same-parent.json](same-parent.json) |
| SJT START | 1/1 success | new attempts 0 → 1 | [start.json](start.json) |
| SJT RESUME | 1/1 success with expected attempt ID | existing rows 2 → 2 | [resume.json](resume.json) |
| Authorized image GET | 1/1 success, 68 real bytes with SHA-256/MIME match | two expected attempts and one asset unchanged | [media.json](media.json) |
| Commit then lost response | 4/4 eventual success: 3 observed fresh, 1 retry-recovered replay, 1 network error | window 4, drain 4 | [response-recovered.json](response-recovered.json) |

The first one-second lost-response injection produced a durable write but no
completed k6 iteration: the retry was interrupted by the scheduler boundary.
The reporter exited nonzero with `missing required k6 metric iterations`; it
did not claim a successful measurement. A fresh four-second pool then yielded
the recovery result above. `node --test` ran 13 fixture/reporter checks:
all replay, only 503, dropped work, interrupted work, committed-lost-response,
recovered replay, invalid metrics and fixture reuse all passed. `npm run build`
passed.

These are tooling and low-speed correctness checks. P1-C05 still needs a
route-by-route SQL/model-call baseline, including public and embedded FINAL
paths, before PERF-01 can be marked CODE_READY. The shared host cannot satisfy
formal capacity acceptance.
