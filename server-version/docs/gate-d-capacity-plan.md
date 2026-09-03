# Gate-D capacity & reconciliation test plan

Post-#46 / V32 hardening follow-up to Gate-C. Code changes land in
`perf/v32-capacity-reconciliation-hardening`; this document is the **test
matrix only**. Do **not** change the default Prisma pool in application config
from these experiments.

## Envelope (reuse Gate-C)

- Host: 4C4G
- Postgres: 1.5 CPU / 1.5 GiB (isolated test DB)
- Redis: 0.25 CPU / 256 MiB
- Node heap: 1 GiB
- API Prisma pool baseline: **10**
- Workers: API-process aggregation only (no Bull submit queue)

## Locked product decisions

- Aggregate busy → **503** + `Retry-After` (`COMPLETION_BUSY`)
- UNIT busy → **503** + `ASSESSMENT_SUBMIT_BUSY`
- `parent.completedAt` = max(required `AssessmentUnitSnapshot.completedAt`)
- Canonical → PR46 Bundle bridge via `bundleBridge` (no `Assessment.result` reread)

## Hard rejects (still out of scope)

Bull / HTTP 202 / FINALIZING, Redis distributed semaphore, FrozenAggregateRuntime,
second encrypted Bundle source payload, default Prisma pool bump, per-IP submit
limiter, worker_threads.

## Admission Gate-D candidate defaults (not production constants)

| Gate | permits | queue | max wait | Retry-After |
|------|---------|-------|----------|-------------|
| UNIT submit | 6 / 7 / **8** | 8 / **16** / 32 | 250 / **500** / 750 ms | 1 s |
| Aggregate finalization | 2 / **3** / 4 | 0 / **4** / 8 | 0 / **250** / 500 ms | 1 s |

Override via `UNIT_SUBMIT_ADMISSION_*` and `AGGREGATE_FINALIZATION_ADMISSION_*`.

## Profiles

### A/B baseline

Run each profile on **main** (A) and this branch (B) on the same machine/seed.

### Steady-state regression

RPS: 25 / 50 / 75 / 100 for Scale / Cognitive / Form UNIT and mixed classroom
(~60% UNIT / 25% read / 15% ready aggregate). Fixture budget ≥ 10k attempts.

### Instant burst (open-loop)

Simultaneous arrivals at t=0: 100 / 250 / 500 / 1000 UNIT submits.
Success: `active ≤ permits`, `queue ≤ max`, overflow is fast 503, no OOM.

### School submit wave

Steady 50 rps → 1000 submits within 1s → return to 50 rps; latency/queue recover.

### Client jitter modes

1. Raw server (no retry) — measures gate alone.
2. Real client — same `submissionId` + attempt-aware 1–5s jitter.

### Aggregate stampedes

- Different-parent: 500 ready parents, simultaneous last-GET.
- Same-parent: 50 concurrent GETs → one durable completion; others CAS loser/replay.

### Prisma pool experiment matrix (config only)

Re-run aggregate + mixed with pool **10 / 12 / 15**. Do not change the default
pool in code; promote only if UNIT mixed does not regress.

## Observability

Throughput, p50/p95/p99, intentional 503 by gate, Prisma wait, event-loop delay,
RSS/GC, `aggregate.*` phase metrics, terminal GET query-count (no second full state).
