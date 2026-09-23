# P1-C02 observer-effect diagnostic

- Date: 2026-09-23 JST
- Source base: `199662df3304f29b0fee74e316a2f10a1a8faa9a`; working tree contains P1-C02 observability changes. This is a **scrape-on/off** comparison within the same candidate, not a baseline/head optimization A/B.
- Route: local `GET /ready` (one PostgreSQL readiness query per HTTP request); k6 on the same development host as the API.
- API: one Node process, `NODE_ENV=test`, isolated `huisurvey-perf01-postgres` (PostgreSQL 14) and `huisurvey-perf01-redis` (Redis 7); background workers disabled. Other unrelated containers share this host.
- Load: 4 k6 VUs, closed loop, 20 seconds per run. Order: no scrape / 5-second scrape, scrape / no scrape, no scrape / scrape.
- The scraper requested `/metrics` every 5 seconds. SQL event collection was off. All six k6 runs had `http_req_failed.value=0` and `checks.value=1`.

| Pair | No-scrape RPS | 5s-scrape RPS | No-scrape p95 ms | 5s-scrape p95 ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 4430.42 | 4583.61 | 1.415 | 1.295 |
| 2 | 4537.21 | 4417.74 | 1.310 | 1.356 |
| 3 | 4628.15 | 4131.36 | 1.263 | 1.379 |
| Three-run median | 4537.21 | 4417.74 | 1.310 | 1.356 |

Median scrape-on throughput change: **-2.63%**; median p95 change: **+3.51%**. This is below the P1-C02 investigation triggers of >3% throughput loss or >5% p95 increase, but pair 3 varies more than the median. These numbers are only a local diagnostic of `/ready` and do not qualify FINAL latency, production capacity, or the final 4C4G target. Repeat the observer-effect control with a representative fresh FINAL workload before formal baseline measurement.

The six `*.json` files are raw k6 summaries; matching `*.log` files retain terminal output. Reproduce with `OUT_DIR=<task-owned-dir> BASE_URL=http://127.0.0.1:<isolated-port> bash server-version/perf/current-main-v1/run-observer-effect.sh`. Source files contain no submitted payloads or credentials. SHA-256 values are in `checksums.sha256`.
