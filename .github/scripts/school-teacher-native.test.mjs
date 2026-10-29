import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {nativeBinding,nativeSastConfig,validateNativeBoundary,requireNativeQualification,requireNativeEvidence,observeNativeMain,requireNativeProducerAttempt,NATIVE_BRANCH,NATIVE_MARKER,NATIVE_JOBS} from './school-teacher-native.mjs';
import {binding,schoolTeacherPlan,schoolTeacherOutputs,requireSuccess,BRANCH,SELF_BRANCH,JOBS,SELF_JOBS} from './school-teacher-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const workflow=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');
const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const job=id=>{const match=new RegExp('^  '+id+':\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|$(?![\\s\\S]))','m').exec(workflow);assert(match,'Missing '+id);return match[1]};
function fixture(){
 const b=structuredClone(nativeBinding());
 const entries=Object.entries({...b.source,...b.controls}).map(([file,e])=>({file,oldBlob:e.before||'0'.repeat(40),newBlob:e.after||'c'.repeat(40),oldMode:e.before?'100644':'000000',newMode:'100644',status:e.before?'M':'A'}));
 const o={event:'pull_request',repository:b.repository,branch:NATIVE_BRANCH,draft:false,forceFull:false,base:b.base,sourceHead:'a'.repeat(40),checkoutHead:'b'.repeat(40),sourceTree:'d'.repeat(40),checkoutTree:'d'.repeat(40),productTree:b.productTree,frontendTree:b.frontendTree,backendTree:b.backendTree,protectedInputs:structuredClone(b.protectedInputs),entries};
 return {b,o};
}
function fixtureRead(b,o){return (...args)=>{
  const s=args.join(' ');if(s==='rev-parse '+o.sourceHead+'^{tree}'||s==='rev-parse '+o.checkoutHead+'^{tree}')return o.sourceTree;
  if(s==='rev-parse '+b.productHead+'^{tree}')return b.productTree;
  if(s==='rev-parse '+o.checkoutHead+'^1')return b.base;
  if(s==='rev-parse '+o.checkoutHead+'^2')return o.sourceHead;
  for(const [p,blob]of Object.entries(b.protectedInputs))if(s==='rev-parse '+o.checkoutHead+':'+p)return blob;
  if(s==='rev-parse '+o.checkoutHead+':server-version/frontend')return b.frontendTree;
  if(s==='rev-parse '+o.checkoutHead+':server-version/backend')return b.backendTree;
  for(const e of o.entries){if(s==='rev-parse '+b.base+':'+e.file)return e.oldBlob;if(s==='rev-parse '+o.checkoutHead+':'+e.file)return e.newBlob;}
  assert.fail('Unexpected read '+s);
 };}

test('native binding preserves pending review and cannot admit raw local evidence by flipping a label',()=>{
 const b=nativeBinding();assert.equal(b.enabled,false);assert.equal(b.review.status,'PENDING');
 assert.throws(()=>requireNativeQualification(b),/pending independent review/);
 assert.throws(()=>requireNativeEvidence(b),/not admitted/);
 b.evidence.status='INDEPENDENTLY_REVIEWED';assert.throws(()=>requireNativeEvidence(b));
 assert.equal(binding({CI_HEAD_REF:NATIVE_BRANCH}).candidate,'native-bundle');
 assert.equal(binding({PLAN:JSON.stringify({candidate:'native-bundle'})}).branch,NATIVE_BRANCH);
 assert.equal(binding({CI_HEAD_REF:BRANCH}).branch,BRANCH);assert.equal(binding({CI_HEAD_REF:SELF_BRANCH}).branch,SELF_BRANCH);
});
test('native boundary freezes every source/control blob and complete protected inputs without relabelling historical products',()=>{
 const {b,o}=fixture();assert.equal(validateNativeBoundary(b,o).candidate,'native-bundle');
 const mutations=[x=>x.base='f'.repeat(40),x=>x.sourceHead='bad',x=>x.checkoutHead='bad',x=>x.sourceTree='bad',x=>x.checkoutTree='f'.repeat(40),x=>x.productTree='f'.repeat(40),x=>x.frontendTree='f'.repeat(40),x=>x.backendTree='f'.repeat(40),x=>x.repository='external/repo',x=>x.branch=SELF_BRANCH,x=>x.draft=true,x=>x.forceFull=true,x=>x.event='workflow_dispatch',x=>x.entries.pop(),x=>x.entries.push(x.entries[0]),x=>x.entries[0].file='unknown.ts',x=>x.entries[0].newBlob='e'.repeat(40),x=>x.entries[0].oldBlob='e'.repeat(40),x=>x.entries[0].oldMode='100755',x=>x.entries[0].newMode='100755',x=>x.entries[0].status='D',x=>delete x.protectedInputs[Object.keys(x.protectedInputs)[0]],x=>x.protectedInputs[Object.keys(x.protectedInputs)[0]]='e'.repeat(40)];
 for(const mutate of mutations){const changed=structuredClone(o);mutate(changed);assert.throws(()=>validateNativeBoundary(b,changed));}
 const control=o.entries.find(e=>e.file!==NATIVE_MARKER&&Object.hasOwn(b.controls,e.file));assert(control);control.newBlob='0'.repeat(40);assert.throws(()=>validateNativeBoundary(b,o));
});
test('pending Draft runs only exact control preflight while Ready/manual/mixed/unknown sources refuse',()=>{
 const {b,o}=fixture(),env={CI_HEAD_REF:NATIVE_BRANCH,CI_EVENT:'pull_request',CI_SOURCE_HEAD:o.sourceHead,CI_IS_DRAFT:'true',CI_PR_REPOSITORY:b.repository};
 const noRead=fixtureRead(b,o);
 const plan=schoolTeacherPlan(o.entries,b.base,o.checkoutHead,noRead,env,b);assert.equal(plan.preflightOnly,true);assert.deepEqual(plan.requiredJobs,['admission']);
 for(const change of [{CI_EVENT:'workflow_dispatch'},{CI_PR_REPOSITORY:'external/repo'},{CI_FORCE_FULL:'true'},{CI_IS_DRAFT:'false'},{CI_HEAD_REF:'unrelated'}])assert.throws(()=>schoolTeacherPlan(o.entries,b.base,o.checkoutHead,noRead,{...env,...change},b));
 assert.throws(()=>schoolTeacherPlan([],b.base,o.checkoutHead,noRead,env,b));
 assert.throws(()=>schoolTeacherPlan([...o.entries,{file:'.github/scripts/school-teacher-self-bindings.json'}],b.base,o.checkoutHead,noRead,env,b));
 assert.equal(schoolTeacherPlan([],b.base,o.checkoutHead,noRead,{CI_HEAD_REF:'unrelated'}),null);
});
test('same-source PR and exact normal main merge recompute the same closed native input graph',()=>{
 const {b,o}=fixture();b.enabled=true;b.review={status:'INDEPENDENTLY_REVIEWED',recordSha256:'1'.repeat(64)};
 const read=fixtureRead(b,o);
 const env={CI_HEAD_REF:NATIVE_BRANCH,CI_EVENT:'pull_request',CI_SOURCE_HEAD:o.sourceHead,CI_IS_DRAFT:'false',CI_PR_REPOSITORY:b.repository};
 assert.deepEqual(schoolTeacherPlan(o.entries,b.base,o.checkoutHead,read,env,b),validateNativeBoundary(b,o));
 const merged=schoolTeacherPlan(o.entries,b.base,o.checkoutHead,read,{...env,CI_HEAD_REF:'main',CI_EVENT:'push'},b);assert.equal(merged.sourceHead,o.sourceHead);
 assert.throws(()=>schoolTeacherPlan(o.entries,b.base,o.checkoutHead,(...a)=>a.join(' ')==='rev-parse '+o.checkoutHead+'^1'?'f'.repeat(40):read(...a),{...env,CI_HEAD_REF:'main',CI_EVENT:'push'},b));
});
test('native and historical job graphs require actual selected successes and refuse every skipped failure or unknown dependency',()=>{
 const all=[...new Set([...JOBS,...SELF_JOBS,...NATIVE_JOBS])];
 for(const selected of [JOBS,SELF_JOBS,NATIVE_JOBS]){
  const needs=Object.fromEntries(all.map(id=>[id,{result:selected.includes(id)?'success':'skipped'}]));assert(requireSuccess({requiredJobs:selected},needs));
  for(const id of selected)for(const result of ['skipped','failure','cancelled',undefined])assert.throws(()=>requireSuccess({requiredJobs:selected},{...needs,[id]:{result}}));
  assert.throws(()=>requireSuccess({requiredJobs:selected},{...needs,unknown:{result:'success'}}));
 }
 const outputs=schoolTeacherOutputs({candidate:'native-bundle'},{accept_media:true});assert.equal(outputs.application_route,'school-teacher');assert.equal(outputs.codeql,true);assert.equal(outputs.accept_media,false);
 const gate=readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8');assert(gate.includes("return ['scope','school-teacher','codeql']"));assert(gate.includes('recomputed-school-teacher-plan'));
});
test('existing workflow keeps independent producers pending evidence actual runtime scans and original real CodeQL',()=>{
 assert(job('backend-self').includes("candidate == 'native-bundle'"));assert(job('backend-self').includes('school-teacher-native-backend-context-'));
 assert(job('frontend').includes('school-teacher-native-frontend-context-'));assert(job('frontend').includes('prisma/build/index.js generate'));
 assert(job('connected').includes("candidate != 'native-bundle'"));
 assert(job('native-evidence').includes('school-teacher-checks.mjs native-evidence'));
 assert(job('native-runtime').includes('needs: [admission, frontend, backend-self]'));assert(job('native-runtime').includes('preflightOnly != true'));assert(job('native-runtime').includes('version: v0.70.0'));
 assert(!job('native-runtime').includes('npm ci'));assert(!job('native-runtime').includes('run build'));assert(!job('native-runtime').includes('services:'));
 for(const id of NATIVE_JOBS)assert(job('qualified').includes(id));
 assert(ci.includes(NATIVE_MARKER));assert(ci.includes("application_route == 'school-teacher' && 'paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]'"));
 assert(!/continue-on-error|no-sandbox|ignoreHTTPSErrors|sysctl/.test(workflow));
 for(const line of ci.split('\n').filter(l=>l.includes('"'+SELF_BRANCH+'","work/school-teacher-visual-20261023"')))assert.fail('Native manual/probe refusal missing: '+line.slice(0,100));
});
test('committed native product and all non-self controls match actual bytes and unchanged locked runtime closure',()=>{
 const b=nativeBinding();assert.equal(git('rev-parse',b.productHead+'^{tree}'),b.productTree);
 for(const [path,e]of Object.entries({...b.source,...b.controls}))if(path!==NATIVE_MARKER)assert.equal(git('hash-object',path),e.after,path);
 for(const [path,blob]of Object.entries(b.protectedInputs))assert.equal(git('hash-object',path),blob,path);
});
test('new main selector preserves historical bases and new Python controls keep real security-extended SAST and raw SARIF',()=>{
 const b=nativeBinding();assert.equal(binding({CI_HEAD_REF:'main',CI_BASE_SHA:b.base}).candidate,'native-bundle');
 assert.equal(binding({CI_HEAD_REF:'main',CI_BASE_SHA:'f39a00f12fed2e1b8e1d3cc45185969262925ed8'}).branch,SELF_BRANCH);
 const paths=['.github/scripts/school-teacher-native-runtime.py','.github/scripts/school-teacher-native-runtime.test.py','.github/scripts/exact-candidate-runtime.py','.github/scripts/unrelated.py','.github/scripts/content-scope.mjs'];
 const config=nativeSastConfig(paths);assert.deepEqual(config['paths-ignore'],['.github/scripts/unrelated.py']);assert.deepEqual(config.queries,[{uses:'security-extended'}]);
 assert(config.paths.includes('.github/scripts'));assert.throws(()=>nativeSastConfig(paths.slice(1)));
 assert(ci.includes("steps.native-bundle-codeql-config.outputs.config && 'javascript-typescript,python'"));assert(ci.includes('school-teacher-native-sast-${{ github.sha }}'));
});
test('Draft control preflight cannot authorize Ready or omit any selected result and does not replay application checks',()=>{
 const {b,o}=fixture(),plan=validateNativeBoundary(b,{...o,draft:true},{draftPreflight:true});
 const scope=Object.fromEntries(Object.entries(schoolTeacherOutputs(plan)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs:scope},'school-teacher':{result:'success'},codeql:{result:'skipped'}};
 assert.deepEqual(requiredChecks(needs,true),['scope','school-teacher']);assert.deepEqual(failedChecks(needs,true),[]);
 assert.deepEqual(requiredChecks(needs,false),['scope','school-teacher','codeql']);assert(failedChecks(needs,false).length);
 for(const id of ['scope','school-teacher'])for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,[id]:{...needs[id],result}},true).length);
 assert(failedChecks({...needs,scope:{result:'success',outputs:{...scope,school_teacher_plan:'broken'}}},true).length);
 const nested=Object.fromEntries([...new Set([...JOBS,...SELF_JOBS,...NATIVE_JOBS])].map(id=>[id,{result:id==='admission'?'success':'skipped'}]));
 assert(requireSuccess(plan,nested));assert.throws(()=>requireSuccess({...plan,preflightOnly:false},nested));assert.throws(()=>requireSuccess(plan,{...nested,frontend:{result:'success'}}));
 for(const id of ['frontend','security','native-evidence','native-runtime'])assert(job(id).includes('preflightOnly != true'));
});
test('main observes only the exact merged PR and newest successful official full qualification, with no older-green fallback',async()=>{
 const plan={candidate:'native-bundle',postMerge:true,requiredJobs:NATIVE_JOBS,sourceHead:'a'.repeat(40),head:'b'.repeat(40)};
 const pr={number:388,merged:true,state:'closed',draft:false,head:{ref:NATIVE_BRANCH,sha:plan.sourceHead,repo:{full_name:'caohuibj/eduK12-new-version'}},base:{ref:'main',repo:{full_name:'caohuibj/eduK12-new-version'}},merge_commit_sha:plan.head};
 const run={id:7,run_attempt:1,head_sha:plan.sourceHead,head_branch:NATIVE_BRANCH,event:'pull_request',path:'.github/workflows/ci.yml',repository:{full_name:'caohuibj/eduK12-new-version'},status:'completed',conclusion:'success'};
 const names=['classify changed content',...NATIVE_JOBS.map(id=>'school-teacher / '+id),'school-teacher / qualified','codeql (javascript/typescript SAST)','merge gate / ready PR'];
 const jobs=names.map((name,i)=>({id:i+10,name,run_id:7,head_sha:plan.sourceHead,run_attempt:1,status:'completed',conclusion:'success'}));
 const fixture={pr,runs:[run],jobs};
 const api=f=>async path=>{
  if(path==='/pulls/388')return f.pr;
  if(path==='/actions/workflows/ci.yml/runs?event=pull_request&head_sha='+plan.sourceHead+'&per_page=100')return {total_count:f.runs.length,workflow_runs:f.runs};
  assert.equal(path,'/actions/runs/7/attempts/1/jobs?per_page=100&page=1');return {total_count:f.jobs.length,jobs:f.jobs};
 };
 assert.equal((await observeNativeMain(plan,api(fixture))).applicationExecuted,false);
 for(const mutate of [f=>f.pr.draft=true,f=>f.pr.merged=false,f=>f.pr.head.sha='c'.repeat(40),f=>f.pr.merge_commit_sha='c'.repeat(40),f=>f.runs[0].conclusion='failure',f=>f.runs[0].status='in_progress',f=>f.runs.push({...run,id:8,conclusion:'failure'}),f=>f.jobs.pop(),f=>f.jobs[0].head_sha='c'.repeat(40),f=>f.jobs[0].run_attempt=2,f=>f.jobs.find(j=>j.name.includes('native-runtime')).conclusion='skipped',f=>f.jobs.find(j=>j.name.startsWith('codeql')).conclusion='skipped']){
  const changed=structuredClone(fixture);mutate(changed);await assert.rejects(()=>observeNativeMain(plan,api(changed)));
 }
 const classifier=readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8');assert(classifier.includes('schoolTeacher.mainObservation=await observeNativeMain(schoolTeacher)'));
 assert(ci.includes("github.event_name == 'pull_request' && (github.event.pull_request.draft == false || fromJSON(needs.scope.outputs.school_teacher_plan"));
});
test('a failed runtime consumer cannot silently cause producers to build again under a later attempt',()=>{
 requireNativeProducerAttempt('1');for(const attempt of ['2','0','',undefined])assert.throws(()=>requireNativeProducerAttempt(attempt));
 const checks=readFileSync(new URL('./school-teacher-checks.mjs',import.meta.url),'utf8');assert(checks.indexOf('requireNativeProducerAttempt(process.env.GITHUB_RUN_ATTEMPT)')<checks.indexOf("freshBuild(kind);nativeContext(kind)"));
});
