# C14 shared slot-plan transaction-boundary audit

Read-only call-site review, 2026-10-18. This is source analysis, not additional runtime qualification. The old admission-only diagnostic separately observed six API-owned PG connections, five parent-lock waiters and one idle-in-transaction ClientRead holder for approximately five seconds. Its failed transactions left no attempt/child/quota increment.

## Writes that must retain the caller's transaction

| Production caller | Actual enclosing transaction | Required propagation |
|---|---|---|
| `modules/composite/composite.service.ts`, `createAttempt` | Logged-in/public/restart/relational admission supplies `db` | `storeFrozenActiveSlotSet(snapshot, db)` |
| `controllers/questionnaireController.ts`, questionnaire start | `prisma.$transaction(tx)` | `storeFrozenActiveSlotSet(snapshot, tx)` |
| `controllers/publicQuestionnaireController.ts`, public start | `prisma.$transaction(tx)` | `storeFrozenActiveSlotSet(snapshot, tx)` |
| `services/questionnaire-form-section.service.ts`, restart | `prisma.$transaction(tx)` | `storeFrozenActiveSlotSet(snapshot, tx)` |

The helper chain is `storeFrozenActiveSlotSet` → `storeSharedSlotPlan` → `publicTemplatesForDatabase(db).saveMany`. A transaction-local store must append and verify through the same transaction and must not publish an uncommitted existence hit into the process-global cache. Existing `storeSharedUnitAdmission(snapshot, db)`, shared Scale runtime persistence and prepared Cognitive persistence already accept the database argument.

## Reads with a real transaction boundary

| Production caller | Actual boundary | Required propagation |
|---|---|---|
| `modules/assessment-runtime/report-outbox.service.ts`, `enqueueBoundReport(tx, parent, true)` | Canonical-unit persistence / retry transaction; job row locked before completeness read | `loadFrozenActiveSlotSet(cipher, tx)` |
| `modules/scale/scale-admission.service.ts`, `readRequiredScaleSlot` called by `activateUnstoredScaleAdmission(db)` | Managed-runtime V2 calls this inside `withSerializableScaleTransaction(tx)`; both Questionnaire and Composite branches | Pass `db` from both branches through `readRequiredScaleSlot` to `loadFrozenActiveSlot(input, db)` |
| `modules/composite/training-variant-child-scope.ts`, selected child/section helpers | Some callers run in Cognitive trial/completion and Scale admission transactions | Propagate supplied `options.db` through `resolveTrainingAttemptScope` / `applyTrainingAttemptScope` to `loadFrozenActiveSlotSet` |

Passing `db` only into the selected-scope helper does not fix the separate Scale slot read. A transaction-local public-template read cannot depend on the global cache having been warmed by a previous request.

## Direct slot readers inspected without an enclosing transaction

- `services/questionnaire-form-section.service.ts`: unified questionnaire state. Parent and snapshot reads use global Prisma; the delivery admission's own transaction starts later.
- `modules/composite/composite.service.ts`: `getUnifiedCompositeAttemptState`. Called after admission commits or from ordinary state reads.
- `modules/composite/frozen-progress.ts`: teacher listing, partial-report checks and header progress reads.
- `modules/composite/whole-questionnaire.service.ts`: `loadParent` during whole definition, pre-ACK validation and worker preparation. Whole receipt registration starts its transaction later; unit batch persistence likewise occurs after frozen-context preparation.
- `modules/assessment-runtime/unified-aggregate-finalizer.service.ts`: `readFrozenSlotSet` from parent probe and completed-bundle recovery. The aggregate's persistence transaction starts after these reads. Child-finalization callers invoke aggregate finalization after their child transaction has committed.
- `modules/assessment-runtime/form-admission.service.ts`: `readRequiredFormSlot` during activation. The later `persistQuestionnaireFormAdmission` / `persistCompositeFormAdmission` creates its own transaction and already passes that transaction to shared admission storage.
- `modules/cognitive/cognitive-admission.service.ts`: `activateCognitiveAdmission` reads its required slot before admission persistence; its entry points are runner delivery or FINAL preparation, not a held parent transaction.

## Shared whole/report template calls

`storeSharedWholeValidation` is called by ordinary whole-definition delivery, before `storeWholeQuestionnaireValidation`'s independent upsert. Compact report layout storage is in report materialization, outside unit/aggregate persistence transactions. These are not the admission pool-starvation call path identified above.

## Cold FINAL test design constraint

A weighted-variant FINAL performs selected-scope verification before the outbox transaction and therefore reads its FSP2 first. Restarting the API alone does not prove that the outbox itself saw a cold global template cache. A genuinely isolated cold-outbox HTTP check should use a fresh ordinary null-policy Form-only composite with stored Form admissions: prepare six distinct attempts, restart only the owned API, log in without state reads, then issue six first FINALs. The existing selected-variant chain separately qualifies weighted scope. No old accepted answers should be resubmitted.
