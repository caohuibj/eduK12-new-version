# Single-ID availability — fixed local publication inventory

Base main d420e90e46036b4518a0f729cb3e1ef4b9ca3306. Product2685b3dbc78d59ec790138966af4935191d8a70d/tree1984f060a9d1bfd09855881c6ae59a55fcdec13c. Backend a05e7a9bedabb422d91c34e21399883f38a2010d, frontend5dc591fe9d9de5adb8f2e24290bdb25d8df09e9c. Later evidence/documentation-only commit leaves both components exact; its HEAD/tree and full mode/blob/hash inventory are supplied separately after commit to avoid self-reference.

## One proposed later Draft

caohuibj/eduK12-new-version, perf/questionnaire-target-availability-20261031 → main. Proposed title: perf(questionnaire): scope availability preflight to the opened questionnaire. PR number unassigned. This is separate from fixed Draft432; no branch upload, PR creation, CI, Ready, merge or deployment is authorized/executed in this preparation.

Production paths:
- server-version/backend/src/controllers/questionnaireController.ts
- server-version/frontend/src/pages/student/QuestionnaireAssessment.tsx

Test paths:
- server-version/backend/src/__tests__/questionnaire/available-target.test.ts
- server-version/frontend/src/pages/student/__tests__/QuestionnaireAssessment.open.test.tsx

All other changed files stay under docs/performance/questionnaire-target-20261031/. Existing baseline/fixed JSON/log.gz files preserve the6backend/3frontend failures and later9PASS. Both backend NDJSON.gz originals retain the complete synthetic bodies, selected-row scope and raw/gzip1 counts. execution.json fixes fixture ddcbf9cdbb1f9f868775bf85372cb3669a5ed48ff1ea8562e0cbf1d3e4c9ee1e, commands and source hashes. selected-evidence.json fixes the exact disjoint9case selection and type receipt identities. No business suite was replayed for this type/publication step.

The exact two product changes remain additive optional where.id and Axios params.questionnaireId. PUBLISHED/COURSE/visibility/current-course qualifications, default catalog, attempt ordering, completed report destination and original POST restore/start semantics remain. Query call count is unchanged; fixture logical rows and serialized/gzip1 bodies decrease only for the targeted preflight. No production latency, PostgreSQL timing/pool, CPU/memory or network claim.

## Two actual component type executions

Node24.21.0; locked backend TypeScript5.9.3, frontend5.6.3, Prisma5.22.0. Generated current-schema client types with a dummy loopback URL and no database connection, dependency install or migration. Prisma's generated schema formatting can differ from repository bytes; raw byte inequality alone is not asserted to be an outdated schema. Both actual compiler/config/lock/generated-input hashes remain recorded before and after.

Backend: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit, exit0, approximately35.61s. Frontend: node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit, exit0, approximately42.22s. Each executed once on product2685b3d and the exact two components above. Empty logs are supported by actual subprocess argv/exit/times, not inferred success. Backend excludes test source by existing config; frontend is the app project, not a separate cognitive-project run. Receipts are unsigned local executions and do not attest every installed dependency byte.

## Later CI boundary

If publication and later qualification are authorized, use the existing main-CI onboarding-structure family with this single actual PR and complete exact source/control/component bindings. This new branch is not currently registered or enabled, and no control file changed here. Preserve the original9cases and matching component types rather than replaying them by default. Any reader adaptation must consume the actual gzip originals and absolute-node/-p compiler argv, never rewrite historical receipts to fit an old schema. Current changed JS/TS SAST and the existing stable gate remain genuine future requirements, not local PASS claims. Unknown scope/base/input drift must be resolved before activation, not treated as permission to run the full platform route.

No production build/image, compiled browser, live DB or full lifecycle qualification exists for this new component tree. This is a Draft-publication inventory, not deployment readiness. Do not pull the separate course-summary, storage, login or concurrency candidates into this slice. PR432 closure is a read-only separate plan in PR432-CLOSEOUT-READONLY.md.
