import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const BRANCH='work/school-teacher-review-20261022', REPOSITORY='caohuibj/eduK12-new-version';
export const JOBS=['admission','frontend','connected','security'];
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export const binding=()=>JSON.parse(readFileSync(new URL('./school-teacher-bindings.json',import.meta.url)));
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
export function validateCandidate(b,o,evidenceBytes){
 assert.equal(b.enabled,true,'Candidate not independently frozen');assert.deepEqual(b.blockers,[]);
 assert.equal(b.branch,BRANCH);assert(['pull_request','push'].includes(o.event));assert.equal(o.branch,o.event==='push'?'main':BRANCH);assert.equal(o.repository,REPOSITORY);
 assert.equal(o.draft,false);assert.equal(o.forceFull,false);
 for(const key of ['base','productHead','frontendTree','backendTree'])assert(sha(b[key]),'Missing '+key);
 assert.equal(o.base,b.base);assert(sha(o.sourceHead));assert(sha(o.checkoutHead));assert(sha(o.sourceTree));
 assert.equal(o.checkoutTree,o.sourceTree,'Actual PR source differs from checkout');
 assert.equal(o.frontendTree,b.frontendTree);assert.equal(o.backendTree,b.backendTree);
 assert.equal(o.productFrontendTree,b.frontendTree);assert.equal(o.productBackendTree,b.backendTree);
 const source=b.source,controls=b.controlBefore;assert(source&&controls);assert(Object.keys(source).length>0);
 const allowed=new Set([...Object.keys(source),...Object.keys(controls)]);
 assert.equal(allowed.size,Object.keys(source).length+Object.keys(controls).length,'Overlapping paths');
 assert.equal(o.entries.length,allowed.size,'Complete raw diff required');assert.equal(new Set(o.entries.map(e=>e.file)).size,o.entries.length);
 for(const e of o.entries){assert(allowed.has(e.file),'Unknown path '+e.file);assert.equal(e.newMode,'100644');
  assert((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'),'Mode/delete/rename refused');
  const expected=source[e.file];const before=expected?expected.before:controls[e.file];
  assert.equal(e.oldBlob,before||'0'.repeat(40),'Baseline blob changed');
  if(expected){assert(sha(expected.after));assert.equal(e.newBlob,expected.after,'Product blob changed');}
 }
 assert.match(b.evidenceSha256||'',/^[a-f0-9]{64}$/);assert.equal(sha256(evidenceBytes),b.evidenceSha256);
 assert.equal(b.review.completed,true,'Final control review required');assert.equal(b.review.originalExecutionSigned,false);
 assert.deepEqual(b.requiredJobs,JOBS);assert.equal(b.frontendBuildDecision,'fresh-once');
 // This first implementation supports fresh compilation only. Never silently rebuild an unchanged qualified component.
 assert.equal(b.backendBuildDecision,'fresh-once','Explicit affected backend fresh decision required; no reuse fallback');
 assert(b.backendBuildReason&&b.backendBuildInputsChanged.length>0);
 assert.equal(b.execution.finalized,true,'Final per-check selections required');
 return {schema:1,route:'school-teacher',base:b.base,head:o.checkoutHead,sourceHead:o.sourceHead,sourceTree:o.sourceTree,
  product:b.productHead,components:{frontend:b.frontendTree,backend:b.backendTree},requiredJobs:JOBS,changes:o.entries};
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
export function actualPlan(env=process.env){const b=binding();assert.equal(b.enabled,true,'DRAFT_DISABLED');return validateCandidate(b,observedCandidate(b,env),readFileSync(new URL('./school-teacher-evidence.json',import.meta.url)))}
export function requireSuccess(plan,needs){assert.deepEqual(Object.keys(needs).sort(),[...plan.requiredJobs].sort());for(const id of plan.requiredJobs)assert.equal(needs[id]?.result,'success',id+' not successful');return true}

export const marker='.github/scripts/school-teacher-bindings.json';
export function schoolTeacherPlan(entries,base,head,read=git,env=process.env,b=binding(),evidenceBytes){
 const branch=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(branch===BRANCH)assert.notEqual(env.CI_EVENT,'workflow_dispatch','No manual/full/probe fallback');
 if(!entries.some(e=>e.file===marker)){assert.notEqual(branch,BRANCH,'School candidate marker missing; no legacy fallback');return null;}
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
