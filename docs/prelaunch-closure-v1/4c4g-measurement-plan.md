# Huisurvey 4C4G production measurement plan

Baseline after PR #176 and PR #177. This plan is for the first real 4 vCPU / 4 GB single-host production rehearsal. It does **not** authorize changing application defaults from static analysis.

## Rules

- Test one exact release SHA at a time.
- Use PostgreSQL 16 / Redis 7.4 / Node 24 and the canonical Compose topology.
- Preserve API Prisma pool, worker Prisma pool, UNIT/Aggregate/Questionnaire admission, Reporting permit, Node heap, PostgreSQL memory, Redis maxmemory and FFmpeg concurrency unless that parameter is the **single experimental variable**.
- Every FINAL load point uses fresh logical submissions. Record logical submissions separately from HTTP attempts.
- Record p50/p95/p99, 429, intentional 503/busy, retry amplification, eventual success, and drain time.
- Stop changing a parameter when evidence does not show it is a bottleneck.

## 0. Baseline evidence

Before production load, dispatch **PERF Phase 0 closure** against the release SHA:

- `scope=full`
- `ab_groups=scaleTypicalSteady cognitiveNbackStandardSteady cognitiveCptStandardSteady sjtLinear30Steady sjtLinear60Steady mixedSteady`

Archive its A/B, mixed burst, lost-response and aggregate-size artifacts with the tested SHA.

## 1. START burst

Target route:

`POST /api/organizations/:organizationId/runs/:runId/executions/:executionId/start`

Prepare 300 fresh execution fixtures with valid current authority and accepted consent where required. Keep the same Organization and Run; every request uses a different execution.

Run two one-shot points:

| Point | Logical STARTs | Shape |
|---|---:|---|
| S100 | 100 | same Organization, same Run, different executions |
| S300 | 300 | same Organization, same Run, different executions |

For each point record:

- logical STARTs;
- HTTP attempts / retries;
- successful distinct execution claims;
- duplicate claims (must be zero);
- p50/p95/p99;
- PostgreSQL lock wait / transaction duration;
- Prisma pool active/waiting;
- total drain time.

Repeat once with executions split across different Runs in the same Organization. This distinguishes remaining Organization-wide serialization from expected execution-local contention.

Acceptance is correctness first: one durable claim per execution, no authority bypass, and no organization-wide serialization signature.

## 2. FINAL sustained

Use the existing `server-version/perf/current-main-v1/run-full-request.mjs` harness and fresh fixtures from `backend/scripts/current-main-seed-fixtures.ts`.

Run separately:

- Scale;
- Cognitive N-back;
- Cognitive CPT;
- SJT-30;
- SJT-60;
- mixed.

Start from the previously demonstrated stable region, then increase one load point at a time. Do not infer production capacity from offered RPS; use **eventual successful logical submissions/sec**.

## 3. FINAL burst

Use **PERF Phase 0 closure / scope=full** mixed one-shot burst evidence for the standardized 100 / 300 points.

Required outputs:

- logical submissions;
- HTTP attempts;
- retry amplification;
- eventual success count/rate;
- 429 count;
- intentional 503/busy count;
- p50/p95/p99;
- drain time;
- durable database completion count.

The existing 500 point remains experimental evidence only.

## 4. Teacher competition

Hold student FINAL load at a previously stable point and introduce one teacher-heavy operation at a time:

1. group report;
2. longitudinal report;
3. Scale/Questionnaire export;
4. protected feedback.

Then run the combined realistic teacher mix.

Record student FINAL eventual success/p95, reporting admission waits, export queue waiting/active counts, Prisma pool waits, CPU, RSS and PostgreSQL active sessions. Compare against the same student load with no teacher operation.

Do not increase Reporting permits or export concurrency unless the comparison shows admission itself—not CPU/DB saturation—is the limiting resource.

## 5. Worker competition

Run the same stable student FINAL load under four worker profiles:

| Profile | Worker load |
|---|---|
| W0 | no media/export work |
| W1 | one active export |
| W2 | FFmpeg concurrency = 1 |
| W3 | FFmpeg concurrency = 2 |

For W2/W3 use the canonical worker process, not FFmpeg inside the API process.

Record API CPU/event-loop latency, worker CPU/RSS, FINAL eventual success/p95, PostgreSQL pool usage, export/video queue depth, and worker drain time.

If FFmpeg=2 materially degrades API capacity on the 4C4G host, cap media concurrency; do **not** introduce a FINAL queue or worker_threads.

## 6. Parameters explicitly deferred to measurement

Only tune with single-variable evidence:

- API Prisma pool (current baseline 10);
- worker Prisma pool (current baseline 4);
- UNIT admission;
- Aggregate admission;
- Questionnaire admission;
- Reporting process-local permit;
- queue lengths/timeouts;
- Node heap;
- PostgreSQL memory;
- Redis maxmemory;
- export concurrency;
- video/FFmpeg concurrency;
- Nginx/backend keepalive only if connection churn is observed.

## 7. Stop criteria

Stop prelaunch optimization when:

- START has no broad Organization serialization and preserves one-claim semantics;
- FINAL stable-region success is bounded by the chosen host envelope rather than a static code defect;
- teacher competition does not cause unbounded API work;
- worker cancellation/retry converges without stale subprocess or stale publication;
- remaining changes would require tuning rather than deterministic work removal.

Classify every post-test finding as **STATICALLY JUSTIFIED**, **MEASUREMENT REQUIRED**, or **LOW VALUE** before changing code.
