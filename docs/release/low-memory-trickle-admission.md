# Controlled low-memory START trickle admission

By default (`ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED` unset or anything other than `'true'`),
ordinary scale-only `START` keeps the strict `< 700 MiB` host-memory gate unchanged.

When both `ASSESSMENT_RESOURCE_PROTECTION_ENABLED=true` and
`ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true` are set explicitly in the backend
deployment profile, `startUserAttempt` splits host memory below `700 MiB` into
two tiers while preserving fail-closed protection under CPU saturation or missing
host telemetry:

- **`>= 700 MiB` (`allow`)**: Normal admission without acquiring the low-memory
  trickle queue (subject to the existing two-sample `>= 95%` host CPU latch).
- **`[floorMiB, 700) MiB` (`trickle`)**: If host CPU is available and at or
  below `maxCpuPercent`, START runs through a per-process bounded admission gate
  (`low_memory_start_admission`). Upon acquiring a gate slot, START forces a
  fresh `/proc/meminfo` `MemAvailable` read (while keeping the `>= 1000ms`
  `/proc/stat` CPU delta window so short queue waits never distort CPU%) before
  allocating a new runtime snapshot. Admitted requests receive a revocable
  slot-scoped trickle permit (`active: true` cleared in `try/finally` when the
  START operation settles) so the in-transaction runtime freeze guard allows
  only active gate-slot holders while un-gated or detached continuations remain
  rejected below `700 MiB`.
- **`< floorMiB`, stalled telemetry, hysteresis lock, CPU above `maxCpuPercent`,
  or trickle queue saturation (`reject_memory` / `reject_cpu`)**: Rejects START
  with HTTP `503` (`INSTRUMENT_NOT_AVAILABLE` + `Retry-After`) before heavy
  composite definition loading or entering `prisma.$transaction`.

## Environment variables

Invalid values throw at backend startup when `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true`:

| Variable | Valid range | Default | Notes |
|---|---|---|---|
| `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED` | `'true'` to enable | unset (off) | Requires `ASSESSMENT_RESOURCE_PROTECTION_ENABLED=true` |
| `ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB` | integer `512..699` | `650` | Critical memory floor; below this rejects immediately |
| `ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB` | integer `floorMiB..700` | `min(700, floorMiB + 20)` (`670`) | Hysteresis release threshold after dropping `< floorMiB` |
| `ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT` | integer `1..94` | `80` | Maximum host CPU% allowed for low-memory trickle |
| `ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT` | integer `0..10` | `1` | `0` disables trickle on that backend instance |
| `ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE` | integer `0..20` | `1` | Bounded trickle waiters per instance |
| `ASSESSMENT_START_LOW_MEMORY_MAX_WAIT_MS` | integer `100..15000` | `2000` | Queue wait budget before failing fast with `503` |

## Dual-instance coordination

All variables above apply strictly **per backend container process**; there is
no shared cross-process atomic semaphore or IPC lock across `backend` and
`backend-2`:

- **Host-wide serial (`limit = 1`)**: Set `ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=1`
  on `backend` and `ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=0` on `backend-2`.
  Note that this is an operational deployment configuration constraint, not an
  atomic cross-process guarantee; configuration drift between container env
  profiles (for example accidentally deploying `1` on both or leaving mismatched
  thresholds) re-allows simultaneous low-memory allocations across instances.
- **Balanced (`1 + 1`)**: Set `MAX_CONCURRENT=1` on both instances only after
  confirming `backend-1` serial throughput and swap/OOM headroom.

Keep `ASSESSMENT_RESOURCE_PROTECTION_ENABLED`, `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED`,
`ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS`, and trickle thresholds verified
and aligned across backend containers whenever enabled.

## Default posture, verification signals, and rollback

Keep `ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED` unset (disabled) by default; merging
or deploying this mechanism must not enable trickle or start load tests
without explicit authorization. Watch `ASSESSMENT_START_ADMISSION_MODE`
transition logs (`allow`, `trickle:low_memory_trickle`, `reject_memory:*`,
`reject_cpu:*`), swap activity, host `MemAvailable`, 503 counts, and
5-attempt/60-second budget exits during approved trials. If swap climbs, P95
stalls, or OOM signals appear, roll back immediately by unsetting
`ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED` (or setting it to `'false'`) and
restarting backend containers; strict `< 700 MiB` blocking resumes immediately.
