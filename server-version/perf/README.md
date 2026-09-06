# FINAL_ONLY performance gate

This directory contains a manual, opt-in performance harness for the PR39 follow-up. It is not part of CI and it does not define a product SLA. Run it only against an isolated application/database deployment created for the test.

The harness is intentionally request-fixture driven. It does not create users, courses, assessments, attempts, or answer payloads, and it does not contain credentials. Prepare disposable fixtures using [fixtures/README.md](fixtures/README.md), copy the example JSON, and keep a ledger of every fixture ID created by the run.

## Safety boundary

- Do not point `BASE_URL` at the shared `ptool-frontend`, `ptool-backend`, `ptool-postgres`, or `ptool-redis` services.
- Do not run `docker compose down -v`, remove persistent volumes, or clean resources not created by this performance run.
- Use a one-shot PostgreSQL/database and temporary application resources, or a separately named isolated compose project.
- After the run, remove only the resources recorded in the fixture ledger and verify the persistent `ptool-*` services and volumes are unchanged.
- Keep `AUTH_TOKEN` in the shell environment or secret manager. Never put it in the fixture JSON or commit it.

## Fixture and command setup

From this directory:

```sh
cp fixtures/final-submit-fixtures.example.json fixtures/final-submit-fixtures.json
# Replace every placeholder route, ID, hash, epoch, and payload with disposable fixtures.

BASE_URL=http://127.0.0.1:3300 \
AUTH_TOKEN="$PERF_AUTH_TOKEN" \
FIXTURE_FILE=./fixtures/final-submit-fixtures.json \
k6 run k6-single-concurrency.js
```

`BASE_URL` defaults to `http://127.0.0.1:3000`. `EXPECTED_STATUSES` defaults to `200`; set it explicitly when a scenario intentionally measures a controlled `409` or `503`, for example `EXPECTED_STATUSES=200,409,503`. `DURATION`, `VUS`, `MAX_VUS`, and `INTER_REQUEST_SLEEP` are optional scenario controls described below.

Each fixture group is an array of request objects. A request must provide `method`, `path`, and `body`; `headers` and `instrument` are optional. The runner serializes object bodies as JSON, adds `Content-Type` when needed, and builds the authenticated session cookie from `AUTH_TOKEN`/`CSRF_TOKEN` (or the `PERF_*` equivalents). Keep credentials out of fixture JSON. Requests in the independent-parent scenario must refer to different parent attempts. Requests in the same-parent scenario must refer to the same parent while using distinct child/section requests when the goal is lock contention rather than replay traffic.

## Scenarios

| Script | Purpose | Default shape |
| --- | --- | --- |
| `k6-single-concurrency.js` | Single-VU baseline for one final-submit path | 1 VU for 30s, `scale` group |
| `k6-independent-capacity.js` | Capacity with independent parent attempts | 1 → 10 → 25 → 50 → 100 → 200 VUs, `scale` group |
| `k6-same-parent-contention.js` | Child completions competing on one parent | 12 VUs for 30s, `sameParent` group |
| `k6-classroom-burst.js` | Short classroom-style arrival burst | 0 → 100 → 250 → 500 VUs, then drain |
| `k6-mixed-load.js` | Mixed Scale/Form/Cognitive final-only traffic | 50 VUs for 30s, `mixed` group |

Override the group when the prepared fixture uses a different name:

```sh
GROUP=formSection VUS=8 DURATION=60s k6 run k6-same-parent-contention.js
```

The independent and contention scripts must consume fresh fixtures one-to-one; a scenario that runs out of fixtures fails closed. Therefore, fixture cardinality and uniqueness are part of the test definition; record them with the result rather than comparing runs with different fixture shapes.

## Measurements to record

For every run record:

1. application commit (`git rev-parse HEAD`) and comparison commit (`origin/main` at the time of the baseline);
2. fixture ledger, database/application topology, VUs/stages, duration, and k6 version;
3. k6 request count, error count, RPS, p50/p95/p99, and controlled `COMPLETION_BUSY`/`STALE_ATTEMPT` counts;
4. application `/metrics` before and after the run, including the `final_submit_*` phase histograms;
5. transaction wall time, transaction wait, row-lock wait, DB query time, commit time, retry/backoff, DB/non-DB compute, CPU/event-loop pressure, and database lock/connection saturation.

`final_submit_transaction_wall_time` is measured around the complete final-submit transaction boundary (the generic `transaction` phase may also be emitted). It must not be reconstructed by summing individual query durations. Compare the follow-up against the same fixture shape and workload on `origin/main`; report relative changes, not an unapproved hard SLA.

## Suggested sequence

Run the single-VU baseline first, then independent capacity, same-parent contention, burst, and mixed load. Save raw k6 output and metric snapshots outside this source tree unless a sanitized result is intentionally added to the PR description. Clean up the disposable fixtures and test resources at the end, and explicitly note anything that could not be removed.

## Gate-E

Eventual-success capacity profiles (public NAT, open-loop scale, cognitive
payload, aggregate, bundle+FFmpeg) live in [`gate-e/`](gate-e/README.md).
Plan: [`../docs/gate-e-capacity-plan.md`](../docs/gate-e-capacity-plan.md).


## Post-Work-C Gate-E

Use the named production-path classes `cognitiveSmall`, `cognitiveNormal`, and
`cognitiveLarge` for E3. The large class is capped by the business
`maxTrials=1000` rule, not sized to the HTTP limit. Run the isolated negative
script for the >1000-trial rejection separately; never include it in capacity
throughput.

The formal capacity report must distinguish lifetime ELU, interval ELU derived
from cumulative active/idle counter deltas, and event-loop delay. The collector
records a null/unavailable interval after its first sample or a counter reset.
