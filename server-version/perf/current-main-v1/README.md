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
