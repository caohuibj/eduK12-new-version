import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,sharedAuthoringPlan,sharedAuthoringOutputs} from './shared-authoring-scope.mjs';
import {verifyReviewedEvidence} from './shared-authoring-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='f'.repeat(40),tree='e'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:'d'.repeat(40),CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
const entries=[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
const read=(_mode,object)=>{if(object.endsWith('^{tree}'))return tree;const ref=object.slice(0,40),file=object.slice(41);return file.startsWith('server-version/')&&file.split('/').length===2?binding.components[file.split('/')[1]]:binding.source[file]?.[ref===binding.base?'before':'after']??binding.protectedInputs[file]??binding.controlBefore[file]};
const plan=(values=entries,options=env,reader=read,base=binding.base)=>sharedAuthoringPlan(values,base,head,reader,options);
test('admits exact raw patch including only the identical shared helper move',()=>{const p=plan();assert.equal(p.postMerge,false);assert.equal(p.product,binding.product);assert.equal(p.changes.length,entries.length)});
test('rejects unknown, missing, duplicate paths and modified modes',()=>{
 for(const changed of [[...entries,{file:'server-version/backend/src/index.ts',status:'M',oldMode:'100644',newMode:'100644'}],entries.slice(1),[...entries.slice(1),entries[1]],entries.map((e,i)=>i===0?{...e,newMode:'120000'}:e)])assert.throws(()=>plan(changed));
});
test('rejects base drift, unknown product bytes, component and lock drift',()=>{
 assert.throws(()=>plan(entries,env,read,'0'.repeat(40)));
 for(const target of [Object.keys(binding.source).find(f=>binding.source[f].after),'server-version/frontend','server-version/backend/package-lock.json'])assert.throws(()=>plan(entries,env,(mode,object)=>object===head+':'+target?'0'.repeat(40):read(mode,object)));
});
test('rejects external/wrong branches, force-full, manual and source/merge tree drift',()=>{
 for(const changes of [{CI_PR_REPOSITORY:'someone/other'},{CI_HEAD_REF:'main'},{CI_FORCE_FULL:'true'},{CI_EVENT:'workflow_dispatch'}])assert.throws(()=>plan(entries,{...env,...changes}));
 assert.throws(()=>plan(entries,env,(mode,object)=>object===head+'^{tree}'?'0'.repeat(40):read(mode,object)),/tree/);
});
test('missing marker on the known PR branch refuses fallback, unrelated patches retain routing',()=>{
 assert.throws(()=>plan(entries.filter(e=>e.file!==marker)),/marker/);
 assert.equal(plan([],{...env,CI_HEAD_REF:'unrelated'}),null);
});
test('only exact main post-merge event classifies without replaying qualification',()=>{
 const p=plan(entries,{CI_EVENT:'push',GITHUB_REF_NAME:'main'});assert.equal(p.postMerge,true);assert.equal(sharedAuthoringOutputs(p).codeql,false);
 assert.throws(()=>plan(entries,{CI_EVENT:'push',GITHUB_REF_NAME:'other'}));
});
test('requires all real candidate, scope and CodeQL successes and rejects drafts or forged outputs',()=>{
 const outputs=Object.fromEntries(Object.entries(sharedAuthoringOutputs(plan())).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'shared-authoring':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','shared-authoring','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const key of ['scope','shared-authoring','codeql'])for(const result of ['failure','cancelled','skipped',undefined])assert.ok(failedChecks({...needs,[key]:{...needs[key],result}},false).includes(key));
 assert.ok(failedChecks(needs,true).includes('scope'));
 assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,run_performance_tests:'true'}}},false).includes('scope'));
});
test('verifies original unsigned reports without accepting failed or filtered cases as passed',()=>{const result=verifyReviewedEvidence();assert.equal(result.acceptedUniqueCases,203);assert.equal(result.originalFailuresRetained,true);assert.equal(result.ciExecuted,false)});
test('rejects evidence drift before trusting a self-reported count or receipt',()=>{assert.throws(()=>verifyReviewedEvidence(()=>Buffer.from('{}')),/bytes changed/)});
test('workflow wires current builds, authenticated freeze chain, Chrome sandbox and strict nested aggregate',()=>{
 const workflow=readFileSync('.github/workflows/ci-shared-authoring.yml','utf8'),ci=readFileSync('.github/workflows/ci.yml','utf8');
 for(const text of ['shared-authoring-checks.mjs','shared-authoring-frozen.cjs','shared-authoring-browser.mjs','tsc --noCheck','npm run build','npm audit --audit-level=high','needs: [admission, frontend, backend, browser]','n[k]?.result!=="success"'])assert.ok(workflow.includes(text),text);
 assert.ok(ci.includes('shared_authoring_plan: ${{ steps.scope.outputs.shared_authoring_plan }}'));
 assert.ok(ci.includes('needs: [scope, shared-authoring,'));assert.ok(ci.includes('uses: ./.github/workflows/ci-shared-authoring.yml'));
 assert.ok(!workflow.includes('--with-deps'));assert.ok(!workflow.includes('--no-sandbox'));
 assert.ok(readFileSync('.github/scripts/shared-authoring-browser.mjs','utf8').includes('chromiumSandbox:true'));
});
