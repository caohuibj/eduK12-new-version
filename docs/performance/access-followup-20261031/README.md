# Access and efficiency follow-up (local only)

Base main0a9c565ce9a46793363fd1b40a3e7a0b1d124019. PR395 and420 were confirmed merged by current GitHub reads. Original performance V2 Notion page406d27635a38819ca344e5dd8074f7fe returned404/object_not_found on2026-10-31; repository roadmap and the current DOT scope apply. No Notion write or alternative-identity retry. Existing other worktree/WIP preserved.

## Questionnaire accepted state and retry

FinalQuestionnaireAssessment now marks the current unit COMPLETED in memory immediately after successful POST, before local cleanup or parent progress reads. Cleanup/reload failure cannot call submission-failure classification or unlock/reseal the accepted unit. Already accepted submit controls and handlers refuse another POST; the committed message outranks the in-flight progress load. This does not claim the parent questionnaire completed or report became readable.

Form uses the existing independent answer/submit controls, like Scale: uncertain sealed answers stay locked while navigation and identical sealed replay remain available. No new engine, cache, API or permissions. Existing Composite accepted handling and Scale replay semantics are the implementation references, not newly replayed qualification.

Three new React/jsdom cases passed: Form ambiguous failure→locked answers/navigation→identical replay; Form accepted→deleted local draft→reload failure→no resubmit; Scale equivalent accepted path. Baseline had both accepted-message failures and, after a selector-only correction, the disabled Form navigation failure. Full original reporter rows, fixture failure and an unchanged-product repeated red invocation caused by an edit cwd error are preserved; no historical failure is relabelled. See questionnaire-recovery/execution.json for exact selections and source hashes. No application build, whole journey, database, CI, upload, merge or deployment.

## Published reporting spec discovery

The page SELECT now returns the same row fields used by getPublishedReportingSpec, then reuses its original toRecord definition/hash validation via an exported alias. No new validator/cache/index. PUBLISHED and optional analysisKind filters, specKey/version/id order, LIMIT/OFFSET, total count and both current authorization calls are retained. Single-ID consumers remain unchanged.

One fixed synthetic adapter exercises1and4rows at page2/size4. Exact public summaries match both implementations; actual Prisma call counts decrease3→2and6→2, i.e. page+count rather than page+count+N. Both auth adapter checks occur before/after. This is a query-shape/call-count result, not actual PostgreSQL latency or production throughput. The existing validator body and authorization functions are unchanged; reporting-spec-pr4 and reportingDiscovery.postgres.integration.test.ts retain their contracts, including current REPORT_READ denial. They were not rerun and no fresh DB authorization claim is made. Original failed budget assertions and current two PASS reporters are in spec-discovery/.

## Manager units projection

The shared manager explicitly requests ?projection=units only under the ordinary/course questionnaire routes. Both controllers retain object/type/management authorization and the existing units service, then return only{units}; they skip the two previously unconditional questionnaireFormItem.findMany and questionnaireScale.findMany(include scale.definition) calls. Default full list/units/total, ordering and full Scale fields remain unchanged. Composite path and backend are untouched. No cache or new management endpoint.

Six scoped controller cases pass: both projected responses omit both discarded Prisma reads; both default responses retain sorted full rows/scale definitions/total; both projected non-manager reads still403 before content work. These are actual controllers with synthetic adapters, not fresh database authorization evidence. Original two red projection cases are retained.

Actual shared manager→API client→loopback HTTP, same41field fixture hash2571671e20a5dea42b1a23f01c5b2be6d52802acf31b1aaf870c446888837b5d and gzip1/no-store: both ordinary and course still2GETs. Content body13628→379raw bytes,1310→200gzip bytes; combined sections+content gzip2307→1197bytes. Fields and dropdown choices are identical. The fixture has Form fields; no Scale bytes or production percentage is inferred. Two initial manager cases passed before and after the changed fixture/URL contract;10other existing cases filtered, including complete parent journey. Wall time/CPU/heap observations remain original but are not used for benefit claims.

## Handoff boundary

All three slices are local commits only. No new CI/control lane, push/PR, upload, merge, deployment, database service or production operation. No new dependencies/schema or permission changes. No group-report or longitudinal feature implementation. The only reporting files changed are the explicitly delegated spec discovery and existing record-mapper export. Full-platform/types/build/browser/database suites are not rerun; current results cover only the named scopes above. Future release/CI qualification remains a separate DOT decision.
