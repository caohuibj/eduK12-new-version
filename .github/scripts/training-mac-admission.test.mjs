import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256,MAC_REQUIRED,REQUIRED,validExactPlan,TOOLS} from './exact-candidate-scope.mjs';
import {verifyMacHistory,verifyRuntimeIdentity,verifyCompleteRuntime} from './training-mac-admission.mjs';
const raw=JSON.parse(readFileSync(new URL('./training-mac-attestation.json',import.meta.url)));
const plan={schema:1,route:'exact-candidate',candidate:'training-mac',postMerge:false,
  base:'1'.repeat(40),head:'2'.repeat(40),sourceHead:'3'.repeat(40),tree:'4'.repeat(40),
  productInventorySha256:'5'.repeat(64),diffSha256:'6'.repeat(64),required:[...MAC_REQUIRED],
  macRuntime:{requiredRuntimePhases:['prepare','backend-compile','frontend-compile','frontend-app-types','changed-lint',
    'dependency-audit','compiled-browser','scoped-pg-http','runtime-packaging','runtime-scans','schema-upgrade-restore']}};
function record(){return {...structuredClone(raw),reviewed:true,originalProductInventorySha256:'7'.repeat(64),productInventorySha256:plan.productInventorySha256,reviewedProductDelta:[]};}
function admit(r=record(),p=plan){const b=Buffer.from(JSON.stringify(r));return verifyMacHistory(b,p,[],'7'.repeat(64),sha256(b));}
function result(){return {status:'success',phases:plan.macRuntime.requiredRuntimePhases.map(name=>({name,status:'success'}))};}
test('Mac has its own complete required gates and Measurement requirements stay intact',()=>{
 assert.ok(validExactPlan(plan));assert.ok(validExactPlan({...plan,candidate:'measurement',required:[...REQUIRED]}));
 assert.equal(validExactPlan({...plan,required:[...REQUIRED]}),false);
 for(const file of ['training-mac-admission.mjs','training-mac-runtime.py','training-mac-browser.mjs'])assert.ok(TOOLS.includes('.github/scripts/'+file));
});
test('bounded historical metadata retains failed exits and unknown build exit without pretending CI',()=>{
 const r=admit();assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);
 assert.equal(r.historicalInvocations.filter(x=>x.originalStatus==='failed').length,2);
 assert.ok(r.historicalInvocations.every(x=>x.originalPassingCaseNames.length===0));
});
test('unreviewed or changed digest is blocking',()=>{
 const b=Buffer.from(JSON.stringify(record()));assert.throws(()=>verifyMacHistory(b,plan,[],'7'.repeat(64),null),/pending/);
 assert.throws(()=>verifyMacHistory(b,plan,[],'7'.repeat(64),'8'.repeat(64)),/changed/);
});
test('failed invocation cannot be relabeled and post-hoc lists are not tests',()=>{
 const r=record();r.executions.find(x=>x.originalExitCode===1).originalStatus='passed';assert.throws(()=>admit(r));
 const s=record();s.executions.find(x=>x.kind==='post-hoc-case-collection').countedAsApplicationTest=true;assert.throws(()=>admit(s));
});
test('reconstructed passing names and empty-log PASS cannot enter admission',()=>{
 const r=record();r.executions[0].originalPassingCaseNames=['reconstructed'];assert.throws(()=>admit(r));
 const s=record();s.types.admittedAsPassed=true;assert.throws(()=>admit(s));
 const t=record();t.compiledOutput.originalExitCode=0;assert.throws(()=>admit(t));
});
test('current source/delta changes and postmerge cannot qualify a PR',()=>{
 const r=record();r.reviewedProductDelta=[{path:'unexpected'}];assert.throws(()=>admit(r));
 assert.throws(()=>admit(record(),{...plan,postMerge:true}));
 assert.throws(()=>admit(record(),{...plan,productInventorySha256:'9'.repeat(64)}));
});
test('runtime requires every actual named phase, not skipped or missing browser/PG',()=>{
 verifyCompleteRuntime(result(),plan);
 for(const name of ['compiled-browser','scoped-pg-http','runtime-scans','schema-upgrade-restore']){
  const r=result();r.phases=r.phases.filter(p=>p.name!==name);assert.throws(()=>verifyCompleteRuntime(r,plan));
  const s=result();s.phases.find(p=>p.name===name).status='skipped';assert.throws(()=>verifyCompleteRuntime(s,plan));
 }
});
test('runtime evidence binds exact plan, run attempt and inputs',()=>{
 const p=Buffer.from(JSON.stringify(plan)),i=Buffer.from('fixed inputs');
 const r={...result(),head:plan.head,sourceHead:plan.sourceHead,tree:plan.tree,planSha256:sha256(p),inputsSha256:sha256(i),consumerRunId:'123',consumerAttempt:'1'};
 verifyRuntimeIdentity(r,plan,p,i,{GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'});
 assert.throws(()=>verifyRuntimeIdentity(r,plan,p,i,{GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2'}));
 assert.throws(()=>verifyRuntimeIdentity({...r,phases:[...r.phases,r.phases[0]]},plan,p,i,{GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'}));
});
test('new Mac job cannot replace or bypass Measurement result aggregation',()=>{
 const text=readFileSync(new URL('../workflows/ci-exact-candidate.yml',import.meta.url),'utf8');
 assert.match(text,/candidate == 'measurement'/);assert.match(text,/candidate == 'training-mac'/);
 assert.match(text,/needs: \[admission, browser, runtime, mac\]/);
 assert.match(text,/selected.includes\(name\)\?'success':'skipped'/);
 const workflow=readFileSync(new URL('../workflows/ci-training-mac-qualification.yml',import.meta.url),'utf8');
 assert.match(workflow,/training-mac-admission.mjs runtime/);
 assert.match(workflow,/retain-compiles/);assert.match(workflow,/retain-images/);
 assert.doesNotMatch(workflow,/Library|download_url|npm run test|npm run build/);
});

test('packaged diagnostic retention never grants scanned qualification',async()=>{
  const {unqualifiedPackaged}=await import('./training-mac-admission.mjs');
  assert.equal(unqualifiedPackaged({phases:[]}),false);
  assert.equal(unqualifiedPackaged({phases:[{name:'runtime-packaging',status:'failure'}]}),false);
  assert.equal(unqualifiedPackaged({phases:[{name:'runtime-packaging',status:'success'},{name:'runtime-scans',status:'failure'}]}),true);
  assert.equal(unqualifiedPackaged({phases:[{name:'runtime-packaging',status:'success'},{name:'runtime-scans',status:'success'}]}),false);
});
