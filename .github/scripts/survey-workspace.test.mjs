import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding,marker,branch,surveyWorkspacePlan,surveyWorkspaceOutputs} from './survey-workspace-scope.mjs';
import {verifyLocalEvidence} from './survey-workspace-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:head,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
const entries=[...Object.entries(binding.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
const read=(_command,value)=>{
 if(value.endsWith('^{tree}'))return 'c'.repeat(40);
 const [revision,...parts]=value.split(':'),file=parts.join(':');
 if(file==='server-version/backend')return binding.components.backend;
 if(file==='server-version/frontend')return binding.components.frontend;
 if(binding.source[file])return revision===binding.base?binding.source[file].before:binding.source[file].after;
 if(revision===binding.base&&binding.controlBefore[file])return binding.controlBefore[file];
 if(binding.protectedInputs[file])return binding.protectedInputs[file];throw Error('Unexpected Git input: '+value);
};
const plan=(overrides={})=>surveyWorkspacePlan(entries,binding.base,head,read,{...env,...overrides});
test('binds the complete Survey candidate and keeps original local results honest',()=>{
 assert.ok(Object.keys(binding.source).length>=90);assert.equal(plan().route,'survey-workspace');
 const r=verifyLocalEvidence();assert.equal(r.status,'REVIEWED_LOCAL_EVIDENCE');
 assert.ok(r.acceptedUniqueCases>100);assert.equal(r.originalFailuresRetained,true);
 assert.equal(r.originalExecutionSigned,false);assert.equal(r.ciExecuted,false);
});
test('rejects unknown, missing, duplicate, renamed, deleted, symlink and executable diff entries',()=>{
 for(const bad of [[...entries,{file:'unknown.ts',status:'A',oldMode:'000000',newMode:'100644'}],entries.slice(1),[...entries,entries[0]],...['R','D'].map(status=>entries.map((e,i)=>i?e:{...e,status})),...['100755','120000'].map(newMode=>entries.map((e,i)=>i?e:{...e,newMode}))])assert.throws(()=>surveyWorkspacePlan(bad,binding.base,head,read,env));
});
test('rejects base/component/source drift, foreign PRs and manual/full events',()=>{
 assert.throws(()=>surveyWorkspacePlan(entries,'b'.repeat(40),head,read,env));
 assert.throws(()=>surveyWorkspacePlan(entries,binding.base,head,()=> 'd'.repeat(40),env));
 for(const override of [{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_HEAD_REF:'another-branch'},{CI_PR_REPOSITORY:'other/repo'},{CI_SOURCE_HEAD:''}])assert.throws(()=>plan(override));
 assert.throws(()=>surveyWorkspacePlan(entries.filter(e=>e.file!==marker),binding.base,head,read,env));
 assert.throws(()=>surveyWorkspacePlan(entries,binding.base,head,(_cmd,value)=>value===head+'^{tree}'?'d'.repeat(40):read(_cmd,value),{...env,CI_SOURCE_HEAD:'b'.repeat(40)}));
});
test('rejects tampered local bytes without rerunning or relabeling application results',()=>{
 assert.throws(()=>verifyLocalEvidence(file=>Buffer.from(readFileSync(file).toString()+' ')));
});
test('requires actual scope, nested Survey workspace and CodeQL success; draft/missing/skipped/failed fail closed',()=>{
 const outputs=Object.fromEntries(Object.entries(surveyWorkspaceOutputs(plan())).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'survey-workspace':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','survey-workspace','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 assert.ok(failedChecks(needs,true).length);
 for(const result of ['failure','cancelled','skipped',undefined])for(const job of ['scope','survey-workspace','codeql'])assert.ok(failedChecks({...needs,[job]:result?{...needs[job],result}:undefined},false).length);
 assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,frontend:'true'}}},false).length);
});
test('leaves unrelated routing unchanged and classifies exact main post-merge without rerunning checks',()=>{
 assert.equal(surveyWorkspacePlan([],binding.base,head,read,{CI_EVENT:'pull_request',CI_HEAD_REF:'unrelated'}),null);
 assert.equal(plan({CI_EVENT:'push',CI_HEAD_REF:'main',CI_SOURCE_HEAD:undefined}).route,'survey-workspace');
});
test('wires missing compilers, rendered consumers and native restore without broad app repetition',()=>{
 const ci=readFileSync('.github/workflows/ci.yml','utf8'),workflow=readFileSync('.github/workflows/ci-survey-workspace.yml','utf8');
 assert.match(ci,/uses: \.\/\.github\/workflows\/ci-survey-workspace.yml/);
 assert.match(ci,/survey_workspace_plan: \$\{\{ steps.scope.outputs.survey_workspace_plan \}\}/);
 assert.ok(ci.includes('training-appearance, survey-workspace,'));assert.ok(ci.includes('"work/survey-visual-20261022"'));
 assert.doesNotMatch(workflow,/docker build|npm run test|vitest.mjs|eslint.js/);
 assert.match(workflow,/tsc -p tsconfig.app.json --noEmit/);assert.equal((workflow.match(/npm run build/g)||[]).length,1);
 assert.doesNotMatch(workflow,/services:/);assert.match(workflow,/survey-workspace-reuse.mjs backend/);
 assert.match(workflow,/needs: frontend/);assert.match(workflow,/actions\/download-artifact@v4/);
 const migration=readFileSync('.github/scripts/survey-workspace-migration.mjs','utf8');
 assert.match(migration,/binding.base/);assert.match(migration,/pg_dump/);assert.match(migration,/pg_restore/);
 assert.match(migration,/127.0.0.1/);assert.match(migration,/survey_upgrade/);assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM users/);
});
