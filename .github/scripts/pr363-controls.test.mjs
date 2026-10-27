import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {binding,BRANCH,MARKER,JOBS,pr363Plan,pr363Outputs,requirePr363Jobs,validateExecution} from './pr363-scope.mjs';
import {verifyConsumerReport,verifyImageReceipt,assertFirstBuildAttempt} from './pr363-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=x=>x.repeat(40),base=h('a'),head=h('b'),source=h('c'),tree=h('d'),blob=h('e');
function fixture(){
 const steps=[{id:'missing-case',kind:'vitest',argv:['node','control.mjs'],report:'pr363-evidence/result.json',expectedCases:['actual-selected-case'],expectedFiltered:[]}];
 const consumer={steps,inputs:[{path:'control.mjs',blob,mode:'100644'}]};
 const b={schemaVersion:1,enabled:true,readiness:'READY',branch:BRANCH,base,product:h('f'),components:{backend:tree,frontend:tree},source:{'product.ts':{before:blob,after:blob}},controlBefore:{[MARKER]:null},protectedInputs:{'lock.json':blob},historicalAdmissions:[],unresolved:[],execution:{finalized:true,feedbackModes:['IMMEDIATE','SCHEDULED'],backend:consumer,frontend:{...consumer,buildArgs:['VITE_COGNITIVE_MODULE_ENABLED=true']},pg:consumer,browser:{...consumer,steps:steps.map(s=>({...s,kind:'browser'}))}}};
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:BRANCH,CI_PR_NUMBER:'363',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_SOURCE_HEAD:source,CI_IS_DRAFT:'false'};
 const entries=[{file:'product.ts',status:'M',oldMode:'100644',newMode:'100644'},{file:MARKER,status:'A',oldMode:'000000',newMode:'100644'}];
 const read=(cmd,arg,...rest)=>cmd==='ls-tree'?`100644 blob ${blob}\t${rest.at(-1)}`:arg.endsWith('^{tree}')||arg.includes('server-version/')?tree:blob;
 return {b,env,entries,read};
}
test('committed bindings remain disabled and all actual consumers unresolved',()=>{
 assert.equal(binding.enabled,false);assert.equal(binding.readiness,'NOTREADY');assert.equal(binding.execution,null);assert.deepEqual(binding.historicalAdmissions,[]);assert(binding.unresolved.length);
 const f=fixture();assert.throws(()=>pr363Plan(f.entries,base,head,f.read,f.env),/NOTREADY/);
});
test('synthetic exact candidate routes exclusively and refuses all source/identity/closure drift',()=>{
 const f=fixture(),plan=pr363Plan(f.entries,base,head,f.read,f.env,f.b),o=pr363Outputs(plan);
 assert.equal(o.application_route,'pr363');assert.equal(o.frontend,false);assert.equal(o.content,false);assert.equal(o.media_groups,'[]');assert.equal(o.codeql,true);
 for(const patch of [{CI_EVENT:'workflow_dispatch'},{CI_EVENT:'push'},{CI_PR_NUMBER:'357'},{CI_PR_REPOSITORY:'other/repo'},{CI_FORCE_FULL:'true'},{CI_HEAD_REF:'other'}])assert.throws(()=>pr363Plan(f.entries,base,head,f.read,{...f.env,...patch},f.b));
 for(const entries of [f.entries.slice(1),[...f.entries,{file:'unknown'}],f.entries.map((e,i)=>i?e:{...e,newMode:'120000'})])assert.throws(()=>pr363Plan(entries,base,head,f.read,f.env,f.b));
 for(const patch of [{enabled:false},{unresolved:['still missing']},{historicalAdmissions:[{summary:'PASS'}]}])assert.throws(()=>pr363Plan(f.entries,base,head,f.read,f.env,{...f.b,...patch}));
 assert.throws(()=>pr363Plan(f.entries,base,head,(c,a,...r)=>a===source+'^{tree}'?h('9'):f.read(c,a,...r),f.env,f.b));
 assert.throws(()=>pr363Plan(f.entries,base,head,(c,a,...r)=>c==='ls-tree'?'wrong':f.read(c,a,...r),f.env,f.b));
 assert.equal(pr363Plan([],base,head,f.read,{CI_EVENT:'pull_request',CI_HEAD_REF:'unrelated',CI_PR_NUMBER:'99'},f.b),null);
});
test('known branch and PR refuse missing marker/disabled plans before a legacy fallback',()=>{
 const f=fixture();assert.throws(()=>pr363Plan([],base,head,f.read,f.env,f.b));
 assert.throws(()=>pr363Plan([],base,head,f.read,{...f.env,CI_EVENT:'workflow_dispatch'},f.b),/manual/);
 assert.throws(()=>validateExecution({...f.b.execution,feedbackModes:['AFTER_COLLECTION']}));
 assert.throws(()=>validateExecution({...f.b.execution,pg:{steps:[],inputs:[]}}));
});
test('report consumers reject empty, failed, missing, extra and unexpectedly filtered cases',()=>{
 const step={kind:'vitest',expectedCases:['case'],expectedFiltered:[]};const report={success:true,numFailedTests:0,testResults:[{assertionResults:[{fullName:'case',status:'passed'}]}]};
 assert.equal(verifyConsumerReport(report,step,{}).passed,1);
 for(const r of [{...report,success:false},{...report,testResults:[]},{...report,numFailedTests:1},{...report,testResults:[{assertionResults:[{fullName:'case',status:'skipped'}]}]}])assert.throws(()=>verifyConsumerReport(r,step,{}));
 const identity={head,tree,runId:'1',manifests:{backend:{sha:head},frontend:{sha:head}}},browser={status:'PASSED',errors:[],source:{head,tree},runId:'1',inputs:identity.manifests,coverage:[{product:'TEACHER',check:'connected'}]};
 const selected={kind:'browser',expectedCases:['TEACHER:connected']};assert.equal(verifyConsumerReport(browser,selected,identity).passed,1);
 for(const patch of [{errors:['real error']},{source:{head:base,tree}},{runId:'2'},{inputs:{}}])assert.throws(()=>verifyConsumerReport({...browser,...patch},selected,identity));
});
test('saved images reject mismatched run/head/content instead of loading older successful artifacts',()=>{
 const data=Buffer.from('synthetic archive'),digest=createHash('sha256').update(data).digest('hex');
 const r={head,runId:'1',images:Object.fromEntries(['builder.tar','runtime.tar'].map(file=>[file,{imageId:'sha256:'+'a'.repeat(64),sha256:digest,tag:'pr363-backend-'+(file==='builder.tar'?'build':'runtime')}]))};
 const identity={head,runId:'1',component:'backend'};verifyImageReceipt(r,identity,()=>data);
 assert.throws(()=>verifyImageReceipt(r,{...identity,head:base},()=>data));assert.throws(()=>verifyImageReceipt(r,{...identity,runId:'2'},()=>data));assert.throws(()=>verifyImageReceipt(r,identity,()=>Buffer.from('changed')));
});
test('aggregate and unchanged stable required gate require actual selected successes',()=>{
 const f=fixture(),plan=pr363Plan(f.entries,base,head,f.read,f.env,f.b),outputs=Object.fromEntries(Object.entries(pr363Outputs(plan)).map(([k,v])=>[k,String(v)]));
 const children=Object.fromEntries(['scope',...JOBS].map(k=>[k,{result:'success'}]));requirePr363Jobs(children);
 for(const result of ['skipped','failure','cancelled',undefined])assert.throws(()=>requirePr363Jobs({...children,'pr363-pg':{result}}));
 const needs={scope:{result:'success',outputs},pr363:{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','pr363','codeql']);assert.deepEqual(failedChecks(needs,false),[]);assert(failedChecks(needs,true).length);assert(failedChecks({...needs,codeql:{result:'skipped'}},false).length);
});
test('actual YAML jobs consume new route without a 51st reusable or old admission identity',()=>{
 const raw=readFileSync('.github/workflows/ci.yml','utf8');
 const jobs=JSON.parse(execFileSync('python3',['-c',"import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin)['jobs']))"],{input:raw,encoding:'utf8'}));
 for(const k of ['pr363',...JOBS]){assert(jobs[k]);assert(!jobs[k].uses);assert(jobs[k].if.includes("application_route == 'pr363'"));}
 assert(jobs.scope.outputs.pr363_plan);assert(jobs['merge-gate'].needs.includes('pr363'));assert(jobs.codeql.if.includes("application_route == 'pr363'"));assert(!jobs.documentation.if.includes("application_route == 'pr363'"));
 assert(jobs.codeql.steps.find(s=>s.name==='initialize CodeQL').with.config.includes("application_route == 'pr363'"));
 for(const[k,j]of Object.entries(jobs))if(k!=='pr363-manual-refusal'&&String(j.if).includes('workflow_dispatch'))assert(j.if.includes("!(github.event_name == 'workflow_dispatch' && github.ref_name == 'perf/four-entry-feedback-20261027')"),k+' manual escape');
 const seen=new Set();function visit(file){const s=readFileSync(file,'utf8');for(const m of s.matchAll(/uses:\s*\.\/(\.github\/workflows\/[\w.-]+\.ya?ml)/g))if(!seen.has(m[1])){seen.add(m[1]);visit(m[1]);}}visit('.github/workflows/ci.yml');assert.equal(seen.size,50);
 for(const c of ['backend','frontend']){const job=jobs['pr363-'+c+'-build'];assert.equal(job.steps.filter(s=>s.run?.includes('pr363-checks.mjs build-')).length,1);assert(job.steps.some(s=>s.uses==='actions/upload-artifact@v4'));}
 for(const k of ['pr363-backend-scan','pr363-frontend-scan'])assert(jobs[k].steps.some(s=>s.uses?.startsWith('aquasecurity/setup-trivy@')));
});
test('YAML changes preserve legacy job bodies and isolate forced-full producers at job conditions',()=>{
 const parse=s=>JSON.parse(execFileSync('python3',['-c',"import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin)['jobs']))"],{input:s,encoding:'utf8',maxBuffer:4*1024*1024}));
 const current=parse(readFileSync('.github/workflows/ci.yml','utf8')),old=parse(execFileSync('git',['show','b48dc7462bfaa8d9081a63c0d9e69f7338968763:.github/workflows/ci.yml'],{encoding:'utf8'}));
 for(const[k,v]of Object.entries(old)){
  if(['scope','codeql','merge-gate'].includes(k))continue;
  const {if:_before,...body}=v,{if:after,...actual}=current[k];assert.deepEqual(actual,body,k+' legacy body changed');
  if(String(_before).includes('vars.CI_FORCE_FULL')||String(_before).includes('inputs.full_acceptance'))assert(after.includes("github.event.pull_request.number == 363"),k+' can escape forced full');
 }
});
test('main only observes the exact normal merge tree and never grants application qualification',()=>{
 const f=fixture(),read=(cmd,arg,...rest)=>cmd==='cat-file'?`tree ${tree}\nparent ${base}\nparent ${source}`:cmd==='fetch'?'':f.read(cmd,arg,...rest);
 const env={CI_EVENT:'push',GITHUB_REF_NAME:'main',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version'};
 const plan=pr363Plan(f.entries,base,head,read,env,f.b);assert.equal(plan.postMerge,true);assert.equal(plan.qualificationClaim,false);assert.equal(pr363Outputs(plan).codeql,false);
 assert.throws(()=>pr363Plan(f.entries,base,head,(c,a,...r)=>c==='cat-file'?`parent ${source}`:read(c,a,...r),env,f.b));
 assert.throws(()=>pr363Plan(f.entries,base,head,(c,a,...r)=>a===source+'^{tree}'?h('9'):read(c,a,...r),env,f.b));
});

test('producer retry stops before another compile while successful consumer retries remain independent',()=>{assertFirstBuildAttempt({GITHUB_RUN_ATTEMPT:'1'});for(const attempt of ['2','3',undefined])assert.throws(()=>assertFirstBuildAttempt({GITHUB_RUN_ATTEMPT:attempt}),/never automatically rebuild/);});
