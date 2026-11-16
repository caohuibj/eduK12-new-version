# Optional anonymous START early memory guard

The early guard is disabled unless both `ASSESSMENT_RESOURCE_PROTECTION_ENABLED`
and `ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED` are `true` in every API
container (`backend` and `backend-2` must stay aligned). When enabled, a new
ordinary public-link START receives the existing retryable resource 503 if host
`MemAvailable` is below 650 MiB or unavailable.

## Exact Scope and Guarantees

- **Check order**: Runs after `findPublicToken`, `assertTokenWindow`, and
  `assertCompositeWindow`, and **before** `loadStartComposite` and the admission
  transaction. Rejected new plain public STARTs skip both publication tree
  cloning/preloading and database attempt creation, though token lookup still
  executes so invalid/expired tokens continue returning 403/409.
- **Bypassed paths**: Recovery-token resumes bypass the check. Anonymous study
  admissions also bypass it because their existing-attempt lookup runs inside
  the admission transaction.
- **Sample freshness boundary**: `sampleAssessmentHostResources()` caches each
  `/proc/meminfo` and `/proc/stat` read for up to `1000 ms` (`at - sample.at < 1000`).
  If reading host telemetry fails or produces a non-finite value, the guard fails
  closed with 503.
- **Transactional freeze guard & 650–699 MiB note**: The existing in-transaction
  freeze guard (`runtime-snapshot.ts` → `assertAssessmentStartResources()`, default
  `< 700 MiB`) remains unchanged and authoritative. `650 MiB` is a conservative
  opt-in floor rather than a proven optimum, and does not enforce cross-instance
  concurrency or replace a dedicated low-memory trickle policy in the
  `650–699 MiB` band.

This is an opt-in experiment. Confirm both variables match across all API
instances, retain the previous profile and compare matching workloads and
starting resource conditions before considering rollout. Record refusals, CPU,
memory, swap, OOM, latency and success, and stop on the agreed safety signals.
Roll back by removing the opt-in variable using the existing release procedure.
