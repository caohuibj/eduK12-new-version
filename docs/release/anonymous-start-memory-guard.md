# Optional anonymous START early memory guard

The early guard is disabled unless both `ASSESSMENT_RESOURCE_PROTECTION_ENABLED`
and `ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED` are `true` in the API
container. When enabled, a new ordinary public-link START receives the existing
retryable resource 503 if host MemAvailable is below 650 MiB or unavailable.
Recovery-token resumes bypass the check. Anonymous study admissions also bypass
it because their existing-attempt check occurs inside the admission transaction.
The existing transactional freeze guard is unchanged.

This is an opt-in experiment. Confirm the variable reaches both API instances,
retain the previous profile and compare matching workloads and starting resource
conditions before considering rollout. Record refusals, CPU, memory, swap, OOM,
latency and success, and stop on the agreed safety signals. Roll back by removing
the opt-in variable using the existing release procedure. No threshold change or
increase in allowed low-memory concurrency is made here.
