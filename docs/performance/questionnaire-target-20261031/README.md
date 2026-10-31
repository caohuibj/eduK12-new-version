# Single-questionnaire availability scope — local follow-up

Base main d420e90e46036b4518a0f729cb3e1ef4b9ca3306, independent branch perf/questionnaire-target-availability-20261031. Published Draft PR432 remains fixed at ef838daaea54c379b2b6c29fbf32d10b063d17ba; it is neither amended nor merged. This follow-up is not uploaded, CI-wired or deployed.

## Minimal change

The existing available controller accepts optional questionnaireId as an additional id filter alongside existing PUBLISHED/COURSE, role, visibility and course eligibility conditions. Questionnaire includes, selected fields, ordering, attempt scope mapping, active-id and completed-time selection, return DTO and default no-parameter directory are unchanged. The entry still makes its existing available preflight, now with params.questionnaireId; it does not replace preflight with startAssessment. An active attempt takes priority over completed history; completed-only routes to the existing report; unstarted uses the same POST. No retake protocol, report permission, endpoint, cache, index or engine changes.

## Baseline and same-input result

One fixed UTC fixture contains12visible questionnaires,4ineligible rows and26attempts for the visible questions. The target has both two active and two completed attempts. Both versions return identical default directory rows and bytes. Target output equals the default directory's exact target DTO, including activeAttempt=target-active-a, latestCompletedAttempt=target-done-latest, assessmentId=target-done-latest and attemptCount4; attempt selection logic is unchanged.

For the single target: questionnaire rows12→1, attempt rows26→4, fixture form-ID rows24→2 and scale links12→1. Controller JSON body7964→744bytes; deterministic gzip1 body816→441bytes. Default directory remains12questions/26attempts,7964raw/816gzipbytes. Prisma method count remains the same; no actual SQL-count, pool-wait, CPU, memory, network latency or production throughput improvement is claimed. The measurement includes response bodies in the retained NDJSON; all data is synthetic. Fixture hash ddcbf9cdbb1f9f868775bf85372cb3669a5ed48ff1ea8562e0cbf1d3e4c9ee1e matches baseline and candidate.

## Necessary checks only

Baseline6backend cases fail because target/forbidden-ID filters are absent;3frontend cases reach the expected original resume/report/start behavior but fail the missing request-param assertion. The unchanged fixtures then pass6backend and3frontend cases after the two-line-scope product edit. Backend checks cover default/target output and exact where/attempt IDs, plus inaccessible-course, draft, wrong questionnaire type, private and missing IDs returning empty. Frontend covers active-with-prior-completion (one POST resume), completed-only (no POST), and unstarted (one POST start). Original failed reporters are retained; no unrelated case or whole journey is rerun.

Limits: the Prisma adapter evaluates the actual controller filter against synthetic records; this is not a fresh database authorization or attempt-persistence exercise. Frontend tests exercise the actual parent and navigation but stub its FINAL child and API responses; existing FINAL/durability checks are not replayed. Teacher/Admin default branches and explicit courseId combination remain source-identical except the additive id property, not separately requalified by this student fixture. No malformed-query hardening is added. Current-component types/build/DB/browser/CI are NOTRUN. Execution commands, exit observations, original rows and current source/lock/config hashes are in execution.json.

## Subsequent fixed-component qualification

After the initial local delivery's NOTRUN statement above, DOT requested the two affected type checks only. Backend and frontend app types each executed once and exited0 on product2685b3d, with exact component trees and real command/exit/log/input receipts under types/. No business case was rerun. PUBLISH-PLAN.md describes the separate, still-unpublished single Draft target; PR432-CLOSEOUT-READONLY.md implements no CI/main/control action. Original synthetic row/body and failure boundaries remain unchanged.

New Notion engineering updates belong to Hui link_6a76f4dd02d08191994e341ce3194fd0. DOT coordinates the performance page/location; repository originals remain authoritative here. No old-account write, duplicate page, migration or School-approval postmortem is performed by this slice.
