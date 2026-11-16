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
  (`low_memory_start_admission`) and re-samples host telemetry inside the gate
  slot before allocating a new runtime snapshot. Admitted requests receive an
  async trickle permit so the in-transaction runtime freeze guard allows them to
  complete while un-gated paths remain rejected below `700 MiB`.
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

All variables above apply per backend container process:

- **Host-wide serial (`limit = 1`)**: Set `ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=1`
  on `backend` and `ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT=0` on `backend-2`
  so trickle slots never double-allocate across instances on a 4C/3.7G host.
- **Balanced (`1 + 1`)**: Set `MAX_CONCURRENT=1` on both instances only after
  confirming `backend-1` serial throughput and swap/OOM headroom.

Ensure `ASSESSMENT_RESOURCE_PROTECTION_ENABLED`, `ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS`,
and trickle thresholds remain aligned across backend containers when enabled.

## Verification signals and rollback

Watch `ASSESSMENT_START_ADMISSION_MODE` transition logs (`allow`,
`trickle:low_memory_trickle`, `reject_memory:*`, `reject_cpu:*`), swap activity,
host `MemAvailable`, 503 counts, and 5-attempt/60-second budget exits during load
tests. If swap climbs, P95 stalls, or OOM signals appear, roll back by removing
`ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true` (or setting it to `'false'`) and
restarting backend containers; strict `< 700 MiB` blocking resumes immediately.
