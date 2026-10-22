import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding,marker,branch,studentPlan} from './training-student-scope.mjs';
import {verifyLocalEvidence} from './training-student-checks.mjs';
import {trainingWorkspacePlan,trainingWorkspaceOutputs} from './training-workspace-scope.mjs';
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
const plan=(overrides={})=>studentPlan(entries,binding.base,head,read,{...env,...overrides});
test('pins all 25 product files, component trees and original evidence',()=>{
 assert.equal(Object.keys(binding.source).length,25);assert.equal(plan().candidate,'student-followup');
 assert.equal(verifyLocalEvidence().status,'REVIEWED_LOCAL_EVIDENCE');assert.equal(verifyLocalEvidence().countsAreNotAdditive,true);
});
test('unknown, missing, duplicate, renamed, deleted and executable inputs fail closed',()=>{
 for(const bad of [[...entries,{file:'unknown.ts',status:'A',oldMode:'000000',newMode:'100644'}],entries.slice(1),[...entries,entries[0]],entries.map((e,i)=>i?e:{...e,status:'R'}),entries.map((e,i)=>i?e:{...e,status:'D'}),entries.map((e,i)=>i?e:{...e,newMode:'100755'})])assert.throws(()=>studentPlan(bad,binding.base,head,read,env));
});
test('new base, source, component, foreign branch, manual or external PR cannot gain this route',()=>{
 assert.throws(()=>studentPlan(entries,'b'.repeat(40),head,read,env));assert.throws(()=>studentPlan(entries,binding.base,head,()=> 'd'.repeat(40),env));
 for(const override of [{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_HEAD_REF:'another-branch'},{CI_PR_REPOSITORY:'other/repo'},{CI_SOURCE_HEAD:''}])assert.throws(()=>plan(override));
 assert.throws(()=>studentPlan(entries.filter(e=>e.file!==marker),binding.base,head,read,env));
 assert.throws(()=>studentPlan(entries,binding.base,head,(_cmd,value)=>value===head+'^{tree}'?'d'.repeat(40):read(_cmd,value),{...env,CI_SOURCE_HEAD:'b'.repeat(40)}));
});
test('tampered evidence or a relabeled failure cannot qualify',()=>{
 assert.throws(()=>verifyLocalEvidence(file=>Buffer.from(readFileSync(file).toString()+' ')));
});
test('requires exact success from admission/compilation aggregate and CodeQL; draft or missing never qualifies',()=>{
 const outputs=Object.fromEntries(Object.entries(trainingWorkspaceOutputs(plan())).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'training-workspace':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','training-workspace','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 assert.ok(failedChecks(needs,true).length);
 for(const result of ['failure','cancelled','skipped',undefined])for(const job of ['scope','training-workspace','codeql'])assert.ok(failedChecks({...needs,[job]:result?{...needs[job],result}:undefined},false).length);
 assert.equal(outputs.frontend_build,'false');assert.equal(outputs.run_performance_tests,'false');
});
test('an unrelated branch retains existing routing and exact main post-merge classifies without rerunning checks',()=>{
 assert.equal(studentPlan([],binding.base,head,read,{CI_EVENT:'pull_request',CI_HEAD_REF:'unrelated'}),null);
 assert.equal(plan({CI_EVENT:'push',CI_HEAD_REF:'main',CI_SOURCE_HEAD:undefined}).candidate,'student-followup');
});
test('workflow connects only this candidate to lightweight compile and excludes legacy component jobs',()=>{
 const wrapper=readFileSync('.github/workflows/ci-training-workspace.yml','utf8');
 assert.match(wrapper,/uses: \.\/\.github\/workflows\/ci-training-student.yml/);
 assert.match(wrapper,/component:\n    if: fromJSON\(inputs.plan\).candidate != 'student-followup'/);
 const workflow=readFileSync('.github/workflows/ci-training-student.yml','utf8');
 assert.doesNotMatch(workflow,/npm (?:run )?test|vitest|migrate deploy|docker build|services:/);
 assert.match(workflow,/npm run build/);assert.match(workflow,/tsc --noEmit/);
});
