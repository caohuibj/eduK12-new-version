# Education feedback production wiring continuation

Later source-contract integration and its affected-only evidence are recorded in [education-feedback-distribution-result.md](education-feedback-distribution-result.md). The results below remain historical observations bound to root `282e9fb`; the later delta absorbs `0e3d210d` and resolves its App conflict without relabelling these earlier results.

Code: `e44a2ce96c1e25f03685a979c36ee630e33c23fb`, tree `8517b2f07439ff2fa4cbd654a7d0115f1b0c78fb`, branch `feat/pr363-education-feedback`. The earlier `bc49043f` handoff/evidence remains historical. This continuation normally merged root `f46336cc` and `282e9fb`; it did not edit the root-owned source, migration, registry, resource-authority or shared FINAL files. Relative to root `282e9fb`, those protected task files remain identical.

## Reused implementation and necessary adapters

- Reused root `assertEducationAssessmentExecutionSource(...,'FROZEN')`, including its actual identity reader, exact original approval records, workflow/assignment/parent/C/P/R checks and emergency-stop behavior. No current new-START/manager/issuer qualification is applied to completed respondent history.
- Reused `currentRunPopulationAuthoritySql(...,'REPORT_READ')`, `resolveEducationProductMemberScope`, the existing respondent disclosure reader and the actual School/Teacher authentication middleware. The shared respondent reader now explicitly uses REPORT_READ, so ordinary intake closure or RUN_START denial does not withdraw an accepted personal report; actual report/account/organization revocation still applies.
- Reused Training content/reference bindings, canonical codecs, the shared interpreter's saved FINAL receipt, `renderDeclaredReport` and the shared declared-node frontend renderer. Report GET does not score, select parameters, regenerate interpretation, approve templates or write FINAL state.
- The education projection remains necessary because the Training private staff report consumer explicitly excludes participants and uses Training-only private scope. The education adapter verifies the actual self execution/current disclosure and approved education audience, then renders permitted saved unit facts; it never borrows the Training client or private report permission.
- The small shared UI adapter is necessary to inject the product application's existing transport and completion lifecycle. School and Teacher use the same component/factory. A report read failure cannot reverse confirmed FINAL; no cross-request authority cache or polling was introduced.

## Actual production connections

`education-assessment-report.service.ts` now exports a production `readEducationRespondentAssessmentReport`. Its source dependency is the real root FROZEN fence, not a placeholder or new-use authorization. The existing index mounts concrete routers at:

- `GET /api/campus/assessment-reports/executions/:executionId`
- `GET /api/huiteacher/assessment-reports/executions/:executionId`

The routers use the corresponding current account realm, School approval, literal server-owned audience, no-store responses and execution-only selection. A parent/child/session ID cannot substitute for an execution authorization.

The School task producer marks exact `education-assessment:` resources with `feedbackNamespace:'EDUCATION_ASSESSMENT'`. `SchoolStudentTasks` consumes that server hint through the shared adapter; legacy tasks retain their legacy report path. No extra new-report probe is added to old tasks. The hint is routing metadata, not a permission grant.

Teacher App supplies `assessmentRuntime.renderFeedback` through its existing `teacherApi`. Its callback accepts `{executionId,attemptId}` exactly as the runtime worker's published interface at `6f69652d9b448d103942f2003099ca08c515017e`; optional title/onClose are presentation only. The new runtime host's internal implementation was not edited. The assembly wrapper in this branch only adds the matching prop type: root must preserve the runtime worker's actual lazy host/prop forwarding body when resolving that assembly file. This is the one known Teacher consumer merge dependency; the production report backend itself is fully composed and mounted here.

A verified pure Form BUNDLE with zero measurement units now returns a completion confirmation after actual parent COMPLETED, without requiring measurement/report facts or an interpretation receipt. Source validation is reused from root's now-compatible empty-unit BUNDLE contract; nonempty real form sections are still required.

## Real PostgreSQL evidence and limits

[The evidence index](education-feedback-wiring-evidence/index.json) retains exact raw failures, reports, exit codes, hashes and scope. A new disposable PostgreSQL `16.15-bookworm` container applied all **240 migrations** successfully and contained **267 public tables**. The test used a separate new disposable Redis, real database/source/current authority SQL, the production report composition/router, and real signed product cookies/JWT middleware. No original database/cache was contacted. CI/GITHUB_ACTIONS/RELEASE_VERIFY_LOCAL were unset. Both created containers were stopped and removed after the checks; partial failed fixture rows were retained until that cleanup.

The fixture reuses the existing education identity/workflow helper and shared canonical/interpreter helpers. Source metadata and accepted FINAL facts are deliberately synthetic stored preparations. This proves real report reads and authority checks, **not** real new-tool governance publication, START, scorer execution or durable FINAL.

| Run | Actual result | Interpretation |
|---|---|---|
| Full new schema | exit 0 | Entire migration chain, not a minimal mock schema |
| Backend wiring first set | 36 PASS, exit 0 | Original initial composition/source contract |
| Backend final wiring set | 31 PASS, exit 0 | FROZEN production composition, pure Form completion and REPORT_READ disclosure contract |
| Frontend final adapter increment | 4 PASS / 4 filtered, exit 0 | Both product transports, close/late reply and School namespace |
| Real PG1 | 0 PASS / 2 FAIL, exit 1 | Fixture lacked execution started_at; Teacher opened event before a required track existed |
| Real PG2 | 0 PASS / 2 FAIL, exit 1 | School fixture referenced a nonexistent Prisma model; Teacher event opened after run publication |
| Real PG3 | School PASS / Teacher FAIL, exit 1 | Teacher CLOSED fixture omitted required closedAt; School completed all actual checks |
| Real PG4, Teacher only | 1 PASS / 1 filtered, exit 0 | Corrected fixture and added only Teacher-specific new-start-stop/emergency checks; School not rerun |
| Final backend/frontend types | exit 0 / exit 0 | Scoped development observations, Node `24.19.0` remains below engines |
| Final changed frontend lint | exit 0 | One preexisting HuiteacherApp `org` dependency warning; new adapter warning removed |

The disjoint actual PG union verifies approved saved report display for School and Teacher, real product cookie boundaries, ordinary source retirement, original approver freeze/role loss, paused School activity/closed Teacher event, current REPORT_READ denial and restoration, report release revocation and account freeze. Teacher additionally verifies that RUN_START denial does not revoke history and an archived runtime emergency stop blocks the report. No mocked SQL/authorization or mock-count claim is used for these PG results. The test DB owner role is not a restricted-runtime-role qualification; root's independent role evidence remains separate.

## Exact remaining shared integration obligations

At absorbed root `282e9fb`, the report reader requires the real attempt's:

- `trainingContentBinding` and hash, with `publicationHash == origin.runtimeSnapshotHash` and exact item/family/measurement/report pointers;
- optional selected `trainingReferenceBinding`/hash and frozen context, with saved selected slots rather than all origin reference candidates;
- encrypted `trainingContentInterpretation` and hash from the shared interpreter, matching attempt/epoch/aggregate input and canonical source result hashes;
- frozen active slots/hash plus current-epoch canonical UNIT_RESULT rows with exact source type/attempt/submission, compiled runtime, definition and context identities;
- actual async job identity/accepted state for PENDING, plus applicable frozen feedback timing. Pure Form completion is the intentional no-measurement exception.

Root still owns real new START/recovery/FINAL/worker integration. In the absorbed source, `training-content-final.ts` ordinary REPORT branch still checks PRIVATE/TRAINING, and `training-content-binding.ts` still has Training-only measurement scope matching. These need the root's existing education C/P/R source branch, not another report engine or weakened private scope. This report task did not change them or manufacture a successful new FINAL.

No build, real browser/mobile keyboard/layout, official CI, production content approval, merge or deployment was performed. Raw first-stage evidence remains unchanged. Node was not upgraded and no whole platform suite was repeated.
