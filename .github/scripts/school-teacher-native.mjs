// Bounded PR388 scenario. Historical School/SELF identities and proofs are never
// input to this lane. Activation and application evidence are still pending.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readNativeEvidenceBytes,verifyNativeEvidence} from './school-teacher-native-evidence.mjs';
export const NATIVE_BRANCH='feat/bundle-evc-profile-20261029';
export const PACKAGE_BRANCH='feat/education-package-runtime-20261029';
export const JDR_BRANCH='feat/teacher-jdr-bundle-20261030';
export const JDR_MARKER='.github/scripts/school-teacher-jdr-bindings.json';
export const PACKAGE_MARKER='.github/scripts/school-teacher-package-bindings.json';
export const isNativeBranch=branch=>[NATIVE_BRANCH,PACKAGE_BRANCH,JDR_BRANCH].includes(branch);
const markerFor=b=>b.branch===JDR_BRANCH?JDR_MARKER:b.branch===PACKAGE_BRANCH?PACKAGE_MARKER:NATIVE_MARKER;
export const NATIVE_MARKER='.github/scripts/school-teacher-native-bindings.json';
export const NATIVE_JOBS=['admission','frontend','backend-self','native-evidence','native-runtime','security'];
export const JDR_AUDIT={run:41031648227,head:'e73d3745d52656ed6557129caeb67c2376a998de',checkout:'aa2beaaf961a696a6eac1d1c54069664a0a03fd4',job:123982828487,artifact:12966606166,digest:'116e885203ccc038ae57ac1b45cf32286ce5c06639022d19528498f4ce4f34f7',bytes:2089};
const hash=x=>createHash('sha256').update(x).digest('hex');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export const nativeBinding=(branch=NATIVE_BRANCH)=>{assert(isNativeBranch(branch),'Unknown native branch');return JSON.parse(readFileSync(new URL(branch===JDR_BRANCH?'./school-teacher-jdr-bindings.json':branch===PACKAGE_BRANCH?'./school-teacher-package-bindings.json':'./school-teacher-native-bindings.json',import.meta.url)))};
export function nativeSastConfig(paths,b=null){
 const python=new Set(['.github/scripts/school-teacher-native-runtime.py','.github/scripts/school-teacher-native-runtime.test.py','.github/scripts/exact-candidate-runtime.py']);
 assert([...python].every(p=>paths.includes(p)),'Native Python extractor inputs missing');
 const reusedApplicationScan=b?.execution.sastContinuation===40980640181;
 return {paths:reusedApplicationScan?['.github/scripts','server-version/e2e','server-version/frontend/e2e','server-version/frontend/vite.config.ts']:['server-version/backend/src','server-version/frontend/src','.github/scripts',...Object.keys(b?.source??{}).filter(p=>p.startsWith('server-version/e2e/'))],
  'paths-ignore':paths.filter(p=>p.startsWith('.github/scripts/')&&p.endsWith('.py')&&!python.has(p)).sort(),queries:[{uses:'security-extended'}]};
}
export function requireNativeQualification(b){
 assert.equal(b.candidate,'native-bundle');
 assert(isNativeBranch(b.branch),'Unknown native branch');assert.equal(b.repository,'caohuibj/eduK12-new-version');
 assert.equal(b.enabled,true,'Native Bundle activation pending independent review');
 assert.equal(b.review.status,'INDEPENDENTLY_REVIEWED','Native controls not independently reviewed');
 assert.match(b.review.recordSha256||'',/^[a-f0-9]{64}$/);
 assert.deepEqual(b.requiredJobs,NATIVE_JOBS);
 if(b.branch===PACKAGE_BRANCH&&b.execution.officialContinuation===40977943858){assert.deepEqual(b.execution.buildComponents,[]);assert.deepEqual(b.execution.auditComponents,[])}else{
 assert.deepEqual(b.execution.buildComponents,['frontend','backend']);
 assert.deepEqual(b.execution.auditComponents,['frontend','backend']);}
 assert.equal(b.execution.historicalOfficialReuse,false,'Historical School producer identities forbidden');
 assert.deepEqual(b.execution.runtime,{node:'node:24.21.0-bookworm-slim',nginx:'nginx:1.31.6-alpine3.24-slim',trivy:'0.70.0',severity:['CRITICAL','HIGH'],ignoreUnfixed:true});
 if(b.execution.officialAuditReuse!==undefined){assert.equal(b.branch,JDR_BRANCH);assert.equal(b.execution.officialAuditReuse,JDR_AUDIT.run);}
 return true;
}
export function verifyJdrAuditReuse(b,run,job,read,now=Date.now()){
 assert.equal(b.branch,JDR_BRANCH);assert.equal(b.execution.officialAuditReuse,JDR_AUDIT.run);
 assert.equal(run.id,JDR_AUDIT.run);assert.equal(run.head_sha,JDR_AUDIT.head);assert.equal(run.head_branch,JDR_BRANCH);
 assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(job.id,JDR_AUDIT.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'school-teacher / security');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 assert(job.steps.some(s=>s.name==='verify the fixed official HIGH CRITICAL audits or execute fresh inputs'&&s.conclusion==='success'));
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000,'Official audit outside existing 24-hour reuse window');
 const inputs=['.github/workflows/ci-school-teacher.yml','.npmrc',...['frontend','backend'].flatMap(k=>['package.json','package-lock.json','.npmrc'].map(p=>'server-version/'+k+'/'+p))];
 assert.equal(read('diff','--name-only',JDR_AUDIT.head,'HEAD','--',...inputs),'','Audit dependencies or execution inputs changed');
 const old=read('show',JDR_AUDIT.head+':.github/scripts/school-teacher-checks.mjs'),current=read('show','HEAD:.github/scripts/school-teacher-checks.mjs');
 for(const [start,end]of [['const auditSeverities=','export function requireReviewedCase'],['export function auditComponents(','export function verifyExecutionInputs'],['export function verifyCompletedAudit(','export function verifySastDelta']]){
  const part=s=>{const a=s.indexOf(start),z=s.indexOf(end,a);assert(a>=0&&z>a,'Audit policy boundaries missing');return s.slice(a,z)};
  assert.equal(part(current),part(old),'Audit command, threshold or receipt policy changed');
 }
 return {originalRun:run.id,originalJob:job.id,originalHead:run.head_sha,originalCheckout:JDR_AUDIT.checkout,originalJobConclusion:job.conclusion,inputsUnchanged:true,auditExecuted:false};
}
export function validateNativeBoundary(b,o,{draftPreflight=false}={}){
 assert.equal(b.candidate,'native-bundle');assert(isNativeBranch(b.branch),'Unknown native branch');
 assert.equal(o.repository,b.repository);assert(['pull_request','push'].includes(o.event));
 assert.equal(o.branch,o.event==='push'?'main':b.branch);
 assert.equal(o.forceFull,false);assert.equal(o.draft,draftPreflight);
 if(draftPreflight)assert.equal(o.event,'pull_request');
 for(const key of ['base','productHead','productTree','frontendTree','backendTree'])assert(sha(b[key]),'Missing '+key);
 assert.equal(o.base,b.base);assert(sha(o.sourceHead));assert(sha(o.checkoutHead));
 assert(sha(o.sourceTree));assert.equal(o.sourceTree,o.checkoutTree,'PR source and merge-preview trees differ');
 assert.equal(o.productTree,b.productTree);assert.equal(o.frontendTree,b.frontendTree);assert.equal(o.backendTree,b.backendTree);
 const files={...b.source,...b.controls};
 assert.equal(Object.keys(files).length,Object.keys(b.source).length+Object.keys(b.controls).length,'Overlapping source/control paths');
 assert(Object.keys(b.source).length>0);assert(Object.hasOwn(b.controls,markerFor(b)));
 assert.equal(o.entries.length,Object.keys(files).length,'Complete raw diff required');
 assert.equal(new Set(o.entries.map(e=>e.file)).size,o.entries.length);
 for(const e of o.entries){
  assert(Object.hasOwn(files,e.file),'Unknown native path '+e.file);
  const expected=files[e.file];
  assert(['A','M'].includes(e.status));assert.equal(e.newMode,'100644');
  assert.equal(e.oldMode,e.status==='A'?'000000':'100644');
  assert.equal(e.oldBlob,expected.before||'0'.repeat(40));assert(sha(e.newBlob));
  if(e.file!==markerFor(b)){assert(sha(expected.after));assert.equal(e.newBlob,expected.after,'Changed native input '+e.file);}
 }
 assert(Object.keys(b.protectedInputs).length>10,'Runtime/config closure missing');
 assert.deepEqual(o.protectedInputs,b.protectedInputs,'Locked dependency/schema/runtime/control dependency drift');
 return {schema:1,route:'school-teacher',candidate:'native-bundle',base:b.base,head:o.checkoutHead,sourceHead:o.sourceHead,sourceTree:o.sourceTree,
  product:b.productHead,productTree:b.productTree,...(b.branch===JDR_BRANCH?{jdrDemo:true}:{}),...(b.branch===PACKAGE_BRANCH?{publicPackage:true,...(b.execution.officialContinuation===40977943858?{continuation:'package-browser-only'}:{})}:{}),components:{frontend:b.frontendTree,backend:b.backendTree},...(o.event==='push'?{postMerge:true}:{}),...(draftPreflight?{preflightOnly:true}:{}),requiredJobs:draftPreflight?['admission']:NATIVE_JOBS,changes:o.entries,
  inputsSha256:hash(JSON.stringify({source:b.source,controls:b.controls,protectedInputs:b.protectedInputs,execution:b.execution}))};
}
export function nativePlan(entries,base,head,read,env,b){
 const branch=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 const markers=[NATIVE_MARKER,PACKAGE_MARKER,JDR_MARKER].filter(p=>entries.some(e=>e.file===p)),known=isNativeBranch(branch);
 assert(markers.length<=1,'Mixed native candidate markers');
 const marker=markers.length===1;
 b??=nativeBinding(known?branch:markers[0]===JDR_MARKER?JDR_BRANCH:markers[0]===PACKAGE_MARKER?PACKAGE_BRANCH:NATIVE_BRANCH);
 if(!known&&!marker)return null;
 assert.notEqual(env.CI_EVENT,'workflow_dispatch','Native manual/full/probe fallback forbidden');
 assert(branch===b.branch||branch==='main'&&env.CI_EVENT==='push','Native marker on wrong branch');
 assert(marker,'Native marker missing; no platform fallback');
 assert(!entries.some(e=>['.github/scripts/school-teacher-bindings.json','.github/scripts/school-teacher-self-bindings.json'].includes(e.file)),'Mixed historical/native scenarios');
 // Draft runs only the closed control graph, never unchanged application
 // compile/tests. This is no approval of the pending application evidence.
 const draftPreflight=env.CI_EVENT==='pull_request'&&env.CI_IS_DRAFT==='true';
 if(!draftPreflight)requireNativeQualification(b);
 const source=env.CI_EVENT==='push'?read('rev-parse',head+'^2'):env.CI_SOURCE_HEAD;
 if(env.CI_EVENT==='push')assert.equal(read('rev-parse',head+'^1'),base,'Only exact normal main merge may be observed');
 const observed={event:env.CI_EVENT,branch,repository:env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,draft:env.CI_IS_DRAFT==='true',forceFull:env.CI_FORCE_FULL==='true',base,
  sourceHead:source,checkoutHead:head,sourceTree:read('rev-parse',source+'^{tree}'),checkoutTree:read('rev-parse',head+'^{tree}'),productTree:read('rev-parse',b.productHead+'^{tree}'),
  frontendTree:read('rev-parse',head+':server-version/frontend'),backendTree:read('rev-parse',head+':server-version/backend'),
  protectedInputs:Object.fromEntries(Object.keys(b.protectedInputs).map(p=>[p,read('rev-parse',head+':'+p)])),
  entries:entries.map(e=>({...e,oldBlob:e.oldMode==='000000'?'0'.repeat(40):read('rev-parse',base+':'+e.file),newBlob:read('rev-parse',head+':'+e.file)}))};
 return validateNativeBoundary(b,observed,{draftPreflight});
}
export function requireNativeEvidence(b,helpers){const result=verifyNativeEvidence(readNativeEvidenceBytes(b),b,helpers);assert.equal(result.pendingFinalReview,false,'Native supplement not admitted until final candidate review');return result}
export function requireNativeProducerAttempt(attempt){
 assert.equal(attempt,'1','Native producer retry requires diagnosis and an exact continuation; never rebuild an existing successful artifact by default');
}
export async function nativeOfficialApi(path,env=process.env){
 assert(env.GH_TOKEN,'Official read token required');
 const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version'+path,{headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Native main observation unavailable');return r.json();
}
export async function observeNativeMain(plan,api=nativeOfficialApi){
 assert.equal(plan.candidate,'native-bundle');assert.equal(plan.postMerge,true);assert.notEqual(plan.preflightOnly,true);assert.deepEqual(plan.requiredJobs,NATIVE_JOBS);
 const prNumber=plan.jdrDemo?405:plan.publicPackage?392:388,branch=plan.jdrDemo?JDR_BRANCH:plan.publicPackage?PACKAGE_BRANCH:NATIVE_BRANCH;
 const pr=await api('/pulls/'+prNumber);
 assert.equal(pr.number,prNumber);assert.equal(pr.merged,true);assert.equal(pr.state,'closed');assert.equal(pr.draft,false);
 assert.equal(pr.head.ref,branch);assert.equal(pr.head.repo.full_name,'caohuibj/eduK12-new-version');assert.equal(pr.head.sha,plan.sourceHead);
 assert.equal(pr.base.ref,'main');assert.equal(pr.base.repo.full_name,'caohuibj/eduK12-new-version');assert.equal(pr.merge_commit_sha,plan.head);
 const listing=await api('/actions/workflows/ci.yml/runs?event=pull_request&head_sha='+plan.sourceHead+'&per_page=100');
 assert(listing.total_count>0&&listing.total_count<=100);assert.equal(listing.workflow_runs.length,listing.total_count);
 // Inspect the newest run for this exact source, never search backwards for
 // an older green result when a newer attempt is pending or failed.
 const run=[...listing.workflow_runs].sort((a,b)=>b.id-a.id)[0];
 assert.equal(run.head_sha,plan.sourceHead);assert.equal(run.head_branch,branch);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(run.repository.full_name,'caohuibj/eduK12-new-version');assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert(Number.isSafeInteger(run.id)&&run.id>0&&Number.isSafeInteger(run.run_attempt)&&run.run_attempt>0);
 const rows=[];let total;
 for(let page=1;page<=2;page++){
  const response=await api('/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page='+page);
  assert(Number.isSafeInteger(response.total_count)&&response.total_count>0&&response.total_count<=200);
  total??=response.total_count;assert.equal(response.total_count,total);rows.push(...response.jobs);if(rows.length===total)break;
 }
 assert.equal(rows.length,total);assert.equal(new Set(rows.map(j=>j.id)).size,rows.length);
 const required=['classify changed content',...NATIVE_JOBS.map(id=>'school-teacher / '+id),'school-teacher / qualified','codeql (javascript/typescript SAST)','merge gate / ready PR'];
 const jobs=required.map(name=>{
  const found=rows.filter(j=>j.name===name);assert.equal(found.length,1,'Missing/ambiguous exact native job '+name);const j=found[0];
  assert.equal(j.run_id,run.id);assert.equal(j.head_sha,plan.sourceHead);assert.equal(j.run_attempt,run.run_attempt);assert.equal(j.status,'completed');assert.equal(j.conclusion,'success',name+' did not qualify');
  return {id:j.id,name:j.name};
 });
 return {kind:'EXACT_MERGED_PR_OBSERVATION',pr:prNumber,sourceHead:plan.sourceHead,mergeHead:plan.head,runId:run.id,attempt:run.run_attempt,jobs,applicationExecuted:false};
}
