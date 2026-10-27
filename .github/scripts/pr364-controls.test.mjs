import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BASE,BRANCH,MARKER,CONTROLS,pr364Plan,pr364Outputs} from './pr364-scope.mjs';
import {verifySelected,UI_CASES,PG_CASES} from './pr364-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=c=>c.repeat(40),head=h('a'),source=h('b'),tree=h('c'),blob=h('d');
function fixture(){
 const b={enabled:true,base:BASE,product:h('e'),controlCheckpoint:h('f'),source:{'docs/test.md':{before:null,after:blob}},controlBefore:Object.fromEntries(CONTROLS.map(p=>[p,null])),components:{backend:h('1'),frontend:h('2')}};
 const entries=[...Object.keys(b.source),...CONTROLS].map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}));
 const env={GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_EVENT:'pull_request',CI_HEAD_REF:BRANCH,CI_PR_NUMBER:'364',CI_SOURCE_HEAD:source,CI_IS_DRAFT:'false'};
 const read=(cmd,a,...rest)=>{if(cmd==='ls-tree')return `100644 blob ${blob}\t${rest.at(-1)}`;if(cmd==='rev-parse'){if(a.endsWith('^{tree}'))return tree;if(a.endsWith(':server-version/backend'))return h('1');if(a.endsWith(':server-version/frontend'))return h('2');return blob;}throw Error('Unexpected fake Git call');};
 return {b,entries,env,read};
}
test('exact pagination scope refuses drift, unknown paths and alternate execution routes',()=>{
 const f=fixture(),plan=pr364Plan(f.entries,BASE,head,f.read,f.env,f.b);
 assert.equal(plan.route,'pr364');assert.equal(pr364Outputs(plan).frontend,false);
 for(const patch of [{enabled:false},{controlCheckpoint:null},{base:h('9')}])assert.throws(()=>pr364Plan(f.entries,BASE,head,f.read,f.env,{...f.b,...patch}));
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_PR_NUMBER:'363'},{CI_FORCE_FULL:'true'},{CI_HEAD_REF:'other'},{CI_PR_REPOSITORY:'other/repo'}])assert.throws(()=>pr364Plan(f.entries,BASE,head,f.read,{...f.env,...patch},f.b));
 for(const entries of [f.entries.slice(1),[...f.entries,{file:'unknown'}],f.entries.map(e=>e.file===MARKER?{...e,newMode:'120000'}:e)])assert.throws(()=>pr364Plan(entries,BASE,head,f.read,f.env,f.b));
 assert.throws(()=>pr364Plan(f.entries,BASE,head,(cmd,a,...r)=>a===source+'^{tree}'?h('9'):f.read(cmd,a,...r),f.env,f.b));
 assert.throws(()=>pr364Plan(f.entries,BASE,head,(cmd,a,...r)=>cmd==='ls-tree'&&a===head?'drift':f.read(cmd,a,...r),f.env,f.b));
 assert.equal(pr364Plan([],BASE,head,f.read,{CI_HEAD_REF:'unrelated',CI_PR_NUMBER:'1'},f.b),null);
});
test('formal reports require exactly the real selected assertions, not empty or skipped success',()=>{
 for(const names of [UI_CASES,PG_CASES]){
  const report={success:true,numFailedTests:0,numPassedTests:names.length,testResults:[{assertionResults:names.map(fullName=>({fullName,status:'passed'}))}]};
  assert.equal(verifySelected(report,names,0).passed,names.length);
  for(const bad of [{...report,success:false},{...report,testResults:[]},{...report,numPassedTests:0},{...report,testResults:[{assertionResults:names.map(fullName=>({fullName,status:'skipped'}))}]}])assert.throws(()=>verifySelected(bad,names,0));
 }
});
test('shallow scope fetches exact missing source and product objects and still refuses tree drift',()=>{
 const f=fixture(),fetched=new Set(),calls=[];
 const read=(cmd,a,...rest)=>{
  if(cmd==='fetch'){const commit=rest.at(-1);calls.push(commit);fetched.add(commit);return '';}
  if(cmd==='rev-parse'&&[source,f.b.product].some(commit=>a.startsWith(commit)&&!fetched.has(commit)))throw Error('Unknown revision');
  return f.read(cmd,a,...rest);
 };
 assert.equal(pr364Plan(f.entries,BASE,head,read,f.env,f.b).sourceHead,source);
 assert.deepEqual(calls,[source,f.b.product]);
 assert.throws(()=>pr364Plan(f.entries,BASE,head,(cmd,a,...rest)=>cmd==='rev-parse'&&a===source+'^{tree}'?h('9'):read(cmd,a,...rest),f.env,f.b),/tree drift/);
});
test('stable required gate rejects draft, failure, missing and skipped qualifications',()=>{
 const f=fixture(),p=pr364Plan(f.entries,BASE,head,f.read,f.env,f.b);
 const scope=Object.fromEntries(Object.entries(pr364Outputs(p)).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs:scope},pr364:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','pr364','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 assert(failedChecks(needs,true).length);
 for(const result of ['failure','cancelled','skipped',undefined])assert(failedChecks({...needs,pr364:{result}},false).length);
 const yaml=readFileSync('.github/workflows/ci.yml','utf8');assert(yaml.includes('    - pr364\n'));assert(yaml.includes('      pr364_plan:'));assert(yaml.includes('node .github/scripts/pr364-checks.mjs frontend'));assert(yaml.includes('node .github/scripts/pr364-checks.mjs backend'));
});
