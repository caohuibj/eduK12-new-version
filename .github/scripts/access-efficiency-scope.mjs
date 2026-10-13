import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./access-efficiency-bindings.json',import.meta.url),'utf8'));
export const accessEfficiencySources=new Set([
 "server-version/backend/src/controllers/checkinController.ts",
 "server-version/backend/src/controllers/courseController.ts",
 "server-version/backend/src/controllers/publicQuestionnaireController.ts",
 "server-version/backend/src/controllers/videoController.ts",
 "server-version/backend/src/middleware/publicAssessmentRateLimit.ts",
 "server-version/backend/src/middleware/uploadAdmission.ts",
 "server-version/backend/src/modules/huiteacher/groupReport.service.ts",
 "server-version/backend/src/modules/survey/analytics.source.ts",
 "server-version/backend/src/routes/uploads.ts",
 "server-version/backend/src/services/powService.ts",
 "server-version/backend/src/utils/listCursor.ts",
 "server-version/backend/src/utils/uploadTemp.ts",
 "server-version/backend/src/utils/videoDownloader.ts",
 "server-version/backend/src/utils/videoProbe.ts",
 "server-version/backend/src/workers/videoProcessorOptimized.ts",
 "server-version/docker-compose.yml",
 "server-version/frontend/src/hooks/useCursorList.ts",
 "server-version/frontend/src/pages/CheckinList.tsx",
 "server-version/frontend/src/pages/student/CheckinSubmit.tsx",
 "server-version/frontend/src/pages/student/StudentCheckins.tsx",
 "server-version/frontend/src/pages/student/StudentHome.tsx",
 "server-version/frontend/src/training/TrainingLearnerHome.tsx",
 "server-version/miniprogram-v2/domains/operations/service.js",
 "server-version/miniprogram-v2/domains/shared/service.js",
 "server-version/miniprogram/api/checkins.js",
 "server-version/miniprogram/api/courses.js",
 "server-version/miniprogram/pages/checkin/list/index.js",
 "server-version/miniprogram/pages/checkin/submit/submit.js",
 "server-version/miniprogram/pages/checkin/submit/submit.wxml",
 "server-version/miniprogram/pages/index/index.js"
]);
export const accessEfficiencyTests=[
 "src/__tests__/integration/accessPaging.postgres.integration.test.ts",
 "src/__tests__/integration/publicBudget.redis.integration.test.ts",
 "src/__tests__/security/video-probe-lifetime.test.ts",
 "src/__tests__/middleware/publicAssessmentRateLimit.test.ts",
 "src/__tests__/integration/powCapacity.redis.integration.test.ts",
 "src/__tests__/services/powService.capacity.test.ts",
 "src/__tests__/services/upload-admission.test.ts",
 "src/__tests__/controllers/video-upload-recovery.test.ts",
 "src/__tests__/security/remote-video-worker-cleanup.test.ts",
 "src/__tests__/security/video-stream-deadline.test.ts",
 "src/__tests__/security/video-output-bound.test.ts",
 "src/__tests__/security/remote-video-queue-lifetime.test.ts",
 "src/__tests__/integration/huiteacherFormRuntime.postgres.integration.test.ts",
 "src/__tests__/integration/huiteacherPrivacyV2.postgres.integration.test.ts",
 "src/__tests__/controllers/checkinSubmit.test.ts",
 "src/__tests__/services/assetStorage.test.ts"
];
export const accessEfficiencyFrontendTests=[
 "src/hooks/useCursorList.test.tsx",
 "src/pages/student/__tests__/StudentHome.dialog.test.tsx",
 "src/training/TrainingScreens.test.tsx"
];
export const accessEfficiencyFocusedTests=[
 {
  "file": "src/__tests__/survey/research-wave-final.postgres.integration.test.ts",
  "title": "computes Survey sources outside business transactions and rechecks current authority before returning"
 },
 {
  "file": "src/__tests__/survey/research-wave-final.postgres.integration.test.ts",
  "title": "adapts 240-item timed FINAL pages and skips raw projection for SCORE_LONG"
 }
];
export const accessEfficiencyTools=new Set([
 '.github/scripts/access-efficiency-scope.mjs','.github/scripts/access-efficiency-scope.test.mjs',
 '.github/scripts/access-efficiency-bindings.json','.github/scripts/access-efficiency-candidate.py',
 '.github/scripts/access-efficiency-reuse.py','.github/scripts/test_access_efficiency_reuse.py',
 '.github/scripts/access-efficiency-browser.mjs','.github/workflows/ci-access-efficiency.yml',
 '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
 'docs/release/README.md',
]);
const ordinaryTests=new Set([...accessEfficiencyTests,...accessEfficiencyFocusedTests.map(t=>t.file)].map(f=>'server-version/backend/'+f)
 .concat(accessEfficiencyFrontendTests.map(f=>'server-version/frontend/'+f),['server-version/miniprogram-v2/tests/access-paging.test.cjs']));
const blob=(ref,file)=>execFileSync('git',['rev-parse',ref+':'+file],{encoding:'utf8'}).trim();
export function admitsAccessEfficiency(entries,read,approved=bindings){
 if(approved?.schema!==1||!approved.files||!Object.keys(approved.files).length||!entries.length)return false;
 const sources=new Set(Object.keys(approved.files));
 if(![...sources].every(file=>entries.some(e=>e.file===file)))return false;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return false;
  if(sources.has(e.file)){
   const b=approved.files[e.file];
   if(!accessEfficiencySources.has(e.file)||!/^[a-f0-9]{40}$/.test(b.after||'')
    ||(b.before===null?e.status!=='A':e.status!=='M'||!/^[a-f0-9]{40}$/.test(b.before||'')))return false;
   if(read('head',e.file)!==b.after||(b.before!==null&&read('base',e.file)!==b.before))return false;
  }else if(!accessEfficiencyTools.has(e.file)&&!ordinaryTests.has(e.file))return false;
 }
 return true;
}
export const accessEfficiencyRequired=['frozen-boundary','affected-components-compile','focused-access-contracts','mobile-contracts','compose-overrides','runtime-scans','pagination-browser','sast'];
export function accessEfficiencyPlan(entries,base,head){
 if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head))throw Error('Full source SHAs required');
 if(!admitsAccessEfficiency(entries,(ref,file)=>blob(ref==='base'?base:head,file)))return null;
 for(const path of ['server-version/frontend/src/survey','server-version/frontend/src/huiteacher','server-version/frontend/src/App.tsx','server-version/backend/src/index.ts'])
  if(blob(base,path)!==blob(head,path))return null;
 return {schema:1,route:'access-efficiency',base,head,changes:entries,changed:['frontend','backend'],
  components:{frontend:blob(head,'server-version/frontend'),backend:blob(head,'server-version/backend')},
  tests:accessEfficiencyTests,focusedTests:accessEfficiencyFocusedTests,frontendTests:accessEfficiencyFrontendTests,
  mobileTests:['tests/access-paging.test.cjs','tests/operations.test.cjs'],required:accessEfficiencyRequired};
}
