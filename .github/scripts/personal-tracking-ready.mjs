import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {participantAccessOutputs} from './participant-access-scope.mjs';
import {personalTrackingDraftScope} from './personal-tracking-draft-scope.mjs';
const originalBinding=JSON.parse(readFileSync(new URL('./personal-tracking-ready.json',import.meta.url)));
const groupBindingFile=new URL('./group-longitudinal-ready.json',import.meta.url);
const executionPlan=JSON.parse(process.env.PERSONAL_TRACKING_PLAN||'null');
const executionBranch=process.env.CI_HEAD_REF||process.env.GITHUB_HEAD_REF||executionPlan?.branch;
export const binding=existsSync(groupBindingFile)
 ? JSON.parse(readFileSync(groupBindingFile)).candidates?.[executionBranch]??originalBinding : originalBinding;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function personalTrackingReadyPlan(entries,base,head,{event,branch,draft,forceFull=false}={}){
 if(branch!==binding.branch||event!=='pull_request')return null;
 if(binding.slice==='group')return groupLongitudinalReadyPlan(entries,base,head,{event,branch,draft,forceFull});
 assert.equal(forceFull,false,'Personal tracking does not authorize whole-platform execution');
 assert.equal(base,binding.base,'Personal tracking main base changed; recheck affected inputs');
 if(binding.slice==='school'){assert.equal(binding.branch,'feat/personal-longitudinal-school-20261030');assert.equal(binding.originalSource,'aecb26636ebec3d7e8fe27201bc01ad7840ca7e2');}
 else if(binding.slice==='teacher'){assert.equal(binding.branch,'feat/personal-longitudinal-education-20261030');assert.equal(binding.originalSource,'2160f195f67b211cc62ab8eda1ecf3f698927900');}
 else if(binding.slice==='training'){assert.equal(binding.branch,'feat/personal-longitudinal-training-20261030');assert.equal(binding.originalSource,'dbcc7e597aba792aa052cd23634332d80a4252e1');}
 else assert.equal(binding.reviewedCandidate,'a62c9a5763da69aa13b4f70d062b0bf55d6db65f');
 assert(personalTrackingDraftScope(entries,{event,draft:true}));
 for(const entry of entries.filter(e=>e.file.startsWith('server-version/'))){
  const pin=binding.files[entry.file];assert(pin,'Unreviewed application input: '+entry.file);
  assert.equal(git('rev-parse',head+':'+entry.file),pin.after);
  assert.equal(pin.after,git('rev-parse',binding.reviewedCandidate+':'+entry.file),'Application differs from reviewed source');
  if(['training','teacher','school'].includes(binding.slice)){const delta=(from,to)=>execFileSync('git',['diff','--unified=0',from,to,'--',entry.file],{encoding:'utf8'}).split('\n').filter(line=>/^[+-]/.test(line)&&!line.startsWith('+++ ')&&!line.startsWith('--- ')).join('\n');assert.equal(hash(delta(pin.originalBase,binding.originalSource)),pin.originalDeltaSHA256,'Original longitudinal delta changed');assert.equal(hash(delta(base,head)),pin.originalDeltaSHA256,'Longitudinal implementation delta differs from original evidence');}
  if(pin.before){assert.equal(entry.status,'M');assert.equal(git('rev-parse',base+':'+entry.file),pin.before)}else assert.equal(entry.status,'A');
 }
 assert.deepEqual(entries.filter(e=>e.file.startsWith('server-version/')).map(e=>e.file).sort(),Object.keys(binding.files).sort());
 for(const [file,blob]of Object.entries(binding.protectedInputs))assert.equal(git('rev-parse',head+':'+file),blob,'Dependency/build input changed');
 if(binding.imageReuse){assert.equal(git('rev-parse',head+':server-version'),binding.imageReuse.serverVersionTree,'Image source tree changed');assert.equal(git('rev-parse',binding.imageReuse.sourceHead+':server-version'),binding.imageReuse.serverVersionTree);for(const [file,blob]of Object.entries(binding.imageReuse.inputs))assert.equal(git('rev-parse',head+':'+file),blob,'Original image producer input changed');}
 if(binding.applicationSastReuse)assert.equal(git('rev-parse',head+':server-version'),binding.applicationSastReuse.serverVersionTree,'Original SAST application input changed');
 if(binding.backendAuditReuse)for(const file of ['server-version/backend/package.json','server-version/backend/package-lock.json'])assert.equal(git('rev-parse',binding.backendAuditReuse.sourceHead+':'+file),git('rev-parse',head+':'+file),'Original backend audit input changed');
 const runtime=entries.filter(e=>/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(e.file)).map(e=>e.file);
 const sastPaths=['training','teacher','school'].includes(binding.slice)?[...new Set([...runtime,'.github/scripts/personal-tracking-ready.mjs'])]:undefined;
 const frontendLintPaths=['training','teacher','school'].includes(binding.slice)?runtime.filter(p=>p.startsWith('server-version/frontend/src/')).map(p=>p.slice('server-version/frontend/'.length)):undefined;
 return {schemaVersion:1,route:'personal-tracking',...(sastPaths?{sastPaths,frontendLintPaths}:{}),base,head,tree:git('rev-parse',head+'^{tree}'),draft:draft===true,reviewedCandidate:binding.reviewedCandidate,...(binding.imageReuse?{imageReuse:binding.imageReuse}:{}),...(binding.backendAuditReuse?{backendAuditReuse:binding.backendAuditReuse}:{}),...(binding.frontendAuditReuse?{frontendAuditReuse:binding.frontendAuditReuse}:{}),...(binding.applicationSastReuse?{applicationSastReuse:binding.applicationSastReuse}:{}),...(binding.qualificationReuse?{qualificationReuse:binding.qualificationReuse}:{}),required:draft?['scope']:['scope','personal-tracking',...(binding.imageReuse?[]:['docker']),'codeql']};
}
// Existing longitudinal qualification job, with exact group-slice source pins.
// This adds no application producer, authorization layer or alternate gate.
export function groupLongitudinalReadyPlan(entries,base,head,{event,branch,draft,forceFull=false}){
 assert.equal(binding.slice,'group');assert.equal(event,'pull_request');assert.equal(branch,binding.branch);
 assert(['feat/group-longitudinal-survey-training-20261030','feat/school-group-longitudinal-complete-20261031'].includes(branch));
 assert.equal(forceFull,false);assert.equal(base,binding.base);
 const marker='.github/scripts/group-longitudinal-ready.json';
 assert.deepEqual(entries.map(e=>e.file).sort(),[...Object.keys(binding.files),marker].sort(),'Complete group candidate inventory changed');
 for(const entry of entries){
  assert.equal(entry.newMode,'100644');
  const pin=entry.file===marker?{before:binding.markerBefore}:binding.files[entry.file];
  assert.equal(entry.status,pin.before?'M':'A');assert.equal(entry.oldMode,pin.before?'100644':'000000');
  if(pin.before)assert.equal(git('rev-parse',base+':'+entry.file),pin.before);
  if(entry.file!==marker)assert.equal(git('rev-parse',head+':'+entry.file),pin.after);
 }
 for(const [component,tree]of Object.entries(binding.components)){
  assert.equal(git('rev-parse',head+':server-version/'+component),tree);
  assert.equal(git('rev-parse',binding.reviewedCandidate+':server-version/'+component),tree);
 }
 for(const [key,component]of [['backendAuditReuse','backend'],['frontendAuditReuse','frontend']])if(binding[key])for(const file of ['package.json','package-lock.json'])assert.equal(git('rev-parse',head+':server-version/'+component+'/'+file),git('rev-parse',binding[key].sourceHead+':server-version/'+component+'/'+file),'Original audit locked input changed');
 const runtime=entries.filter(e=>/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(e.file)).map(e=>e.file);
 return {schemaVersion:1,route:'personal-tracking',slice:'group',...(binding.backendAuditReuse?{backendAuditReuse:binding.backendAuditReuse}:{}),...(binding.frontendAuditReuse?{frontendAuditReuse:binding.frontendAuditReuse}:{}),branch,base,head,tree:git('rev-parse',head+'^{tree}'),
  draft:draft===true,reviewedCandidate:binding.reviewedCandidate,
  sastPaths:[...new Set([...runtime,'.github/scripts/personal-tracking-ready.mjs'])],
  frontendLintPaths:runtime.filter(p=>p.startsWith('server-version/frontend/src/')).map(p=>p.slice('server-version/frontend/'.length)),
  required:draft?['scope']:['scope','personal-tracking','docker','codeql']};
}
export function personalTrackingReadyOutputs(plan){const out=participantAccessOutputs(plan);delete out.participant_access_plan;return {...out,application_route:'personal-tracking',scenario:'personal-tracking',codeql:!plan.draft,personal_tracking_plan:JSON.stringify(plan),personal_tracking_draft:false};}
export async function admitOriginalReports(read=readFileSync){
 // Reuse the existing unsigned original-report verifier. Original failures and
 // filtered rows are preserved; these cases are NOT claimed as CI executions.
 const {verifyOriginalReport,verifyFailureContinuations}=await import('./onboarding-checks.mjs');
 const admitted=[],unique=new Set(),original=new Set();
 for(const item of binding.reports){const bytes=read(item.file);assert.equal(hash(bytes),item.sha256,'Original reporter changed');assert.equal(hash(execFileSync('git',['show',binding.reviewedCandidate+':'+item.file])),item.sha256,'Reporter differs from reviewed immutable Git original');if(binding.originalSource)assert.equal(hash(execFileSync('git',['show',binding.originalSource+':'+item.file])),item.sha256,'Reporter differs from immutable original longitudinal evidence');const report=JSON.parse(bytes);const caseNames=verifyOriginalReport(report,item.review,{allowDuplicateFiltered:true});for(const name of caseNames){unique.add(name);if(binding.originalReportPrefix?item.file.startsWith(binding.originalReportPrefix):item.file.includes('/originals/'))original.add(name);}admitted.push({id:item.id,caseNames,ciExecuted:false,originalSigned:false,provenance:'reviewed-local-evidence'});}
 verifyFailureContinuations(binding.reports.map(r=>({...r.review,id:r.id})),admitted);
 assert.equal(original.size,binding.originalCaseCount??31,'All original successful cases must remain present');assert.equal(unique.size,binding.originalCaseCount??unique.size,'Unexpected application evidence count');
 if(binding.historicalDraftControl){const p=binding.historicalDraftControl;assert.equal(hash(read(p.file)),p.sha256);assert.equal(hash(execFileSync('git',['show',binding.originalSource+':'+p.file])),p.sha256);}
 const historicalFailures=[];
 for(const item of binding.historicalFailures??[]){
  const bytes=read(item.file);assert.equal(hash(bytes),item.sha256,'Original failed reporter changed');assert.equal(hash(execFileSync('git',['show',binding.originalSource+':'+item.file])),item.sha256);
  const report=JSON.parse(bytes);assert.equal(report.success,false);assert.deepEqual(Object.fromEntries(['success','numPassedTests','numFailedTests','numPendingTests'].map(k=>[k,report[k]])),item.summary);
  const cases=report.testResults.flatMap(s=>s.assertionResults.map(c=>({fullName:c.fullName,status:c.status})));assert.deepEqual(cases,item.cases);assert(cases.some(c=>c.status==='failed'));
  if(item.continuations){
   assert.deepEqual(item.continuations.map(c=>c.failedCaseName).sort(),cases.filter(c=>c.status==='failed').map(c=>c.fullName).sort(),'Failed cases lost their original continuation identities');
   for(const c of item.continuations)assert(admitted.some(r=>r.id===c.successfulReportId&&r.caseNames.includes(c.failedCaseName)),'Retained-state continuation missing');
  }else assert(admitted.some(r=>r.id===item.continuation&&r.caseNames.length),'Retained-state continuation missing');
  historicalFailures.push({...item,status:'ORIGINAL_FAILURE_RETAINED',ciExecuted:false});
 }
 return {reviewedCandidate:binding.reviewedCandidate,caseCount:unique.size,admitted,historicalFailures,ciExecuted:false,reviewBasis:binding.reviewBasis};
}
/** Separate process avoids the CLI -> onboarding -> scope -> CLI top-level
 * await cycle; it uses the same original verifier, without application replay. */
export function admitOriginalReportsInChild(){
 const code="const {admitOriginalReports}=await import('./.github/scripts/personal-tracking-ready.mjs');process.stdout.write(JSON.stringify(await admitOriginalReports()));";
 return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}));
}
export async function verifyOriginalImages(plan,fetcher=fetch,now=Date.now(),expectedProof=binding.imageReuse){
 const proof=plan.imageReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(expectedProof));
 const token=process.env.GH_TOKEN;assert(token,'Existing Actions read token required');
 const get=async path=>{const response=await fetcher('https://api.github.com/repos/'+binding.repository+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});assert(response.ok,'Official image metadata inaccessible: '+response.status);return response.json()};
 const run=await get('/actions/runs/'+proof.runId),job=await get('/actions/jobs/'+proof.jobId);
 assert.equal(run.head_sha,proof.sourceHead);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.run_id,proof.runId);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 assert([proof.sourceHead,proof.executionHead].includes(job.head_sha),'Image execution source changed');
 assert.equal(job.name,'docker (compose config + production builds) / production image build and scan');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original image check expired');
 const steps=['validate compose','assert prelaunch resource and HTTPS contract','assert API/worker isolation topology','validate monitoring compose','build production images','verify production Nginx static asset MIME and security headers','scan backend image (high and critical)','scan frontend image (high and critical)'];
 for(const name of steps)assert.equal(job.steps.find(step=>step.name===name)?.conclusion,'success','Original required image step did not pass: '+name);
 return {status:'ADMITTED_IMAGE_CHECKS_ONLY',runId:run.id,originalRunConclusion:run.conclusion,jobId:job.id,sourceHead:run.head_sha,executionHead:job.head_sha,completedAt:job.completed_at,serverVersionTree:proof.serverVersionTree,requiredSteps:steps,ciExecutedInOriginalRun:true,reexecuted:false,deployableArchiveAvailable:false};
}
export async function verifyOriginalBackendAudit(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.backendAuditReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.backendAuditReuse));assert(process.env.GH_TOKEN);
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official audit metadata unavailable: '+response.status);const job=await response.json();
 assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha));assert.equal(job.status,'completed');
 const matches=job.steps.filter(step=>step.name===proof.step);assert.equal(matches.length,1);const step=matches[0];assert.equal(step.conclusion,'success','Original locked backend audit did not pass');
 const age=now-Date.parse(step.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original locked audit expired');
 const originalWorkflow=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});const block=originalWorkflow.slice(originalWorkflow.indexOf('- name: '+proof.step),originalWorkflow.indexOf('- name: real nonempty main upgrade'));assert(block.includes('npm audit --audit-level=high'),'Original audit threshold changed');
 return {status:'ADMITTED_BACKEND_AUDIT_ONLY',runId:proof.runId,jobId:job.id,sourceHead:proof.sourceHead,originalJobConclusion:job.conclusion,step:proof.step,completedAt:step.completed_at,ciExecutedInOriginalRun:true,reexecuted:false};
}
/** Reuse the exact locked frontend audit step, independently of source types. */
export async function verifyOriginalFrontendAudit(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.frontendAuditReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.frontendAuditReuse));assert(process.env.GH_TOKEN);
 for(const path of ['server-version/frontend/package.json','server-version/frontend/package-lock.json'])assert.equal(git('rev-parse','HEAD:'+path),git('rev-parse',proof.sourceHead+':'+path),'Original frontend audit input changed');
 const workflow=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'}),start=workflow.indexOf('- name: '+proof.step),end=workflow.indexOf('      - name:',start+8);assert(start>=0&&workflow.slice(start,end).includes('npm audit --audit-level=high'),'Original frontend audit threshold changed');
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official frontend audit metadata unavailable: '+response.status);const job=await response.json();
 assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha));assert.equal(job.status,'completed');const steps=job.steps.filter(s=>s.name===proof.step);assert.equal(steps.length,1);const step=steps[0];assert.equal(step.conclusion,'success','Original frontend audit did not pass');const age=now-Date.parse(step.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original frontend audit expired');
 return {status:'ADMITTED_FRONTEND_LOCK_AUDIT_ONLY',runId:proof.runId,jobId:proof.jobId,sourceHead:proof.sourceHead,originalJobConclusion:job.conclusion,step:proof.step,completedAt:step.completed_at,reexecuted:false};
}
/** The original complete application extraction is retained. Changed controls
 * are still analyzed by the current CodeQL job; findings are not disposed here. */
export async function verifyOriginalApplicationSast(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.applicationSastReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.applicationSastReuse));assert(process.env.GH_TOKEN);
 assert.equal(git('rev-parse','HEAD:server-version'),proof.serverVersionTree);
 assert.equal(git('rev-parse',proof.sourceHead+':server-version'),proof.serverVersionTree);
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official original SAST metadata inaccessible');const job=await response.json();
 assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha),'Original SAST source differs');assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original application SAST expired');
 for(const name of ['bound personal tracking SAST without extending the inline expression','initialize CodeQL','analyze with CodeQL'])assert.equal(job.steps.find(s=>s.name===name)?.conclusion,'success','Original application SAST step failed');
 const original=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});for(const path of proof.paths)assert(original.includes("'"+path+"'"),'Original extraction path missing');
 return {status:'ADMITTED_APPLICATION_SAST_ONLY',runId:proof.runId,jobId:proof.jobId,sourceHead:proof.sourceHead,executionHead:proof.executionHead,serverVersionTree:proof.serverVersionTree,paths:proof.paths,reexecuted:false,findingsDispositionChanged:false};
}
function nativeSourceInput(source){return source.slice(source.indexOf('\nexport function prepareMainSchema('),source.lastIndexOf("\nif(process.argv[1]"));}
function qualificationJobInput(workflow){return workflow.slice(workflow.indexOf('  personal-tracking:\n'),workflow.indexOf('  merge-gate:\n')).split('\n').filter(line=>!line.includes("if: ${{ !fromJSON(needs.scope.outputs.personal_tracking_plan || '{}').qualificationReuse")).join('\n');}
export async function verifyOriginalQualification(plan,fetcher=fetch,now=Date.now()){
 const proof=plan.qualificationReuse;assert(proof&&JSON.stringify(proof)===JSON.stringify(binding.qualificationReuse));assert(process.env.GH_TOKEN);
 assert.equal(git('rev-parse',proof.sourceHead+':server-version'),proof.serverVersionTree);
 if(!proof.nativeOnly)assert.equal(git('rev-parse','HEAD:server-version'),proof.serverVersionTree);
 for(const path of ['server-version/backend/prisma','server-version/backend/package.json','server-version/backend/package-lock.json'])assert.equal(git('rev-parse','HEAD:'+path),git('rev-parse',proof.sourceHead+':'+path),'Original native schema/tool input changed: '+path);
 const original=execFileSync('git',['show',proof.sourceHead+':.github/scripts/personal-tracking-ready.mjs'],{encoding:'utf8'}),current=readFileSync(new URL(import.meta.url),'utf8');
 assert.equal(nativeSourceInput(current),nativeSourceInput(original),'Native qualification code changed');
 const originalBinding=JSON.parse(execFileSync('git',['show',proof.sourceHead+':.github/scripts/personal-tracking-ready.json'],{encoding:'utf8'}));
 const baselineSchema=git('rev-parse',binding.base+':server-version/backend/prisma');
 if(proof.candidateAsBaseline){assert.equal(proof.nativeOnly,true,'Candidate state admits native-only evidence');assert.equal(baselineSchema,git('rev-parse',proof.sourceHead+':server-version/backend/prisma'),'Qualified candidate state differs from current base; no-migration reuse refused');}
 else assert.equal(baselineSchema,git('rev-parse',originalBinding.base+':server-version/backend/prisma'),'Original native main schema changed');
 const workflow=readFileSync('.github/workflows/ci.yml','utf8'),originalWorkflow=execFileSync('git',['show',proof.sourceHead+':.github/workflows/ci.yml'],{encoding:'utf8'});assert.equal(qualificationJobInput(workflow),qualificationJobInput(originalWorkflow),'Original tool/qualification job input changed');
 const response=await fetcher('https://api.github.com/repos/'+binding.repository+'/actions/jobs/'+proof.jobId,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert(response.ok,'Official successful qualification metadata inaccessible: '+response.status);const job=await response.json();
 assert.equal(job.id,proof.jobId);assert.equal(job.run_id,proof.runId);assert([proof.sourceHead,proof.executionHead].includes(job.head_sha));assert.equal(job.name,'personal tracking / original evidence and native migration');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=-300000&&age<=proof.maximumAgeHours*3600000,'Original qualification expired');
 for(const name of ['admit exact original local reporters without application replay','install locked native migration tools','real nonempty main upgrade and native dump restore',...(proof.nativeOnly?[]:['install frontend tools and audit locked inputs','actual frontend app types and affected source lint'])])assert.equal(job.steps.find(s=>s.name===name)?.conclusion,'success','Original qualification step missing or failed: '+name);
 return {status:proof.nativeOnly?'ADMITTED_NATIVE_QUALIFICATION_ONLY':'ADMITTED_COMPLETE_NATIVE_FRONTEND_QUALIFICATION',runId:proof.runId,jobId:proof.jobId,sourceHead:proof.sourceHead,executionHead:proof.executionHead,reexecuted:false,base:binding.base,originalServerVersionTree:proof.serverVersionTree,nativeSchemaTree:git('rev-parse','HEAD:server-version/backend/prisma'),candidateAsBaseline:proof.candidateAsBaseline===true,frontendAdmitted:!proof.nativeOnly};
}
export function prepareMainSchema(temporary){
 const file=resolve(temporary,'main-schema.tar');
 execFileSync('git',['archive','--format=tar','--output',file,binding.base,'server-version/backend/prisma']);
 execFileSync('tar',['-xf',file,'-C',temporary]);
 return resolve(temporary,'server-version/backend/prisma/schema.prisma');
}
/** Synthetic old rows honor the existing LINKED_WAVES disclosure gate. */
export function nativeSurveyFixtureSql({owner,id,participant,wave,publication,attempt,final,digest}){
 return `INSERT INTO survey_projects(id,owner_user_id,title,collection_mode,status) VALUES ('${id}','${owner}','native upgrade sentinel','LINKED_WAVES','ACTIVE');
   INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version) VALUES ('${publication}','${id}','${digest}','{"schemaVersion":1,"synthetic":true}',1,1);
   INSERT INTO survey_waves(id,project_id,publication_id,ordinal,title,status,consent_text,linkage_notice_confirmed) VALUES ('${wave}','${id}','${publication}',1,'T1','CLOSED','Synthetic isolated schema preservation fixture',true);
   INSERT INTO survey_participants(id,project_id,research_code,credential_hash) VALUES ('${participant}','${id}','R-SYNTHETIC','${digest}');
   INSERT INTO survey_wave_attempts(id,project_id,wave_id,participant_id,status,completed_at) VALUES ('${attempt}','${id}','${wave}','${participant}','COMPLETED',CURRENT_TIMESTAMP);
   INSERT INTO survey_wave_finals(id,attempt_id,project_id,wave_id,publication_id,submission_id,payload_hash,definition_digest,results_cipher,results_hash) VALUES ('${final}','${attempt}','${id}','${wave}','${publication}','${randomUUID()}','${digest}','${digest}','synthetic-opaque-old-report','${digest}');`;
}
/** Nonempty opaque pre-migration records; no application/scoring replay. */
export function nativeTrainingFixtureSql({owner,id,trackingId,attempt}){
 return `INSERT INTO composite_assessments(id,code,name,created_by,status,updated_at,report_package_key,report_package_version,report_package_profile,report_package_snapshot_encrypted) VALUES
  ('${id}','native-old-${id}','Synthetic old publication','${owner}','PUBLISHED',clock_timestamp(),'synthetic-legacy-package','1.0.0','research','synthetic-opaque-old-report-definition'),
  ('${trackingId}','native-new-${trackingId}','Synthetic tracked draft','${owner}','DRAFT',clock_timestamp(),NULL,NULL,NULL,NULL);
  INSERT INTO composite_assessment_attempts(id,composite_assessment_id,user_id,participant_key,status,completed_at,delivery_mode)
  VALUES('${attempt}','${id}','${owner}','native-old:${attempt}','COMPLETED',clock_timestamp(),'LEGACY');`;
}
export function nativeTrainingFactsSql(id,attempt){return `SELECT jsonb_build_object(
 'publication',(SELECT to_jsonb(p)-ARRAY['personal_tracking_baseline_id','personal_tracking_ordinal','personal_tracking'] FROM composite_assessments p WHERE id='${id}'),
 'attempt',(SELECT to_jsonb(a)-'personal_changes_snapshots' FROM composite_assessment_attempts a WHERE id='${attempt}'))::text;`;}
/** Minimal valid old Run graph. Opaque SQL sentinel, not an application FINAL. */
export function nativeTeacherFixtureSql({owner,id,trackingId,attempt,organization,membership,track,actor,relationship,digest}){
 return `INSERT INTO organizations(id,name,created_by_user_id,product_domain) VALUES('${organization}','Synthetic native Teacher schema fixture','${owner}','SCHOOL');
 INSERT INTO organization_memberships(id,organization_id,user_id,org_role) VALUES('${membership}','${organization}','${owner}','ORG_ADMIN');
 INSERT INTO assessment_runs(id,organization_id,name,status,created_by_user_id,published_at) VALUES
 ('${id}','${organization}','Opaque old completed run','PUBLISHED','${owner}',clock_timestamp()),
 ('${trackingId}','${organization}','Synthetic new tracked draft','DRAFT','${owner}',NULL);
 INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy,frozen_resource_policy,resource_policy_hash)
 VALUES('${track}','${organization}','${id}','SCALE','synthetic-schema-source','1.0.0','{}','{"synthetic":true}','${digest}');
 INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,actor_role,snapshot_payload,snapshot_hash)
 VALUES('${actor}','${organization}','${id}','ORG_MEMBER','${owner}','${membership}','TEACHER','{"synthetic":true}','${digest}');
 INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash)
 VALUES('${relationship}','${organization}','${id}','SELF','${actor}','${actor}','{"opaqueOldReport":"synthetic-schema-sentinel"}','${digest}');
 INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,respondent_actor_snapshot_id,relationship_snapshot_id,status,runtime_binding_kind,runtime_binding_ref,started_at,completed_at)
 VALUES('${attempt}','${organization}','${id}','${track}','${actor}','${actor}','${relationship}','COMPLETED','COMPOSITE_ATTEMPT','synthetic-opaque-runtime-${attempt}',clock_timestamp(),clock_timestamp());`;
}
export function nativeTeacherFactsSql(id,attempt){return `SELECT jsonb_build_object(
 'run',(SELECT to_jsonb(r)-ARRAY['personal_tracking_baseline_id','personal_tracking_ordinal','personal_tracking'] FROM assessment_runs r WHERE id='${id}'),
 'execution',(SELECT to_jsonb(e)-'personal_changes_snapshots' FROM assessment_run_executions e WHERE id='${attempt}'),
 'tracks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM assessment_run_tracks t WHERE run_id='${id}'),
 'actors',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM assessment_run_actor_snapshots a WHERE run_id='${id}'),
 'relationships',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM assessment_run_relationship_snapshots r WHERE run_id='${id}'))::text;`;}
function trackingSchemaSql({parent,attempt,check,index,trigger,snapshotTrigger,preserve}){return `SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN ('${parent}'::regclass,'${attempt}'::regclass) AND a.attname IN ('personal_tracking_baseline_id','personal_tracking_ordinal','personal_tracking','personal_changes_snapshots')),
 'checks',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('${parent}'::regclass,'${attempt}'::regclass) AND (conname='${check}' OR pg_get_constraintdef(oid) LIKE '%personal_changes_snapshots%')),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indexrelid='${index}'::regclass),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid,true) ORDER BY tgname) FROM pg_trigger WHERE tgname IN ('${trigger}','${snapshotTrigger}')),
 'functions',(SELECT jsonb_agg(pg_get_functiondef(oid) ORDER BY proname) FROM pg_proc WHERE proname IN ('${preserve}','preserve_personal_changes_snapshots')))::text;`;}
function trainingSchemaSql(){return trackingSchemaSql({parent:'composite_assessments',attempt:'composite_assessment_attempts',check:'personal_tracking_complete',index:'composite_personal_tracking_wave',trigger:'composite_personal_tracking_immutable',snapshotTrigger:'personal_changes_snapshots_append',preserve:'preserve_composite_personal_tracking'});}
function educationSchemaSql(){return trackingSchemaSql({parent:'assessment_runs',attempt:'assessment_run_executions',check:'education_tracking_complete',index:'education_personal_tracking_wave',trigger:'education_personal_tracking_immutable',snapshotTrigger:'education_personal_snapshots_append',preserve:'preserve_education_personal_tracking'});}
export function nativeTaskArtifactFixtureSql({owner,id,trackingId}){
 return `INSERT INTO reporting_task_artifacts(id,product,container_id,task_id,generated_by,payload_cipher,payload_hash,generated_at)
 VALUES('${id}','SURVEY','${trackingId}','${trackingId}','${owner}','synthetic-opaque-old-encrypted-artifact','${'a'.repeat(64)}','2026-10-30 00:00:00.123');`;
}
export function nativeTaskArtifactFactsSql(id){return `SELECT jsonb_build_object('id',id,'product',product,'container',container_id,'task',task_id,'owner',generated_by,'cipher',payload_cipher,'hash',payload_hash,'generatedAt',generated_at)::text FROM reporting_task_artifacts WHERE id='${id}';`;}
const groupArtifactGuards=(sql,database,id,owner,planId)=>{
 assert.equal(sql(database,`SELECT report_kind||':'||COALESCE(plan_id,'NULL') FROM reporting_task_artifacts WHERE id='${id}';`),'GROUP:NULL');
 assert.throws(()=>sql(database,`UPDATE reporting_task_artifacts SET payload_hash=payload_hash WHERE id='${id}';`),/reporting snapshot rows are immutable/);
 const insert=(kind,plan)=>`INSERT INTO reporting_task_artifacts(id,product,container_id,task_id,generated_by,payload_cipher,payload_hash,generated_at,report_kind,plan_id) VALUES('${randomUUID()}','SURVEY','${planId}','${planId}','${owner}','synthetic-only','${'a'.repeat(64)}',clock_timestamp(),'${kind}',${plan});`;
 assert.throws(()=>sql(database,insert('GROUP',`'${planId}'`)),/reporting_task_artifact_kind/);
 assert.throws(()=>sql(database,insert('GROUP_LONGITUDINAL','NULL')),/reporting_task_artifact_kind/);
};
async function nativeDatabase(){
 const service=process.env.PG_SERVICE;assert(service&&/^[a-zA-Z0-9_.-]+$/.test(service));
 const backend=resolve('server-version/backend'),temporary=mkdtempSync(resolve(tmpdir(),'personal-native-'));
 const names=['personal_tracking_upgrade_test','personal_tracking_restore_test'];
 const sql=(database,query)=>execFileSync('docker',['exec','-i',service,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','ptool','-d',database],{input:query,encoding:'utf8'}).trim();
 const database=name=>'postgresql://ptool:ptool123@127.0.0.1:5432/'+name+'?schema=public';
 const deploy=(schema,url)=>execFileSync(process.execPath,[resolve(backend,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:url},stdio:'inherit'});
 try{
  for(const name of names)sql('postgres','CREATE DATABASE '+name+';');
  deploy(prepareMainSchema(temporary),database(names[0]));
  const owner=randomUUID(),id=randomUUID(),participant=randomUUID(),wave=randomUUID(),publication=randomUUID(),attempt=randomUUID(),final=randomUUID(),trackingId=randomUUID(),digest='a'.repeat(64);
  const {PrismaClient}=createRequire(resolve(backend,'package.json'))('@prisma/client'),db=new PrismaClient({datasources:{db:{url:database(names[0])}}}),login='native-'+owner.replaceAll('-','').slice(0,20);
  try{await db.user.create({data:{id:owner,username:login,passwordHash:'synthetic-schema-fixture-not-a-login',role:'TEACHER',accountDomain:binding.slice==='training'?'TRAINING':binding.slice==='teacher'?'SCHOOL':'SURVEY'}});if(!['training','teacher'].includes(binding.slice))await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});}finally{await db.$disconnect()}
  // Nonempty old-schema SQL fixture, not a repeated application journey or a
  // claim of a newly accepted scientific FINAL. Opaque original bytes survive.
  sql(names[0],binding.slice==='group'?nativeTaskArtifactFixtureSql({owner,id,trackingId}):binding.slice==='teacher'?nativeTeacherFixtureSql({owner,id,trackingId,attempt,organization:randomUUID(),membership:randomUUID(),track:randomUUID(),actor:randomUUID(),relationship:randomUUID(),digest}):binding.slice==='training'?nativeTrainingFixtureSql({owner,id,trackingId,attempt}):nativeSurveyFixtureSql({owner,id,participant,wave,publication,attempt,final,digest}));
  const facts=db=>sql(db,binding.slice==='group'?nativeTaskArtifactFactsSql(id):binding.slice==='teacher'?nativeTeacherFactsSql(id,attempt):binding.slice==='training'?nativeTrainingFactsSql(id,attempt):`SELECT jsonb_build_object('publication',(SELECT to_jsonb(p) FROM survey_publications p WHERE id='${publication}'),'final',(SELECT to_jsonb(f) FROM survey_wave_finals f WHERE id='${final}'),'attempt',(SELECT to_jsonb(a) FROM survey_wave_attempts a WHERE id='${attempt}'))::text;`);
  const before=facts(names[0]);
  deploy(resolve(backend,'prisma/schema.prisma'),database(names[0]));assert.equal(facts(names[0]),before,'Old publication/FINAL/attempt changed');
  if(binding.slice==='group'){
   const beforeMigrations=execFileSync('git',['ls-tree','--name-only',binding.base+':server-version/backend/prisma/migrations'],{encoding:'utf8'}).trim().split('\n').filter(n=>/^\d/.test(n));
   const applied=sql(names[0],`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name;`).split('\n');
   assert.deepEqual(applied.filter(n=>!beforeMigrations.includes(n)),binding.addedMigrations);
   groupArtifactGuards(sql,names[0],id,owner,trackingId);
   if(binding.nativeProduct==='SCHOOL'){const guard=sql(names[0],`SELECT pg_get_functiondef('protect_education_private_registered_identity()'::regprocedure);`);for(const text of ["origin->>'schemaVersion'='1'","origin->>'schemaVersion'='2'",'private-scale:SCHOOL:'])assert(guard.includes(text),'School source identity guard missing: '+text);}
   sql(names[0],`INSERT INTO reporting_task_artifacts(id,product,container_id,task_id,generated_by,payload_cipher,payload_hash,generated_at,report_kind,plan_id) VALUES('${trackingId}','${binding.nativeProduct??'SURVEY'}','${trackingId}','${trackingId}','${owner}','synthetic-opaque-longitudinal','${digest}',clock_timestamp(),'GROUP_LONGITUDINAL','${trackingId}');`);
  }else if(binding.slice==='teacher'){
   assert.equal(sql(names[0],`SELECT (personal_tracking IS NULL)::text FROM assessment_runs WHERE id='${id}';`),'true');
   assert.equal(sql(names[0],`SELECT personal_changes_snapshots::text FROM assessment_run_executions WHERE id='${attempt}';`),'{}');
   assert.throws(()=>sql(names[0],`UPDATE assessment_runs SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,personal_tracking='{}' WHERE id='${id}';`),/Published education tracking is immutable/);
   sql(names[0],`UPDATE assessment_runs SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,personal_tracking='{"synthetic":true}',status='PUBLISHED' WHERE id='${trackingId}';`);
   assert.throws(()=>sql(names[0],`UPDATE assessment_runs SET personal_tracking='{}' WHERE id='${trackingId}';`),/Published education tracking is immutable/);
   sql(names[0],`UPDATE assessment_run_executions SET personal_changes_snapshots='{"t1":"synthetic-opaque-snapshot"}' WHERE id='${attempt}';`);
   assert.throws(()=>sql(names[0],`UPDATE assessment_run_executions SET personal_changes_snapshots='{}' WHERE id='${attempt}';`),/append-only/);
  }else if(binding.slice==='training'){
   assert.equal(sql(names[0],`SELECT (personal_tracking IS NULL)::text FROM composite_assessments WHERE id='${id}';`),'true');
   assert.equal(sql(names[0],`SELECT personal_changes_snapshots::text FROM composite_assessment_attempts WHERE id='${attempt}';`),'{}');
   assert.throws(()=>sql(names[0],`UPDATE composite_assessments SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,personal_tracking='{}' WHERE id='${id}';`),/Published personal tracking is immutable/);
   sql(names[0],`UPDATE composite_assessments SET personal_tracking_baseline_id=id,personal_tracking_ordinal=1,personal_tracking='{"synthetic":true}',status='PUBLISHED' WHERE id='${trackingId}';`);
   assert.throws(()=>sql(names[0],`UPDATE composite_assessments SET personal_tracking='{}' WHERE id='${trackingId}';`),/Published personal tracking is immutable/);
   sql(names[0],`UPDATE composite_assessment_attempts SET personal_changes_snapshots='{"t1":"synthetic-opaque-snapshot"}' WHERE id='${attempt}';`);
   assert.throws(()=>sql(names[0],`UPDATE composite_assessment_attempts SET personal_changes_snapshots='{}' WHERE id='${attempt}';`),/append-only/);
  }else{
  assert.equal(sql(names[0],`SELECT (longitudinal_plan IS NULL)::text FROM survey_projects WHERE id='${id}';`),'true');
  assert.equal(sql(names[0],`SELECT longitudinal_snapshots::text FROM survey_participants WHERE id='${participant}';`),'{}');
  sql(names[0],`UPDATE survey_projects SET longitudinal_plan='{"schemaVersion":1,"synthetic":true}' WHERE id='${id}';`);
  assert.throws(()=>sql(names[0],`UPDATE survey_projects SET longitudinal_plan='{}' WHERE id='${id}';`),/Published personal tracking plan is immutable/);
  assert.throws(()=>sql(names[0],`UPDATE survey_waves SET longitudinal_source_wave_id='different' WHERE id='${wave}';`),/Published personal tracking source is immutable/);
  }
  const dump=execFileSync('docker',['exec',service,'pg_dump','-U','ptool','-Fc',names[0]],{maxBuffer:64*1024*1024});
  execFileSync('docker',['exec','-i',service,'pg_restore','-U','ptool','--no-owner','--no-privileges','-d',names[1]],{input:dump});
  assert.equal(facts(names[1]),before,'Native restored facts changed');
  const schema=db=>binding.slice==='group'?sql(db,`SELECT jsonb_build_object('columns',(SELECT jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'default',column_default,'nullable',is_nullable,'udt',udt_name) ORDER BY ordinal_position) FROM information_schema.columns c WHERE table_schema='public' AND table_name='reporting_task_artifacts'),'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='reporting_task_artifacts'::regclass),'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE tablename='reporting_task_artifacts'),'trigger',(SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='reporting_task_artifacts'::regclass AND NOT tgisinternal),'privateSourceGuard',${binding.nativeProduct==='SCHOOL'?"pg_get_functiondef('protect_education_private_registered_identity()'::regprocedure)":'NULL'})::text;`):binding.slice==='teacher'?sql(db,educationSchemaSql()):binding.slice==='training'?sql(db,trainingSchemaSql()):execFileSync('docker',['exec',service,'pg_dump','-U','ptool','--schema-only','--table=public.survey_projects','--table=public.survey_waves','--table=public.survey_participants','--no-owner','--no-privileges',db],{encoding:'utf8',maxBuffer:64*1024*1024}).split('\n').filter(line=>!/^\\(?:un)?restrict /.test(line)&&!/^-- Dumped (?:from|by)/.test(line)).join('\n');
  assert.equal(schema(names[0]),schema(names[1]),'Native restored schema changed');
  if(binding.slice==='group'){
   groupArtifactGuards(sql,names[1],id,owner,trackingId);
   assert.equal(sql(names[1],`SELECT report_kind||':'||plan_id FROM reporting_task_artifacts WHERE id='${trackingId}';`),'GROUP_LONGITUDINAL:'+trackingId);
   assert.equal(sql(names[1],`SELECT product FROM reporting_task_artifacts WHERE id='${trackingId}';`),binding.nativeProduct??'SURVEY');
  }else if(binding.slice==='teacher'){
   assert.throws(()=>sql(names[1],`UPDATE assessment_runs SET personal_tracking='{}' WHERE id='${trackingId}';`),/Published education tracking is immutable/);
   assert.equal(sql(names[1],`SELECT personal_changes_snapshots->>'t1' FROM assessment_run_executions WHERE id='${attempt}';`),'synthetic-opaque-snapshot');
   assert.throws(()=>sql(names[1],`UPDATE assessment_run_executions SET personal_changes_snapshots='{}' WHERE id='${attempt}';`),/append-only/);
  }else if(binding.slice==='training'){
   assert.throws(()=>sql(names[1],`UPDATE composite_assessments SET personal_tracking='{}' WHERE id='${trackingId}';`),/Published personal tracking is immutable/);
   assert.equal(sql(names[1],`SELECT personal_changes_snapshots->>'t1' FROM composite_assessment_attempts WHERE id='${attempt}';`),'synthetic-opaque-snapshot');
   assert.throws(()=>sql(names[1],`UPDATE composite_assessment_attempts SET personal_changes_snapshots='{}' WHERE id='${attempt}';`),/append-only/);
  }else assert.throws(()=>sql(names[1],`UPDATE survey_projects SET longitudinal_plan='{}' WHERE id='${id}';`),/Published personal tracking plan is immutable/);
  return {status:'PASSED',base:binding.base,postgres:sql(names[0],'SHOW server_version;'),schemaFixture:'nonempty old-schema SQL, no application replay',oldFactsSHA256:hash(before),dumpSHA256:hash(dump),dumpBytes:dump.length,restoredFactsEqual:true,restoredSchemaEqual:true,addedMigrations:binding.addedMigrations,schemaScope:binding.slice==='group'?'task artifact kind/plan default, CHECK/index/immutability and nonempty old encrypted bytes; native full dump/restore':binding.slice==='teacher'?'new education columns, CHECKs, unique index, immutable/append-only triggers and functions on assessment_runs/assessment_run_executions; full database native restore; old Run graph facts retained':binding.slice==='training'?'new columns, CHECKs, unique index, triggers and functions on composite_assessments/composite_assessment_attempts; full database native restore; unrelated legacy DDL text is not requalified':'changed survey_projects, survey_waves, survey_participants tables, constraints, indexes and triggers; full database native restore',immutableGuards:true,dumpPublished:false};
 }finally{rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Formal qualification requires the existing Actions execution context');
 const phase=process.argv[2],plan=JSON.parse(process.env.PERSONAL_TRACKING_PLAN||'null');
 assert(plan&&plan.head===git('rev-parse','HEAD')&&!plan.draft);mkdirSync('personal-tracking-evidence',{recursive:true});
 if(phase==='admit'){const originals=admitOriginalReportsInChild();const [images,audit,frontendAudit,qualification]=await Promise.all([plan.imageReuse?verifyOriginalImages(plan):undefined,plan.backendAuditReuse?verifyOriginalBackendAudit(plan):undefined,plan.frontendAuditReuse?verifyOriginalFrontendAudit(plan):undefined,plan.qualificationReuse?verifyOriginalQualification(plan):undefined]);writeFileSync('personal-tracking-evidence/reused-originals.json',JSON.stringify({plan,...originals,...(images?{originalImages:images}:{}),...(audit?{originalBackendAudit:audit}:{}),...(frontendAudit?{originalFrontendAudit:frontendAudit}:{}),...(qualification?{originalQualification:qualification}:{})},null,2)+'\n');}
 else if(phase==='native')writeFileSync('personal-tracking-evidence/native-upgrade-restore.json',JSON.stringify({plan,...await nativeDatabase()},null,2)+'\n');
 else throw Error('Unknown qualification phase');
}
