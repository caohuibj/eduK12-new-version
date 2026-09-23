# PERF-01 current-main HTTP accounting

These tools operate only on a named, disposable PostgreSQL test database. The
fixture seeder writes per-student session headers, and its output directory must
be private under `/tmp`; never commit fixture JSON, `auth.env`, raw request logs,
or credentials. Set `NODE_ENV=test`, `PERF_ISOLATED_TEST_MODE=1`,
`PERF_FIXTURE_DB_NAME` to the exact database name in `DATABASE_URL`, and the
normal test runtime keys before seeding. Set `UPLOAD_DIR` to a task-owned `/tmp`
directory so the media fixture can store its self-authored 1x1 PNG.

From `server-version/backend`, seed with `PERF_CURRENT_MAIN_V1=1` and
`FIXTURE_OUT_DIR=/tmp/<private-run> npm run perf:fixtures:seed`. Use
`PERF_WARMUP_FIXTURES`, `PERF_STEADY_FIXTURES`, and `PERF_MIXED_PER_CLASS` to
size disjoint pools. `PERF_SAME_PARENT_SIBLINGS` accepts 2, 10, or 50. The
seeder refuses a non-test environment, a mismatched database name, and output
outside `/tmp`. Regenerate before every fresh run.

From `server-version`, run the FINAL accounting script with `PERF_FIXTURE_FILE`
pointing to the private `final-submit-fixtures.json`, `PERF_FIXTURE_GROUP` to
one group such as `sjtLinear10Steady`, `BASE_URL` to the API origin,
`PERF_RUN_DIR=/tmp/<private-evidence>`, `PERF_RATE=1`, and `PERF_SECONDS=1`:

```sh
node perf/current-main-v1/run-full-request.mjs
```

The group must contain at least `rate × seconds + 1` unused fixtures. The
runner refuses pre-completed children, records scheduler drops and interrupted
iterations, and reconciles client completion against database rows at the
steady-window boundary and after a bounded drain. Its JSON, CSV, Markdown,
manifest, k6 summary, and raw metric snapshots stay in the private run
directory. `PERF_RATE_CEILING` and `PERF_DRAIN_SECONDS` bound the run. The
reporter exits nonzero on missing/negative metrics, empty samples, fixture
exhaustion, identity mismatch, or inconsistent durable counts. A drain
completion is a count, never divided by steady-window duration.

For START, RESUME, and authorized media bytes, set `PERF_FIXTURE_FILE` to the
private `journey-fixtures.json` and select `sjtStartWarmup`,
`sjtResumeWarmup`, or `sjtMediaWarmup`:

```sh
node perf/current-main-v1/run-journey.mjs
```

Media verifies the database asset hash, response status, MIME type, byte
length, and SHA-256 of the response body. START verifies the number of newly
persisted attempts; RESUME verifies existing attempt identity. The tests use
real HTTP and fresh per-student session headers.

To reproduce a committed write with a lost response, start
`lost-response-proxy.mjs` with `PERF_UPSTREAM_URL` pointing to a loopback test
API and `PERF_PROXY_PORT` set to a separate loopback port. Point the FINAL
runner at the proxy. The proxy forwards the first successful FINAL to the
upstream API, waits for its successful response, then closes the client socket.
The next retry uses the same submission identity. The report separates an
observed fresh 2xx from a durable write recovered by replay; it never treats a
first-attempt replay as a new student completion. The proxy requires test mode.

`node --test perf/current-main-v1/report-run.test.mjs` exercises all replay,
only 503, dropped iterations, interrupted scheduler work, lost responses, and
recovered replay. A low-speed smoke run on a shared host validates accounting,
not rated capacity. `CAPACITY_VERIFIED` requires the plan's isolated 4C4G
target and independent load generator.

## Phase 0 representative smoke

The existing fresh-fixture harness is also the Phase 0 load primitive. A representative automated smoke uses `scaleTypicalSteady`, `cognitiveNbackStandardSteady`, and `sjtLinear30Steady` at a deliberately low concurrent arrival rate. It gates only fresh/durable accounting and unexpected HTTP errors; it does not enforce latency or throughput thresholds.

For exploratory work, regenerate fixtures before each logical fresh run and increase `PERF_RATE` in controlled steps. The selected steady group must contain at least `PERF_RATE × PERF_SECONDS + 1` unused fixtures. Keep fixture seeding outside the measured steady window. Record the actual host and leave `PERF_CAPACITY_QUALIFIED=0` on GitHub-hosted, Codespaces, Mac, and Windows runs.

## Route-by-route isolated PostgreSQL baseline

Use a fresh, task-owned fixture file with all 14 FINAL groups and explicit
`LEGACY_COURSE` and `ORGANIZATION_RUN` samples. Set `PERF_SQL_EVENT_COUNT=1`
on the isolated API and runner, and `PERF_REQUIRE_ALL_FRESH=1` on each runner
invocation. The runner captures PostgreSQL version, table counts, indexes and
ANALYZE timestamps before every run, and a no-work `/metrics` control scrape
so its SQL/model calls can be subtracted. A group with HTTP error, replay,
retry, drop, missing metrics or an incorrect durable identity fails the
baseline gate.

After one successful run per group, from `server-version` execute:

```sh
PERF_RUN_PREFIX=/tmp/<run-prefix> \
PERF_EVIDENCE_DIR=perf/current-main-v1/evidence/<date> \
PERF_ROUTE_INVENTORY=../docs/performance-optimization-v1/route-inventory.csv \
PERF_BUDGET_CSV=../docs/performance-optimization-v1/query-budgets.csv \
node perf/current-main-v1/summarize-route-baseline.mjs
```

The rollup refuses missing/failing route or policy-domain runs. It emits a
sanitized JSON/CSV/Markdown rollup and fills before costs in the comparison
CSV; private raw manifests, headers, fixture records and credentials remain
outside the repository. The committed
`evidence/query-baseline-20260923/route-baseline.json` contains the completed
PERF-01 baseline and SQL/model/phase distributions. A single request per
route has no meaningful p95 and this shared host is unqualified for capacity.
