import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import observerReuse from './school-teacher-observer-reuse.cjs';
import {nativeBinding,nativePlan,requireNativeQualification,NATIVE_BRANCH,NATIVE_MARKER,NATIVE_JOBS} from './school-teacher-native.mjs';
export const BRANCH='work/school-teacher-review-20261022', REPOSITORY='caohuibj/eduK12-new-version';
export const SELF_BRANCH='release/education-observer-native-20261029';
export const SELF_BASE='f39a00f12fed2e1b8e1d3cc45185969262925ed8';
export const SELF_MARKER='.github/scripts/school-teacher-self-bindings.json';
export const JOBS=['admission','frontend','connected','security'];
export const SELF_JOBS=['admission','frontend','backend-self','postgres-self','browser-self','security'];
const allJobs=[...new Set([...JOBS,...SELF_JOBS,...NATIVE_JOBS])];
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export const binding=(env=process.env)=>{
 const branch=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(branch===NATIVE_BRANCH||env.PLAN&&JSON.parse(env.PLAN).candidate==='native-bundle')return nativeBinding();
 const before=env.CI_BASE_SHA||(env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8')).before:null);
 if(branch==='main'&&before===nativeBinding().base)return nativeBinding();
 const selected=branch===SELF_BRANCH||branch==='main'&&before===SELF_BASE||env.PLAN&&JSON.parse(env.PLAN).candidate==='education-self';
 return JSON.parse(readFileSync(new URL(selected?'./school-teacher-self-bindings.json':'./school-teacher-bindings.json',import.meta.url)));
};
const candidateBranch=b=>{assert([BRANCH,SELF_BRANCH].includes(b.branch),'Unknown School candidate');return b.branch};
export const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
export function rawEntries(bytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length&&bytes.at(-1)===0,'Empty/malformed diff');
 const text=bytes.toString('utf8');assert(Buffer.from(text).equals(bytes));
 const a=text.slice(0,-1).split('\0');assert.equal(a.length%2,0);const paths=new Set(),rows=[];
 for(let i=0;i<a.length;i+=2){const m=/^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/.exec(a[i]);assert(m);
  const file=a[i+1];assert(file&&!file.startsWith('/')&&!file.split('/').includes('..')&&!paths.has(file));paths.add(file);
  rows.push({file,oldMode:m[1],newMode:m[2],oldBlob:m[3],newBlob:m[4],status:m[5]});}
 return rows;
}
export const rawDiffFingerprint=bytes=>{rawEntries(bytes);return sha256(bytes)};
export function requireFreshQualification(b){
 assert.equal(b.qualification,'fresh-integrated-authoring');
 assert.equal(b.base,candidateBranch(b)===SELF_BRANCH?SELF_BASE:'ea887330b6eba11013a00e294d5aff84ecfbaf36');
 assert.equal(b.frontendBuildDecision,'fresh-current-source');
 assert.equal(b.backendBuildDecision,'fresh-current-source');
 assert.equal(b.execution.finalized,true);
 assert.equal(b.execution.frontend.types,true);
 for(const component of ['frontend','backend'])assert(b.execution[component].batches.length>0,'Fresh affected batches required');
 assert.deepEqual(b.execution.auditComponents,['frontend','backend']);
 return true;
}
export function requireSchoolQualification(b){
 if(b.candidate==='native-bundle')return requireNativeQualification(b);
 if(b.qualification!==observerReuse.mode)return requireFreshQualification(b);
 assert.equal(b.branch,SELF_BRANCH);assert.equal(b.base,SELF_BASE);
 assert.equal(b.frontendTree,observerReuse.fixed.frontendTree);assert.equal(b.backendTree,observerReuse.fixed.currentBackendTree);
 assert.equal(b.frontendBuildDecision,'fixed-official-observer-build');assert.equal(b.backendBuildDecision,'fresh-main-tooling-integration');
 assert.deepEqual(b.execution.officialContinuation,{run:observerReuse.fixed.run,head:observerReuse.fixed.head,checkout:observerReuse.fixed.checkout});
 assert.equal(b.execution.finalized,true);return true;
}
export function validateCandidate(b,o,evidenceBytes){
 assert.equal(b.enabled,true,'Candidate not independently frozen');assert.deepEqual(b.blockers,[]);
 const branch=candidateBranch(b);assert(['pull_request','push'].includes(o.event));assert.equal(o.branch,o.event==='push'?'main':branch);assert.equal(o.repository,REPOSITORY);
 assert.equal(o.draft,false);assert.equal(o.forceFull,false);
 for(const key of ['base','productHead','frontendTree','backendTree'])assert(sha(b[key]),'Missing '+key);
 assert.equal(o.base,b.base);assert(sha(o.sourceHead));assert(sha(o.checkoutHead));assert(sha(o.sourceTree));
 assert.equal(o.checkoutTree,o.sourceTree,'Actual PR source differs from checkout');
 assert.equal(o.frontendTree,b.frontendTree);assert.equal(o.backendTree,b.backendTree);
 assert.equal(o.productFrontendTree,b.frontendTree);assert.equal(o.productBackendTree,b.backendTree);
 const source=b.source,controls=b.controlBefore;assert(source&&controls);assert(Object.keys(source).length>0);
 if(branch===SELF_BRANCH){
  assert.deepEqual(Object.keys(b.controlAfter).sort(),Object.keys(controls).filter(path=>path!==SELF_MARKER).sort(),'Every non-self-referential control must be frozen');
 }
 const allowed=new Set([...Object.keys(source),...Object.keys(controls)]);
 assert.equal(allowed.size,Object.keys(source).length+Object.keys(controls).length,'Overlapping paths');
 assert.equal(o.entries.length,allowed.size,'Complete raw diff required');assert.equal(new Set(o.entries.map(e=>e.file)).size,o.entries.length);
 for(const e of o.entries){assert(allowed.has(e.file),'Unknown path '+e.file);assert.equal(e.newMode,'100644');
  assert((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'),'Mode/delete/rename refused');
  const expected=source[e.file];const before=expected?expected.before:controls[e.file];
  assert.equal(e.oldBlob,before||'0'.repeat(40),'Baseline blob changed');
  if(expected){assert(sha(expected.after));assert.equal(e.newBlob,expected.after,'Product blob changed');}
  else if(branch===SELF_BRANCH&&e.file!==SELF_MARKER){assert(sha(b.controlAfter[e.file]));assert.equal(e.newBlob,b.controlAfter[e.file],'Control blob changed');}
 }
 assert.match(b.evidenceSha256||'',/^[a-f0-9]{64}$/);assert.equal(sha256(evidenceBytes),b.evidenceSha256);
 assert.equal(b.review.completed,true,'Final control review required');assert.equal(b.review.originalExecutionSigned,false);
 const requiredJobs=branch===SELF_BRANCH?SELF_JOBS:JOBS;
 assert.deepEqual(b.requiredJobs,requiredJobs);if([observerReuse.mode,'fresh-integrated-authoring'].includes(b.qualification)){requireSchoolQualification(b)}else{
 assert.equal(b.qualification,undefined,'Unknown qualification mode');
 assert.equal(b.frontendBuildDecision,'fixed-run15-frontend-build');
 // Frontend reuses the exact verified run15 build; backend retains its fixed producer identity.
 assert.equal(b.backendBuildDecision,'fixed-official-backend-build','Only the fixed official backend producer may qualify; no fresh fallback');
 assert(b.backendBuildReason&&b.backendBuildInputsChanged.length>0);
 }
 assert.equal(b.execution.finalized,true,'Final per-check selections required');
 return {schema:1,route:'school-teacher',...(branch===SELF_BRANCH?{candidate:'education-self',browserMode:'SELF_COMPOSITION'}:{}),...(b.qualification===observerReuse.mode?{continuation:'observer-run2'}:{}),base:b.base,head:o.checkoutHead,sourceHead:o.sourceHead,sourceTree:o.sourceTree,
  product:b.productHead,components:{frontend:b.frontendTree,backend:b.backendTree},requiredJobs,changes:o.entries};
}
export function observedCandidate(b,env=process.env){
 const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8')),pr=event.pull_request;assert(pr,'PR event required');
 const head=git('rev-parse','HEAD');assert.equal(head,env.GITHUB_SHA);
 assert.equal(git('diff','--name-only','HEAD','--','server-version','.github'),'','Dirty tracked source');
 const entries=rawEntries(execFileSync('git',['diff','--no-ext-diff','--no-textconv','--no-renames','--raw','-z','--abbrev=40',pr.base.sha,head]));
 return {event:env.GITHUB_EVENT_NAME,branch:pr.head.ref,repository:pr.head.repo.full_name,draft:pr.draft,forceFull:env.CI_FORCE_FULL==='true',base:pr.base.sha,
  sourceHead:pr.head.sha,checkoutHead:head,sourceTree:git('rev-parse',pr.head.sha+'^{tree}'),checkoutTree:git('rev-parse','HEAD^{tree}'),entries,
  frontendTree:git('rev-parse','HEAD:server-version/frontend'),backendTree:git('rev-parse','HEAD:server-version/backend'),
  productFrontendTree:git('rev-parse',b.productHead+':server-version/frontend'),productBackendTree:git('rev-parse',b.productHead+':server-version/backend')};
}
export function actualPlan(env=process.env){const b=binding(env);if(b.candidate==='native-bundle'){const o=observedCandidate(b,env);return nativePlan(o.entries,o.base,o.checkoutHead,git,{...env,CI_EVENT:env.GITHUB_EVENT_NAME,CI_HEAD_REF:o.branch,CI_PR_REPOSITORY:o.repository,CI_SOURCE_HEAD:o.sourceHead,CI_IS_DRAFT:String(o.draft)},b)}assert.equal(b.enabled,true,'DRAFT_DISABLED');return validateCandidate(b,observedCandidate(b,env),readFileSync(new URL('./school-teacher-evidence.json',import.meta.url)))}
export function requireSuccess(plan,needs){
 assert([JOBS,SELF_JOBS,NATIVE_JOBS,...(plan.candidate==='native-bundle'&&plan.preflightOnly===true?[['admission']]:[])].some(ids=>JSON.stringify(ids)===JSON.stringify(plan.requiredJobs)),'Unknown School job set');
 const keys=Object.keys(needs);assert(keys.every(id=>allJobs.includes(id)),'Unknown School dependency');
 for(const id of plan.requiredJobs)assert.equal(needs[id]?.result,'success',id+' not successful');
 for(const id of keys.filter(id=>!plan.requiredJobs.includes(id)))assert.equal(needs[id].result,'skipped','Unselected School job ran');
 return true;
}

export const marker='.github/scripts/school-teacher-bindings.json';
export function schoolTeacherPlan(entries,base,head,read=git,env=process.env,b,evidenceBytes){
 const branch=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(branch===NATIVE_BRANCH||entries.some(e=>e.file===NATIVE_MARKER))return nativePlan(entries,base,head,read,env,b);
 const self=entries.some(e=>e.file===SELF_MARKER),legacy=entries.some(e=>e.file===marker);
 assert(!(self&&legacy),'Ambiguous School candidates');
 if([BRANCH,SELF_BRANCH].includes(branch))assert.notEqual(env.CI_EVENT,'workflow_dispatch','No manual/full/probe fallback');
 if(!self&&!legacy){assert(![BRANCH,SELF_BRANCH].includes(branch),'School candidate marker missing; no legacy fallback');return null;}
 b??=binding({...env,CI_HEAD_REF:self?SELF_BRANCH:BRANCH});
 assert.equal(b.branch,self?SELF_BRANCH:BRANCH,'School marker/branch mismatch');
 assert.equal(b.enabled,true,'DRAFT_DISABLED');assert(['pull_request','push'].includes(env.CI_EVENT));
 const sourceHead=env.CI_EVENT==='pull_request'?env.CI_SOURCE_HEAD:head;
 const observed={event:env.CI_EVENT,branch,repository:env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,draft:env.CI_IS_DRAFT==='true',forceFull:env.CI_FORCE_FULL==='true',base,sourceHead,checkoutHead:head,
  sourceTree:read('rev-parse',sourceHead+'^{tree}'),checkoutTree:read('rev-parse',head+'^{tree}'),
  frontendTree:read('rev-parse',head+':server-version/frontend'),backendTree:read('rev-parse',head+':server-version/backend'),
  productFrontendTree:read('rev-parse',b.productHead+':server-version/frontend'),productBackendTree:read('rev-parse',b.productHead+':server-version/backend'),
  entries:entries.map(e=>({file:e.file,oldMode:e.oldMode,newMode:e.newMode,oldBlob:e.oldMode==='000000'?'0'.repeat(40):read('rev-parse',base+':'+e.file),newBlob:read('rev-parse',head+':'+e.file),status:e.status}))};
 return validateCandidate(b,observed,evidenceBytes??readFileSync(new URL('./school-teacher-evidence.json',import.meta.url)));
}
export function schoolTeacherOutputs(plan,acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)))){
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),...Object.fromEntries(['heavy_runner','light_runner','frontend_runner','docker_runner','codeql_runner','regression_runner','browser_runner','media_runner'].map(k=>[k,'["ubuntu-24.04"]'])),application_route:'school-teacher',scenario:'school-teacher',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',school_teacher_plan:JSON.stringify(plan)};
}
