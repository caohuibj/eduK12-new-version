import {test} from 'node:test';import assert from 'node:assert/strict';
import {original,repaired,artifactPin,frontendPin,verifyOfficial,verifyArtifact,verifyClosure,verifyControlClosure,verifyFrozenReceipt} from './shared-authoring-reuse.mjs';
import {binding,branch} from './shared-authoring-scope.mjs';
const now=Date.parse('2026-10-23T06:00:00Z');
const run={id:original.run,head_sha:original.head,repository:{full_name:'caohuibj/eduK12-new-version'},head_repository:{full_name:'caohuibj/eduK12-new-version'},head_branch:branch,event:'pull_request',status:'completed',conclusion:'failure'};
const stages=['install official locked backend dependencies and exact Prisma client','missing backend dependency security audit','compile current backend once without repeating accepted semantic types','prepare only the disposable service database','actual compiled publication, frozen participant and released-report material chain'];
const job={id:original.backend,run_id:run.id,head_sha:run.head_sha,name:'shared-authoring / backend',status:'completed',conclusion:'success',completed_at:'2026-10-23T04:59:38Z',steps:stages.map(name=>({name,status:'completed',conclusion:'success'}))};
const artifact={id:artifactPin.id,name:artifactPin.name,size_in_bytes:artifactPin.size,digest:'sha256:'+artifactPin.sha256,expired:false,created_at:'2026-10-23T04:59:35Z',expires_at:'2026-10-26T04:59:35Z',workflow_run:{id:run.id,head_sha:run.head_sha,head_branch:branch,repository_id:1338215995,head_repository_id:1338215995}};
test('accepts an official successful component without promoting its failed parent',()=>{const r=verifyOfficial(run,job,'backend',now);assert.equal(r.parentRunConclusion,'failure');assert.equal(r.originalJobConclusion,'success')});
test('refuses wrong repository, event, branch, head or unfinished original run',()=>{for(const patch of [{repository:{full_name:'other/repo'}},{event:'push'},{head_branch:'main'},{head_sha:'0'.repeat(40)},{status:'in_progress'}])assert.throws(()=>verifyOfficial({...run,...patch},job,'backend',now))});
test('refuses failed, missing, cancelled, stale and incomplete original job steps',()=>{
 for(const patch of [{id:0},{conclusion:'failure'},{status:'in_progress'},{steps:[]},{steps:job.steps.map((s,i)=>i? s:{...s,conclusion:'cancelled'})}])assert.throws(()=>verifyOfficial(run,{...job,...patch},'backend',now));
 assert.throws(()=>verifyOfficial(run,job,'backend',now+86400000));assert.throws(()=>verifyOfficial(run,job,'backend',now-86400000));
});
test('requires the actual successful application CodeQL stages',()=>{const sast={...job,id:original.sast,name:'codeql (javascript/typescript SAST)',steps:['initialize CodeQL','analyze with CodeQL'].map(name=>({name,status:'completed',conclusion:'success'}))};verifyOfficial(run,sast,'sast',now);assert.throws(()=>verifyOfficial(run,{...sast,steps:sast.steps.slice(0,1)},'sast',now))});
test('pins original artifact identity, ZIP digest, size, freshness and run ownership',()=>{verifyArtifact(artifact,now);for(const patch of [{id:0},{digest:'sha256:wrong'},{expired:true},{size_in_bytes:0},{workflow_run:{...artifact.workflow_run,head_sha:'0'.repeat(40)}}])assert.throws(()=>verifyArtifact({...artifact,...patch},now));assert.throws(()=>verifyArtifact(artifact,now+86400000))});
test('requires unchanged backend and frozen consumer bytes; SAST permits only freshly scanned sanitizer tests',()=>{
 const read=(...args)=>args[0]==='diff'?'server-version/frontend/src/utils/__tests__/sanitize.test.ts':args[1].endsWith(':server-version/backend')?binding.components.backend:args[1].endsWith(':server-version/frontend/src/utils/__tests__/sanitize.test.ts')?binding.source['server-version/frontend/src/utils/__tests__/sanitize.test.ts'].after:'frozen';
 verifyClosure('backend',read);verifyClosure('sast',read);
 assert.throws(()=>verifyClosure('backend',(...args)=>args[1]==='HEAD:server-version/backend'?'drift':read(...args)));
 assert.throws(()=>verifyClosure('backend',(...args)=>args[1]==='HEAD:.github/scripts/shared-authoring-frozen.cjs'?'drift':read(...args)));
 assert.throws(()=>verifyClosure('sast',(...args)=>args[0]==='diff'?'server-version/frontend/src/utils/sanitize.ts':read(...args)));
});
test('refuses missing frozen-chain assertions and false manual acceptance claims',()=>{const r={status:'PASS',compiledBackend:true,syntheticAccounts:true,loginUiManuallyAccepted:false,checks:Array.from({length:7},(_,i)=>'check '+i)};verifyFrozenReceipt(r);for(const patch of [{status:'FAIL'},{compiledBackend:false},{loginUiManuallyAccepted:true},{checks:['same','same']}])assert.throws(()=>verifyFrozenReceipt({...r,...patch}))});
test('frontend reuse requires its exact tree and successful new-lock types sanitizer audit and build',()=>{
 const r={...run,id:repaired.run,head_sha:repaired.head};
 const j={...job,id:repaired.frontend,run_id:r.id,head_sha:r.head_sha,name:'shared-authoring / frontend',steps:['install official locked frontend dependencies','missing frontend dependency security audit','verify the new dependency with current app types and sanitizer boundary regressions','compile the repaired current frontend once'].map(name=>({name,status:'completed',conclusion:'success'}))};
 verifyOfficial(r,j,'frontend',now,repaired);assert.throws(()=>verifyOfficial(r,{...j,steps:j.steps.slice(0,3)},'frontend',now,repaired));
 const a={...artifact,id:frontendPin.id,name:frontendPin.name,size_in_bytes:frontendPin.size,digest:'sha256:'+frontendPin.sha256,workflow_run:{...artifact.workflow_run,id:r.id,head_sha:r.head_sha}};verifyArtifact(a,now,frontendPin,repaired);
 const read=(...args)=>args[1].endsWith(':server-version/backend')?binding.components.backend:binding.components.frontend;
 verifyClosure('frontend',read);assert.throws(()=>verifyClosure('frontend',(...args)=>args[1]==='HEAD:server-version/frontend'?'drift':read(...args)));
});
test('prior control scan reuse refuses any change outside fresh CodeQL paths',()=>{
 const paths=['.github/scripts/shared-authoring-browser.mjs','.github/scripts/shared-authoring-checks.mjs','.github/scripts/shared-authoring-reuse.mjs','.github/scripts/shared-authoring-reuse.test.mjs','.github/scripts/shared-authoring.test.mjs'];
 verifyControlClosure(()=>paths.join('\n'));assert.throws(()=>verifyControlClosure(()=>[...paths,'.github/scripts/merge-gate.mjs'].join('\n')));assert.throws(()=>verifyControlClosure(()=>paths.slice(1).join('\n')));
});
