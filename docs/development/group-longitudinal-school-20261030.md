# School planned group longitudinal adapter

Local dependent slice on `863ae60a19eb4021c754d7d786695d7ce62479ea`. DOT pagination commit `24f78d1034703530b81834dce3f0e85a404a74de` was cherry-picked as `c94b83185`; its original receipt remains with DOT. This slice preserves its nextSourcePage/append/deduplicate behavior and does not implement another pager.

## Connection and behavior

- `campus/group-longitudinal-plan.service.ts` resolves only School-linked published/closed Runs from their original personal_tracking baseline and stable plan metric IDs. One current bound slot is selected before score keys. Frozen source C/profile and score units must match; participant visibility is not a GROUP grant. Only metrics with an actual group disclosure in at least one selected wave enter the report; a narrower wave keeps that metric suppressed without erasing another permitted score.
- Per-wave `generateCampusGroupReport/readCampusGroupReport` remain the authority for manager roles, approved GROUP spec, selected historical class/tag cohort, release delay, source rights, minimum N and small-difference protection. No calls are made under a second/nested School release lock. Existing per-wave GROUP artifacts retain the cohort/disclosure history; the compound report stores references and the small numeric longitudinal projection, not another copy of raw inputs or whole per-wave payloads.
- Two bounded header reads freeze actual completion dates and detect changes to the exact completed parent/epoch. An ongoing later attempt does not displace the completed result. If the authoritative execution pointer is not the latest completed parent, the adapter rejects rather than silently using an older result or changing Run identity. No redo capability is added. Old compound reads call original per-wave readers and check immutable record hashes plus only the relevant public numeric/count fields; wording changes do not invalidate the saved version, and a narrowed numeric view still withholds it.
- `reporting/resultSource.ts` adds optional `slotKey` discovery pushdown and carries actual Cognitive protocol signatures when present. Default callers retain their catalog behavior. School compares actual protocol, not report wording or an entire unrelated configuration digest. Existing `reporting/task-artifact.ts` gains the SCHOOL namespace with one atomic constraint extension; no new store/engine, grants or queue.
- `group-longitudinal-plan.routes.ts` is mounted at `/reports/groups/plans/:organizationId/:runId` under the existing School authentication/no-store surface. POST shares the existing School MFA and `campus-report-write` budget. The old arbitrary-Run longitudinal POST now returns a plan-required 409 after current manager authorization; historical artifact storage/read services are unchanged.
- The existing `SchoolGroupLongitudinal` page reuses `SchoolGroupReports` in longitudinal-only mode. Single mode retains its controls/history behavior; longitudinal mode does not auto-open single artifacts. Its plan panel is loaded lazily, uses the selected existing GROUP spec and class/tag selection, and displays the original frozen population labels per wave. Source pages and their selected tasks are retained. The old free choice of several unrelated Runs is retired. No new per-tool Reporting Spec or scientific approval is introduced.

The shared report DTO receives optional `wavePopulationLabels`; the original Survey/Training runtime projection remains unchanged. Old saved payloads and their hashes are not rewritten. Teacher code and source-policy defaults are untouched.

## Source contract blocker — no positive real School E2E claim

The checked main-supported School SELF sources still have `INDIVIDUAL_ONLY` and ORGANIZATION/PROFESSIONAL `NONE`:

- `education-tools/private-tool.runtime-policy.ts:16/20`
- `scale-library-governance/education-runtime-entry.ts:63/66`
- `education-tools/assessment-resource.contract.ts:91`
- `education-tools/private-tool.composition-source.ts:134/142`

The existing group catalog filters `analysisKind=GROUP`. These sources cannot become group-readable merely because they have a personal longitudinal plan. The adapter keeps their denial and has an explicit contract for it. Source configuration work must cover School as well as Teacher, including analysis mode, group metric audience and the `educationCompositionExecution.ts:43` runtime restriction. Apply permission choices only to appropriate new source versions/new published plans; do not upgrade old NONE contracts or invent new license rights.

Consequently this slice is **not ready for merge or a claim that School's real numeric journey is complete**. Once an appropriately authorized source configuration exists, do one new native School positive generation/read journey against that fresh T1/T2 plan. Do not redo the old 22/37 observations. Discovery still requires an accepted canonical selected leaf; a wave with no accepted leaf descriptor remains unavailable through the current School source mechanism. Numeric Form and Teacher non-Form expansions remain outside this slice.

## Evidence / formal preparation

`docs/evidence/group-longitudinal-school-20261030/manifest.json` maps distinct passed cases to their original reporters and retains failed invocations. Coverage is thin-service orchestration with supplied existing safe GROUP projections, actual PostgreSQL namespace/header/latest-parent/selected-slot queries, child/root HTTP contracts with the existing auth/MFA/CSRF test boundaries, and shared UI connection tests. It is not a new scientific test, real source publication journey or fresh validation of the existing School reporting engine. Source permission denial remains real code evidence; it was not replaced with a permissive registry to manufacture a positive E2E result.

The current backend/frontend type invocations and changed-file lint are developer evidence, not automatic official qualification. Required official migration/recovery, image/SAST and final candidate alignment have not been run. This new product-constraint migration needs its own affected qualification; old native restore results do not prove it.

For PR421 independently: its frozen `5a547d0c` Draft CI 41084956982/publication 41084956270 succeeded, and DOT review found no new concrete issue. It changes no schema or frontend; prepare a single natural base alignment and the existing affected backend/security/image qualification. Its two PG quota-row results are not a trial/FINAL E2E claim; no old 37-case replay or unrelated database restore is justified by the quota patch alone. No Ready change, CI routing edit or formal run has been performed by this School slice.

Survey/Training candidate upload remains denied pending explicit user authorization. No new upload or workaround has been attempted, and its frozen commit remains unchanged. School development is local and stacked rather than appended to that candidate.
