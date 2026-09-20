# Scale result / runtime exposure matrix — PR-1 baseline

This matrix records ownership for later PRs. PR-1 does not change these output paths.

| Surface | Current ownership / representative path | PR-1 action | Later enforcement |
|---|---|---|---|
| Standalone start / GET / history | `scaleController`, `scale-workflow.service.ts` | inventory only | PR-2 projection; PR-3 eligibility |
| Standalone final / replay | legacy + unified final-submit services | inventory only | PR-2 projection; PR-3 frozen admission |
| Questionnaire | `questionnaireController`, child scale responses, collection report | inventory only | PR-2 projection; PR-3 eligibility |
| Public Questionnaire | `publicQuestionnaireController`, session/recovery-scoped child scale responses | inventory only | PR-2 projection; PR-3 eligibility |
| Composite | `composite.service.ts`, `composite-report.projector.ts`, analysis export | inventory only | PR-2 projection; PR-3 eligibility |
| Scale unit report | `reporting/scale-unit-report.ts` | inventory only | PR-2 strict external DTO |
| Stored questionnaire aggregate | `reporting/questionnaire-collection-report.ts` | inventory only | PR-2 re-projection |
| Export preview/job/artifact | export services | inventory only | PR-2 audience/policy binding |
| Relational / organization reporting | existing resource/relationship guards | preserve | PR-2 intersects existing restrictions |

## Route interpretation rule

A legacy function existing in the codebase does not imply an HTTP route is open. Routes already wired to `legacyWriteDisabled` remain disabled; PR-1 must not reopen them.

## Internal-vs-external rule

Authoritative score/result storage and canonical unit snapshots are internal facts. They are not assumed audience-safe merely because another field such as `result` is null. PR-2 will establish the strict serializer boundary.

## PR-1 invariant

No newly introduced source, policy or V2 snapshot type is consumed by an HTTP response path or new-start enforcement path in this PR.