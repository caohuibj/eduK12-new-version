import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupReportBranch,groupReportBase,groupReportFiles,groupReportDraftPlan,groupReportDraftOutputs} from './group-report-draft.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const env={CI_EVENT:'pull_request',CI_IS_DRAFT:'true',CI_HEAD_REF:groupReportBranch,CI_PR_NUMBER:'402',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version'};
const entries=groupReportFiles.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
const head='a'.repeat(40);
test('Draft checkpoint only selects source controls; never admits local application evidence or Ready',()=>{
 const p=groupReportDraftPlan(entries,groupReportBase,head,env),o=Object.fromEntries(Object.entries(groupReportDraftOutputs(p)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs:o}};
 assert.deepEqual(requiredChecks(needs,true),['scope']);assert.deepEqual(failedChecks(needs,true),[]);
 assert(failedChecks(needs,false).includes('group-report-ready-qualification-required'));
 for(const key of ['maintenance','frontend','content','codeql','run_performance_tests'])assert.equal(o[key],'false');
});
test('unknown inputs, moved base, deletions and full/manual/Ready requests cannot fall back on this branch',()=>{
 for(const extra of [{file:'server-version/backend/prisma/schema.prisma',status:'M',oldMode:'100644',newMode:'100644'},
  {...entries[0],status:'D',newMode:'000000'},{...entries[0],newMode:'120000'}])assert.throws(()=>groupReportDraftPlan([extra],groupReportBase,head,env));
 for(const override of [{CI_IS_DRAFT:'false'},{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'},{GITHUB_REPOSITORY:'outside/repo'}])
  assert.throws(()=>groupReportDraftPlan(entries,groupReportBase,head,{...env,...override}));
 assert.throws(()=>groupReportDraftPlan(entries,'b'.repeat(40),head,env));
 assert.equal(groupReportDraftPlan(entries,groupReportBase,head,{...env,CI_HEAD_REF:'unrelated'}),null);
});
test('existing scope and gate both recompute the same complete candidate before the Draft checkpoint',()=>{
 const source=readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8'),workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert(source.includes('groupReportDraftPlan'));assert(workflow.includes("if: steps.scope.outputs.application_route == 'group-report-draft'"));
 assert(workflow.includes('groupReportDraftPlan(entries,process.env.CI_BASE_SHA'));
 assert(workflow.includes('CI_IS_DRAFT: ${{ github.event.pull_request.draft }}'));
 // The stable gate continues to execute current content-scope on the real checkout.
 assert(workflow.includes('.github/scripts/merge-gate.mjs'));assert(workflow.includes('.github/scripts/content-scope.mjs'));
});
