# Gate-E performance harness

Manual, opt-in follow-up to Gate-D. See
[`docs/gate-e-capacity-plan.md`](../../docs/gate-e-capacity-plan.md).

Primary KPIs (emitted by every scenario via `lib/eventual-success.js`):

| Metric | Meaning |
|--------|---------|
| `gate_e_eventual_success` | Durable successful logical submits (counter) |
| `gate_e_eventual_success_rate` | Success rate of logical submits |
| `gate_e_eventual_latency_ms` | End-to-end latency including allowed 503 retries |
| `gate_e_rate_limited_429` | Public limiter / ingress 429 (not retried) |
| `gate_e_capacity_busy_503` | Capacity busy observed on a failed logical submit |

**Eventual successful students/sec** ≈ `gate_e_eventual_success / wall_seconds`
from the k6 summary. Do not treat raw `http_reqs` RPS as capacity when 503/429
are present.

## Safety

- Use isolated `eduk12-gate47-*` Postgres/Redis only.
- Never `docker compose down -v` against shared `ptool-*` volumes.
- Fresh fixture **per logical submit**; prepare disposable ledgered fixtures.
- FinalDraft / harness retries **503 only** — never 429.

## Round-1 sweep / Scale CLOSED

- Prisma pool = **10** (do not raise)
- Locked operating envelope: **UNIT=7**, **Aggregate=3**, pool=10
- **Tested stable Scale FINAL rate:** ≤**150** fresh FINAL/s (not "150 concurrent users")
- Overload ~**175/s+**: non-deterministic UNIT saturation; intentional 503; not production SLO
- E5 out of Assessment capacity mainline
- Profiles E1–E5 below (E1 uses start-token audience split; next after E1 is E3)

## Commands

```sh
export PATH="/home/box/bin:$PATH"
export BASE_URL=http://127.0.0.1:3300
export FIXTURE_FILE=/tmp/eduk12-gate47-fixtures/final-submit-fixtures.json
export EXPECTED_STATUSES=200,409,503

# E1 Public NAT / shared-link GET budgets (audience ≠ class size)
# E1a: same NAT IP, different start tokens
TOKEN_MODE=distinct PEAK=500 k6 run k6-e1a-nat-distinct-tokens.js
# E1b: same NAT IP, same start token (levels 60/250/500) + abuse negative
TOKEN_MODE=shared PEAK=60 k6 run k6-e1b-shared-token-get.js
TOKEN_MODE=shared PEAK=250 k6 run k6-e1b-shared-token-get.js
TOKEN_MODE=shared PEAK=500 k6 run k6-e1b-shared-token-get.js
ABUSE=1 PEAK=200 ITERATIONS=200 k6 run k6-e1b-shared-token-get.js
# Legacy FINAL-submit NAT stub (not the E1a/E1b GET acceptance)
NAT_PEAK=100 GROUP=scale k6 run k6-e1-public-nat.js

# E2 Scale open-loop (offered arrival ≈ target; read eventual success KPIs)
TARGET_SUCCESS_RATE=25 DURATION=30s k6 run k6-e2-scale-open-loop.js
TARGET_SUCCESS_RATE=50 DURATION=30s k6 run k6-e2-scale-open-loop.js
TARGET_SUCCESS_RATE=75 DURATION=30s k6 run k6-e2-scale-open-loop.js
TARGET_SUCCESS_RATE=100 DURATION=30s k6 run k6-e2-scale-open-loop.js

# E3 Cognitive payload classes
GROUP=cognitive PAYLOAD_CLASS=normal VUS=10 k6 run k6-e3-cognitive-payload.js

# E4 Aggregate
MODE=manyParent PEAK=100 GROUP=mixed k6 run k6-e4-aggregate.js
MODE=sameParent PEAK=50 GROUP=sameParent k6 run k6-e4-aggregate.js
# Seed siblings first: SAME_PARENT_SIBLINGS=2|10|50 (default 50; pool must be >= PEAK)

# E5 Bundle mixed (set FFMPEG_CONCURRENCY=0|1|2 on the backend process)
VUS=50 DURATION=30s FFMPEG_CONCURRENCY=0 k6 run k6-e5-bundle-mixed.js
```

Work A (public limiter / nginx buffering / auth+body metrics) should be deployed
on the branch under test before interpreting E1 429 vs 503 mix.


## E2 implementation notes

- Fixture index **must** use `execution.scenario.iterationInTest` (global). A
  per-VU module `cursor` collides under `constant-arrival-rate` and falsely
  inflates `gate_e_idempotent_replays`.
- Write custom summaries to `GATE_E_SUMMARY_PATH` — do not use `K6_SUMMARY_EXPORT`
  (k6's built-in overwrites that path with a metrics-only dump).

## E2 fresh-write (Gate-E.1)

- Fixtures must be **parent-bound UNIFIED_V1** scale assessments (see `backend/scripts/gate47-seed-fixtures.ts`).
- Each logical submit consumes one unfinished assessment / unique attempt / unique `submissionId`.
- Hard accounting: HTTP fresh completions ≈ DB `COMPLETED` delta ≈ `assessment_unit_snapshots` delta ≈ fixtures used.
- Prior E5 FFmpeg numbers are **INVALID** (no real FFmpeg; media is maintenance-only, not Gate-E mainline).

## E1 start-token audience split

- `PUBLIC_ASSESSMENT_EXPECTED_CLASS_SIZE` (default 60) → **IP** GET/FINAL only (`N × G|F × NAT`).
- `PUBLIC_ASSESSMENT_EXPECTED_START_TOKEN_AUDIENCE` (default 500) → **start-token** GET/FINAL (`A × G|F`).
- Class size ≠ shared-link audience. Explicit `PUBLIC_ASSESSMENT_TOKEN_*_LIMIT` still overrides.
