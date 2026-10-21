import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {sha256,REQUIRED,REPOSITORY,TOOLS,validateFrozen,productFingerprint,
  exactCandidateOutputs,exactCandidatePlan,validExactPlan,verifyUnchangedCatalogInputs,situationalPublicationBoundary} from './exact-candidate-scope.mjs';
import {admitHistorical,LOCAL_REQUIRED,backendTypesFingerprint,validateBrowserRecords,verifyConsumedInputs,verifyRecordedEnvironment,reviewedWrapperReporterException,admitNewCognitive} from './exact-candidate-admission.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';

const h='1'.repeat(40), base='2'.repeat(40),blob='3'.repeat(40);
const rows=[{path:'server-version/backend/src/index.ts',mode:'100644',blob}];
const product=productFingerprint(rows);
const plan={schema:1,route:'exact-candidate',candidate:'measurement',base,head:h,sourceHead:h,tree:h,
  postMerge:false,productInventorySha256:product,diffSha256:'4'.repeat(64),required:[...REQUIRED],
  sourceReference:h,components:{frontend:{archiveSha256:'7'.repeat(64)}},runtime:null};
function environment() {
  return {assurance:'reviewed-historical-not-cryptographic-environment',fullHistoricalDependencyByteManifest:false,
    limitations:['Original full dependency byte manifest was not recorded; retained versions corroborate the original lock.'],
    originalToolHashes:[{name:'node',sha256:'6'.repeat(64)}],lockfiles:[{path:'package-lock.json',blob}],
    generatedInputs:{notApplicable:true,rationale:'This synthetic tooling fixture consumes no generated inputs.'},
    retainedPackageVersions:[{name:'typescript',version:'5.9.3',provenance:'retained-version-matches-original-lock'}]};
}
function fresh() {
  return {id:'frontend-cognitive-types',kind:'recorded-local-execution',reviewed:true,status:'passed',exitCode:0,
    ciExecuted:false,originalExecutionSigned:false,trackedCheckoutUnchanged:true,head:h,sourceHead:h,productInventorySha256:product,
    command:['node','--require','capture-reads.cjs','node_modules/typescript/bin/tsc','-p','tsconfig.cognitive.json','--noEmit'],
    nodeVersion:'24.21.0',typescriptVersion:'5.6.3',nodeSha256:'6'.repeat(64),officialDependencyArchiveSha256:'7'.repeat(64),
    startedAt:'2026-10-20T13:24:57Z',finishedAt:'2026-10-20T13:25:05Z',
    evidence:['execution.json','consumed-reads.json','original-command.log','original-command.exit','capture-reads.cjs','run-once.py'].map(name=>({name,sha256:'5'.repeat(64)})),
    sourceInputs:rows,dependencyInputs:[{path:'node_modules/typescript/lib/tsc.js',sha256:'8'.repeat(64)}]};
}
function attestation() {
  return {schema:1,kind:'reviewed-local-evidence',historicalKind:'reviewed-historical-local',freshChecks:[fresh()],candidate:'measurement',
    originalExecutionSigned:false,ciExecuted:false,productInventorySha256:product,required:[...LOCAL_REQUIRED],
    checks:LOCAL_REQUIRED.map(id=>({id,reviewed:true,outcome:'passed',evidence:[{name:'original.json',sha256:'5'.repeat(64)}],
      environmentEvidence:environment(),originalExitCode:0,originalStatus:'passed',failureHistory:[],selectedCases:[{name:id,status:'passed'}],
      ...(id==='backend-types'?{inputClosure:backendTypesFingerprint(rows)}:
        {inputs:rows,closureReview:'reviewed-transitive-source-and-recorded-environment'})}))};
}
function admit(a=attestation(),p=plan,r=rows) {const b=Buffer.from(JSON.stringify(a));return admitHistorical(b,p,r,sha256(b));}
function needs() {return {scope:{result:'success',outputs:Object.fromEntries(
  Object.entries(exactCandidateOutputs(plan)).map(([k,v])=>[k,String(v)]))},
  'exact-candidate':{result:'success'},codeql:{result:'success'}};}
test('historical admission is explicit and never relabeled CI execution or signature',()=>{
  const result=admit();assert.equal(result.kind,'reviewed-local-evidence');assert.equal(result.historicalKind,'reviewed-historical-local');
  assert.equal(result.ciExecuted,false);assert.equal(result.originalExecutionSigned,false);
});
test('unreviewed digest, tampered bytes and missing category cannot pass',()=>{
  const b=Buffer.from(JSON.stringify(attestation()));
  assert.throws(()=>admitHistorical(b,plan,rows),/independent review/);
  assert.throws(()=>admitHistorical(Buffer.concat([b,Buffer.from(' ')]),plan,rows,sha256(b)),/independent review/);
  const a=attestation();a.checks.pop();assert.throws(()=>admit(a),/claims/);
});
test('no blank logs, documentation statement or zero-execution substitute',()=>{
  for(const mutate of [
    a=>a.checks[0].evidence=[],
    a=>a.checks[0].selectedCases=[],
    a=>a.checks[0].reviewed=false,
    a=>a.checks[0].selectedCases[0].status='skipped',
    a=>a.originalExecutionSigned=true,
    a=>a.ciExecuted=true,
  ]) {const a=attestation();mutate(a);assert.throws(()=>admit(a));}
});
test('changed input, wrong candidate and incomplete closure fail closed',()=>{
  assert.throws(()=>admit(attestation(),plan,[{...rows[0],blob:'9'.repeat(40)}]),/closure/);
  const a=attestation();a.candidate='training-mac';assert.throws(()=>admit(a),/candidate/);
  const b=attestation();b.checks[1].inputs=[];assert.throws(()=>admit(b),/closure/);
  const c=attestation();c.checks[1].inputs=[{...rows[0],mode:'100755'}];assert.throws(()=>admit(c),/consumed input/);
});
test('failed invocation stays failed while named successful case may be admitted',()=>{
  const a=attestation(),c=a.checks.find(c=>c.id==='connected-http-contracts');
  delete c.originalExitCode;delete c.originalStatus;
  c.executions=[{id:'failed-original',exitCode:1,status:'failed',cases:[
    {name:'original-pass',status:'passed'},{name:'original-fail',status:'failed'}]},
    {id:'corrected-only',exitCode:0,status:'passed',cases:[
      {name:'original-pass',status:'skipped'},{name:'corrected-pass',status:'passed'}]}];
  c.selectedCases=[{name:'original-pass',status:'passed',executionId:'failed-original'},
    {name:'corrected-pass',status:'passed',executionId:'corrected-only'}];
  for(const e of c.executions)e.environmentEvidence=environment();
  c.inputSets=c.executions.map(e=>({executionId:e.id,inputs:rows}));
  assert.equal(admit(a).status,'success');
  c.selectedCases[0].executionId='corrected-only';assert.throws(()=>admit(a),/actually passed/);
  c.selectedCases[0].executionId='failed-original';c.executions[0].status='passed';
  assert.throws(()=>admit(a),/relabeled/);
});
test('missing process exit may admit only reviewed actual reporter cases, never command completion',()=>{
  const a=attestation(),c=a.checks[3];
  c.admission='selected-successful-cases';
  c.executions=[{id:'original-reporter',exitCode:null,status:'unknown',cases:[
    {name:'actually passed',status:'passed'},{name:'filtered',status:'skipped'}]}];
  c.selectedCases=[{name:'actually passed',status:'passed',executionId:'original-reporter'}];
  c.executions[0].environmentEvidence=environment();
  c.inputSets=[{executionId:'original-reporter',inputs:rows}];
  assert.equal(admit(a).status,'success');
  c.executions[0].status='passed';assert.throws(()=>admit(a),/relabeled/);
});
test('disjoint deltas require exact blobs, exact selected cases and complete transitive review',()=>{
  const after=[{...rows[0],blob:'a'.repeat(40)}];
  const overlay={path:rows[0].path,before:blob,after:after[0].blob,mode:'100644',reviewed:true,
    selectedCases:['fixed case'],review:{transitiveEffects:'unaffected',
      imports:'reviewed-unaffected',sharedState:'reviewed-unaffected',validators:'reviewed-unaffected',
      callees:'reviewed-unaffected',config:'reviewed-unaffected',schema:'reviewed-unaffected',
      rationale:'Exact independently inspected delta is not consumed by this fixed original case.'}};
  verifyConsumedInputs(rows,[overlay],['fixed case'],after);
  for(const change of [{after:blob},{reviewed:false},{selectedCases:['other case']},
    {review:{...overlay.review,sharedState:'unknown'}}])
    assert.throws(()=>verifyConsumedInputs(rows,[{...overlay,...change}],['fixed case'],after));
  assert.throws(()=>verifyConsumedInputs(rows,[overlay],['fixed case'],rows),/Unused/);
});
test('no extra, duplicate or changed selected obligations',()=>{
  const a=attestation();a.required.pop();assert.throws(()=>admit(a),/selection/);
  const b=attestation();b.checks.push(b.checks[0]);assert.throws(()=>admit(b),/claims/);
  const c=attestation();c.checks[0].selectedCases.push(c.checks[0].selectedCases[0]);assert.throws(()=>admit(c),/duplicate/);
  assert.equal(validExactPlan({...plan,required:REQUIRED.slice(1)}),false);
});
test('stable merge gate selects narrow mandatory job and SAST, and rejects every non-success',()=>{
  assert.deepEqual(requiredChecks(needs(),false),['scope','exact-candidate','codeql']);
  assert.deepEqual(failedChecks(needs(),false),[]);
  for(const key of ['scope','exact-candidate','codeql'])
    for(const state of ['failure','skipped','cancelled',undefined]) {
      const n=needs();n[key].result=state;assert.ok(failedChecks(n,false).includes(key));
    }
  assert.ok(failedChecks(needs(),true).includes('scope'));
});
test('gate rejects selected-route drift and postmerge masquerading as a PR',()=>{
  for(const field of ['ops','perf_smoke','media2','frontend_build']) {
    const n=needs();n.scope.outputs[field]='true';assert.ok(failedChecks(n,false).includes('scope'));
  }
  const n=needs();n.scope.outputs.exact_candidate_plan=JSON.stringify({...plan,postMerge:true});
  assert.ok(failedChecks(n,false).includes('scope'));
});
test('frozen scope binds complete product, diff, base, source tree and file mode',()=>{
  const input={candidate:'measurement',base,head:h,sourceHead:h,tree:h,sourceTree:h,rows,diffHash:plan.diffSha256};
  const bindings={candidates:{measurement:{enabled:true,base,productInventorySha256:product,diffSha256:plan.diffSha256}}};
  assert.ok(validateFrozen(input,bindings));
  for(const change of [{base:h},{sourceTree:base},{diffHash:'0'.repeat(64)},
    {rows:[...rows,{path:'unknown.txt',mode:'100644',blob}]},
    {rows:[...rows,{path:TOOLS[0],mode:'100755',blob}]}])
    assert.throws(()=>validateFrozen({...input,...change},bindings));
  assert.throws(()=>validateFrozen({...input,candidate:'training-mac'},bindings),/not frozen/);
});
test('two named branches reject full/manual, foreign PR and invalid Mac identity without fallback',()=>{
  const env={CI_EVENT:'pull_request',CI_HEAD_REF:'work/measurement-version-final-20261020',
    CI_SOURCE_HEAD:h,CI_PR_REPOSITORY:REPOSITORY,GITHUB_REPOSITORY:REPOSITORY};
  for(const extra of [{CI_FORCE_FULL:'true'},{CI_EVENT:'workflow_dispatch'},{CI_PR_REPOSITORY:'other/repo'},
    {CI_HEAD_REF:'work/training-mac-ui-final-20261020'}])
    assert.throws(()=>exactCandidatePlan(base,h,{...env,...extra}));
  assert.equal(exactCandidatePlan(base,h,{...env,CI_HEAD_REF:'unrelated'}),null);
});
function browserFixture() {
  const proof={candidate:'measurement',productInventorySha256:product,runId:123,head:h,attempt:1,
    jobs:Array.from({length:6},(_,i)=>({id:i+1,name:'fixed-'+i})),
    artifact:{id:456,name:'fixed-browser',bytes:100},requiredChecks:['actual scenario']};
  const run={id:123,head_sha:h,run_attempt:1,repository:{full_name:REPOSITORY},head_repository:{full_name:REPOSITORY},
    event:'push',path:'.github/workflows/ci-measurement-browser.yml',head_branch:'ci/measurement-browser-20261020',
    status:'completed',conclusion:'success'};
  const jobs=proof.jobs.map(j=>({...j,status:'completed',conclusion:'success'}));
  const artifact={id:456,name:'fixed-browser',size_in_bytes:100,expired:false,workflow_run:{id:123,head_sha:h}};
  const report={head:h,status:'PASS',selectedPhase:'journeys',pageErrors:[],blockedExternalRequests:[],
    callbackFailures:[],checks:[{name:'actual scenario',status:'PASS'}]};
  return {proof,run,jobs,artifact,report};
}
test('fixed official browser identities cannot turn partial successful checks into run success',()=>{
  const check=f=>validateBrowserRecords(f.proof,f.run,f.jobs,f.artifact,f.report,plan);
  assert.equal(check(browserFixture()).status,'success');
  for(const change of [f=>f.run.conclusion='failure',f=>f.jobs[5].conclusion='skipped',
    f=>f.artifact.expired=true,f=>f.report.status='FAIL',f=>f.report.checks=[],
    f=>f.report.callbackFailures=['error'],f=>f.run.head_sha=base]) {
    const f=browserFixture();change(f);assert.throws(()=>check(f));
  }
});
test('browser admission preserves original ordered repeated checks, not arbitrary duplicate successes',()=>{
  const f=browserFixture();
  f.proof.requiredChecks.push('actual scenario');
  f.report.checks.push({name:'actual scenario',status:'PASS'});
  assert.equal(validateBrowserRecords(f.proof,f.run,f.jobs,f.artifact,f.report,plan).status,'success');
  f.report.checks.push({name:'actual scenario',status:'PASS'});
  assert.throws(()=>validateBrowserRecords(f.proof,f.run,f.jobs,f.artifact,f.report,plan),/selection/);
});
test('only new qualification jobs are wired, no old test rerun in dedicated workflow',()=>{
  const workflow=readFileSync(new URL('../workflows/ci-exact-candidate.yml',import.meta.url),'utf8');
  for(const forbidden of ['npm run build','vitest','tsc --noEmit','npm test','node --test'])
    assert.equal(workflow.includes(forbidden),false,forbidden);
  assert.match(workflow,/needs: \[admission, browser\]/);
  assert.match(workflow,/needs: \[admission, browser, runtime, mac\]/);
  assert.match(workflow,/selected.includes\(name\)\?'success':'skipped'/);
  const main=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  assert.match(main,/needs: \[scope, exact-candidate,/);
  assert.match(main,/application_route == 'exact-candidate'/);
});
test('actual scope CLI stops malformed exact candidate identity rather than printing legacy plan',()=>{
  const child=spawnSync(process.execPath,['.github/scripts/content-scope.mjs'],{
    encoding:'utf8',env:{...process.env,CI_EVENT:'pull_request',CI_HEAD_REF:'work/training-mac-ui-final-20261020',
      CI_SOURCE_HEAD:h,CI_BASE_SHA:base,CI_PR_REPOSITORY:REPOSITORY,GITHUB_REPOSITORY:REPOSITORY}});
  assert.notEqual(child.status,0);assert.ok(child.stderr.trim().length>0);
  assert.equal(child.stdout.includes('legacy'),false);
});
test('all fifteen manual probes and scope/merge refuse the two bounded branches at job.if',()=>{
  const main=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const blocks=main.split(/\n  (?=[a-z][a-z0-9-]*:\n)/);
  const guarded=blocks.filter(b=>/^(probe-[\w-]+|scope|merge-gate):\n/.test(b));
  assert.equal(guarded.length,17);
  for(const b of guarded) {
    const condition=b.match(/\n    if: ([^\n]+)/)?.[1];
    assert.match(condition,/!\(github.event_name == 'workflow_dispatch' && contains/);
    assert.match(condition,/work\/measurement-version-final-20261020/);
    assert.match(condition,/work\/training-mac-ui-final-20261020/);
  }
});

test('historical environment discloses limited corroboration without inventing a byte manifest',()=>{
  verifyRecordedEnvironment(environment());
  for(const change of [{fullHistoricalDependencyByteManifest:true},{limitations:[]},
    {originalToolHashes:[]},{assurance:'cryptographically-exact-environment'},
    {generatedInputs:{notApplicable:true,rationale:'unknown'}}])
    assert.throws(()=>verifyRecordedEnvironment({...environment(),...change}));
  const a=attestation();delete a.checks[0].environmentEvidence;assert.throws(()=>admit(a),/environment/);
});

test('explicit absent old dependency requires exact reviewed added overlay',()=>{
  const original=[{path:rows[0].path,blob:null,mode:null}];
  const overlay={path:rows[0].path,before:null,after:blob,mode:'100644',change:'added',reviewed:true,
    selectedCases:['fixed'],review:{transitiveEffects:'unaffected',imports:'reviewed-unaffected',
    sharedState:'reviewed-unaffected',validators:'reviewed-unaffected',callees:'reviewed-unaffected',
    config:'reviewed-unaffected',schema:'reviewed-unaffected',rationale:'Exact new dependency is reviewed as no-op for the original selected source consumer.'}};
  verifyConsumedInputs(original,[overlay],['fixed'],rows);
  assert.throws(()=>verifyConsumedInputs(original,[{...overlay,change:undefined}],['fixed'],rows));
});
test('unavailable original environment is not a generic unknown invocation exemption',()=>{
  const e={...environment(),originalToolHashes:{unavailable:true,rationale:'The original separately executed reporter invocation did not retain tool hashes.'}};
  assert.throws(()=>verifyRecordedEnvironment(e),/exact reviewed wrapper/);
  verifyRecordedEnvironment(e,true);
  assert.throws(()=>verifyRecordedEnvironment({...e,lockfiles:e.originalToolHashes},true),/exact reviewed wrapper/);
});

test('real wrapper exception binds exactly its report, 35 names and honest source provenance',()=>{
  const a=JSON.parse(readFileSync(new URL('./exact-candidate-attestation.json',import.meta.url)));
  const c=a.checks.find(c=>c.id==='affected-unit-contracts'),e=c.executions[0];
  assert.equal(reviewedWrapperReporterException(c,e),true);
  for(const change of [{id:'other'}, {exitCode:0,status:'passed'}])
    assert.equal(reviewedWrapperReporterException(c,{...e,...change}),false);
  for(const change of [{selectedCases:c.selectedCases.slice(1)}, {evidence:[]},
    {historicalInputBinding:true}, {invocationCompletionProven:true}])
    assert.equal(reviewedWrapperReporterException({...c,...change},e),false);
});

test('new Cognitive proof stays a recorded execution, not an inferred historical pass',()=>{
  assert.equal(admitNewCognitive(fresh(),plan,rows).kind,'recorded-local-execution');
  for(const change of [{reviewed:false},{exitCode:1},{kind:'reviewed-historical-local'},
    {officialDependencyArchiveSha256:'0'.repeat(64)},{sourceInputs:[]},{dependencyInputs:[]},
    {evidence:[]},{productInventorySha256:'0'.repeat(64)}])assert.throws(()=>admitNewCognitive({...fresh(),...change},plan,rows));
});

test('standalone catalog boundary refuses changed consumed inputs and exhaustive catalog additions',()=>{
  const input={path:'server-version/backend/src/modules/situational/instruments/fixed/instrument.json',blob,mode:'100644'};
  verifyUnchangedCatalogInputs([input],[input],[input]);
  for(const changed of [[{...input,blob:h}],[{...input,mode:'100755'}],[],
    [input,{...input,path:input.path.replace('fixed/','new/')}]] )
    assert.throws(()=>verifyUnchangedCatalogInputs([input],[input],changed));
  assert.equal(situationalPublicationBoundary(base,h,{CI_HEAD_REF:'unrelated'}),null);
  assert.throws(()=>situationalPublicationBoundary(base,h,{CI_HEAD_REF:'work/measurement-version-final-20261020',CI_EVENT:'push'}),/actual PR/);
});
test('all automatic workflow entry points are inventoried and standalone exact branch avoids installation',()=>{
  const dir=new URL('../workflows/',import.meta.url);
  const automatic=readdirSync(dir).filter(p=>/\.ya?ml$/.test(p)).filter(p=>
    /\n  (push|pull_request|pull_request_review|pull_request_target|workflow_run|schedule|release):/.test(readFileSync(new URL(p,dir),'utf8').split('\njobs:')[0])).sort();
  assert.deepEqual(automatic,['ci-measurement-browser.yml','ci-shared-assessment-foundation.yml','ci.yml','situational-publication.yml']);
  const workflow=readFileSync(new URL('situational-publication.yml',dir),'utf8');
  assert.match(workflow,/situationalPublicationBoundary/);
  assert.match(workflow,/if: contains\(fromJSON\('\["work\/measurement-version-final-20261020","work\/training-mac-ui-final-20261020"\]'/);
  assert.match(workflow,/Detect publication-relevant changes\n        if: steps.exact.outputs.handled != 'true'/);
  assert.match(workflow,/npm ci --ignore-scripts\n        if: steps.scope.outputs.relevant == 'true'/);
});

test('optional legacy step plans remain parseable before false route conditions are applied',()=>{
  const main=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
  const expressions=[...main.matchAll(/fromJSON\((steps\.scope\.outputs\.[a-z_]+)([^)]*)\)/g)];
  assert.equal(expressions.length,1);
  for(const [,name,fallback] of expressions) {
    assert.equal(name,'steps.scope.outputs.homepage_copy_plan');
    assert.equal(fallback," || '{}'");
  }
  const outputs=exactCandidateOutputs(plan);
  assert.equal(outputs.homepage_copy_plan,undefined);
  assert.equal(JSON.parse(outputs.homepage_copy_plan || '{}').base,undefined);
  const homepage={base:'a'.repeat(40)};
  assert.deepEqual(JSON.parse(JSON.stringify(homepage) || '{}'),homepage);
  assert.throws(()=>JSON.parse('invalid' || '{}'));
  assert.match(main,/if: steps.scope.outputs.application_route == 'homepage-copy' && github.event_name == 'pull_request'/);
});

test('restored route requires real runtime qualification and cannot select diagnosis instead',()=>{
  const workflow=readFileSync(new URL('../workflows/ci-exact-candidate.yml',import.meta.url),'utf8');
  const runtime=workflow.split('\n  runtime:\n')[1].split('\n  ready:\n')[0];
  assert.doesNotMatch(runtime,/if: false/);
  assert.doesNotMatch(workflow,/schema-diagnostic:/);
  assert.match(runtime,/exact-candidate-runtime.py --plan exact-candidate-plan.json --phase all/);
  assert.match(workflow,/needs: \[admission, browser, runtime, mac\]/);
  assert.match(workflow,/selected.includes\(name\)\?'success':'skipped'/);
});

test('restored runtime result requires original three-phase admission without execution claims',()=>{
  const workflow=readFileSync(new URL('../workflows/ci-exact-candidate.yml',import.meta.url),'utf8');
  assert.match(workflow,/details.kind,'admitted-prior-official-success'/);
  assert.match(workflow,/details.ciExecuted,false/);
  assert.match(workflow,/details.original.consumerRunId,'39442752356'/);
  assert.match(workflow,/details.original.head,'16625dbd4cfd938e16f7c0adb5e14a01c0ebd22c'/);
});

test('Mac catalog accepts only exact reviewed follow-redirects dependency pairs',async()=>{
  const {MAC_CATALOG_DEPENDENCY_DELTA:pairs}=await import('./exact-candidate-scope.mjs');
  const inputs=pairs.map(r=>({path:r.path,blob:r.before,mode:'100644'}));
  const after=pairs.map(r=>({path:r.path,blob:r.after,mode:'100644'}));
  verifyUnchangedCatalogInputs(inputs,inputs,after,pairs);
  assert.throws(()=>verifyUnchangedCatalogInputs(inputs,inputs,after));
  assert.throws(()=>verifyUnchangedCatalogInputs(inputs,inputs,after,[{...pairs[0],after:'1'.repeat(40)},pairs[1]]));
  assert.throws(()=>verifyUnchangedCatalogInputs(inputs,inputs,[{...after[0],blob:'1'.repeat(40)},after[1]],pairs));
});
