import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupLongitudinalBranch,groupLongitudinalFiles,groupReportLeafBranch,groupReportBranch,groupReportBase,groupReportFiles,groupReportDraftPlan,groupReportDraftOutputs,groupReportDiffBase} from './group-report-draft.mjs';
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
test('unknown inputs, malformed base, deletions and full/manual/Ready requests cannot fall back on this branch',()=>{
 for(const extra of [{file:'server-version/backend/prisma/schema.prisma',status:'M',oldMode:'100644',newMode:'100644'},
  {...entries[0],status:'D',newMode:'000000'},{...entries[0],newMode:'120000'}])assert.throws(()=>groupReportDraftPlan([extra],groupReportBase,head,env));
 for(const override of [{CI_IS_DRAFT:'false'},{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'},{GITHUB_REPOSITORY:'outside/repo'}])
  assert.throws(()=>groupReportDraftPlan(entries,groupReportBase,head,{...env,...override}));
 assert.throws(()=>groupReportDraftPlan(entries,'invalid-base',head,env));
 assert.equal(groupReportDraftPlan(entries,groupReportBase,head,{...env,CI_HEAD_REF:'unrelated'}),null);
});
test('existing scope and gate both recompute the same complete candidate before the Draft checkpoint',()=>{
 const source=readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8'),workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert(source.includes('groupReportDraftPlan'));assert(workflow.includes("if: steps.scope.outputs.application_route == 'group-report-draft'"));
 assert(workflow.includes('groupReportDraftPlan(entries,actualBase'));
 assert(workflow.includes('CI_IS_DRAFT: ${{ github.event.pull_request.draft }}'));
 const actualBase='c'.repeat(40),parentSource='d'.repeat(40),read=()=>`tree ${'e'.repeat(40)}\nparent ${actualBase}\nparent ${parentSource}\n`;
 assert.equal(groupReportDiffBase(groupReportBase,head,{...env,CI_SOURCE_HEAD:parentSource,GITHUB_SHA:head},read),actualBase);
 assert.throws(()=>groupReportDiffBase(groupReportBase,head,{...env,CI_SOURCE_HEAD:head},read));
 assert.throws(()=>groupReportDiffBase(groupReportBase,head,{...env,CI_SOURCE_HEAD:parentSource},()=>`parent ${actualBase}\n`));
 assert.equal(groupReportDiffBase(groupReportBase,head,{CI_HEAD_REF:'unrelated'},()=>{throw Error('must not inspect unrelated checkout')}),groupReportBase);
 assert(workflow.includes('fetch the actual group report merge base'));

 // The stable gate continues to execute current content-scope on the real checkout.
 assert(workflow.includes('.github/scripts/merge-gate.mjs'));assert(workflow.includes('.github/scripts/content-scope.mjs'));
});

test('fixed Training Bundle leaf Draft uses the existing scope-only checkpoint without replay or Ready qualification',()=>{
 const leafEnv={...env,CI_HEAD_REF:groupReportLeafBranch},leaf=[{file:'server-version/backend/src/modules/training-analysis/group-source.ts',status:'M',oldMode:'100644',newMode:'100644'},{file:'docs/evidence/group-report-leaf-sources-20261030/mainf674/disclosed-five-person-continuation.json',status:'A',oldMode:'000000',newMode:'100644'}];
 const p=groupReportDraftPlan(leaf,groupReportBase,head,leafEnv),o=Object.fromEntries(Object.entries(groupReportDraftOutputs(p)).map(([k,v])=>[k,String(v)])),needs={scope:{result:'success',outputs:o}};
 assert.deepEqual(requiredChecks(needs,true),['scope']);assert.deepEqual(failedChecks(needs,true),[]);assert.equal(o.codeql,'false');assert.equal(o.frontend,'false');
 assert.throws(()=>groupReportDraftPlan(leaf,groupReportBase,head,{...leafEnv,CI_IS_DRAFT:'false'}));
 assert.throws(()=>groupReportDraftPlan([{...leaf[0],file:'server-version/backend/src/modules/reporting/personal-tracking.ts'}],groupReportBase,head,leafEnv));
 const parent='c'.repeat(40),source='d'.repeat(40);assert.equal(groupReportDiffBase(groupReportBase,head,{...leafEnv,CI_SOURCE_HEAD:source},()=>`tree ${'e'.repeat(40)}\nparent ${parent}\nparent ${source}\n`),parent);
});


test('longitudinal Draft accepts exact candidate paths and rejects unreviewed execution or paths',()=>{
 const longEnv={...env,CI_HEAD_REF:groupLongitudinalBranch};
 const paths=groupLongitudinalFiles.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
 const plan=groupReportDraftPlan(paths,groupReportBase,head,longEnv);
 const outputs=Object.fromEntries(Object.entries(groupReportDraftOutputs(plan)).map(([k,v])=>[k,String(v)]));
 assert.deepEqual(requiredChecks({scope:{result:'success',outputs}},true),['scope']);
 assert(failedChecks({scope:{result:'success',outputs}},false).includes('group-report-ready-qualification-required'));
 for(const key of ['maintenance','frontend','content','codeql','run_performance_tests'])assert.equal(outputs[key],'false');
 for(const file of ['server-version/backend/prisma/schema.prisma','docs/evidence/group-longitudinal-survey-training-20261030/unlisted.json'])
  assert.throws(()=>groupReportDraftPlan([{...paths[0],file}],groupReportBase,head,longEnv));
 for(const override of [{CI_IS_DRAFT:'false'},{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'},{GITHUB_REPOSITORY:'outside/repo'}])
  assert.throws(()=>groupReportDraftPlan(paths,groupReportBase,head,{...longEnv,...override}));
 for(const change of [{status:'D',newMode:'000000'},{newMode:'120000'}])
  assert.throws(()=>groupReportDraftPlan([{...paths[0],...change}],groupReportBase,head,longEnv));
 const parent='c'.repeat(40),source='d'.repeat(40);
 assert.equal(groupReportDiffBase(groupReportBase,head,{...longEnv,CI_SOURCE_HEAD:source},()=>`parent ${parent}\nparent ${source}\n`),parent);
 assert.throws(()=>groupReportDiffBase(groupReportBase,head,{...longEnv,CI_SOURCE_HEAD:head},()=>`parent ${parent}\nparent ${source}\n`));
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert(workflow.includes(groupLongitudinalBranch));
});
