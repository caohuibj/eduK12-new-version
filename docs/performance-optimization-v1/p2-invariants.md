# PERF-02 / P2-C01 runtime invariant gate

Status: IMPLEMENTED_AS_GATE; runtime behavior is unchanged by this commit.

This gate reuses the real PostgreSQL and privacy/concurrency suites already present on current main instead of duplicating their fixtures. It must pass before any P2 hot-path commit is treated as CODE_READY.

## Required matrix

| P2-C01 invariant | Existing executable coverage |
| --- | --- |
| fresh FINAL persists one authoritative result | `integration/instrument-final-submit.postgres.integration.test.ts`; SJT standalone/composite PostgreSQL suites |
| identical concurrent FINAL converges to one winner + replay | Scale instrument FINAL PostgreSQL; Cognitive concurrency suite; SJT standalone/composite concurrency |
| conflicting retry / stale epoch does not overwrite | instrument FINAL PostgreSQL; SJT composite binding/conflict tests |
| restart / terminal parent competition cannot pollute new attempt | instrument FINAL restart/stale tests; SJT composite stale binding tests |
| anonymous recovery remains bound to the right execution | instrument FINAL public/recovery tests; assessment-run consent/recovery PostgreSQL suite |
| frozen scientific identity fails closed | existing Cognitive frozen profile/reference suites remain part of Full Gate |
| relational/cohort/organization visibility remains governed | `assessment-relational/result-authority.test.ts`, `runtime-consent.test.ts`, organization consent/recovery integration |
| durable raw/snapshot identity remains unique under concurrency | instrument FINAL + SJT bundle PostgreSQL count assertions |
| response-loss recovery does not create a second canonical result | PERF-01 lost-response accounting artifact + assessment-run recovery coverage |

The dedicated Phase 0 workflow runs the highest-risk PostgreSQL/concurrency/privacy subset with `--no-file-parallelism`. Full Gate still remains authoritative for the complete repository suite.

## Performance curve

Before changing a hot path, the same workflow runs two non-capacity exploratory points on GitHub-hosted Ubuntu:

- 10 fresh FINAL/s for 5 seconds;
- 25 fresh FINAL/s for 5 seconds.

Each point uses a new disposable PostgreSQL/Redis job and a newly seeded fixture pool. It runs:

- Scale typical;
- Cognitive N-back standard;
- Cognitive CPT standard;
- SJT linear 30;
- SJT linear 60.

These runs are deliberately `PERF_CAPACITY_QUALIFIED=0`. They are used to find logic/resource regressions and to select the first optimization target, not to claim 2C4G/4C4G capacity.
