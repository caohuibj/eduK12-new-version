# C06 Form V3: core work in progress

This checkpoint is not full acceptance. Nullable item `formPolicy` freezes version 3, required refusal submission mode and hidden required qualification. Historical absent/null definitions and V1/V2 facts remain unchanged. Nullable section and parent `taskSatisfaction` separate accepted FINAL/report availability from educational task satisfaction. Old null projections retain historical behavior; policy sections require a non-null current-epoch qualification before aggregate completion. No migration backfill.

Shared Form normalizer executes once per ordered typed section. Training conditions use only preceding SINGLE/MULTIPLE in that section, not cross-tool or cross-section state. Omitted hidden answers remain omitted; explicit hidden null is rejected. V3 encrypted facts preserve ANSWERED/REFUSED/SHOWN_MISSING/NOT_SHOWN and matrix row reasons, with selected other text. No new score model. Fixed shared 47-case oracle is untouched.

Required refusal and hidden-not-satisfied authoring are intentionally blocked at this checkpoint until task/list/report consumers are integrated. No production, CI, push or browser execution. New authoring target section runs inside the existing questionnaire revision transaction. Copy uses preallocated database IDs and exact stable-key mapping.

Initial new backend tests: 6/6 passed. First typecheck found three integration typing errors; fixes are pending recheck. No real PG/API migration or UI evidence yet. This is a source checkpoint for parallel consumer integration, not a release candidate.

## Second implementation checkpoint

- FormPlayer uses shared visibility/exclusive/other controls; refusal values and per-row refusal remain typed. Pagination excludes hidden fields. Editing a source clears hidden persisted answers; sealed submission includes only visible DB item IDs and selected other text. A real component/persistence test covers previously saved conditional text removed before FINAL.
- New QUESTIONNAIRE addItem accepts an optional existing ordinary section ID inside the existing revision/owner/draft transaction. No target preserves existing auto-sectioning. UI uses returned stable keys; publication rejects forward/dangling/cross-section/Likert references. Generic composite copy rejects V3 and directs callers to the supported product-copy route, which remaps exact item keys and condition references.
- Only ordinary QUESTIONNAIRE unified FINAL is eligible. Unsupported bundle/relational/legacy paths are blocked at authoring/publication/start/admission; historical no-policy paths remain unchanged. New acceptance-without-satisfaction controls stay unavailable until consumer integration.
- V3 report metadata reads state/rowStates/otherText from the same authoritative facts load, never mutable String projections. Parent task qualification is projected at current-audience report reads, including materialized reports. Whole worker carries qualification into its committed context. Aggregate validates lightweight section qualification against the existing canonical facts verification; no second normalization pass is added.
- Backend targeted regression: 84 passed, including fixed shared oracle and typed facts/policy cases. Frontend existing FormPlayer/FINAL: 39 passed; authoring/control/helper selection: 48 passed (overlaps the prior controls); two additional V3 authoring/persistence cases passed with 41 unselected tests recorded skipped. These counts are not additive unique totals.
- Frontend latest app typecheck passed. Backend latest attempt failed only on a newly added teacher-mapper field omitted from its local type; that overlapping consumer hunk has now been removed and awaits recheck. Prior failed typecheck logs are retained. Browser, actual migrations/role checks/HTTP and performance remain unverified.
- Query/CPU observation: new per-section qualification is stored in the accepting transaction. Aggregate graph additionally selects section-attempt qualification; exact SQL count/cost has not been measured. No per-item DB reads were introduced by the pure adapter; this is not a performance result.

## Prototype-key and authoring cleanup increment

The public composite wire now rejects reserved object keys before record parsing can silently discard `__proto__`; a positive valid-payload control and exact rejected-path assertion accompany it. Final policy tests are 9/9, backend typecheck exit 0, frontend app typecheck exit 0, and affected frontend source ESLint exit 0. Earlier errors remain in the evidence ledger. The final optional `otherText` API type declaration is additive and will be typechecked with the merged consumer candidate.

Changing to a legacy year/month or demographic field turns off V3 authoring; clearing Other also clears its text limit, avoiding an invalid leftover configuration. Full Survey normalizer behavior remains anchored to the untouched 47-case oracle. Remaining per-question definition validation in section preparation is a possible CPU hotspot; no optimization result is claimed.

## Local answer snapshot hardening

Form edits now advance a synchronous ref before React renders, so consecutive callbacks sanitize and persist removals against the same up-to-date snapshot. The existing serial local-save queue is unchanged. Affected FINAL component suite: 19/19 passed; affected-file ESLint: exit 0. No separate same-frame event simulation was added.

Definition-order test now calls the pure validator directly with a valid control, forward reference, missing source/destination-only section and an actual preceding Likert source. It no longer risks passing merely because submitted required answers are absent. Policy suite remains 9/9; this is stronger coverage, not nine additional cases.
