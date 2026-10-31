import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {participantAccessOutputs} from './participant-access-scope.mjs';

export const groupReportBranch='feat/group-report-snapshots-20261030';
export const groupReportLeafBranch='feat/group-report-leaf-sources-20261030';
export const groupReportStandaloneBranch='feat/group-report-training-standalone-20261030';
const draftBranches=[groupReportBranch,groupReportLeafBranch,groupReportStandaloneBranch];
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
const allowed=new Set(groupReportAllowedPaths);
const leafFiles=new Set(['.github/scripts/group-report-draft.mjs','.github/scripts/group-report-draft.test.mjs','docs/development/group-report-leaf-sources-20261030.md',...['modules/composite/composite.service.ts','modules/training-analysis/group-source.ts','modules/training-analysis/source.ts','__tests__/training-analysis/group-bundle-leaves.test.ts','__tests__/integration/trainingBundleLeafGroup.postgres.integration.test.ts'].map(path=>'server-version/backend/src/'+path)]);
const standaloneFiles=new Set(['.github/scripts/group-report-draft.mjs','.github/scripts/group-report-draft.test.mjs','docs/development/group-report-source-matrix-20261030.md',...['modules/training-analysis/group-report.service.ts','modules/training-analysis/group-source.ts','modules/training-analysis/source.ts','__tests__/training-analysis/group-standalone-cognitive.test.ts','__tests__/integration/trainingStandaloneCognitiveGroup.postgres.integration.test.ts'].map(path=>'server-version/backend/src/'+path)]);

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
  for(const e of entries){const known=ref===groupReportLeafBranch?(leafFiles.has(e.file)||e.file.startsWith('docs/evidence/group-report-leaf-sources-20261030/')):ref===groupReportStandaloneBranch?(standaloneFiles.has(e.file)||e.file.startsWith('docs/evidence/group-report-training-standalone-20261030/')):allowed.has(e.file);assert(known,'Unknown group-report path: '+e.file);assert.equal(e.newMode,'100644');assert(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644','Normal added/modified files only');}
  return {schema:1,route:'group-report-draft',base,eventBase:env.CI_BASE_SHA||base,eventMergeSha:env.GITHUB_SHA||head,head,preflightOnly:true,changes:entries};
}
export function groupReportDraftOutputs(plan){
  const outputs=participantAccessOutputs({...plan,postMerge:false});delete outputs.participant_access_plan;
  return {...outputs,application_route:'group-report-draft',scenario:'group-report-draft',codeql:false,group_report_plan:JSON.stringify(plan)};
}
