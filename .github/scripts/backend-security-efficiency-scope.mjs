import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const root='server-version/backend/';
const bindings=JSON.parse(readFileSync(new URL('./backend-security-efficiency-bindings.json',import.meta.url),'utf8'));
export const backendSecurityEfficiencyTools=new Set([
 '.github/scripts/backend-security-efficiency-scope.mjs',
 '.github/scripts/backend-security-efficiency-scope.test.mjs',
 '.github/scripts/backend-security-efficiency-bindings.json',
 '.github/scripts/campus-candidate.py',
 '.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs',
 '.github/workflows/ci.yml','.github/workflows/ci-backend-security-efficiency.yml',
 'docs/release/README.md',
]);
export const backendSecurityEfficiencyProductionFiles=new Set([
 "controllers/authController.ts",
 "controllers/checkinController.ts",
 "controllers/assignmentController.ts",
 "controllers/courseController.ts",
 "controllers/documentController.ts",
 "controllers/publicQuestionnaireController.ts",
 "controllers/videoController.ts",
 "services/assetStorage.ts",
 "services/powService.ts",
 "services/remoteVideoAdmission.ts",
 "services/videoRetry.ts",
 "services/videoProcessingRecovery.ts",
 "workers/videoProcessorOptimized.ts",
 "routes/uploads.ts",
 "modules/huiteacher/personalScale.routes.ts",
 "modules/huiteacher/observer.routes.ts",
 "modules/huiteacher/consensus.routes.ts",
 "modules/huiteacher/fieldForm.routes.ts",
 "modules/huiteacher/fieldFeedback.routes.ts",
 "modules/huiteacher/studentEvaluation.routes.ts",
 "modules/huiteacher/improvement.routes.ts",
 "modules/report-privacy/routes.ts",
 "modules/survey/analytics.read.ts"
].map(file=>root+'src/'+file));
export const backendSecurityEfficiencyTests=[
 'src/__tests__/huiteacherRoutingEfficiency.test.ts',
 'src/__tests__/middleware/auth.test.ts',
 'src/__tests__/middleware/csrf.test.ts',
 'src/__tests__/utils/authCookies.test.ts',
 'src/__tests__/controllers/authLibrary.test.ts',
 'src/__tests__/controllers/courseLibrary.test.ts',
 'src/__tests__/controllers/assignmentSubmit.test.ts',
 'src/__tests__/controllers/checkinSubmit.test.ts',
 'src/__tests__/controllers/checkinPublicSecurity.test.ts',
 'src/__tests__/controllers/checkinExport.test.ts',
 'src/__tests__/integration/checkinIntegration.test.ts',
 'src/__tests__/integration/legacy-asset-domain.postgres.integration.test.ts',
 'src/__tests__/security/checkinSecurity.test.ts',
 'src/__tests__/services/courseGlobalAccountAuthority.test.ts',
 'src/__tests__/services/assetStorage.test.ts',
 'src/__tests__/services/powService.capacity.test.ts',
 'src/__tests__/integration/powCapacity.redis.integration.test.ts',
 'src/__tests__/services/upload-admission.test.ts',
 'src/__tests__/services/videoRetry.test.ts',
 'src/__tests__/services/videoProcessingRecovery.test.ts',
 'src/__tests__/services/videoProcessingState.test.ts',
 'src/__tests__/controllers/video-upload-recovery.test.ts',
 'src/__tests__/security/remote-video-admission.test.ts',
 'src/__tests__/security/remote-video-worker-cleanup.test.ts',
 'src/__tests__/security/video-stream-deadline.test.ts',
 'src/__tests__/security/video-output-bound.test.ts',
 'src/__tests__/security/remote-video-queue-lifetime.test.ts',
 'src/__tests__/survey/research-analytics.contract.test.ts',
];
export const backendSecurityEfficiencyFocusedTests=[{file:'src/__tests__/survey/research-wave-final.postgres.integration.test.ts',title:'aggregates paired Wave counts from FINALs while retaining exclusions, quality and empty cohorts'}];
const testFiles=new Set([...backendSecurityEfficiencyTests,...backendSecurityEfficiencyFocusedTests.map(test=>test.file)].map(file=>root+file));
const blob=(ref,file)=>execFileSync('git',['rev-parse',ref+':'+file],{encoding:'utf8'}).trim();
// This is a frozen C repair, not a reusable permission to change arbitrary
// handlers. Every approved production before/after blob must match exactly.
export function admitsBackendSecurityEfficiency(entries,read,approved=bindings){
 if(approved?.schema!==1||!approved.files||!Object.keys(approved.files).length||!entries.length)return false;
 const sources=new Set(Object.keys(approved.files));
 if(![...sources].every(file=>entries.some(e=>e.file===file)))return false;
 for(const e of entries){
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return false;
  if(sources.has(e.file)){
   const binding=approved.files[e.file];
   if(!backendSecurityEfficiencyProductionFiles.has(e.file)
    ||!/^[a-f0-9]{40}$/.test(binding.after||'')
    ||(binding.before===null?e.status!=='A':e.status!=='M'||!/^[a-f0-9]{40}$/.test(binding.before||'')))return false;
   if(read('head',e.file)!==binding.after||(binding.before!==null&&read('base',e.file)!==binding.before))return false;
  }else if(!backendSecurityEfficiencyTools.has(e.file)&&!testFiles.has(e.file))return false;
 }
 return true;
}
export function backendSecurityEfficiencyPlan(entries,base,head){
 if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head))throw Error('Full source SHAs required');
 if(!admitsBackendSecurityEfficiency(entries,(ref,file)=>blob(ref==='base'?base:head,file)))return null;
 if(blob(base,'server-version/frontend')!==blob(head,'server-version/frontend'))return null;
 return {schema:1,route:'backend-security-efficiency',base,head,changes:entries,changed:['backend'],
  components:{backend:blob(head,'server-version/backend')},tests:backendSecurityEfficiencyTests,focusedTests:backendSecurityEfficiencyFocusedTests,
  required:['frozen-boundary','backend-compile','focused-security-efficiency-contracts','runtime-scan','sast']};
}
