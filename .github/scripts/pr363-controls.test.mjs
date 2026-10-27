import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {binding,BRANCH,MARKER,JOBS,CONTROL_FILES,digest,pr363Plan,pr363Outputs,requirePr363Jobs,validateExecution} from './pr363-scope.mjs';
import {verifyConsumerReport,verifyImageReceipt,assertFirstBuildAttempt,stepCommand,verifyHistoricalAdmission,assertApplicationPhase,browserEnvironment,browserIngressConfig} from './pr363-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const h=x=>x.repeat(40),base=h('a'),head=h('b'),source=h('c'),tree=h('d'),blob=h('e');
function fixture(){
 const steps=[{id:'missing-case',kind:'vitest',expectedExitCode:0,runner:'host-node',dependencies:[],argv:['node','control.mjs'],report:'pr363-evidence/result.json',expectedCases:['actual-selected-case'],expectedFiltered:[]}];
 const consumer={steps,requiredOutcomes:['actual-selected-case'],environment:{TZ:'UTC'},inputs:[{path:'control.mjs',blob,mode:'100644'}]};
 const b={schemaVersion:1,enabled:true,readiness:'READY',branch:BRANCH,base,product:h('f'),components:{backend:tree,frontend:tree},source:{'product.ts':{before:blob,after:blob}},controlCheckpoint:h('1'),controlBefore:Object.fromEntries(CONTROL_FILES.map(f=>[f,null])),protectedInputs:{'lock.json':blob},historicalAdmissions:[],unresolved:[],execution:{finalized:true,feedbackModes:['IMMEDIATE','SCHEDULED'],backend:consumer,frontend:{...consumer,buildArgs:['VITE_COGNITIVE_MODULE_ENABLED=true']},pg:consumer,browser:{...consumer,inputs:[...consumer.inputs,{path:'server-version/e2e/pr363-browser.cjs',mode:'100644',blob}],requiredOutcomes:['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED'],steps:[{id:'compiled-browser',kind:'browser',expectedExitCode:0,runner:'host-node',dependencies:['backend'],argv:['node','server-version/e2e/pr363-browser.cjs'],report:'pr363-evidence/browser.json',expectedCases:['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED']}]}}};
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:BRANCH,CI_PR_NUMBER:'363',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_SOURCE_HEAD:source,CI_IS_DRAFT:'false'};
 const entries=[{file:'product.ts',status:'M',oldMode:'100644',newMode:'100644'},...CONTROL_FILES.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
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
 const identity={head,tree,runId:'1',manifests:{backend:{sha:head},frontend:{sha:head}}},browser={schemaVersion:1,status:'PASS',stage:'complete',chromePreflight:{ok:true},chromeSandbox:{ok:true},source:{head,tree},runId:'1',inputs:identity.manifests,cases:[{product:'SCHOOL',mode:'IMMEDIATE',complete:true,resumedSameParent:true,reportState:'READY'},{product:'TEACHER',mode:'IMMEDIATE',complete:true,resumedSameParent:true,reportState:'READY'},{product:'TEACHER',mode:'SCHEDULED',complete:true,resumedSameParent:true,reportState:'WITHHELD'}]};
 const selected={kind:'browser',expectedCases:['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED']};assert.equal(verifyConsumerReport(browser,selected,identity).passed,3);
 for(const patch of [{status:'PASSED'},{chromeSandbox:{ok:false}},{cases:[]},{errorDigest:'actual-error'},{source:{head:base,tree}},{runId:'2'},{inputs:{}}])assert.throws(()=>verifyConsumerReport({...browser,...patch},selected,identity));
});
test('saved images reject mismatched run/head/content instead of loading older successful artifacts',()=>{
 const data=Buffer.from('synthetic archive'),digest=createHash('sha256').update(data).digest('hex');
 const r={head,runId:'1',producerAttempt:'1',dependencySource:{lockPath:'server-version/backend/package-lock.json',lockBlob:blob,lockSHA256:'1'.repeat(64)},manifest:{sha:head,runId:'1',kind:'backend',lockDigest:'1'.repeat(64)},images:Object.fromEntries(['builder.tar','runtime.tar'].map(file=>[file,{imageId:'sha256:'+'a'.repeat(64),sha256:digest,tag:'pr363-backend-'+(file==='builder.tar'?'build':'runtime')}]))};
 const identity={head,runId:'1',component:'backend',consumerAttempt:'2',lockBlob:blob,lockSHA256:'1'.repeat(64)};verifyImageReceipt(r,identity,()=>data);
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
 assert(jobs.scope.outputs.pr363_plan);assert(jobs['merge-gate'].if.includes("!(github.event_name == 'push' && needs.scope.outputs.application_route == 'pr363')"));assert(jobs['merge-gate'].needs.includes('pr363'));assert(jobs.codeql.if.includes("application_route == 'pr363'"));assert(!jobs.documentation.if.includes("application_route == 'pr363'"));
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
test('fixed code-owned controls bind every after byte to checkpoint while excluding only bindings self-hash',()=>{
 const f=fixture();assert(CONTROL_FILES.includes(MARKER));
 assert.throws(()=>pr363Plan(f.entries,base,head,f.read,f.env,{...f.b,controlBefore:{...f.b.controlBefore,'extra-control.mjs':null}}),/Control names/);
 assert.throws(()=>pr363Plan(f.entries,base,head,(c,a,...r)=>c==='ls-tree'&&a===head&&r.at(-1)==='.github/scripts/pr363-checks.mjs'?`100644 blob ${h('9')}\t${r.at(-1)}`:f.read(c,a,...r),f.env,f.b),/control bytes drift/);
 assert.throws(()=>pr363Plan(f.entries,base,head,f.read,f.env,{...f.b,source:{...f.b.source,'.github/scripts/foreign.mjs':{before:null,after:blob}}}),/control path/);
 const expanded={...f.b,execution:structuredClone(f.b.execution)};expanded.execution.pg.inputs=[...f.b.execution.pg.inputs,...Array.from({length:4000},(_,i)=>({path:`source/${i}.ts`,mode:'100644',blob}))];
 assert(JSON.stringify(pr363Plan(f.entries,base,head,f.read,f.env,expanded)).length<5000,'Complete source closures stay in Git, never oversized PLAN env');
});
test('real commands and native receipts are distinct from Vitest and use verified builder dependencies',()=>{
 const f=fixture(),e=structuredClone(f.b.execution);const command={id:'types',kind:'command',outcomeId:'types',runner:'builder-node',component:'frontend',dependencies:[],expectedExitCode:0,argv:['node','node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],dependencySource:{lockPath:'server-version/frontend/package-lock.json',lockBlob:blob}};
 e.frontend={...e.frontend,steps:[command],requiredOutcomes:['types'],inputs:[...e.frontend.inputs,{path:command.dependencySource.lockPath,mode:'100644',blob}]};validateExecution(e);
 const c=stepCommand(command,{imageId:'sha256:'+'1'.repeat(64),repository:'/checkout',evidence:'/results'});assert.equal(c.exe,'docker');assert(c.args.includes('node_modules/typescript/bin/tsc'));assert(c.args.includes('sha256:'+'1'.repeat(64)));
 assert.equal(verifyConsumerReport({kind:'command-receipt',exitCode:0,signal:null},command,{}).testsClaimed,false);
 assert.throws(()=>verifyConsumerReport({kind:'command-receipt',exitCode:2,signal:null},command,{}));
 const receipt={...command,kind:'receipt',assertions:[{pointer:'/restored/nonempty',equals:true}]};assert.equal(verifyConsumerReport({restored:{nonempty:true}},receipt,{}).testsClaimed,false);assert.throws(()=>verifyConsumerReport({restored:{nonempty:false}},receipt,{}));
 assert.throws(()=>validateExecution({...e,frontend:{...e.frontend,inputs:f.b.execution.frontend.inputs}}),/dependency lock/);
});
function historyFixture(){
 const hash=x=>createHash('sha256').update(x).digest('hex'),files=[{path:'source/unit.ts',mode:'100644',blob}],currentEnvironment={host:{node:'v24.21.0',platform:'linux',arch:'x64'},configuration:{TZ:'UTC'}};
 const report={success:false,numTotalTests:3,numPassedTests:1,numFailedTests:1,numPendingTests:1,testResults:[{assertionResults:[{fullName:'passed-case',status:'passed'},{fullName:'original-failure',status:'failed'},{fullName:'original-filtered',status:'pending'}]}]};
 const execution={argv:['node','vitest.mjs','run'],exitCode:1,signal:null,cwd:'/original'},inputs={files,environment:{node:'v24.22.1',postgres:'17.11'},dependencies:{lock:'original-lock'},tools:{vitest:'4.1.11'},generated:{prisma:'original-generated-hash'}};
 const entry={schemaVersion:1,id:'original-case',kind:'vitest',phase:'pg',outcomes:['passed-case'],reviewCheckpoint:h('7'),cases:[{fullName:'passed-case',pointer:'/testResults/0/assertionResults/0'}],selectors:{argv:'/argv',exitCode:'/exitCode',signal:'/signal',cwd:'/cwd',files:'/files',environment:'/environment',dependencies:'/dependencies',tools:'/tools',generated:'/generated'},proofs:{}};
 const bytes=new Map();function proof(key,value){const path='docs/evidence/pr363-'+key+(key==='log'?'.log':'.json'),raw=Buffer.from(typeof value==='string'?value:JSON.stringify(value));bytes.set(path,raw);entry.proofs[key]={path,sha256:hash(raw),encoding:key==='log'?'utf8':'json'};}
 proof('report',report);proof('execution',execution);proof('inputs',inputs);proof('log','original failed invocation log, unchanged');
 const review={kind:'pr363-root-case-review-v1',reviewer:'root dot',decision:'ADMIT',admissionId:entry.id,outcomes:entry.outcomes,originalSHA256:Object.fromEntries(['report','execution','log','inputs'].map(k=>[k,entry.proofs[k].sha256])),currentInputsSHA256:digest(files),originalExecution:execution,originalReporterSummary:Object.fromEntries(['success','numTotalTests','numPassedTests','numFailedTests','numPendingTests'].map(k=>[k,report[k]])),originalInvocationCases:report.testResults[0].assertionResults,environmentComparison:{original:Object.fromEntries(['environment','dependencies','tools','generated'].map(k=>[k,inputs[k]])),current:currentEnvironment,decision:'COMPATIBLE',rationale:'Synthetic root review of exact environment difference for this one case; not an actual admission'},deltas:[]};proof('review',review);
 const context={head,currentInputs:files,currentEnvironment,readBytes:path=>bytes.get(path),readGit:(cmd,sha,...r)=>`100644 blob ${blob}\t${r.at(-1)}`};
 return {entry,context,report,execution,inputs,review,proof,bytes};
}
test('fixed historical case admits original PASS without rewriting failure/filter/exit or signing execution',()=>{
 const f=historyFixture(),r=verifyHistoricalAdmission(f.entry,f.context);assert.equal(r.kind,'reviewed-local-evidence');assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.originalExecution.exitCode,1);assert.equal(r.originalFailuresRetained,true);
 const selection=fixture().b.execution;const e=structuredClone(selection);e.pg={...e.pg,steps:[],inputs:f.context.currentInputs,requiredOutcomes:['passed-case']};validateExecution(e,[f.entry]);
 assert.throws(()=>validateExecution({...e,pg:{...e.pg,steps:selection.pg.steps,inputs:[...e.pg.inputs,...selection.pg.inputs],requiredOutcomes:['passed-case'] }},[f.entry]),/outcomes/);
});
test('historical admission refuses missing raw proof, wrong bytes, summary-only approval and unreviewed runtime/source delta',()=>{
 for(const change of [f=>{f.entry.proofs.report.sha256='0'.repeat(64)},f=>{f.entry.cases[0].pointer='/testResults/0/assertionResults/1'},f=>{f.review.originalExecution={...f.execution,exitCode:0};f.proof('review',f.review)},f=>{delete f.inputs.generated;f.proof('inputs',f.inputs);f.review.originalSHA256.inputs=f.entry.proofs.inputs.sha256;f.proof('review',f.review)},f=>{f.context.currentEnvironment={...f.context.currentEnvironment,host:{node:'other'}}},f=>{f.context.currentInputs=[{...f.context.currentInputs[0],blob:h('9')}]},f=>{f.review.decision='summary-PASS';f.proof('review',f.review)},f=>{f.context.readGit=(c,a,...r)=>`${a===f.entry.reviewCheckpoint?'100755':'100644'} blob ${blob}\t${r.at(-1)}`}]){
  const f=historyFixture();change(f);assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context));
 }
});
test('only exact per-case root delta review admits changed file bytes; missing rationale or mismatched case refuses',()=>{
 const f=historyFixture();f.context.currentInputs=[{...f.context.currentInputs[0],blob:h('9')}];f.review.currentInputsSHA256=digest(f.context.currentInputs);
 f.review.deltas=[{path:'source/unit.ts',before:{mode:'100644',blob},after:{mode:'100644',blob:h('9')},outcomes:['passed-case'],rationale:'Exact synthetic delta reviewed for this single case'}];f.proof('review',f.review);
 verifyHistoricalAdmission(f.entry,f.context);
 f.review.deltas[0].outcomes=['another-case'];f.proof('review',f.review);assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context));
});

test('main source observation cannot enter aggregate, scan, checks or browser qualification',()=>{assertApplicationPhase({postMerge:true},'source');for(const phase of ['aggregate','scan-backend','browser','pg','build-frontend'])assert.throws(()=>assertApplicationPhase({postMerge:true},phase),/source\/tree observation only/);assertApplicationPhase({postMerge:false},'aggregate');});
test('historical command accepts actual exit receipt without inventing Vitest and rejects if-present or nonzero exit',()=>{
 const f=historyFixture();f.entry.kind='command';f.entry.outcomes=['frontend-app-types'];delete f.entry.cases;
 f.execution={argv:['node','node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],exitCode:0,signal:null,cwd:'/actual/frontend'};
 f.proof('report',f.execution);f.proof('execution',f.execution);
 f.review.outcomes=f.entry.outcomes;f.review.originalExecution=f.execution;f.review.originalInvocationCases=[];f.review.originalSHA256.report=f.entry.proofs.report.sha256;f.review.originalSHA256.execution=f.entry.proofs.execution.sha256;
 f.review.commandOutcome={id:f.entry.outcomes[0],argv:f.execution.argv,exitCode:0,logSHA256:f.entry.proofs.log.sha256};f.review.commandLogAssociationRationale='Synthetic original execution/log association reviewed explicitly, not an empty-green-log inference';f.proof('review',f.review);
 const admitted=verifyHistoricalAdmission(f.entry,f.context);assert.equal(admitted.ciExecuted,false);assert.deepEqual(admitted.outcomes,['frontend-app-types']);
 f.execution.argv=['npm','run','typecheck','--if-present'];f.proof('report',f.execution);f.proof('execution',f.execution);f.review.originalExecution=f.execution;f.review.originalSHA256.report=f.entry.proofs.report.sha256;f.review.originalSHA256.execution=f.entry.proofs.execution.sha256;f.proof('review',f.review);assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context),/no-op/);
 f.execution.argv=['node','tsc.mjs'];f.execution.exitCode=2;f.proof('report',f.execution);f.proof('execution',f.execution);f.review.originalExecution=f.execution;f.review.originalSHA256.report=f.entry.proofs.report.sha256;f.review.originalSHA256.execution=f.entry.proofs.execution.sha256;f.proof('review',f.review);assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context),/original exit0/);
});
test('steps cannot replace actual CI/runner/service identity with client environment values',()=>{
 for(const key of ['CI','GITHUB_ACTIONS','CI_POSTGRES_SERVICE_ID','PR363_PG_PORT','GH_TOKEN','PATH']){const f=fixture(),e=structuredClone(f.b.execution);e.backend.steps[0].environment={[key]:'forged'};assert.throws(()=>validateExecution(e),/forge runner/);}
});

test('shallow checkout fetches only the fixed reviewed control checkpoint, never a fallback head',()=>{const f=fixture(),fetched=[];let available=false;const read=(c,a,...r)=>{if(c==='ls-tree'&&a===f.b.controlCheckpoint&&!available)throw Error('Missing immutable Git object');if(c==='fetch'){fetched.push(r.at(-1));available=true;return '';}return f.read(c,a,...r);};pr363Plan(f.entries,base,head,read,f.env,f.b);assert.deepEqual(fetched,[f.b.controlCheckpoint]);});
test('actual original SHA256 file manifests compare exact current Git bytes without backfilling old Git blobs',()=>{
 const f=historyFixture(),bytes=Buffer.from('original source with final newline\n');f.inputs.files=[{path:'source/unit.ts',mode:'100644',sha256:createHash('sha256').update(bytes).digest('hex')}];f.proof('inputs',f.inputs);f.review.originalSHA256.inputs=f.entry.proofs.inputs.sha256;f.proof('review',f.review);f.context.readGitBytes=()=>bytes;
 verifyHistoricalAdmission(f.entry,f.context);f.context.readGitBytes=()=>Buffer.from('modified');assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context));
});

test('lossless gzip transport preserves exact original reporter hash instead of relabelling the compressed bytes',()=>{const f=historyFixture(),ref=f.entry.proofs.report,original=f.bytes.get(ref.path),compressed=gzipSync(original);f.bytes.set(ref.path,compressed);ref.encoding='gzip-json';ref.decodedSHA256=ref.sha256;ref.sha256=createHash('sha256').update(compressed).digest('hex');const r=verifyHistoricalAdmission(f.entry,f.context);assert.equal(r.originalSHA256.report,ref.decodedSHA256);assert.equal(r.proofTransportSHA256.report,ref.sha256);ref.decodedSHA256='0'.repeat(64);assert.throws(()=>verifyHistoricalAdmission(f.entry,f.context),/original bytes drift/);});

test('browser preflight may use real command receipts but cannot replace compiled browser with preflight-only or Vitest',()=>{const f=fixture(),e=structuredClone(f.b.execution),command={id:'preflight',kind:'command',outcomeId:'preflight',runner:'host-node',dependencies:['backend'],expectedExitCode:0,argv:['node','control.mjs']};e.browser.steps.unshift(command);e.browser.requiredOutcomes=['preflight',...e.browser.requiredOutcomes];validateExecution(e);assert.throws(()=>validateExecution({...e,browser:{...e.browser,steps:[command],requiredOutcomes:['preflight']}}),/real compiled browser/);});

test('actual browser CLI uses same verified dist, isolated job services and canonical trusted HTTPS443',()=>{
 const env={GITHUB_RUN_ID:'123',CI_POSTGRES_SERVICE_ID:'a'.repeat(64),PR363_PG_PORT:'54321',PR363_REDIS_PORT:'54322',RUNNER_TEMP:'/tmp/actions',HOME:'/home/runner',SCHOOL_TEACHER_ISOLATED_DB:'1',GH_TOKEN:'must-not-inherit'};
 const actual=browserEnvironment(env,'/repo');assert.equal(actual.DATABASE_URL,actual.SCHOOL_TEACHER_TEST_DATABASE_URL);assert.equal(new URL(actual.DATABASE_URL).pathname,'/school_teacher_browser_ci_test');assert.equal(actual.SCHOOL_TEACHER_PRIVATE_DIR,'/tmp/actions/pr363-private');assert.equal(actual.SCHOOL_TEACHER_FRONTEND_DIST,'/repo/server-version/frontend/dist');assert.equal(actual.PR363_TEACHER_ORIGIN,'https://teacher.eduk12.top');assert.equal(actual.PR363_BACKEND_TEACHER_PORT,'43132');assert.equal(actual.GH_TOKEN,undefined);
 for(const patch of [{CI_POSTGRES_SERVICE_ID:'guessed'},{PR363_PG_PORT:'443'},{SCHOOL_TEACHER_ISOLATED_DB:'0'}])assert.throws(()=>browserEnvironment({...env,...patch},'/repo'));
 const config=browserIngressConfig('/repo','/tmp/actions/pr363-ingress');assert.equal((config.match(/127\.0\.0\.1:443/g)||[]).length,3);assert(config.includes('proxy_set_header Origin $http_origin'));assert(config.includes('proxy_set_header X-Forwarded-Proto https'));assert(config.includes('return 444'));assert(!config.includes('proxy_hide_header'));assert.throws(()=>browserIngressConfig('/repo;malicious','/tmp/private'));
});

test('actual browser YAML wires native fixture prerequisites and only sanitized public receipts',()=>{
 const jobs=JSON.parse(execFileSync('python3',['-c',"import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin)['jobs']))"],{input:readFileSync('.github/workflows/ci.yml','utf8'),encoding:'utf8'})),job=jobs['pr363-browser'];
 assert.equal(job.services.postgres.env.POSTGRES_DB,'school_teacher_browser_ci_test');assert.equal(job.env.SCHOOL_TEACHER_ISOLATED_DB,'1');assert.equal(job.env.TZ,'UTC');assert(job.steps.some(s=>s.run?.includes('libnss3-tools nginx openssl')));assert(job.steps.some(s=>s.run?.includes('before[p]=stat.S_IMODE(st.st_mode)')));assert.equal(job.steps.filter(s=>s.run==='node .github/scripts/pr363-checks.mjs browser').length,1);
 assert(job.steps.some(s=>s.if==='always()'&&s.run?.includes('pr363-ci-ingress')));const upload=job.steps.find(s=>s.uses==='actions/upload-artifact@v4');assert.equal(upload.with.path,'pr363-evidence/*.json\npr363-evidence/*.log\n');assert(!JSON.stringify(job).includes('ignoreHTTPSErrors'));assert(!JSON.stringify(job).includes('--no-sandbox'));
 const f=fixture(),e=structuredClone(f.b.execution);e.browser.steps[0].argv=['node','control.mjs'];assert.throws(()=>validateExecution(e));
});
