import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./assessment-capacity-bindings.json',import.meta.url),'utf8'));
export const assessmentCapacitySources=new Set([
 "server-version/backend/prisma/migrations/20261015020000_whole_questionnaire_receipt/migration.sql",
 "server-version/backend/prisma/migrations/20261015030000_whole_validation_manifest/migration.sql",
 "server-version/backend/src/config/database.ts",
 "server-version/backend/src/modules/assessment-runtime/reference-binding.ts",
 "server-version/backend/src/modules/composite/whole-questionnaire.service.ts",
 "server-version/backend/src/modules/scale/scale-result.ts",
 "server-version/backend/src/services/reportFeedbackHints.ts",
 "server-version/backend/src/services/runtimeObservability.ts",
 "server-version/frontend/src/components/WholeCompositeQuestionnaire.tsx",
 "server-version/frontend/src/components/questionnaire/ScalePlayer.tsx",
 "server-version/frontend/src/modules/composite/report-polling.ts",
 "server-version/frontend/src/services/persistence/finalDraftStore.ts",
 "server-version/backend/prisma/migrations/20261015010000_composite_report_outbox/migration.sql",
 "server-version/backend/prisma/schema.prisma",
 "server-version/backend/scripts/runtime-table-policy.json",
 "server-version/backend/src/config/assessmentReports.ts",
 "server-version/backend/src/config/backgroundWorkers.ts",
 "server-version/backend/src/middleware/publicAssessmentRateLimit.ts",
 "server-version/backend/src/modules/assessment-runtime/persistence.ts",
 "server-version/backend/src/modules/assessment-runtime/report-outbox.service.ts",
 "server-version/backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts",
 "server-version/backend/src/modules/composite/composite-report-cache.ts",
 "server-version/backend/src/modules/composite/composite.controller.ts",
 "server-version/backend/src/modules/composite/composite.public.routes.ts",
 "server-version/backend/src/modules/composite/composite.routes.ts",
 "server-version/backend/src/modules/composite/composite.service.ts",
 "server-version/backend/src/modules/scale/scale-admission.service.ts",
 "server-version/backend/src/modules/scale/scale-final-submit.service.ts",
 "server-version/backend/src/modules/scale/scale-scoring.ts",
 "server-version/backend/src/modules/scale/unified-final-submit.service.ts",
 "server-version/backend/src/services/boundedAdmissionGate.ts",
 "server-version/backend/src/workers/compositeReportWorker.ts",
 "server-version/backend/src/workers/main.ts",
 "server-version/backend/src/workers/workerShutdown.ts",
 "server-version/docker-compose.yml",
 "server-version/frontend/src/components/FinalCompositeAssessment.tsx",
 "server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx",
 "server-version/frontend/src/modules/composite/CompositeReportPage.tsx",
 "server-version/frontend/src/modules/composite/api.ts",
 "server-version/frontend/src/modules/composite/types.ts"
]);
export const assessmentCapacityTests=[
 "src/__tests__/assessment-runtime/assessment-timeline.test.ts",
 "src/__tests__/assessment-runtime/frozen-reference-batch.test.ts",
 "src/__tests__/assessment-runtime/reportFeedbackHints.test.ts",
 "src/__tests__/workers/compositeReportWorker.scheduler.test.ts",
 "src/__tests__/services/boundedAdmissionGate.test.ts",
 "src/__tests__/config/backgroundWorkers.test.ts",
 "src/__tests__/workers/worker-shutdown.test.ts",
 "src/__tests__/middleware/publicAssessmentRateLimit.test.ts",
 "src/__tests__/scale/scale-v2.test.ts",
 "src/__tests__/composite/report.controller.test.ts",
 "src/__tests__/composite/composite-report-cache.test.ts",
 "src/__tests__/integration/report-outbox.postgres.integration.test.ts",
 "src/__tests__/assessment-runtime/v32-2.postgres.integration.test.ts",
 "src/__tests__/assessment-runtime/v32-3.postgres.integration.test.ts",
 "src/__tests__/scale/scale-projection.test.ts",
 "src/__tests__/scale/scale-attempt-projection.test.ts",
 "src/__tests__/scale/composite-export-projection.test.ts"
];
export const assessmentCapacityFrontendTests=[
 "src/components/__tests__/WholeCompositeQuestionnaire.test.tsx",
 "src/modules/composite/__tests__/report-polling.test.ts",
 "src/components/__tests__/FinalCompositeAssessment.test.tsx",
 "src/modules/composite/__tests__/CompositeReportPage.test.tsx"
];
export const assessmentCapacityFocusedTests=[
 {
  "file": "src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts",
  "title": "submits scale answers as one final mutation for sizes 1, 5, and 10"
 },
 {
  "file": "src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts",
  "title": "serializes concurrent final scale replay on the assessment row without Serializable retries"
 },
 {
  "file": "src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts",
  "title": "accepts authenticated and anonymous Composite form-section submissions"
 }
];
export const assessmentCapacityTools=new Set([
 "AGENTS.md",
 "docs/release/README.md",
 ".github/scripts/assessment-capacity-scope.mjs",
 ".github/scripts/assessment-capacity-scope.test.mjs",
 ".github/scripts/assessment-capacity-bindings.json",
 ".github/scripts/assessment-capacity-candidate.py",
 ".github/scripts/assessment-capacity-reuse.py",
 ".github/scripts/test_assessment_capacity_reuse.py",
 ".github/scripts/assessment-capacity-recovery.py",
 ".github/scripts/assessment-capacity-browser.mjs",
 ".github/workflows/ci-assessment-capacity.yml",
 ".github/scripts/content-scope.mjs",
 ".github/scripts/merge-gate.mjs",
 ".github/workflows/ci.yml"
]);
const ordinaryTests=new Set([...assessmentCapacityTests,...assessmentCapacityFocusedTests.map(t=>t.file)].map(f=>'server-version/backend/'+f)
 .concat(assessmentCapacityFrontendTests.map(f=>'server-version/frontend/'+f),['server-version/backend/src/__tests__/integration/report-outbox-fixture.ts']));
const blob=(ref,file)=>execFileSync('git',['rev-parse',ref+':'+file],{encoding:'utf8'}).trim();
export function admitsAssessmentCapacity(entries,read,approved=bindings){
 if(approved?.schema!==1||!approved.files||!Object.keys(approved.files).length||!entries.length)return false;
 if(new Set(entries.map(e=>e.file)).size!==entries.length)return false;
 const sources=new Set(Object.keys(approved.files));
 if(![...sources].every(file=>entries.some(e=>e.file===file)))return false;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return false;
  if(sources.has(e.file)){
   const b=approved.files[e.file];
   if(!assessmentCapacitySources.has(e.file)||!/^[a-f0-9]{40}$/.test(b.after||'')
    ||(b.before===null?e.status!=='A':e.status!=='M'||!/^[a-f0-9]{40}$/.test(b.before||'')))return false;
   if(read('head',e.file)!==b.after||(b.before!==null&&read('base',e.file)!==b.before))return false;
  }else if(!assessmentCapacityTools.has(e.file)&&!ordinaryTests.has(e.file))return false;
 }
 return true;
}
export function isolatedTestRunnerCorrectionsOnly(after,beforeBlob){
 if(!/^[a-f0-9]{40}$/.test(beforeBlob||''))return false;
 const replacements=[
  ["env=['CI=true','NODE_ENV=test'","env=['COGNITIVE_MODULE_ENABLED=true','CI=true','NODE_ENV=test'"],
  ["passed=len(suites)==1 and bool(assertions)","passed=len(suites)==1 and suites[0].get('status')=='passed' and bool(assertions)"],
  ["['--no-file-parallelism','--reporter=json','--outputFile=/evidence/backend-tests.json']","['--no-file-parallelism','--reporter=default','--reporter=json','--outputFile=/evidence/backend-tests.json']"],
 ];
 for(const [before,current] of replacements){if(after.split(current).length!==2)return false;after=after.replace(current,before)}
 return execFileSync('git',['hash-object','--stdin'],{input:after,encoding:'utf8'}).trim()===beforeBlob;
}
export const assessmentCapacityRequired=['frozen-boundary','affected-components-compile','canonical-submit-scoring-authority','durable-outbox-crash-recovery','new-schema-restore','compose-overrides','runtime-scans','report-feedback-browser','sast'];
export function assessmentCapacityPlan(entries,base,head){
 if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head))throw Error('Full source SHAs required');
 if(!admitsAssessmentCapacity(entries,(ref,file)=>blob(ref==='base'?base:head,file)))return null;
 for(const path of ['server-version/frontend/src/survey','server-version/frontend/src/huiteacher','server-version/frontend/src/App.tsx','server-version/backend/src/index.ts','server-version/backend/package-lock.json','server-version/frontend/package-lock.json'])
  if(blob(base,path)!==blob(head,path))return null;
 const transition=bindings.compilationReuseTransition;
 if(transition){
  if(blob(head,'.github/scripts/assessment-capacity-candidate.py')!==transition.candidateAfter
    ||blob(head,'.github/scripts/assessment-capacity-reuse.py')!==transition.verifierAfter
    ||!isolatedTestRunnerCorrectionsOnly(execFileSync('git',['show',head+':.github/scripts/assessment-capacity-candidate.py'],{encoding:'utf8'}),transition.candidateBefore))return null;
 }
 return {schema:1,route:'assessment-capacity',base,head,...(transition?{compilationReuseTransition:transition}:{}),changes:entries,changed:['frontend','backend'],
  components:{frontend:blob(head,'server-version/frontend'),backend:blob(head,'server-version/backend')},
  tests:assessmentCapacityTests,focusedTests:assessmentCapacityFocusedTests,frontendTests:assessmentCapacityFrontendTests,required:assessmentCapacityRequired};
}
