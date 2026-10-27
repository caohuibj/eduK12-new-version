# Education feedback integration seam

Branch: `feat/pr363-education-feedback`, starts at `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`. This is the feedback task line; source registry/authority/migrations and new Teacher runtime remain with root/other worker.

## Frontend

`EducationTaskFeedback` props: `entry: SCHOOL|TEACHER`, `executionId`, `title`, product-bound `api`, stable `loadFeedback(): Promise<EducationFeedbackData>`, `onClose`, optional `renderLegacy(data)`. Key it to execution and identity scope. Mount only after authoritative parent `COMPLETED`, or a separate real accepted whole-submit ACK host; a child receipt is not whole completion. It always preserves accepted completion, reads once, exposes explicit refresh/retry/close, and discards late replies after identity/task switch or close. It does not poll, submit, or cache cross-request authorization.

Existing School/Teacher Scale consumers retain their product-owned report paths. School's optional runner `onParentCompleted()` is emitted only from an actual loaded parent COMPLETED, never from a child FINAL response, and excluded for observers. Other Teacher multi-tool hosts can use the shared component with `/assessment-reports/executions/:executionId` and their own stable loader.

DTO recognizes `EDUCATION_SCALE_PERSONAL_REPORT` and new `EDUCATION_ASSESSMENT_PERSONAL_REPORT`, schemaVersion 1. The new DTO has `state: READY|WITHHELD|COMPLETED|PENDING`, `mode`, `message`, optional `releaseAt`, and `reports: [{itemId,family,status,rendered}]` for READY. Each rendered object is existing `renderDeclaredReport` output. Missing/withdrawn/unavailable templates are explicit statuses; there is no raw metrics fallback. ASSET nodes show alt text only; this does not create an unprotected resource URL.

## Backend wiring required from root

`createEducationAssessmentReportReader(deps)` requires both:

1. `readSource(tx,{product,organizationId,resourceKey,resourceVersion,purpose:'HISTORY'})` returning `null` or `{identityOnly:true,origin,entry,runtime:{id},releases:ReadonlyMap<string,StoredRelease>}`. Structurally wider root runtime/source objects are compatible. `origin` is existing `EducationAssessmentOrigin`; key is `education-assessment:PRODUCT:ORGANIZATION_UUID:RESOURCE_UUID`, version `1.0.0`.
2. `assertSourceAuthority(tx,{actorUserId,executionId,product,organizationId,source,purpose:'REPORT_READ'}): Promise<void>` which independently proves current education source/report use and original authorizer authority. It must reject stale/revoked grants; `identityOnly` is never this grant. No permissive default adapter, process registration, or authorization cache exists.

Root composes once and mounts `createEducationAssessmentReportRouter('SCHOOL', reader)` at `/api/campus`, and the TEACHER router at `/api/huiteacher`. Both enforce the corresponding authentication middleware; School also checks student approval. There is no Training cookie/session-ID transport. Root may call this reader before legacy fallback in `readCampusStudentFeedback`, or keep it as its dedicated multi-tool endpoint.

The reader checks current product membership, self respondent/subject, report denies, current population, resource key/version/policy, parent/assignment identity, real async job identity, and rechecks current source/authority after async materialization. A READY report additionally consumes `readRespondentRunSummary` as an independent disclosure ceiling.

## Shared FINAL input needed

The actual education runtime must have the existing frozen `trainingContentBinding` + hash, optional `trainingReferenceBinding` + hash, encrypted `trainingContentInterpretation` + hash, aggregate input hash, active slots and current-epoch canonical UNIT_RESULT rows. The shared interpreter must have produced that receipt at FINAL/worker time. The reader decodes it and renders existing facts; it does not invoke scorers, reference selection or new interpretation on GET. Origin unit item IDs and C/P/R pointers must equal those bindings. Missing verifiable receipt is WITHHELD, not synthetic PENDING. Real PENDING requires an actual matching PENDING/PROCESSING job and accepted submission/current completion.

Report content audience must exactly be `student` for SCHOOL or `teacher` for TEACHER, with current source-use authority. A PRIVATE report from another product, including TRAINING, is refused. A shared/platform report still needs the explicit source authority callback. No template is created, approved or auto-published by this task line.

Release-time behavior reuses `evaluateTrainingFeedbackForAttempt`; root must preserve any applicable frozen feedback policy when constructing the education delivery. If root uses another education timing contract, supply its equivalent before integration rather than silently dropping delayed opening. Report images are intentionally not served by this new DTO; authorized ASSET delivery remains a separately scoped integration item.

No production/PG/browser/CI qualification is claimed by this interface note. Exact tests, original failures and final commit identities will be recorded in the final evidence note.
