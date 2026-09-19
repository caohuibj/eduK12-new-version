# Reporting authorization route matrix

PR4 security inventory. This file records server-side route ownership; UI navigation is not an authorization boundary.

| Surface | Legacy / generic policy | Organization protected policy |
| --- | --- | --- |
| `/api/relational/reports/cohort` | `LEGACY_COURSE_SUBJECT_AGGREGATE`; teacher Course lineage only | rejected by explicit `policyDomain === LEGACY_COURSE` candidate filter |
| `/api/relational/assignments/:assignmentId/*` | legacy assignment guard requires `LEGACY_COURSE` | rejected by `assertLegacyRelationalAssignmentDomain` |
| `/api/composite-assessments/attempts/:attemptId/report` | individual generic attempt allowed | aggregate/protected relational attempt rejected before controller |
| `/api/composite-assessments/attempts/:attemptId/analysis-export` | individual generic attempt allowed | aggregate/protected relational attempt rejected before controller |
| `/api/composite-assessments/:id/attempts/:attemptId/report` | existing teacher report authorization plus generic-domain guard | aggregate/protected relational attempt rejected before controller |
| `/api/composite-assessments/:id/attempts/:attemptId/analysis-export` | existing teacher authorization plus generic-domain guard | aggregate/protected relational attempt rejected before controller |
| `/api/questionnaires/assessments/:id/report` | existing subject report authorization plus generic-domain guard | linked aggregate/protected attempt rejected before controller |
| Cognitive `/history` | existing standalone history | already restricted to `compositeAttemptId = null`, so Run-bound protected sessions are excluded |
| Organization protected feedback endpoint | not accepted | must use `ORG_PROTECTED_FEEDBACK_V1`, subject deny and respondent privacy |

Protected report IDs and runtime lineage must not be reinterpreted as legacy Course data. Additional PR4 APIs/CSV/Safety rows are appended here when enabled.
