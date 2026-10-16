import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./assessment-capacity-bindings.json',import.meta.url),'utf8'));
export const assessmentCapacitySources=new Set([
 "server-version/backend/prisma/migrations/20261016010000_detached_whole_receipt_budget/migration.sql",
 "server-version/backend/prisma/migrations/20261016090000_shared_scale_runtime_artifacts/migration.sql",
 "server-version/backend/prisma/migrations/20261016130000_compact_assessment_public_templates/migration.sql",
 "server-version/backend/prisma/migrations/20261016143000_index_compact_raw_receipts/migration.sql",
 "server-version/backend/prisma/migrations/20261016160000_shared_control_bindings/migration.sql",
 "server-version/backend/prisma/migrations/20261016170000_shared_cognitive_runtime/migration.sql",
 "server-version/backend/prisma/schema.prisma",
 "server-version/backend/scripts/rollback-shared-runtime.ts",
 "server-version/backend/scripts/runtime-table-policy.json",
 "server-version/backend/src/config/database.ts",
 "server-version/backend/src/controllers/publicQuestionnaireController.ts",
 "server-version/backend/src/controllers/questionnaireController.ts",
 "server-version/backend/src/controllers/questionnaireImageController.ts",
 "server-version/backend/src/controllers/questionnaireVideoController.ts",
 "server-version/backend/src/controllers/scaleController.ts",
 "server-version/backend/src/controllers/scaleImageController.ts",
 "server-version/backend/src/controllers/scaleVideoController.ts",
 "server-version/backend/src/index.ts",
 "server-version/backend/src/middleware/errorHandler.ts",
 "server-version/backend/src/modules/assessment-relational/product-cohort-materializer.ts",
 "server-version/backend/src/modules/assessment-relational/runtime-consent.ts",
 "server-version/backend/src/modules/assessment-runtime/bounded-artifact-cache.ts",
 "server-version/backend/src/modules/assessment-runtime/canonical.ts",
 "server-version/backend/src/modules/assessment-runtime/compact-assessment-storage.ts",
 "server-version/backend/src/modules/assessment-runtime/compact-field-codec.ts",
 "server-version/backend/src/modules/assessment-runtime/compact-raw.ts",
 "server-version/backend/src/modules/assessment-runtime/compact-scale-facts.ts",
 "server-version/backend/src/modules/assessment-runtime/control-reference-codec.ts",
 "server-version/backend/src/modules/assessment-runtime/form-admission.service.ts",
 "server-version/backend/src/modules/assessment-runtime/public-templates.ts",
 "server-version/backend/src/modules/assessment-runtime/report-outbox.service.ts",
 "server-version/backend/src/modules/assessment-runtime/runtime-snapshot-v2.ts",
 "server-version/backend/src/modules/assessment-runtime/runtime-snapshot.ts",
 "server-version/backend/src/modules/assessment-runtime/scale-fact-records.ts",
 "server-version/backend/src/modules/assessment-runtime/security.ts",
 "server-version/backend/src/modules/assessment-runtime/shared-cognitive-runtime.ts",
 "server-version/backend/src/modules/assessment-runtime/shared-control-records.ts",
 "server-version/backend/src/modules/assessment-runtime/shared-scale-runtime.ts",
 "server-version/backend/src/modules/assessment-runtime/slot-set.ts",
 "server-version/backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts",
 "server-version/backend/src/modules/assessment-runtime/unit-admission.ts",
 "server-version/backend/src/modules/assessment-runtime/whole-receipt-atomic.ts",
 "server-version/backend/src/modules/assessment-runtime/whole-receipt-storage.ts",
 "server-version/backend/src/modules/assessment-safety/organization-view.ts",
 "server-version/backend/src/modules/bundle-product/analysis.ts",
 "server-version/backend/src/modules/cognitive/cognitive-admission.service.ts",
 "server-version/backend/src/modules/cognitive/cognitive.public.routes.ts",
 "server-version/backend/src/modules/cognitive/cognitive.routes.ts",
 "server-version/backend/src/modules/cognitive/cognitive.security.ts",
 "server-version/backend/src/modules/cognitive/completion.service.ts",
 "server-version/backend/src/modules/cognitive/final-submit.service.ts",
 "server-version/backend/src/modules/cognitive/session.service.ts",
 "server-version/backend/src/modules/cognitive/trial.service.ts",
 "server-version/backend/src/modules/cognitive/unified-final-submit.service.ts",
 "server-version/backend/src/modules/composite/compact-composite-report.ts",
 "server-version/backend/src/modules/composite/composite-analysis-snapshot.service.ts",
 "server-version/backend/src/modules/composite/composite-export.service.ts",
 "server-version/backend/src/modules/composite/composite-image.controller.ts",
 "server-version/backend/src/modules/composite/composite-report-cache.ts",
 "server-version/backend/src/modules/composite/composite-report-read.ts",
 "server-version/backend/src/modules/composite/composite-video.controller.ts",
 "server-version/backend/src/modules/composite/composite.controller.ts",
 "server-version/backend/src/modules/composite/composite.public.routes.ts",
 "server-version/backend/src/modules/composite/composite.routes.ts",
 "server-version/backend/src/modules/composite/composite.service.ts",
 "server-version/backend/src/modules/composite/frozen-progress.ts",
 "server-version/backend/src/modules/composite/whole-questionnaire.service.ts",
 "server-version/backend/src/modules/composite/whole-receipt-recovery.ts",
 "server-version/backend/src/modules/huiteacher/personalScale.service.ts",
 "server-version/backend/src/modules/mobile/assessment.routes.ts",
 "server-version/backend/src/modules/reporting/compact-questionnaire-report.ts",
 "server-version/backend/src/modules/reporting/questionnaire-collection-report.ts",
 "server-version/backend/src/modules/reporting/resultSource.ts",
 "server-version/backend/src/modules/reporting/scale-unit-report.ts",
 "server-version/backend/src/modules/scale/scale-admission.service.ts",
 "server-version/backend/src/modules/scale/scale-final-submit.service.ts",
 "server-version/backend/src/modules/scale/scale-restart.controller.ts",
 "server-version/backend/src/modules/scale/scale-restart.service.ts",
 "server-version/backend/src/modules/scale/scale-start.controller.ts",
 "server-version/backend/src/modules/scale/scale-workflow.service.ts",
 "server-version/backend/src/modules/scale/unified-final-submit.service.ts",
 "server-version/backend/src/services/assessmentResourceProtection.ts",
 "server-version/backend/src/services/exportService.legacy.ts",
 "server-version/backend/src/services/questionnaire-form-section.service.ts",
 "server-version/backend/src/services/questionnaireProgressService.ts",
 "server-version/backend/src/services/reportReadyNotifications.ts",
 "server-version/backend/src/services/runtimeObservability.ts",
 "server-version/backend/src/services/wholeSubmissionPriority.ts",
 "server-version/backend/src/utils/encryption.ts",
 "server-version/backend/src/workers/compositeReportWorker.ts",
 "server-version/backend/src/workers/main.ts",
 "server-version/docker-compose.yml",
 "server-version/frontend/src/components/WholeCompositeQuestionnaire.tsx",
 "server-version/frontend/src/modules/composite/CompositeReportPage.tsx",
 "server-version/frontend/src/modules/composite/api.ts",
 "server-version/frontend/src/modules/composite/receipt-recovery.ts",
 "server-version/frontend/src/modules/composite/report-polling.ts",
 "server-version/frontend/src/modules/composite/types.ts",
 "server-version/perf/current-main-v1/check-final-routes.mjs"
]);
export const assessmentCapacityTests=[
 "src/__tests__/assessment-relational/runtime-consent.test.ts",
 "src/__tests__/assessment-runtime/assessment-timeline.test.ts",
 "src/__tests__/assessment-runtime/compact-assessment-storage.test.ts",
 "src/__tests__/assessment-runtime/control-reference-codec.test.ts",
 "src/__tests__/assessment-runtime/database-scale-definition-cache.test.ts",
 "src/__tests__/assessment-runtime/frozen-json-package-compat.test.ts",
 "src/__tests__/assessment-runtime/frozen-reference-batch.test.ts",
 "src/__tests__/assessment-runtime/frozen-scale-artifact-cache.test.ts",
 "src/__tests__/assessment-runtime/frozen-scale-v2-artifact-cache.test.ts",
 "src/__tests__/assessment-runtime/frozen-slot-cache.test.ts",
 "src/__tests__/assessment-runtime/report-ready-wait.test.ts",
 "src/__tests__/assessment-runtime/reportFeedbackHints.test.ts",
 "src/__tests__/assessment-runtime/shared-scale-runtime.test.ts",
 "src/__tests__/assessment-runtime/v32-1.architecture.test.ts",
 "src/__tests__/assessment-runtime/v32-2.postgres.integration.test.ts",
 "src/__tests__/assessment-runtime/v32-3.postgres.integration.test.ts",
 "src/__tests__/assessment-runtime/whole-pressure-coalescing.test.ts",
 "src/__tests__/assessment-runtime/whole-pressure-lifecycle.test.ts",
 "src/__tests__/assessment-runtime/whole-receipt-storage.test.ts",
 "src/__tests__/assessment-runtime/whole-submission-priority.test.ts",
 "src/__tests__/composite/composite-analysis-snapshot.completion.test.ts",
 "src/__tests__/composite/composite-analysis-snapshot.integration.test.ts",
 "src/__tests__/composite/composite-report-cache.test.ts",
 "src/__tests__/composite/report-package.service.test.ts",
 "src/__tests__/composite/report.controller.test.ts",
 "src/__tests__/composite/results.service.test.ts",
 "src/__tests__/composite/situational-bundle.postgres.integration.test.ts",
 "src/__tests__/config/backgroundWorkers.test.ts",
 "src/__tests__/hotpath/final-route-inventory.test.ts",
 "src/__tests__/integration/compact-assessment-storage.postgres.integration.test.ts",
 "src/__tests__/integration/report-outbox.postgres.integration.test.ts",
 "src/__tests__/integration/shared-cognitive-runtime.postgres.integration.test.ts",
 "src/__tests__/integration/shared-scale-runtime.postgres.integration.test.ts",
 "src/__tests__/middleware/errorHandler.test.ts",
 "src/__tests__/middleware/publicAssessmentRateLimit.test.ts",
 "src/__tests__/scale/composite-export-projection.test.ts",
 "src/__tests__/scale/scale-attempt-projection.test.ts",
 "src/__tests__/scale/scale-projection.test.ts",
 "src/__tests__/scale/scale-v2.test.ts",
 "src/__tests__/services/assessmentResourceProtection.test.ts",
 "src/__tests__/services/boundedAdmissionGate.test.ts",
 "src/__tests__/situational/scientific-promotion.postgres.integration.test.ts",
 "src/__tests__/situational/unknown-onboarding.postgres.integration.test.ts",
 "src/__tests__/workers/compositeReportWorker.scheduler.test.ts",
 "src/__tests__/workers/worker-shutdown.test.ts"
];
export const assessmentCapacityFrontendTests=[
 "src/components/__tests__/AnonymousStudyManager.test.tsx",
 "src/components/__tests__/FinalCompositeAssessment.test.tsx",
 "src/components/__tests__/WholeCompositeQuestionnaire.test.tsx",
 "src/modules/composite/__tests__/CompositeReportPage.test.tsx",
 "src/modules/composite/__tests__/CompositeSituationalReport.test.tsx",
 "src/modules/composite/__tests__/report-polling.test.ts",
 "src/modules/composite/receipt-recovery.test.ts"
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
 "docs/performance-optimization-v1/route-inventory.csv",
 "docs/performance/2026-10-17-release-validation.md",
 "docs/performance/2026-10-17-shared-control-storage.md",
 "docs/performance/20261016-compact-assessment-facts.md",
 "docs/performance/20261016-server-efficiency.md",

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
 .concat(assessmentCapacityFrontendTests.map(f=>'server-version/frontend/'+f),['server-version/backend/src/__tests__/integration/report-outbox-fixture.ts','server-version/backend/src/__tests__/fixtures/cognitive-storage.synthetic.json']));
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
 for(const path of ['server-version/frontend/src/survey','server-version/frontend/src/huiteacher','server-version/frontend/src/App.tsx','server-version/backend/package-lock.json','server-version/frontend/package-lock.json'])
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
