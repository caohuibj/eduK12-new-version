import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsSurveyCandidate,surveyCandidateRequired} from './survey-candidate-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const bindings=JSON.parse(readFileSync(new URL('./survey-candidate-bindings.json',import.meta.url)));
const entries=Object.entries(bindings.files).map(([file,b])=>({file,status:b.before===null?'A':'M',oldMode:b.before===null?'000000':'100644',newMode:'100644'}));
const read=(ref,file)=>bindings.files[file]?.[ref==='base'?'before':'after'];
test('exact Survey source boundary rejects missing, changed, unknown, duplicate and unsafe entries',()=>{
 assert.equal(admitsSurveyCandidate(entries,read),true);
 assert.equal(admitsSurveyCandidate(entries.slice(1),read),false);
 assert.equal(admitsSurveyCandidate(entries,()=> 'f'.repeat(40)),false);
 for(const change of [{file:'server-version/frontend/src/App.tsx',status:'M',oldMode:'100644',newMode:'100644'}, {...entries[0],newMode:'120000'}, {...entries[0],status:'D'}, {...entries[0],status:'R100'},entries[0]])assert.equal(admitsSurveyCandidate([...entries,change],read),false);
});
const fixture=()=>{
 const p={schema:1,route:'survey-candidate',base:'a'.repeat(40),head:'b'.repeat(40),tree:'c'.repeat(40),changed:['frontend','backend'],components:{frontend:'d'.repeat(40),backend:'e'.repeat(40)},backendTests:['contract'],frontendTests:['component'],required:surveyCandidateRequired};
 const outputs={application_route:p.route,scenario:p.route,survey_candidate_plan:JSON.stringify(p),codeql:'true',frontend_build:'true',ui_required:'false',media_selection:'[]',media_groups:'[]'};
 for(const k of ['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'])outputs[k]='false';
 return {scope:{result:'success',outputs},'survey-candidate':{result:'success'},codeql:{result:'success'}};
};
test('Survey stable gate requires successful scope, actual candidate and SAST',()=>{
 const needs=fixture();assert.deepEqual(requiredChecks(needs,false),['scope','survey-candidate','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const job of ['scope','survey-candidate','codeql'])for(const state of ['failure','cancelled','skipped',undefined]){const n=fixture();n[job].result=state;assert.ok(failedChecks(n,false).includes(job));}
 assert.ok(failedChecks(needs,true).includes('scope'));
 for(const flag of ['codeql','frontend_build']){const n=fixture();n.scope.outputs[flag]='false';assert.ok(failedChecks(n,false).includes('scope'));}
 const n=fixture();n.scope.outputs.survey_candidate_plan='{}';assert.ok(failedChecks(n,false).includes('scope'));
});
test('Survey workflow keeps explicit isolation, source binding, scans and artifact failure evidence',()=>{
 const workflow=readFileSync(new URL('../workflows/ci-survey-candidate.yml',import.meta.url),'utf8');
 for(const text of ['ubuntu-24.04','24.21.0','surveyCandidatePlan','github.event.pull_request.head.sha','HIGH,CRITICAL','if: success() || failure()','retention-days: 3'])assert.ok(workflow.includes(text),text);
 assert.ok(!workflow.includes('secrets: inherit'));assert.ok(!/continue-on-error:\s*true/.test(workflow));
 const main=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert.ok(main.includes("if: github.event_name == 'pull_request' && github.event.pull_request.draft == false && needs.scope.outputs.application_route == 'survey-candidate'"));
});
