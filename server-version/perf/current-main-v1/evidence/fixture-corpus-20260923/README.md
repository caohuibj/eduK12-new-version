# PERF-01 / P1-C03 fixture and compatibility evidence

Date: 2026-09-23 JST. Base `main@199662df3304f29b0fee74e316a2f10a1a8faa9a`, tested against the PERF-01 worktree. One API process, task-owned local PostgreSQL 14 on port 55439 and Redis 7 on port 56379; this shared Mac is **UNQUALIFIED_FOR_CAPACITY**. No result here claims 4C4G capacity.

## Corpus and fresh pool

- `npm run perf:corpus:verify`: 29 current Cognitive registry entries and 87 task-owned golden cases matched. All 87 declared profile combinations are supported; missing profiles would be recorded as `UNSUPPORTED`. The baseline includes BART variable-length traces and the published nback-100 / cpt-180 class identities. Golden hashes cover definition/runtime, report metadata, profile config, inputs, expected scores and expected validation errors. It contains no encrypted bytes or random IVs.
- `npm run perf:fixtures:seed` with `PERF_CURRENT_MAIN_V1=1`, `NODE_ENV=test`, `PERF_ISOLATED_TEST_MODE=1`, `PERF_FIXTURE_DB_NAME` matching the test database, runtime test keys, and `FIXTURE_OUT_DIR` under `/tmp`: generated 37 unique fresh attempts in 25 disjoint warmup/steady groups (1 warmup, 2 steady per ordinary class, plus one Scale boundary fixture). Local fixture JSON and per-fixture auth headers stayed outside the repository with file mode 0600. Do not copy them into PR evidence.
- `node --test server-version/perf/current-main-v1/fresh-fixture-pool.test.mjs`: 5/5 checks passed. Exhaustion, a shared warmup/steady attempt, reused child/epoch and reused submissionId fail before load starts.

## Real HTTP and database checks

- [SJT HTTP](sjt-http.json): five first-attempt fresh FINALs passed with exact decoded score semantics and frozen definition identity: 10/30/60-scene linear, full and early branching. Each linear class shares one frozen validation definition across many attempts. Explicit negative requests returned 400/403/409; the untouched fixture then completed fresh and its deliberate replay returned `replayed=true`.
- [Cognitive HTTP](cognitive-http.json): experience/standard/research for nback (30/100/180 trials) and cpt (60/180/360 trials) passed first-attempt fresh FINAL. HTTP metrics matched the pure scorer; each response carried the frozen profile report. The published nback-100/cpt-180 historical classes remain covered.
- [Scale HTTP](scale-http.json): 25-item and longest legal 1000-item standalone FINAL passed fresh; scores equalled answer counts and no reference was reported. A 1001-answer request returned 400. The initial 8065-answer probe also returned 400 and revealed the HTTP schema's 1000-answer cap, which is tighter than the 512 KiB canonical payload cap for these answer values.
- `PERF_INTEGRATION_DATABASE_URL=<isolated URL> npx vitest run src/__tests__/hotpath/scale-multi-reference.postgres.integration.test.ts`: 1/1 passed against PostgreSQL. Two score selections shared one active reference version and authoritative row; frozen hashes matched. Current executable Scale registry has 11 packages and zero `declared` reference policies, so a reference-enabled **HTTP** fixture is currently unsupported. No test-only scientific package was added to the production registry to fake that route.

## Reproduction and limits

The isolated seeder is `server-version/backend/scripts/gate47-seed-fixtures.ts` in current-main mode. The three `check-*-fixtures.mjs` scripts require `PERF_FIXTURE_FILE` and `BASE_URL`; each consumes fresh rows. Reseed into a new `/tmp` directory before repeating first-attempt checks. The corpus verifier runs without PostgreSQL. `state.json` records the next planned commit and remaining environment gate.

This commit establishes correctness samples, not complete full-request SQL costs or capacity. P1-C04 adds accounting and P1-C05 measures the before baseline.
