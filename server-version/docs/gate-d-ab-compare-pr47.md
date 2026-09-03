# Gate-D A/B compare — origin/main vs PR #47

- Written: 2026-09-03 03:07:28 PT
- **A (main)**: `803ac87df42660db07fbf37ecdb7cfed32281255` (`origin/main`, Merge PR #46)
- **B (#47)**: `1b6df8b5e85ed33405ad0383a0f3af32a9248338` (`perf/v32-capacity-reconciliation-hardening`)
- Stack: shared `eduk12-gate47-pg` @ `172.18.0.2` + `eduk12-gate47-redis` @ `172.18.0.3` (no `docker compose down -v`)
- Ports: **A on `:3301`**, **B on `:3300`** (B stopped while A ran for fair CPU/memory)
- k6: `/home/box/bin/k6`, `EXPECTED_STATUSES=200,409,503`, same VU/DURATION settings as prior Gate-D B run
- Fixtures: fresh seed via `/tmp/eduk12-gate47-seed-fixtures.ts` (copied to `backend/scripts/gate47-seed-fixtures.ts`)
  - A → `/tmp/eduk12-gate47-fixtures-main/` (800/200/150/650)
  - B reseed → `/tmp/eduk12-gate47-fixtures-reseed-b/` (same counts)
  - B original used `/tmp/eduk12-gate47-fixtures/` (partially consumed under load — kept for reference)
- Primary fair compare: **A fresh vs B reseed**. B-original shown for continuity.
- No merge / no push.

## Primary table (A fresh vs B reseed)

| Scenario | Side | reqs | RPS | p95 | med | 503busy (`final_submit_busy`) | checks |
|---|---|---:|---:|---:|---:|---:|---|
| Single-concurrency (1 VU, 30s, scale) | **A main** | 4092 | 136.4 | 11.97 ms | 6.1 ms | 0 | 100% |
| Single-concurrency (1 VU, 30s, scale) | **B reseed** | 3966 | 132.2 | 12.23 ms | 6.32 ms | 0 | 100% |
| Independent capacity (MAX_VUS=75, scale) | **A main** | 41536 | 415.4 | 194.85 ms | 73.62 ms | 0 | 100% |
| Independent capacity (MAX_VUS=75, scale) | **B reseed** | 54669 | 546.7 | 215.26 ms | 55.91 ms | 29367 | 100% |
| Classroom burst (BURST_PEAK=250, mixed) | **A main** | 8030 | 422.6 | 872.82 ms | 372.94 ms | 0 | 100% |
| Classroom burst (BURST_PEAK=250, mixed) | **B reseed** | 18301 | 962.9 | 214.36 ms | 126.34 ms | 17080 | 100% |
| Mixed load (50 VU, 30s, mixed) | **A main** | 13507 | 449.3 | 254.57 ms | 83.92 ms | 0 | 100% |
| Mixed load (50 VU, 30s, mixed) | **B reseed** | 26340 | 875.9 | 249.62 ms | 29.29 ms | 23008 | 100% |

## B-original (prior run, partially consumed fixtures)

| Scenario | reqs | RPS | p95 | med | 503busy | checks |
|---|---:|---:|---:|---:|---:|---|
| Single-concurrency (1 VU, 30s, scale) | 4054 | 135.1 | 11.99 ms | 6.17 ms | 0 | 100% |
| Independent capacity (MAX_VUS=75, scale) | 57833 | 578.3 | 197.68 ms | 55.14 ms | 31404 | 100% |
| Classroom burst (BURST_PEAK=250, mixed) | 18061 | 950.3 | 218.41 ms | 118.8 ms | 16997 | 100% |
| Mixed load (50 VU, 30s, mixed) | 26282 | 874.1 | 252.61 ms | 30.58 ms | 22971 | 100% |

## unit_submit rejection metrics (Prometheus)

| Metric | A main | B reseed (delta over run) | B original (cumulative after run) |
|---|---|---|---|
| `ptool_bounded_admission_rejections_total{gate="unit_submit",reason="queue_full"}` | **absent** (main has no labelled unit_submit rejection series) | **+69287** | 71204 |
| `ptool_bounded_admission_rejections_total{gate="unit_submit",reason="timeout"}` | **absent** | **+168** | 168 |
| k6 `final_submit_busy` (sum across 4 scenarios) | **0** | 29367+17080+23008 = **69455** | 31404+16997+22971 = **71372** |

Notes:
- Almost all intentional 503s under B load map to `ASSESSMENT_SUBMIT_BUSY` / `unit_submit` admission (`queue_full`, some `timeout`).
- Main still times `final_submit_admission` phase histograms but does **not** emit labelled bounded-admission rejection counters or return 503 busy under these loads — so high-load RPS on B is inflated by cheap rejects; A RPS is closer to “accepted work” throughput.
- Fixture budget (800 scale / 650 mixed) << request volume → many idempotent replays after first completion on both sides; busy rate on B remains a valid admission-pressure signal.
- Independent-capacity script always stages through target 100 before MAX_VUS=75 (same as prior B note).

## Artifacts

- A: `main-k6-*.{log,summary.json}`, `metrics-before-main.txt`, `metrics-after-main.txt`, `main-backend.log`, `main-seed-fixtures.log`, `HEAD-main.txt`
- B original: `k6-*.{log,summary.json}`, `metrics-before-k6.txt`, `metrics-after-k6.txt`, `SUMMARY.txt`
- B reseed: `reseed-b-k6-*.{log,summary.json}`, `metrics-before-reseed-b.txt`, `metrics-after-reseed-b.txt`, `reseed-b-backend.log`, `reseed-b-seed.log`
- Fixtures: `/tmp/eduk12-gate47-fixtures-main/`, `/tmp/eduk12-gate47-fixtures-reseed-b/`, `/tmp/eduk12-gate47-fixtures/`

## Stack left

- B host backend on `:3300` (PID in `reseed-b-backend.pid`); A stopped after its run.
- pg/redis proxies untouched; volumes not wiped.
