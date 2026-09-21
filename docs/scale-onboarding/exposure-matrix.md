# Scale result / runtime exposure matrix — PR-1 baseline

This matrix freezes the output and admission surfaces that later PRs must protect. PR-1 inventories them only; it does not introduce result projection or eligibility enforcement.

## Standalone Scale routes

| Method / route | Current handler | Baseline disposition | Later owner |
|---|---|---|---|
| `POST /scales/:scaleId/assessments` | `scaleController.startAssessmentV2` | open unified start | PR-3 eligibility/deployment |
| `POST /scales/assessments/:assessmentId/submit` | `scaleController.submitFinalAssessment` | open FINAL submit/replay path | PR-2 projection; PR-3 admission verification |
| `POST /scales/assessments/:assessmentId/restart` | `scaleController.restartAssessmentV2` | open restart | PR-3 new epoch/decision |
| `GET /scales/assessments/:assessmentId` | `scaleController.getAssessmentV2` | open resume/completed read | PR-2 strict DTO |
| `GET /scales/assessments/my` | `scaleController.listMyAssessments` | open history | PR-2 per-attempt projection |
| `GET /scales/:scaleId/assessments` | `scaleController.listScaleAssessments` | open teacher list | PR-2 resource capability + projection |
| `GET /scales/:scaleId/export/preview` | `scaleController.getExportPreview` | open teacher preview | PR-2 export projection |
| `POST /scales/:scaleId/export` | `scaleController.exportScaleData` | open teacher export | PR-2 export projection |
| `GET /scales/exports/:artifactId[ /status]` | download/status handlers | open authenticated artifact path | PR-2 artifact binding/download auth |
| `PATCH .../answers[/batch]`, `POST .../complete` | `legacyWriteDisabled` | disabled | must remain disabled |

## Authenticated Questionnaire routes

| Method / route | Current handler | Baseline disposition | Later owner |
|---|---|---|---|
| `POST /questionnaires/:id/assessments` | `questionnaireController.startAssessment` | open parent start | PR-3 context/child eligibility |
| `GET /questionnaires/assessments/:id` | `questionnaireController.getAssessment` | open resume/completed read | PR-2 projection |
| `POST .../form-sections/:sectionId/submit` | `submitFinalFormSection` | open FINAL form section | preserve |
| `POST .../scales/:scaleAssessmentId/submit` | `submitFinalScale` | open FINAL child Scale | PR-2 projection; PR-3 frozen decision |
| `POST /questionnaires/assessments/:id/complete` | `completeAssessment` | open parent completion | PR-2 stored aggregate projection |
| `GET /questionnaires/assessments/:id/report` | relational guard + `getReport` | open guarded report | PR-2 projection; relation remains upper bound |
| export preview/generate/download/status | questionnaire export handlers | open authenticated/teacher paths | PR-2 export policy |
| context freeze and incremental form-answer routes | `legacyWriteDisabled` | disabled | must remain disabled |

## Public Questionnaire routes

| Method / route | Current handler | Baseline disposition | Later owner |
|---|---|---|---|
| `POST /public/questionnaires/:token/start` | `publicQuestionnaireController.startAssessment` | open token start | PR-3 trusted public context/identity |
| `GET /public/assessments/:sessionId` | `getAssessment` behind `requireQuestionnaireResume` | open session resume | PR-2 session-scoped projection |
| `POST .../form-sections/:sectionId/submit` | `submitFinalFormSection` | open FINAL form section | preserve |
| `POST .../scale/:scaleAssessmentId/submit` | `submitFinalScale` | open FINAL child Scale | PR-2 projection; PR-3 eligibility |
| `GET .../scale/:scaleAssessmentId` | `getScaleAssessment` | open child read | PR-2 projection |
| `GET .../report` | `getReport` | open session report | PR-2 projection |
| context freeze, incremental answer writes and legacy complete routes | `legacyWriteDisabled` | disabled | must remain disabled |

## Internal report / aggregate / composite / export exits

| Exit | Baseline meaning | Later owner |
|---|---|---|
| `scale-workflow.service.ts` response helper | may materialize full internal result | PR-2 split resume/completed allowlist DTOs |
| `reporting/scale-unit-report.ts` | internal Scale unit report can contain result + score fields | PR-2 internal/external split |
| `reporting/questionnaire-collection-report.ts` | stored aggregate shortcut is not audience-safe by construction | PR-2 re-projection |
| `assessment-runtime/unified-aggregate-finalizer.service.ts` | canonical aggregate storage | remain internal; PR-2 projects reads |
| `composite-report.projector.ts` / `composite.service.ts` | collection/package/participant/teacher projections | PR-2 per-unit disclosure; PR-3 eligibility |
| `composite-analysis-export.service.ts` | composite file/export path | PR-2 projection and lineage constraints |
| `exportService` / `exportJobService` / `exportArtifactService` | preview, generation, artifact lifecycle | PR-2 policy/audience binding and download recheck |
| relational / organization reporting | existing stricter resource, cohort and consent rules | preserved as upper bounds |

## Route interpretation rule

A legacy function existing in the codebase does not imply an HTTP route is open. Routes wired to `legacyWriteDisabled` are explicitly recorded as disabled and are not reopened for this refactor.

## Internal-vs-external rule

Authoritative score/result storage and canonical unit snapshots are internal facts. They are not assumed audience-safe because a sibling `result` field is null or because a frontend hides a field. PR-2 owns the strict serialization boundary.

## PR-1 invariant

No newly introduced source, policy or V2 snapshot type is consumed by an HTTP response path or new-start enforcement path in PR-1.
