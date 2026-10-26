/** Direct adapter contracts with fake recompute/aggregate. No official API,
 * application, historical evidence admission or CI is executed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runPr356StableGate} from './pr356-stable-gate.mjs';
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
