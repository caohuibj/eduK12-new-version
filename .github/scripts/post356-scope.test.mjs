import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {post356Plan,post356Outputs,files,baseSHA,branch} from './post356-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40),source='b'.repeat(40);
const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_PR_NUMBER:'999',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_SOURCE_HEAD:source};
const entries=files.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
const read=()=> 'c'.repeat(40);
test('exact repair accepts only complete bounded changes and a matching source tree',()=>{
 const plan=post356Plan(entries,baseSHA,head,read,env);assert.equal(plan.route,'post356');
 for(const changed of [entries.slice(1),[...entries,{file:'server-version/backend/prisma/schema.prisma',status:'M',oldMode:'100644',newMode:'100644'}],entries.map((e,i)=>i?e:{...e,newMode:'120000'})])assert.throws(()=>post356Plan(changed,baseSHA,head,read,env));
 assert.throws(()=>post356Plan(entries,'d'.repeat(40),head,read,env));
 assert.throws(()=>post356Plan(entries,baseSHA,head,read,{...env,CI_EVENT:'workflow_dispatch'}));
 assert.throws(()=>post356Plan(entries,baseSHA,head,read,{...env,CI_FORCE_FULL:'true'}));
 assert.throws(()=>post356Plan(entries,baseSHA,head,read,{...env,CI_PR_REPOSITORY:'foreign/repo'}));
 assert.throws(()=>post356Plan(entries,baseSHA,head,(_,...args)=>args[0]===source+'^{tree}'?'d'.repeat(40):read(),env));
});
test('required gate refuses missing failed skipped draft and forged plans',()=>{
 const p=post356Plan(entries,baseSHA,head,read,env),outputs=Object.fromEntries(Object.entries(post356Outputs(p)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},post356:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','post356','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const result of ['failure','skipped','cancelled',undefined])assert(failedChecks({...needs,post356:{result}},false).length);
 assert(failedChecks(needs,true).length);assert(failedChecks({...needs,scope:{result:'success',outputs:{...outputs,frontend:'true'}}},false).length);
});
test('actual workflow connects qualification and required gate without full platform routing',()=>{
 const s=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert.match(s,/post356_plan: \$\{\{ steps.scope.outputs.post356_plan/);
 const job=s.slice(s.indexOf('\n  post356:'),s.indexOf('\n  training-polish:'));
 for(const token of ['post356Plan(changedEntries','npx vitest run','RUN npx tsc','--severity HIGH,CRITICAL'])assert(job.includes(token));
 assert(s.slice(s.indexOf('\n  codeql:'),s.indexOf('\n  codeql:')+18000).includes("application_route == 'post356'"));
 const gate=s.slice(s.indexOf('\n  merge-gate:'));assert(gate.includes('    - post356\n'));
 const outputs=post356Outputs({postMerge:false});for(const key of ['frontend','frontend_build','run_performance_tests','ui_required'])assert.equal(outputs[key],false);
 assert.equal(outputs.codeql,true);assert.equal(outputs.application_route,'post356');
});

test('control-only repair forbids application changes and shallow post-merge fetch binds exact parents',async()=>{
 const {controlBase,controlBranch,controlFiles}=await import('./post356-scope.mjs');
 const controlEntries=controlFiles.map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
 const e={...env,CI_HEAD_REF:controlBranch};
 assert.equal(post356Plan(controlEntries,controlBase,head,read,e).controlOnly,true);
 assert.throws(()=>post356Plan([...controlEntries,entries[0]],controlBase,head,read,e));
 assert.throws(()=>post356Plan(controlEntries,controlBase,head,(...a)=>a[1]===head+':server-version/backend'?'e'.repeat(40):read(),e));
 const calls=[];const mergeRead=(...a)=>{calls.push(a);return a[0]==='cat-file'?`tree ${'c'.repeat(40)}\nparent ${controlBase}\nparent ${source}\n\nmerge`:read()};
 const plan=post356Plan(controlEntries,controlBase,head,mergeRead,{CI_EVENT:'push',GITHUB_REF_NAME:'main'});
 assert.equal(plan.postMerge,true);assert(calls.some(a=>JSON.stringify(a)===JSON.stringify(['fetch','--no-tags','--depth=2','origin',head])));
})
