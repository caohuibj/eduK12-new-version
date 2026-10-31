import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';

export const groupReportBranch='feat/group-report-snapshots-20261030';
export const groupReportLeafBranch='feat/group-report-leaf-sources-20261030';
export const groupLongitudinalBranch='feat/group-longitudinal-survey-training-20261030';
export const groupReportStandaloneBranch='feat/group-report-training-standalone-20261030';
export const selfGroupBranch='feat/education-self-group-contract-readers-20261030';
const draftBranches=[groupReportBranch,groupReportLeafBranch,groupReportStandaloneBranch,selfGroupBranch,groupLongitudinalBranch];
export const groupReportBase='dfd506347cfa2c684a75812936f32d48bdce34d4';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
// GitHub may refresh refs/pull/N/merge after the event's base SHA was captured.
// Use that actual merge's first parent, and require its second parent to be this
// exact PR source. This only scopes a Draft; it admits no old application result.
export function groupReportDiffBase(eventBase,head,env=process.env,read=git){
  const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
  if(!draftBranches.includes(ref))return eventBase;
  assert.match(eventBase||'',/^[a-f0-9]{40}$/);assert.match(head||'',/^[a-f0-9]{40}$/);
  const parents=read('cat-file','-p',head).split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));
  assert.equal(parents.length,2,'Actual GitHub merge checkout required');
  assert.equal(parents[1],env.CI_SOURCE_HEAD,'Merge checkout belongs to another PR source');
  return parents[0];
}
export const groupReportFiles=Object.freeze([
  '.github/scripts/group-report-draft.mjs','.github/scripts/group-report-draft.test.mjs',
  '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
  'docs/development/group-report-implementation-20261030.md',
  'server-version/backend/prisma/migrations/20261030160000_reporting_task_artifacts/migration.sql',
  ...['reporting/group-summary.ts','reporting/task-artifact.ts','survey/group-report.service.ts','survey/analytics.source.ts','survey/analytics.routes.ts'].map(p=>'server-version/backend/src/modules/'+p),
  ...['reporting/task-group-summary.test.ts','survey/group-report.test.ts','survey/group-report.postgres.integration.test.ts'].map(p=>'server-version/backend/src/__tests__/'+p),
  ...['modules/reporting/TaskGroupReport.tsx','modules/reporting/task-group-report.css','survey/SurveyGroupReports.tsx','survey/SurveyGroupReports.test.tsx','survey/SurveyAnalyticsWorkspace.tsx'].map(p=>'server-version/frontend/src/'+p),
  'server-version/e2e/group-report-browser.cjs','server-version/e2e/group-report-fixture.tsx',
]);
const evidenceNames=['README.md','manifest.json','backend-tests.json','frontend-tests.json','frontend-repair.json',
  'postgres-setup-first.json','postgres-setup-diagnostic.json','postgres-setup-repair.json','postgres-query-count.json','postgres-query-count.log','actionlint.log','ci-first-failed.log','ci-first.json','ci-second-failed.log','ci-second-scope.log','ci-second.json','merge-parent-diagnostic.json','actionlint-current.log','wide-form-first.json','wide-form-first.log','wide-form-repair.json','wide-form-repair.log','p2-backend-types.log','postgres-first.json','postgres-boundary-repair.json','postgres-diagnostic.log','postgres-setup-repair.log','postgres-first.log','postgres-boundary-repair.log',
  'browser-original.cjs','browser-original.log','browser-print.log','browser.json','group-1440.png','group-390.png','group-report.pdf','group-report.txt',
  'backend-types.log','frontend-types.log','frontend-lint.log'];
export const groupReportAllowedPaths=Object.freeze([...groupReportFiles,...evidenceNames.map(p=>'docs/evidence/group-report-20261030/'+p)]);
export const selfGroupDraftPaths=Object.freeze([
  ".github/scripts/group-report-draft.mjs",
  ".github/scripts/group-report-draft.test.mjs",
  "docs/development/education-self-group-v2-handoff-20261030.md",
  "docs/evidence/education-self-group-publishing-20261030/README.md",
  "docs/evidence/education-self-group-publishing-20261030/backend-types.json",
  "docs/evidence/education-self-group-publishing-20261030/backend-types.log",
  "docs/evidence/education-self-group-publishing-20261030/frontend-types.json",
  "docs/evidence/education-self-group-publishing-20261030/frontend-types.log",
  "docs/evidence/education-self-group-publishing-20261030/frontend.json",
  "docs/evidence/education-self-group-publishing-20261030/frontend.log",
  "docs/evidence/education-self-group-publishing-20261030/native.json",
  "docs/evidence/education-self-group-publishing-20261030/native.log",
  "docs/evidence/education-self-group-v2-20261030/README.md",
  "docs/evidence/education-self-group-v2-20261030/backend-types.json",
  "docs/evidence/education-self-group-v2-20261030/backend-types.log",
  "docs/evidence/education-self-group-v2-20261030/contract.json",
  "docs/evidence/education-self-group-v2-20261030/contract.log",
  "docs/evidence/self-group-bundle-leaf-ceiling-20261030/README.md",
  "docs/evidence/self-group-bundle-leaf-ceiling-20261030/contract.json",
  "docs/evidence/self-group-bundle-leaf-ceiling-20261030/contract.log",
  "docs/evidence/self-group-inbox-disclosure-20261030/README.md",
  "docs/evidence/self-group-inbox-disclosure-20261030/contract.json",
  "docs/evidence/self-group-inbox-disclosure-20261030/contract.log",
  "server-version/backend/src/__tests__/assessment-policy/respondent-summary.test.ts",
  "server-version/backend/src/__tests__/assessment-policy/self-group-contract.test.ts",
  "server-version/backend/src/__tests__/bundle-onboarding/education-self-group-leaf-ceiling.test.ts",
  "server-version/backend/src/__tests__/education-tools/assessment-resource.self-group.test.ts",
  "server-version/backend/src/__tests__/reporting/education-assessment-personal-report.service.test.ts",
  "server-version/backend/src/modules/assessment-policy/self-group-contract.ts",
  "server-version/backend/src/modules/assessment-relational/product-registry.ts",
  "server-version/backend/src/modules/bundle-product/education-adapter.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.catalog.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.contract.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.marker-contract.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.marker.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.repository.ts",
  "server-version/backend/src/modules/education-tools/assessment-resource.service.ts",
  "server-version/backend/src/modules/huiteacher/assessmentRunPolicy.ts",
  "server-version/backend/src/modules/huiteacher/assessmentRuntime.access.ts",
  "server-version/backend/src/modules/reporting/education-assessment-personal-report.service.ts",
  "server-version/backend/src/modules/reporting/education-assessment-report.projector.ts",
  "server-version/backend/src/modules/reporting/education-scale-personal-report.service.ts",
  "server-version/backend/src/modules/reporting/respondentSummary.ts",
  "server-version/frontend/src/components/education-tools/EducationAssessmentRegistrationPanel.test.tsx",
  "server-version/frontend/src/components/education-tools/EducationAssessmentRegistrationPanel.tsx",
  "server-version/frontend/src/components/education-tools/assessmentResourceClient.ts"
]);
const selfGroupFiles=new Set(selfGroupDraftPaths);
const allowed=new Set(groupReportAllowedPaths);
const leafFiles=new Set(['.github/scripts/group-report-draft.mjs','.github/scripts/group-report-draft.test.mjs','docs/development/group-report-leaf-sources-20261030.md',...['modules/composite/composite.service.ts','modules/training-analysis/group-source.ts','modules/training-analysis/source.ts','__tests__/training-analysis/group-bundle-leaves.test.ts','__tests__/integration/trainingBundleLeafGroup.postgres.integration.test.ts'].map(path=>'server-version/backend/src/'+path)]);
const standaloneFiles=new Set(['.github/scripts/group-report-draft.mjs','.github/scripts/group-report-draft.test.mjs','docs/development/group-report-source-matrix-20261030.md',...['modules/training-analysis/group-report.service.ts','modules/training-analysis/group-source.ts','modules/training-analysis/source.ts','__tests__/training-analysis/group-standalone-cognitive.test.ts','__tests__/integration/trainingStandaloneCognitiveGroup.postgres.integration.test.ts'].map(path=>'server-version/backend/src/'+path)]);

// Exact original quota + Survey/Training candidate paths; no evidence directory wildcard.
export const groupLongitudinalFiles=Object.freeze([
  ".github/scripts/group-report-draft.mjs",
  ".github/scripts/group-report-draft.test.mjs",
  ".github/workflows/ci.yml",
  "docs/development/group-longitudinal-draft-route-20261031.md",
  "docs/evidence/group-longitudinal-survey-training-20261030/README.md",
  "docs/evidence/group-longitudinal-survey-training-20261030/backend-types-candidate.log",
  "docs/evidence/group-longitudinal-survey-training-20261030/contracts-continuation.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/contracts-first.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-cognitive-types-candidate.log",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-lint-continuation.log",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-lint.log.gz",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-panel-first.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-types-candidate.log",
  "docs/evidence/group-longitudinal-survey-training-20261030/frontend-types-first.log",
  "docs/evidence/group-longitudinal-survey-training-20261030/initial-http-group-longitudinal-1280.png",
  "docs/evidence/group-longitudinal-survey-training-20261030/initial-http-group-longitudinal-390.png",
  "docs/evidence/group-longitudinal-survey-training-20261030/initial-http-result.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/manifest.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/presentation-report-1280.png",
  "docs/evidence/group-longitudinal-survey-training-20261030/presentation-report-390.png",
  "docs/evidence/group-longitudinal-survey-training-20261030/presentation-result.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/survey-contract-continuation.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/survey-current-leaf.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/survey-evidence.json",
  "docs/evidence/group-longitudinal-survey-training-20261030/survey-published-scope.json",
  "docs/evidence/training-cognitive-wave-quota-20261030/README.md",
  "docs/evidence/training-cognitive-wave-quota-20261030/pg-after-fixture.json",
  "docs/evidence/training-cognitive-wave-quota-20261030/pg-diagnostic.json",
  "docs/evidence/training-cognitive-wave-quota-20261030/pg-final.json",
  "docs/evidence/training-cognitive-wave-quota-20261030/pg-first.json",
  "server-version/backend/prisma/migrations/20261030200000_group_longitudinal_artifact_kind/migration.sql",
  "server-version/backend/src/__tests__/cognitive/training-wave-quota.postgres.integration.test.ts",
  "server-version/backend/src/__tests__/reporting/group-longitudinal.postgres.integration.test.ts",
  "server-version/backend/src/__tests__/reporting/group-longitudinal.test.ts",
  "server-version/backend/src/__tests__/survey/group-report.test.ts",
  "server-version/backend/src/controllers/trainingAnalysisController.ts",
  "server-version/backend/src/modules/cognitive/attempt-quota.ts",
  "server-version/backend/src/modules/composite/composite.service.ts",
  "server-version/backend/src/modules/reporting/group-longitudinal.ts",
  "server-version/backend/src/modules/reporting/task-artifact.ts",
  "server-version/backend/src/modules/survey/analytics.routes.ts",
  "server-version/backend/src/modules/survey/analytics.source.ts",
  "server-version/backend/src/modules/survey/group-longitudinal.service.ts",
  "server-version/backend/src/modules/survey/group-report.service.ts",
  "server-version/backend/src/modules/training-analysis/group-longitudinal.service.ts",
  "server-version/backend/src/modules/training-analysis/group-report.service.ts",
  "server-version/backend/src/routes/courses.ts",
  "server-version/e2e/group-longitudinal-visual.cjs",
  "server-version/frontend/src/modules/reporting/GroupLongitudinalPanel.test.tsx",
  "server-version/frontend/src/modules/reporting/GroupLongitudinalPanel.tsx",
  "server-version/frontend/src/modules/reporting/GroupLongitudinalReport.tsx",
  "server-version/frontend/src/modules/reporting/group-longitudinal-ui.css",
  "server-version/frontend/src/survey/SurveyGroupReports.tsx",
  "server-version/frontend/src/training/TrainingGroupReports.tsx"
]);
const longitudinalFiles=new Set(groupLongitudinalFiles);

/** A Draft review checkpoint only. No local-result admission, application
 * qualification, security waiver or Ready/main route is created here. */
export function groupReportDraftPlan(entries,base,head,env=process.env){
  const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
  if(!draftBranches.includes(ref))return null;
  assert.equal(env.CI_EVENT,'pull_request','Group report preparation only supports an actual Draft PR');
  assert.equal(env.CI_IS_DRAFT,'true','Ready requires a separately reviewed affected qualification plan');
  assert.notEqual(env.CI_FORCE_FULL,'true');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true');
  assert.match(base||'',/^[a-f0-9]{40}$/,'Actual immutable merge base required');
  assert.match(head,/^[a-f0-9]{40}$/);assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(String(env.CI_PR_NUMBER),/^[1-9][0-9]*$/);
  assert(entries.length>0);assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
  for(const e of entries){const known=ref===groupLongitudinalBranch?longitudinalFiles.has(e.file):ref===selfGroupBranch?selfGroupFiles.has(e.file):ref===groupReportLeafBranch?(leafFiles.has(e.file)||e.file.startsWith('docs/evidence/group-report-leaf-sources-20261030/')):ref===groupReportStandaloneBranch?(standaloneFiles.has(e.file)||e.file.startsWith('docs/evidence/group-report-training-standalone-20261030/')):allowed.has(e.file);assert(known,'Unknown group-report path: '+e.file);assert.equal(e.newMode,'100644');assert(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644','Normal added/modified files only');}
  return {schema:1,route:'group-report-draft',base,eventBase:env.CI_BASE_SHA||base,eventMergeSha:env.GITHUB_SHA||head,head,preflightOnly:true,changes:entries};
}
export function groupReportDraftOutputs(plan){
  const outputs=participantAccessOutputs({...plan,postMerge:false});delete outputs.participant_access_plan;
  return {...outputs,application_route:'group-report-draft',scenario:'group-report-draft',codeql:false,group_report_plan:JSON.stringify(plan)};
}
