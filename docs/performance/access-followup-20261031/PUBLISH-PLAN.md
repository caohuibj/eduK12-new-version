# Fixed candidate publication inventory — not activated

Product head926b6b8ede703762ae174fee876ae0a8c59fe8f9, tree68f7f7627d760e5184986c3e584578b0fbd3c403. Base main0a9c565ce9a46793363fd1b40a3e7a0b1d124019. Backend741c7d10e8c0f056a83baf09a318a5c85206f8a1; frontend6bac0de97553862cdc4d4bbf418aae2c60319a66. Only this evidence/publication-document commit follows product; both component trees must remain exact. Final documentation HEAD/tree and complete raw inventory are supplied in the local handoff manifest after commit, avoiding self-referential source claims.

## One proposed Draft PR

Repository caohuibj/eduK12-new-version, existing local branch fix/performance-access-followup-20261031 → main. Proposed title: fix(perf): preserve questionnaire recovery and trim redundant reads. Exactly one Draft PR for these three slices plus the DOT review correction; PR number is unassigned. No reuse of PR395 or420. No push, PR API/body write, Ready, CI activation, merge or deployment has occurred for this branch. DOT will present this fixed inventory before any later publication authorization.

## Production paths — six

- server-version/frontend/src/components/FinalQuestionnaireAssessment.tsx
- server-version/frontend/src/components/FormSectionManager.tsx
- server-version/backend/src/modules/reporting/discovery.ts
- server-version/backend/src/modules/reporting/spec.ts
- server-version/backend/src/controllers/generalQuestionnaireController.ts
- server-version/backend/src/controllers/questionnaireController.ts

## Test paths — four

- server-version/frontend/src/components/__tests__/FinalQuestionnaireAssessment.test.tsx
- server-version/frontend/src/components/__tests__/FormSectionManager.http.test.tsx
- server-version/backend/src/__tests__/reporting/spec-discovery-reads.test.ts
- server-version/backend/src/__tests__/questionnaire/content-units-projection.test.ts

## Original synthetic/local evidence

All remaining changed paths are inside docs/performance/access-followup-20261031/; no CI files, dependencies, schema, package catalog, permission, COS or deployment files change. README.md records outcomes and limits. questionnaire-recovery/ retains the initial originals, fixture correction and cwd-error repeated red invocation. questionnaire-review-repair/ retains DOT correction baseline3FAIL and current3PASS. spec-discovery/ retains N+1 baseline and two-output/read-count comparison. content-units/ retains two controller baseline failures, six passing controller boundaries and two real-client loopback/gzip baseline/candidate records. types/ contains actual compiler receipts, empty logs, required Prisma generation preparation and the exact runner script. selected-evidence.json fixes the disjoint14case union and original reporter/receipt hashes. Nothing is retroactively signed or called CI-executed.

The14case union is1original Form replay +3review-repair cases +2spec-discovery +6controller +2managerHTTP. The earlier two accepted cases remain original PASS history but are superseded in the selected union by their extended current cases. Preserve all failed/filtered rows; no14case full rerun occurred. Direct consumers include authenticated/public ordinary questionnaire FINAL, ordinary/course/Composite section management (Composite query unchanged), and existing group/protected/individual spec-directory readers. No group or longitudinal feature files are modified.

## Types — performed once per affected component

Generated local Prisma Client5.22.0 types from the current unchanged schema because the restored generated schema was stale. A dummy loopback URL was supplied; generation opened no database connection, installed no dependency or schema migration. CLI versions match locks. Backend TypeScript5.9.3 and frontend5.6.3, Node24.21.0. Actual recorded commands:

- backend: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit, exit0, approximately37.22seconds.
- frontend: node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit, exit0, approximately45.40seconds.

Both ran on product head926b6b8e and the exact component trees above. Empty logs are qualified by actual subprocess exit/times and before/after compiler/config/lock/schema/generated-client hashes in the receipts. Backend tsconfig excludes test sources. Frontend uses the app project including its imported types/tests; the separate cognitive project was not run. These are unsigned local executions, not production compilations or a complete installed-node_modules attestation. Documentation-only commits do not invalidate the exact component result.

## Proposed existing CI route — not wired and not authorized now

Use the main .github/workflows/ci.yml onboarding-structure route, as used by prior bounded performance candidates. Do not create a workflow or use another conversation's fixed source authorization. Existing onboarding-scope.mjs currently has no candidate for this branch/PR, so these results do not make it executable: any future wiring must append the actual single PR/source binding, complete raw path/mode/blob inventory and component/control checkpoint, and admit exactly the selected14cases plus two current component type receipts. This plan grants no gate success or broad legacy fallback. No such control edit has been made.

Proposed missing formal scope is the existing source classification, exact evidence admission, current JS/TS security-extended CodeQL for the six changed production files and any actually changed qualification controls, and existing stable merge gate. Prior application assertions and current types are retained at their original input identities; they are not default CI reexecution targets. Source/reader mismatches stop instead of running platform regression to manufacture a success. Suggested existing budgets: scope8min, admission5min, CodeQL30min; five minutes prompts a concrete stage report. Stable required context and protections stay unchanged. Exact final jobs/activation await DOT's later publication plan; no CI controls are changed in this preparation.

No qualified production build/image or compiled-browser artifact exists for these new component trees. Old395/420 artifacts cannot qualify this changed product. This is a Draft-publication inventory, not deployment readiness. If a later release needs new artifacts, generate each once at its chosen execution site under that release's explicit scope; do not start builds, database/media/load suites, new gate systems or deployment from this document. No production latency, actual PostgreSQL duration, pool wait or capacity claim is made.
