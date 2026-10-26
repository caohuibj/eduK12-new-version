// Only pure needs/compact-plan fixtures; no official API/Git/application work.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRANCH,REPOSITORY,REQUIRED_PHASE_IDS,REQUIRED_EVIDENCE_IDS,canonicalSHA256,candidateInputsDigest,compactPlan,pr356Outputs} from './pr356-plan.mjs';
import {requiredPr356Checks,failedPr356Checks,validatePr356GateNeeds} from './pr356-gate-contract.mjs';
const H='a'.repeat(40),B='b'.repeat(40),T='c'.repeat(40),P='d'.repeat(40),M='e'.repeat(40),backend='f'.repeat(40),frontend='1'.repeat(40);
function fixture({attempt='3',sourceAttempt='1',producerAttempt='2',digest='sha256:'+'9'.repeat(64)}={}){
 const phases=Object.fromEntries(REQUIRED_PHASE_IDS.map(id=>{const inputs={schemaVersion:1,files:[{path:'synthetic/source.ts',mode:'100644',blob:'2'.repeat(40)}],configuration:{phase:id},tools:{node:'24.21.0'},dependencies:{synthetic:'control-only'}};return [id,{jobName:'pr356-'+id,caseIds:[id+' actual required case'],inputs,inputsSHA256:canonicalSHA256(inputs)}]}));
 const inventory=[{path:'synthetic/source.ts',status:'M',oldMode:'100644',newMode:'100644',before:'3'.repeat(40),after:'2'.repeat(40)}];
 const plan={schemaVersion:1,route:'pr356',phase:'admit',repository:REPOSITORY,pr:356,branch:BRANCH,base:B,head:H,checkout:H,tree:T,product:P,components:{backend,frontend},protectedInputs:{'synthetic/source.ts':'2'.repeat(40)},inventory,inventorySHA256:canonicalSHA256(inventory),bindingSHA256:canonicalSHA256({synthetic:'binding'}),acceptanceSHA256:canonicalSHA256({synthetic:'acceptance'}),requiredPhaseIds:[...REQUIRED_PHASE_IDS],phases,historicalEvidence:REQUIRED_EVIDENCE_IDS.map(id=>({id,state:'approved',caseIds:[id+' original evidence case']})),context:{event:'workflow_dispatch',runId:'1001',attempt:sourceAttempt,actualDraft:false,mainSha:B,mergeCommitSha:M}};
 const retained=JSON.parse(readFileSync(new URL('./pr356-acceptance.json',import.meta.url),'utf8'));plan.backendProductionTypesCoverage=structuredClone(retained.backendProductionTypesCoverage);plan.retainedEvidenceDeclarations=structuredClone(retained.retainedEvidenceDeclarations);plan.phases['backend-image'].caseIds.push('backend-image-built');
 plan.candidateInputsSHA256=candidateInputsDigest(plan);
 const needs={scope:{result:'success',outputs:pr356Outputs(plan)},'pr356-admission':{result:'success',outputs:{artifact_id:'2001',artifact_name:'pr356-merge-admission-precheck-1001-'+producerAttempt,artifact_digest:digest,producer_run:'1001',producer_head:H,producer_attempt:producerAttempt,head:H,base:B,tree:T,candidate_inputs_sha256:plan.candidateInputsSHA256}}};
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:REPOSITORY,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:H,GITHUB_RUN_ID:'1001',GITHUB_RUN_ATTEMPT:attempt,GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_REF_NAME:BRANCH};
 const changePlan=change=>{const p=JSON.parse(needs.scope.outputs.pr356_plan);change(p);needs.scope.outputs.pr356_plan=JSON.stringify(p)};
 return {needs,env,plan:compactPlan(plan),changePlan};
}
const rejected=(f,check='scope',...drafts)=>{const draft=drafts.length?drafts[0]:false;assert.throws(()=>validatePr356GateNeeds(f.needs,draft,f.env));assert(failedPr356Checks(f.needs,draft,f.env).includes(check));};

test('required PR356 checks never become an empty or Draft scope-only success',()=>{
 for(const args of [[{},true],[{},false],[undefined,undefined]])assert.deepEqual(requiredPr356Checks(...args),['scope','pr356-admission']);
 const changed=requiredPr356Checks();changed.pop();assert.equal(requiredPr356Checks().length,2);
 assert.deepEqual(failedPr356Checks({},false,{}),['scope','pr356-admission']);
});
test('actual compactPlan admit shape yields only a fixed precheck pin and leaves needs bytes untouched',()=>{
 const f=fixture(),original=JSON.stringify(f.needs),result=validatePr356GateNeeds(f.needs,false,f.env);
 assert.deepEqual(result.plan,f.plan);assert.deepEqual(result.admissionPin,{runId:'1001',attempt:'2',artifactId:'2001',artifactName:'pr356-merge-admission-precheck-1001-2',artifactDigest:'sha256:'+'9'.repeat(64),zipSHA256:'9'.repeat(64),sourceHead:H});
 assert.deepEqual(failedPr356Checks(f.needs,false,f.env),[]);assert.equal(JSON.stringify(f.needs),original);assert(!Object.hasOwn(result,'qualified'));
});
test('successful original producer and source attempts may precede the current consumer attempt',()=>{
 const f=fixture({attempt:'12',sourceAttempt:'1',producerAttempt:'2'});assert.equal(validatePr356GateNeeds(f.needs,false,f.env).admissionPin.attempt,'2');
 const same=fixture({attempt:'1',sourceAttempt:'1',producerAttempt:'1'});assert.deepEqual(failedPr356Checks(same.needs,false,same.env),[]);
});
test('upload bare hex and official prefixed digest normalize identically without rewriting either original',()=>{
 for(const digest of ['9'.repeat(64),'sha256:'+'9'.repeat(64)]){
  const f=fixture({digest});assert.equal(validatePr356GateNeeds(f.needs,false,f.env).admissionPin.artifactDigest,'sha256:'+'9'.repeat(64));assert.equal(f.needs['pr356-admission'].outputs.artifact_digest,digest);
 }
});
test('missing/skipped/failure/cancelled jobs are never inferred from another success',()=>{
 for(const job of ['scope','pr356-admission'])for(const status of [undefined,'skipped','failure','cancelled','neutral','pending']){
  const f=fixture();if(status===undefined)delete f.needs[job];else f.needs[job].result=status;rejected(f,job);
 }
});
test('Draft, unknown and truthy-string PR state all fail stable admission',()=>{
 for(const draft of [true,undefined,null,0,'false'])rejected(fixture(),'scope',draft);
 for(const actualDraft of [true,null,undefined]){const f=fixture();f.changePlan(p=>{if(actualDraft===undefined)delete p.context.actualDraft;else p.context.actualDraft=actualDraft});rejected(f)}
});
test('qualify/observe/postmerge and unrelated metadata routes cannot claim this stable gate',()=>{
 for(const phase of ['qualify','observe','postmerge']){
  const f=fixture();f.needs.scope.outputs.pr356_phase=phase;f.changePlan(p=>{p.phase=phase});rejected(f);
 }
 for(const change of [{application_route:'A'},{application_route:'B'},{application_route:'reviewed-candidate'},{scenario:'media'},{post_merge:'true'},{pr356_phase:'qualify'}]){const f=fixture();Object.assign(f.needs.scope.outputs,change);rejected(f)}
});
test('source compact JSON must be original bounded object JSON, never absent/ambiguous/partial',()=>{
 for(const value of ['',undefined,'{','[]','null','{ "schemaVersion": 1 }',' '.repeat(256*1024)]){const f=fixture();f.needs.scope.outputs.pr356_plan=value;rejected(f)}
 const duplicate=fixture();duplicate.needs.scope.outputs.pr356_plan=duplicate.needs.scope.outputs.pr356_plan.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1');rejected(duplicate);
});
test('every complete source identity and digest is mandatory',()=>{
 for(const key of ['base','head','checkout','tree','product','inventorySHA256','bindingSHA256','acceptanceSHA256','candidateInputsSHA256'])for(const value of [undefined,'',true,'pending']){
  const f=fixture();f.changePlan(p=>{if(value===undefined)delete p[key];else p[key]=value});rejected(f);
 }
 for(const components of [{},[],{backend},{backend,frontend,worker:backend}]){const f=fixture();f.changePlan(p=>{p.components=components});rejected(f)}
 const head=fixture();head.changePlan(p=>{p.checkout=M});rejected(head);
 const digest=fixture();digest.needs.scope.outputs.pr356_candidate_inputs_sha256='8'.repeat(64);rejected(digest);
});
test('all sixteen phase rows and nonempty unique input/case tables are required',()=>{
 for(const mutate of [p=>p.requiredPhaseIds.pop(),p=>p.requiredPhaseIds.push(p.requiredPhaseIds[0]),p=>delete p.phases[REQUIRED_PHASE_IDS[0]],p=>p.phases.unknown={jobName:'unknown',caseIds:['unknown'],inputsSHA256:'9'.repeat(64)}]){const f=fixture();f.changePlan(mutate);rejected(f)}
 for(const id of REQUIRED_PHASE_IDS)for(const mutate of [p=>{p.phases[id].caseIds=[]},p=>{p.phases[id].caseIds=['same','same']},p=>{p.phases[id].caseIds=['']},p=>{p.phases[id].inputsSHA256=''},p=>{delete p.phases[id].inputsSHA256},p=>{p.phases[id].jobName='another-job'},p=>{p.phases[id].state='pending'}]){const f=fixture();f.changePlan(mutate);rejected(f)}
 const duplicate=fixture();duplicate.changePlan(p=>{p.phases[REQUIRED_PHASE_IDS[1]].caseIds=p.phases[REQUIRED_PHASE_IDS[0]].caseIds});rejected(duplicate);
});
test('all thirteen historical groups need approved nonempty unique cases without invented historical input SHAs',()=>{
 const f=fixture();assert(f.plan.historicalEvidence.every(group=>!Object.hasOwn(group,'inputsSHA256')));assert.equal(failedPr356Checks(f.needs,false,f.env).length,0);
 for(const mutate of [p=>p.historicalEvidence.pop(),p=>p.historicalEvidence.push(p.historicalEvidence[0]),p=>{p.historicalEvidence[0].caseIds=[]},p=>{p.historicalEvidence[0].state='pending'},p=>{p.historicalEvidence[0].caseIds=['dup','dup']},p=>{p.historicalEvidence[1].caseIds=p.historicalEvidence[0].caseIds},p=>{p.historicalEvidence[0].caseIds=p.phases[REQUIRED_PHASE_IDS[0]].caseIds}]){const bad=fixture();bad.changePlan(mutate);rejected(bad)}
});
test('official event/repository/source/run/context and future source attempts must match',()=>{
 for(const change of [{GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'fork/example'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_SHA:M},{GITHUB_RUN_ID:'1002'},{GITHUB_RUN_ATTEMPT:'0'},{GITHUB_REF:'refs/heads/main'},{GITHUB_REF_NAME:'main'}]){const f=fixture();Object.assign(f.env,change);rejected(f)}
 for(const mutate of [p=>{p.context.runId='1002'},p=>{p.context.attempt='4'},p=>{p.context.mainSha=M},p=>{delete p.context.mergeCommitSha},p=>{p.context.event='pull_request'},p=>{p.repository='fork/example'},p=>{p.pr=355},p=>{p.branch='main'}]){const f=fixture();f.changePlan(mutate);rejected(f)}
});
test('admission must expose its fixed artifact and all recomputed source outputs',()=>{
 for(const key of ['artifact_id','artifact_name','artifact_digest','producer_run','producer_head','producer_attempt','head','base','tree','candidate_inputs_sha256']){
  const f=fixture();delete f.needs['pr356-admission'].outputs[key];rejected(f,'pr356-admission');
 }
 for(const change of [{artifact_id:'0'},{artifact_name:'pr356-merge-admission-1001-2'},{artifact_name:'pr356-merge-admission-precheck-1001-3'},{producer_run:'1002'},{producer_head:M},{producer_attempt:'4'},{head:M},{base:M},{tree:M},{candidate_inputs_sha256:'8'.repeat(64)}]){const f=fixture();Object.assign(f.needs['pr356-admission'].outputs,change);rejected(f,'pr356-admission')}
});
test('malformed digests/IDs never become an official pin through normalization',()=>{
 for(const digest of ['',true,'sha256:'+('9'.repeat(63)),'SHA256:'+'9'.repeat(64),'sha256:sha256:'+'9'.repeat(64),'9'.repeat(64)+'\n','G'.repeat(64)]){const f=fixture();f.needs['pr356-admission'].outputs.artifact_digest=digest;rejected(f,'pr356-admission')}
 for(const value of ['01','1.5',false,'900719925474099200000',9007199254740992]){const f=fixture();f.needs['pr356-admission'].outputs.artifact_id=value;rejected(f,'pr356-admission')}
});
test('unrelated legacy/metadata-reuse job results neither extend nor satisfy PR356 requirements',()=>{
 const f=fixture();f.needs['metadata-reuse-A']={result:'success'};f.needs['metadata-reuse-B']={result:'success'};f.needs['backend-regression']={result:'failure'};
 assert.deepEqual(requiredPr356Checks(f.needs,false),['scope','pr356-admission']);assert.deepEqual(failedPr356Checks(f.needs,false,f.env),[]);
 delete f.needs['pr356-admission'];assert.deepEqual(failedPr356Checks(f.needs,false,f.env),['pr356-admission']);
});
