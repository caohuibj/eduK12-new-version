import vm from 'node:vm';
/** Direct adapter contracts with fake recompute/aggregate. No official API,
 * application, historical evidence admission or CI is executed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runPr356StableGate,runPr356PullRequestGate} from './pr356-stable-gate.mjs';
import {REPOSITORY,BRANCH,REQUIRED_PHASE_IDS,REQUIRED_EVIDENCE_IDS,canonicalSHA256,candidateInputsDigest,pr356Outputs} from './pr356-plan.mjs';
const h='a'.repeat(40),base='b'.repeat(40),tree='c'.repeat(40),blob='d'.repeat(40);
function setup(t){
 const temp=mkdtempSync(join(tmpdir(),'pr356-stable-control-'));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const inputs={schemaVersion:1,files:[{path:'.github/scripts/pr356-stable-gate.mjs',mode:'100644',blob}],configuration:{syntheticOnly:true},tools:{node:'24.21.0'},dependencies:{syntheticOnly:true}};
 const inventory=[{path:inputs.files[0].path,status:'A',oldMode:'000000',newMode:'100644',before:null,after:blob}];
 const plan={schemaVersion:1,route:'pr356',phase:'admit',repository:REPOSITORY,pr:356,branch:BRANCH,base,head:h,checkout:h,tree,product:'e'.repeat(40),components:{backend:'f'.repeat(40),frontend:'1'.repeat(40)},protectedInputs:{synthetic:blob},inventory,inventorySHA256:canonicalSHA256(inventory),bindingSHA256:'2'.repeat(64),acceptanceSHA256:'3'.repeat(64),phases:Object.fromEntries(REQUIRED_PHASE_IDS.map(id=>[id,{id,state:'ready',jobName:'pr356-'+id,caseIds:[id+'-synthetic-control'],inputs,inputsSHA256:canonicalSHA256(inputs),maxAgeSeconds:3600}])),requiredPhaseIds:[...REQUIRED_PHASE_IDS],historicalEvidence:REQUIRED_EVIDENCE_IDS.map(id=>({id,state:'approved',caseIds:[id+'-synthetic-history'],cases:[]})),context:{event:'workflow_dispatch',runId:'100',attempt:'2',actualDraft:false,mainSha:base,mergeCommitSha:'4'.repeat(40)},qualificationOnly:true,externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
 const retained=JSON.parse(readFileSync(new URL('./pr356-acceptance.json',import.meta.url),'utf8'));plan.backendProductionTypesCoverage=structuredClone(retained.backendProductionTypesCoverage);plan.retainedEvidenceDeclarations=structuredClone(retained.retainedEvidenceDeclarations);plan.phases['backend-image'].caseIds.push('backend-image-built');
 plan.candidateInputsSHA256=candidateInputsDigest(plan);
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:REPOSITORY,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_REF_NAME:BRANCH,GITHUB_SHA:h,GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'2',RUNNER_TEMP:temp,PR356_PHASE_SPEC:join(temp,'specs','phase-spec.json'),PR356_PHASE_INPUTS:join(temp,'specs','phase-inputs.json'),PR356_EVIDENCE_DIR:join(temp,'results','merge-admission')};
 const outputs={artifact_id:'123',artifact_digest:'5'.repeat(64),artifact_name:'pr356-merge-admission-precheck-100-1',producer_run:'100',producer_head:h,producer_attempt:'1',head:h,base,tree,candidate_inputs_sha256:plan.candidateInputsSHA256};
 return {plan,env,needs:{scope:{result:'success',outputs:pr356Outputs(plan)},'pr356-admission':{result:'success',outputs}}};
}
test('stable adapter recomputes complete recipe and forwards original precheck attempt without authorizing release',async t=>{
 const {plan,env,needs}=setup(t);let recomputes=0,calls=0;
 const receipt=await runPr356StableGate({needs,env,recompute:async actual=>(assert.equal(actual,env),recomputes++,plan),aggregate:async args=>{calls++;assert.equal(args.mode,'gate');assert.equal(args.plan,plan);assert.equal(args.admissionPin.attempt,'1');assert.equal(args.admissionPin.runId,'100');assert.equal(args.admissionPin.zipSHA256,'5'.repeat(64));assert.equal(args.env.GITHUB_RUN_ATTEMPT,'2');return {syntheticOnly:true};}});
 assert.equal(recomputes,1);assert.equal(calls,1);assert.equal(receipt.releaseAuthorized,false);assert.equal(receipt.externalDotApprovalRequired,true);assert.equal(JSON.parse(readFileSync(env.PR356_PHASE_SPEC)).jobName,'merge gate / ready PR');assert.deepEqual(JSON.parse(readFileSync(env.PR356_PHASE_INPUTS)),JSON.parse(readFileSync(env.PR356_PHASE_SPEC)).inputs);
});
test('source or precheck missing/skipped/failure refuses before any official recompute or aggregation',async t=>{
 const original=setup(t);for(const name of ['scope','pr356-admission'])for(const status of ['skipped','failure','cancelled',undefined]){
  const needs=structuredClone(original.needs);needs[name].result=status;await assert.rejects(runPr356StableGate({...original,needs,recompute:()=>{throw Error('UNEXPECTED_RECOMPUTE')},aggregate:()=>{throw Error('UNEXPECTED_AGGREGATE')}}),error=>!error.message.includes('UNEXPECTED_'));
 }
});
test('actual complete case/identity recompute drift refuses before aggregate and preserves prior recipes',async t=>{
 const s=setup(t);for(const mutate of [p=>p.head='6'.repeat(40),p=>p.tree='7'.repeat(40),p=>p.phases['backend-image'].caseIds.push('unreviewed-new-case'),p=>p.historicalEvidence.pop(),p=>p.context.actualDraft=true]){
  const full=structuredClone(s.plan);mutate(full);await assert.rejects(runPr356StableGate({...s,recompute:async()=>full,aggregate:()=>{throw Error('UNEXPECTED_AGGREGATE')}}),error=>!error.message.includes('UNEXPECTED_'));
 }
 mkdirSync(dirname(s.env.PR356_PHASE_SPEC),{recursive:true});writeFileSync(s.env.PR356_PHASE_SPEC,'retained prior recipe');await assert.rejects(runPr356StableGate({...s,recompute:async()=>s.plan,aggregate:()=>{throw Error('UNEXPECTED_AGGREGATE')}}),/Preserve previous/);assert.equal(readFileSync(s.env.PR356_PHASE_SPEC,'utf8'),'retained prior recipe');
});
test('actual merge-gate CLI on PR356 refuses skipped precheck without legacy fallback or API',t=>{
 const s=setup(t);s.needs['pr356-admission'].result='skipped';const r=spawnSync(process.execPath,['.github/scripts/merge-gate.mjs'],{env:{...process.env,...s.env,CI_HEAD_REF:BRANCH,NEEDS_JSON:JSON.stringify(s.needs)},encoding:'utf8',timeout:10000});assert.equal(r.status,1);assert.match(r.stderr,/precheck did not succeed/);assert.doesNotMatch(r.stdout,/"required":/);
});

import {readPr356AdmissionPin} from './pr356-admission.mjs';

function prSetup(t){
 const s=setup(t);s.plan.phase='observe';s.plan.checkout=s.plan.context.mergeCommitSha;s.plan.context.event='pull_request';
 Object.assign(s.env,{GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/356/merge',GITHUB_SHA:s.plan.checkout,GH_TOKEN:'synthetic-only'});s.needs.scope.outputs=pr356Outputs(s.plan);s.needs['pr356-admission']={result:'skipped',outputs:{}};
 s.pin={head:h,runId:'200',attempt:1,artifactId:321,zipSHA256:'6'.repeat(64)};
 s.pr={number:356,state:'open',merged:false,draft:false,head:{sha:h,repo:{full_name:REPOSITORY}},base:{sha:base},body:'<!-- pr356-admission-pin:v1\n'+JSON.stringify(s.pin)+'\n-->'};
 s.fetcher=async(url,options)=>{assert.equal(url,'https://api.github.com/repos/'+REPOSITORY+'/pulls/356');assert.equal(options.redirect,'error');return {status:200,json:async()=>s.pr};};return s;
}
test('eligible PR wrapper checks live source and explicit locator then invokes only authenticated metadata reuse',async t=>{
 const s=prSetup(t);let calls=0;const result=await runPr356StableGate({...s,recompute:async()=>s.plan,aggregate:async a=>{calls++;assert.equal(a.mode,'pr-gate');assert.equal(a.plan.checkout,s.env.GITHUB_SHA);assert.equal(a.admissionPin.artifactId,321);assert.equal(a.admissionPin.runId,'200');return {synthetic:true};}});
 assert.equal(calls,1);assert.equal(result.role,'pull-request-admission');assert.equal(result.releaseAuthorized,false);assert.equal(result.head,h);
});
test('eligible PR wrapper refuses wrong event, source, draft and missing locator without aggregate',async t=>{
 for(const mutate of [s=>s.env.GITHUB_EVENT_NAME='workflow_dispatch',s=>s.env.GITHUB_REF='refs/pull/999/merge',s=>s.needs.scope.result='failure',s=>s.needs.scope.outputs.pr356_phase='qualify',s=>s.pr.head.sha=base,s=>s.pr.draft=true,s=>s.pr.body='',s=>s.pr.body=s.pr.body+s.pr.body,s=>s.pr.head.repo.full_name='foreign/repository']){
  const s=prSetup(t);mutate(s);await assert.rejects(runPr356PullRequestGate({...s,recompute:async()=>s.plan,aggregate:()=>{throw Error('UNEXPECTED_AGGREGATE')}}),e=>!e.message.includes('UNEXPECTED_AGGREGATE'));
 }
});
test('explicit PR locator rejects stale, ambiguous or malformed metadata rather than latest-success fallback',()=>{
 const pin={head:h,runId:'200',attempt:1,artifactId:321,zipSHA256:'6'.repeat(64)},body=p=>'<!-- pr356-admission-pin:v1\n'+JSON.stringify(p)+'\n-->';
 assert.deepEqual(readPr356AdmissionPin(body(pin),h),{runId:'200',attempt:1,artifactId:321,zipSHA256:'6'.repeat(64)});
 for(const p of [{...pin,head:base},{...pin,attempt:0},{...pin,artifactId:-1},{...pin,zipSHA256:'bad'},{...pin,url:'https://evil.invalid'}])assert.throws(()=>readPr356AdmissionPin(body(p),h));
 for(const b of ['',body(pin)+body(pin),body(pin)+'<!-- pr356-admission-pin:v1',body(pin).replace('v1','v2')])assert.throws(()=>readPr356AdmissionPin(b,h));
});

test('actual YAML gives eligible Ready PR the stable name while never selecting application qualification',()=>{
 const parsed=spawnSync('python3',['-c','import yaml,json; print(json.dumps(yaml.safe_load(open(".github/workflows/ci.yml"))["jobs"]))'],{encoding:'utf8'});assert.equal(parsed.status,0);const jobs=JSON.parse(parsed.stdout),job=jobs['merge-gate'];
 const evaluate=(expression,github,inputs={},phase='observe')=>{
  const body=expression.replace(/^\s*\$\{\{\s*/,'').replace(/\s*\}\}\s*$/,'');
  return vm.runInNewContext(body,{github,inputs,needs:{scope:{outputs:{application_route:'pr356',pr356_phase:phase}}},vars:{},always:()=>true,contains:(array,value)=>array.includes(value),fromJSON:JSON.parse},{timeout:1000});
 };
 const pr=draft=>({event_name:'pull_request',repository:REPOSITORY,ref:'refs/pull/356/merge',ref_name:'356/merge',event:{pull_request:{number:356,draft,head:{ref:BRANCH,repo:{full_name:REPOSITORY}}}}});
 assert.equal(evaluate(job.name,pr(false)),'merge gate / ready PR');assert.equal(evaluate(job.if,pr(false)),true);
 assert.equal(evaluate(job.name,pr(true)),'PR356 / no merge eligibility');assert.equal(evaluate(job.if,pr(true)),false);
 const dispatch={event_name:'workflow_dispatch',ref:'refs/heads/'+BRANCH,ref_name:BRANCH,event:{}};
 assert.equal(evaluate(job.name,dispatch,{pr356_phase:'qualify'},'qualify'),'PR356 / no merge eligibility');assert.equal(evaluate(job.if,dispatch,{pr356_phase:'qualify'},'qualify'),false);
 assert.equal(evaluate(job.name,dispatch,{pr356_phase:'admit'},'admit'),'merge gate / ready PR');assert.equal(evaluate(job.if,dispatch,{pr356_phase:'admit'},'admit'),true);
 for(const id of REQUIRED_PHASE_IDS)assert.equal(evaluate(jobs['pr356-'+id].if,pr(false)),false,id+' cannot replay on PR metadata admission');
});
