# C06 task satisfaction consumer checkpoint

Scope: separate persisted submission completion from educational task satisfaction. This is a local consumer checkpoint, not full C06 acceptance, browser acceptance, performance qualification, or deployment.

## Contract

- A submitted `COMPLETED` attempt remains submitted, consumes its existing attempt allowance, and retains its authorized report. No restart/admission/max-attempt mutation was added.
- Consumer qualification calls the public `isTaskSatisfied` helper: `COMPLETED` plus null/undefined (historical compatibility) or `SATISFIED`; any other non-null value fails closed.
- `listAvailableForStudent` retains `latestCompletedAttempt` for reports and independently returns `hasSatisfiedAttempt` / `latestSatisfiedAttempt` from all already-batched history. A newer unsuccessful submission does not erase older satisfaction. Latest report metadata includes `taskSatisfied`.
- Student tasks add `SUBMITTED_NOT_SATISFIED`; it is not an unsubmitted/PENDING attempt. Report links remain available. Original active-attempt/window precedence and attempt ceilings remain unchanged. Historical satisfaction is explicitly retained in the projection and UI.
- Both course UI paths consume the distinction: `pages/student/CourseDetail` and `training/courseAssessments` → `TrainingLearnerCourse`. The latter continues using the original course-delivery feed for null-course multi-delivery authorization.
- Teacher list/editor/results and workbench distinguish submitted counts from satisfied/unsatisfied counts. `completed` still totals all submissions. Grouping by task satisfaction adds buckets by status; no Object.fromEntries overwrite. Counts are attempts, not deduplicated people; satisfaction/unsatisfaction use submitted attempts as denominator.
- Teacher rows and anonymous rows expose only the same authorized participant metadata plus qualification. Report presentation keeps submission/report permission separate from qualification and renders V3 four-state, other text, and matrix-row state metadata from the authoritative server projection. Missing old state is not guessed.
- The existing `/my-assessments` inbox is a second consumer of the task feed. Its minimal projection treats the new submitted state as a report target, not a launch target. Identity, source predicates, feedback policy, and other task sources are unchanged.
- `QuestionnaireProduct.available` was inspected: it spreads the new light projection and retains `latestCompletedAttempt` for reports. No source change was needed. Old standalone Questionnaire/Scale completion routes and CourseStatus are untouched.

## Cost boundary

Qualification adds one scalar to the existing batch history select and existing teacher select. It does not add historical per-questionnaire reads, decrypt answers, recalculate scoring, or read facts. Grouped teacher/workbench counts remain one query. Tests inspect the exact light projection and constant query shape over 30 questionnaires; existing task-feed tests cover 100 courses. This is query-shape evidence, not a real PostgreSQL or concurrency performance measurement. Existing unrelated progress/report computations are not claimed optimized.

## Integration boundary

Base `8ac167cf6a494d8410743e2f14ef6448cb1daea4`, plus helper fix `00de27874512488e8b0359256223bc526be7e654` (equivalent local cherry-pick `aa9c7f9c`). Core owner supplies runtime/report `taskSatisfied`, V3 fact metadata, aggregate computation, authoring, and FINAL handling. Overlap is confined to consumer hunks in composite.service.ts and report/attempt/teacher type fields; frontend runtime optional type additions are identical to core-owner additions.

Checks use independent npm ci, Node 24.21.0, fresh Prisma 5.22 client, and the shared measurement lock. No PG/Redis restart, browser retry, production, push, PR, or CI run. Raw failures and targeted retries are retained with the final evidence summary rather than relabeled as a clean single pass.

## Local result

Business source `f0c82f4eafdb7c084c356a3b07ba1de6f3b50039`, tree `b584feebdbbd3bc5f269cedfaa994627a78880c2`. 98 unique backend cases and 72 unique frontend cases reached passing results across targeted phases. Final backend/frontend typechecks show no compiler errors. Changed production frontend files have zero lint errors and seven pre-existing hook/unused-import warnings. This is not a claim that all checks ran once cleanly against the final combined C06 source.

`c06-consumer-evidence/summary.json` binds raw logs and changed source hashes. It retains the initial expired-CTA regression, two frontend fixture failures (missing anonymous recovery credential and stale window.location), and the report-union typing failure, alongside each targeted correction. Final C06 integration and real end-to-end execution remain the core owner's responsibility.
