# PERF v1 runtime baseline

## Recovery point

- Repository: `caohuibj/eduK12-new-version`
- Execution specification: `docs/performance-optimization-v1/implementation-plan.md`
- Analysis base: `f89354d32c7ac3dc4a9abd3a6abdca851667b8b5`
- Working base: `68afbe63672b42c9a2086f834d5ae46794c3c013` (GitHub `main`, checked 2026-09-23)
- Worktree: `/Users/Qiang/projects/perf-measurement-baseline-v1`; branch: `perf/measurement-baseline-v1`
- Current planned commit: P1-C05; the P1-C01–C04 commits have been rebased onto the working base above.

The original checkout was on `fix/ci-runner-stability-v2`; it was not modified. No PERF-01/02/03 PR or progress file existed at the start. Open PRs #164, #157, #155, #146, #145, #125, #112, and #48 concern other work. PR #164 changes content CI and is not treated as a performance baseline.

## Phase 0 / dual-capacity amendment

- Phase 0 now deliberately uses GitHub-hosted Actions, the existing Mac/Windows self-hosted runners, and Codespaces for correctness, profiling, exploratory stress and comparable A/B.
- These environments remain unqualified for production capacity; manifests must not set `PERF_CAPACITY_QUALIFIED=1` merely because a run reaches a high rate.
- Formal capacity is staged later as two independent profiles: `CAP-2C4G` first, then `CAP-4C4G`. Both require whole-host topology and an external load generator.
- PR #165 remains PERF-01; this amendment extends its measurement infrastructure rather than creating a duplicate baseline PR.

## Main since analysis base

The relevant main delta includes questionnaire four-type and bundle runtime work (#160, #162, #163), a new questionnaire-product and bundle-product mount in `src/index.ts`, composite route guard and recovery additions, bundle-specific aggregate reads/writes, and CI content fast paths (#158). These additions do not remove the 14 FINAL route templates in section 7.2 of the plan. The new composite `/:id` write guard explicitly bypasses `/attempts/*`; the three composite FINAL handlers retain respondent access and relational consent guards. The new bundle aggregate path must be included in parent-finalization measurements, not assumed equivalent to the prior generic path.

The CI workflow classifies content-only changes and has separate PR-light and ready-PR full gates. The active main ruleset (ID `23665026`, read 2026-09-23) requires `merge gate / ready PR` with strict head freshness. Runtime, parser, and gateway changes in this plan require the full merge gate. Required branch rules and final head checks must be re-read when a PR is ready; a local test or an older SHA is not a substitute.

## Fixed comparison configuration

| Resource | Default at working base | Qualification |
| --- | --- | --- |
| API processes | 1 | Target topology still to be measured |
| UNIT admission | 7 active / 16 queued / 500 ms wait | `unitSubmitAdmission.ts`; env overrides are recorded per run |
| Aggregate admission | 3 active / 4 queued / 250 ms wait | `aggregateFinalizationAdmission.ts` |
| Prisma pool | 10 | `databasePool.ts`; explicit `DATABASE_URL` parameters take precedence |
| JSON body parser | 2 MB, before CSRF, route auth and UNIT admission | `src/index.ts` |
| Public limiters | process-local, mounted before public routers | `src/index.ts` |
| Phase 0 target | existing GitHub/Codespaces/self-hosted resources | Correctness, profiling, exploratory stress and comparable A/B only; `PERF_CAPACITY_QUALIFIED=0` |\n| Formal capacity targets | CAP-2C4G, then CAP-4C4G | Whole-host target for each profile; external load generator required |

The isolated PostgreSQL first-attempt HTTP baseline now covers all 14 FINAL route templates and two distinct policy-domain samples. It records SQL events, model calls, phase means, response bytes and durable completion; see `query-budgets.csv` and `server-version/perf/current-main-v1/evidence/query-baseline-20260923/route-baseline.json`. One request per route is not a latency distribution or a throughput/capacity measurement. No 4C4G capacity has been measured. Historical Gate-E figures are background only.

## Current path and planned owner

| Hotspot or guard | Current location | Planned item |
| --- | --- | --- |
| SJT validation index | `src/modules/situational/situation-scoring.ts` | P2-C02 |
| SJT commit/replay and parent recovery | `src/modules/situational/situational-final-submit.service.ts` | P2-C03, P2-C05 |
| SJT response/runtime projection | `src/modules/situational/situational-runtime.service.ts` | P2-C05 |
| SJT and embedded controller response | `src/controllers/situationalController.ts`; `src/modules/composite/composite.controller.ts` | P2-C04, P2-C05 |
| Scale child binding and reference | `src/modules/scale/scale-final-submit.service.ts`; `src/controllers/scaleController.ts` | P2-C04, P2-C07 |
| Cognitive verified input, scorer, frozen report | `src/modules/cognitive/final-submit.service.ts`; `unified-final-submit.service.ts`; `v2/authoritative-scorer.ts`; `profile-freeze.ts` | P2-C04, P2-C06 |
| Reference freeze/load | `src/modules/assessment-runtime/reference-binding.ts` | P2-C07 |
| Parent snapshot/aggregate | `src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts` | P2-C08 |
| Auth, organization, consent, privacy | `src/middleware/auth.ts`; `src/modules/organization/principal.ts`; `src/modules/assessment-relational/result-authority.ts`; `runtime-consent.ts` | P1-C04 budget, P2-C01/P2-C04 invariants |
| Gate, transaction, pool | `src/services/unitSubmitAdmission.ts`; `aggregateFinalizationAdmission.ts`; `questionnaireProgressService.ts`; `src/config/databasePool.ts` | P1-C02/P1-C04, P2-C01, P3-C01/P3-C02 |
| Entry parser and public limiter | `src/index.ts`; `src/middleware/publicAssessmentRateLimit.ts` | P3-C01/P3-C02 |
| Media | `src/modules/assessment-media/assessment-image-delivery.ts`; `src/modules/situational/situational-video.service.ts` | P3-C04 |
| Client retry and proxy | `frontend/src/services/persistence/finalDraftCapacityRetry.ts`; `frontend/nginx.conf` | P3-C03 |
| Existing observation and query test | `src/services/runtimeObservability.ts`; `src/__tests__/hotpath/query-budget.postgres.integration.test.ts` | P1-C02/P1-C04/P1-C05 |

`src/` paths in this table are under `server-version/backend/`. Route-level access, reconciliation and response privacy are counted in the full HTTP budget, even when a service microbenchmark omits them. The 14 current FINAL templates and their guard/handler mapping are in `route-inventory.csv`. Run `node server-version/perf/current-main-v1/check-final-routes.mjs` from the repository root after route edits.

## Environment and evidence status

Docker is available on the development host. Existing PostgreSQL/Redis containers belong to other work and are not used. P1-C02 created task-owned `huisurvey-perf01-postgres` (PostgreSQL 14, localhost port 55439) and `huisurvey-perf01-redis` (Redis 7, localhost port 56379). The independent database has all 81 current migrations; no shared data or credentials are used. k6 is available locally. The database is suitable for correctness and development SQL probes. This host also runs unrelated containers and k6 shares resources with the API, so it cannot qualify whole-host capacity or a clean same-host A/B. There is no exclusive formal CAP-2C4G or CAP-4C4G target provisioned for this phase. Phase 0 instead uses existing GitHub/Codespaces/self-hosted resources for correctness and comparable measurement. `performance-results.md` separates measured evidence from unverified formal capacity.
