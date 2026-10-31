import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {binding,validateCandidate,schoolTeacherPlan,schoolTeacherOutputs,requireSuccess,SELF_BRANCH,SELF_BASE,SELF_MARKER,SELF_JOBS,JOBS,REPOSITORY,sha256} from './school-teacher-scope.mjs';
import {frontendTypeCommand,verifyTestReport,requireNoHistoricalAcceptance,verifyExecutionInputs} from './school-teacher-checks.mjs';
const require=createRequire(import.meta.url);
const browser=require('../../server-version/e2e/education-self-questionnaire.cjs');
const workflow=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');
const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
const job=id=>{const m=new RegExp('^  '+id+':\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|$(?![\\s\\S]))','m').exec(workflow);assert(m,'Missing job '+id);return m[1]};
const needs=id=>{const text=job(id),inline=/^    needs: (.+)$/m.exec(text);if(inline)return inline[1].replace(/[\[\]]/g,'').split(/,\s*/);const block=/^    needs:\n((?:    - .+\n)+)/m.exec(text);assert(block,'Missing needs '+id);return [...block[1].matchAll(/^    - (.+)$/gm)].map(m=>m[1])};
function fixture(){
 const b=structuredClone(binding({CI_HEAD_REF:SELF_BRANCH}));
 // Synthetic unit observations only; production activation remains disabled in
 // the committed binding until DOT independently reviews this exact candidate.
 b.enabled=true;b.blockers=[];b.review.completed=true;
 const sourceHead='a'.repeat(40),sourceTree='b'.repeat(40),evidence=readFileSync(new URL('./school-teacher-evidence.json',import.meta.url));
 const entries=[...Object.entries(b.source).map(([file,e])=>({file,oldBlob:e.before||'0'.repeat(40),newBlob:e.after,oldMode:e.before?'100644':'000000',newMode:'100644',status:e.before?'M':'A'})),...Object.entries(b.controlBefore).map(([file,before])=>({file,oldBlob:before||'0'.repeat(40),newBlob:b.controlAfter[file]||'c'.repeat(40),oldMode:before?'100644':'000000',newMode:'100644',status:before?'M':'A'}))];
 const o={event:'pull_request',repository:REPOSITORY,branch:SELF_BRANCH,draft:false,forceFull:false,base:SELF_BASE,sourceHead,checkoutHead:sourceHead,sourceTree,checkoutTree:sourceTree,frontendTree:b.frontendTree,backendTree:b.backendTree,productFrontendTree:b.frontendTree,productBackendTree:b.backendTree,entries};
 return {b,o,evidence};
}
test('committed selection pins actual source and controls and reads its nonempty baseline and cross-component input closure',()=>{
 const b=binding({CI_HEAD_REF:SELF_BRANCH}),hash=path=>execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim();
 for(const [path,entry]of Object.entries(b.source))assert.equal(hash(path),entry.after,'Source input drift: '+path);
 for(const [path,blob]of Object.entries(b.controlAfter))assert.equal(hash(path),blob,'Control input drift: '+path);
 assert.equal(verifyExecutionInputs(b).inlineBaselineFixtureHashVerified,true);
});
test('SELF candidate selects a separate binding and freezes complete source controls modes and the real base',()=>{
 assert.equal(binding({CI_HEAD_REF:SELF_BRANCH}).branch,SELF_BRANCH);
 assert.equal(binding({CI_HEAD_REF:'main',CI_BASE_SHA:SELF_BASE}).branch,SELF_BRANCH);
 assert.equal(binding({PLAN:JSON.stringify({candidate:'education-self'})}).branch,SELF_BRANCH);
 assert.equal(binding({CI_HEAD_REF:'work/school-teacher-review-20261022'}).branch,'work/school-teacher-review-20261022');
 const f=fixture();assert.equal(validateCandidate(f.b,f.o,f.evidence).candidate,'education-self');
 for(const mutate of [o=>o.base='d'.repeat(40),o=>o.entries.pop(),o=>o.entries[0].newBlob='e'.repeat(40),o=>o.entries[0].newMode='100755',o=>o.checkoutTree='f'.repeat(40),o=>o.branch='another-branch',o=>o.draft=true,o=>o.forceFull=true]){const o=structuredClone(f.o);mutate(o);assert.throws(()=>validateCandidate(f.b,o,f.evidence));}
 const o=structuredClone(f.o),control=o.entries.find(e=>Object.hasOwn(f.b.controlAfter,e.file));control.newBlob='0'.repeat(40);assert.throws(()=>validateCandidate(f.b,o,f.evidence));
 const b=structuredClone(f.b);delete b.controlAfter[control.file];assert.throws(()=>validateCandidate(b,f.o,f.evidence));
 const disabled=structuredClone(f.b);disabled.enabled=false;assert.throws(()=>validateCandidate(disabled,f.o,f.evidence));
});
test('known SELF branch refuses marker loss dispatch ambiguity or fallback, and retains root route and CodeQL gates',()=>{
 const f=fixture(),env={CI_HEAD_REF:SELF_BRANCH,CI_EVENT:'pull_request'};
 assert.throws(()=>schoolTeacherPlan([],SELF_BASE,f.o.sourceHead,()=>assert.fail('No source lookup allowed'),env,f.b,f.evidence));
 assert.throws(()=>schoolTeacherPlan([],SELF_BASE,f.o.sourceHead,()=>{}, {...env,CI_EVENT:'workflow_dispatch'},f.b,f.evidence));
 assert.throws(()=>schoolTeacherPlan([{file:SELF_MARKER},{file:'.github/scripts/school-teacher-bindings.json'}],SELF_BASE,f.o.sourceHead,()=>{},env,f.b,f.evidence));
 const outputs=schoolTeacherOutputs(validateCandidate(f.b,f.o,f.evidence));assert.equal(outputs.application_route,'school-teacher');assert.equal(outputs.codeql,true);assert.equal(outputs.situational,false);
 const gate=readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8');assert(gate.includes("return ['scope','school-teacher','codeql']"));assert(gate.includes('recomputed-school-teacher-plan'));
 assert(ci.includes(SELF_MARKER));assert(ci.includes("github.event.before == '"+SELF_BASE+"'"));
 for(const line of ci.split('\n').filter(line=>line.includes('"work/school-teacher-review-20261022"')))assert(line.includes('"'+SELF_BRANCH+'"'),'Known-branch refusal/probe exclusion lost SELF');
 assert(ci.includes("application_route == 'school-teacher' && 'paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]'"));
});
test('SELF exact needs accepts only selected successes and deliberately skipped legacy job',()=>{
 assert.deepEqual(needs('qualified'),['admission','frontend','connected','backend-self','postgres-self','browser-self','native-evidence','native-runtime','security']);
 const n=Object.fromEntries(SELF_JOBS.map(id=>[id,{result:'success'}]));n.connected={result:'skipped'};assert.equal(requireSuccess({requiredJobs:SELF_JOBS},n),true);
 for(const id of SELF_JOBS)for(const result of ['skipped','cancelled','failure',undefined]){const changed=structuredClone(n);changed[id].result=result;assert.throws(()=>requireSuccess({requiredJobs:SELF_JOBS},changed));}
 assert.throws(()=>requireSuccess({requiredJobs:SELF_JOBS},{...n,connected:{result:'success'}}));assert.throws(()=>requireSuccess({requiredJobs:SELF_JOBS},{...n,unexpected:{result:'success'}}));
 const legacy=Object.fromEntries(JOBS.map(id=>[id,{result:'success'}]));for(const id of SELF_JOBS.filter(id=>!JOBS.includes(id)))legacy[id]={result:'skipped'};assert.equal(requireSuccess({requiredJobs:JOBS},legacy),true);
});
test('separate producers reuse unchanged results while the missing browser alone consumes both builds',()=>{
 assert.deepEqual(needs('backend-self'),['admission']);assert.deepEqual(needs('postgres-self'),['admission','backend-self']);assert.deepEqual(needs('browser-self'),['admission','frontend','backend-self','postgres-self']);
 assert(job('backend-self').includes('school-teacher-checks.mjs backend'));assert(job('backend-self').includes('school-teacher-backend-${{ github.sha }}'));
 const pg=job('postgres-self');assert(pg.includes('school-teacher-checks.mjs postgres'));assert(!pg.includes('services:'));assert(!pg.includes('npm ci'));assert(!pg.includes('school-teacher-checks.mjs migrate'));assert(!pg.includes('school-teacher-checks.mjs postgres-restore'));
 const text=job('browser-self');assert(text.includes('school-teacher-backend-${{ github.sha }}'));assert(text.includes('school-teacher-checks.mjs verify-backend-artifact'));assert(text.includes('CAMPUS_ELIGIBILITY_HMAC_KEY CAMPUS_MFA_ENCRYPTION_KEY'));assert(text.includes("ASSESSMENT_COMPACT_FACTS_ENABLED: 'false'"));assert(!text.includes('EDUCATION_MATERIAL_CAPACITY_PROBE_STUB'));
 assert(text.includes('school-teacher-checks.mjs browser-report'));assert(text.includes('school-teacher-checks.mjs verify-frontend-artifact'));assert(!text.includes('school-teacher-checks.mjs restore'));assert(text.includes('migrate deploy'));
 assert(!/continue-on-error|no-sandbox|ignoreHTTPSErrors|sysctl|workflow_dispatch/.test(workflow));assert.equal(frontendTypeCommand({branch:SELF_BRANCH}).exe,'npm');assert.deepEqual(frontendTypeCommand({branch:SELF_BRANCH}).args,['run','typecheck']);
});
test('collected selections require nonzero exact passes, exact filtering and successful teardown; private results remain unadmitted',()=>{
 const batch={expectedPassed:['actual'],expectedFiltered:['not selected']},report={success:true,numFailedTests:0,testResults:[{assertionResults:[{fullName:'actual',status:'passed'},{fullName:'not selected',status:'pending'}]}]};assert.equal(verifyTestReport(report,batch).passed,1);
 for(const mutate of [r=>r.success=false,r=>r.numFailedTests=1,r=>r.testResults[0].assertionResults[0].status='skipped',r=>r.testResults[0].assertionResults.push({fullName:'unknown',status:'pending'}),r=>r.testResults=[]]){const r=structuredClone(report);mutate(r);assert.throws(()=>verifyTestReport(r,batch));}
 assert.throws(()=>requireNoHistoricalAcceptance({schemaVersion:1,acceptedGroups:[{originalExecutionSigned:false}]}));
 const b=binding({CI_HEAD_REF:SELF_BRANCH});for(const c of ['frontend','backend']){const closure=b.execution[c].inputClosure;assert(closure.trees.some(t=>t.path==='server-version/'+c));assert.equal(sha256(JSON.stringify({files:closure.files,trees:closure.trees})),closure.sha256);for(const selected of b.execution[c].batches){assert(selected.expectedPassed.length);assert(Array.isArray(selected.expectedFiltered));const names=[...selected.expectedPassed,...selected.expectedFiltered];assert.equal(new Set(names).size,names.length,'Frozen assertion names must be unique before CI activation');}}
});
function reportFixture(){
 const head='a'.repeat(40),tree='b'.repeat(40),runId='123',hex='c'.repeat(64),binary='/opt/google/chrome/chrome';
 const options={executablePath:binary,headless:true,chromiumSandbox:true};
 const preflight={ok:true,code:'CHROME_PREFLIGHT_READY',schemaVersion:1,scope:'preinstalled-chrome-preflight',acceptance:false,browserLaunched:false,platform:'linux',architecture:'x64',nonroot:true,
 package:{name:'google-chrome-stable',architecture:'amd64',packageVersion:'142.0.7444.59-1',browserVersion:'142.0.7444.59'},files:[{path:binary,rootOwned:true,executable:true,groupOrWorldWritable:false,permissionMode:0o755,setuid:false},{path:'/opt/google/chrome/chrome-sandbox',rootOwned:true,executable:true,groupOrWorldWritable:false,permissionMode:0o4755,setuid:true}],
 playwright:{version:'1.62.1',browserType:'chromium',executablePath:binary,lockSha256:hex,publicApiSha256:hex},launchOptions:options};
 const inputs=Object.fromEntries(['frontend','backend'].map(kind=>[kind,{schemaVersion:1,kind,sha:head,runId,lockDigest:hex,contentDigest:hex}]));
 const report={schemaVersion:1,status:'PASSED',browserMode:'SELF_COMPOSITION',source:{head,tree},runId,errors:[],inputs,layoutDetector:{status:'PASSED',closedVisibleClips:1,openVisibleClips:2},chrome:{options,preflight,sandbox:{ok:true,code:'CHROME_SANDBOX_VERIFIED',seccompBpf:true,suidSandbox:true,pidNamespaces:true},launchedVersion:preflight.package.browserVersion},
 startups:['SCHOOL','TEACHER'].map(product=>({product,corsOrigin:'https://'+product.toLowerCase()+'.eduk12.top',ready:true,phase:'READY'})),storageModes:['SCHOOL','TEACHER'].map(product=>({product,compactFactsEnabled:false})),coverage:[],sessions:[],screenshots:[]};
 for(const product of ['SCHOOL','TEACHER']){
  report.coverage.push({product,check:browser.checks[0],fixedVersion:true,reopened:true,displayOnly:true,sourceProviders:['PRIVATE_VERSION','PRIVATE_VERSION','LIBRARY_SCALE']},{product,check:browser.checks[1],parentCount:1,sourceUnits:3,resumed:true,status:'COMPLETED'},{product,check:browser.checks[2],authorDenied:true,states:['READY','COMPLETION_ONLY','WITHHELD']});
  for(const actor of ['author','participant'])report.sessions.push({product,actor,authenticated:true,pageErrors:[],consoleErrors:[],unexpectedRequests:[],requestFailures:[],failedResponses:[],expectedFailures:[]});
  for(const suffix of ['author','feedback'])report.screenshots.push({product,file:'screenshots/'+product.toLowerCase()+'-ordinary-'+suffix+'.png'});
 }
 const png=Buffer.alloc(128);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1440,16);png.writeUInt32BE(900,20);
 return {report,identity:{head,tree,runId,...inputs},read:()=>png};
}
test('browser report consumer accepts complete exact-source SELF matrix and rejects stale identity missing authorization coverage unsafe Chrome and teardown errors',()=>{
 const f=reportFixture();assert.equal(browser.verifyReport(f.report,f.identity,f.read).status,'PASSED');
 for(const mutate of [r=>r.source.head='d'.repeat(40),r=>r.runId='old',r=>r.inputs.frontend.sha='d'.repeat(40),r=>r.coverage.pop(),r=>r.coverage[0].displayOnly=false,r=>r.coverage[2].authorDenied=false,r=>r.sessions[0].authenticated=false,r=>r.sessions[1].pageErrors=['synthetic error'],r=>r.sessions[2].failedResponses=[{path:'/unexpected',status:500}],r=>r.chrome.options.chromiumSandbox=false,r=>r.chrome.launchedVersion='old',r=>r.startups[1].ready=false,r=>r.storageModes[0].compactFactsEnabled=true,r=>r.screenshots.pop(),r=>r.errors=['synthetic teardown failure']]){const r=structuredClone(f.report);mutate(r);assert.throws(()=>browser.verifyReport(r,f.identity,f.read));}
});

// Model the repaired Teacher task controller's durable START binding. No DOM, account, API
// server or application qualification is implied by these executor contracts.
function teacherResumeFixture({failOpen=false}={}){
 const events=[],stop=new Error('synthetic stop before FINAL'),openError=new Error('synthetic task click failed');
 let parentRef=null,rowRef=null,panelOpen=false,selected=false;
 const waiters=new Set(),state={id:'parent',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:{id:'scale-item',type:'SCALE'}};
 const parentResponse=()=>{
  const response={request:()=>({method:()=> 'GET'}),url:()=> 'https://teacher.eduk12.top/api/huiteacher/assessment-composite-attempts/parent?view=current-unit',status:()=>200,json:async()=>({data:state})};
  for(const waiter of waiters)if(waiter.match(response)){clearTimeout(waiter.timer);waiters.delete(waiter);waiter.resolve(response)}
 };
 const card={filter:()=>card,getByRole:(role,{name})=>({click:async()=>{
  if(failOpen)throw openError;
  assert.equal(role,'button');assert.equal(name,rowRef?'继续测评':'开始测评','The mounted card must retain its durable START binding');
  events.push('card:'+name);panelOpen=true;if(rowRef)parentResponse();
 }})};
 const page={
  locator:()=>card,
  waitForResponse:match=>new Promise((resolve,reject)=>{
   const waiter={match,resolve,timer:null};waiter.timer=setTimeout(()=>{waiters.delete(waiter);reject(new Error('synthetic missing response'))},15);waiters.add(waiter);
  }),
  reload:async()=>assert.fail('Same-page resume must not reload the product'),
  getByRole:(role,{name})=>{
   if(role==='region'&&name==='本段作答说明')return {getByText:()=>({waitFor:async()=>{}})};
   if(role==='region'&&name==='测评独立作答页')return {waitFor:async options=>{assert.deepEqual(options,{state:'hidden'});assert.equal(panelOpen,false);events.push('exit-confirmed')}};
   if(role==='checkbox')return {count:async()=>1,check:async()=>events.push('consent')};
   assert.equal(role,'button');
   if(name==='开始或继续测评')return {click:async()=>{parentRef='parent';rowRef=parentRef;events.push('START');parentResponse()}};
   if(name==='合成量表选项乙')return {click:async()=>{selected=true;events.push('answer')},getAttribute:async attribute=>{assert.equal(attribute,'aria-pressed');events.push('restored');return String(selected)}};
   if(name==='保存并退出')return {click:async()=>{events.push('save-exit');panelOpen=false}};
   if(name==='提交整份量表')return {click:async()=>{events.push('before-FINAL');throw stop}};
   assert.fail('Unexpected synthetic control '+name);
  },
 };
 const session={product:'TEACHER',prefix:'/api/huiteacher',origin:'https://teacher.eduk12.top',page,api:async uri=>{
  assert.equal(uri,'/my-assessment-tasks?pageSize=25');return {list:[{executionId:'execution',eventId:'event',title:'fixed ordinary questionnaire',runtimeBindingRef:parentRef}]};
 }};
 return {events,stop,openError,run:()=>browser.participant(session,{}, {id:'event'},{title:'fixed ordinary questionnaire'},{author:{},report:{coverage:[]},out:'/unused'})};
}
test('SELF browser resumes the same durable Teacher parent from its mounted card without reloading',async()=>{
 const f=teacherResumeFixture();await assert.rejects(f.run(),error=>error===f.stop);
 assert.deepEqual(f.events,['card:开始测评','consent','START','answer','save-exit','exit-confirmed','card:继续测评','restored','before-FINAL']);
 await new Promise(resolve=>setTimeout(resolve,25)); // The intentionally stopped POST waiter must remain handled.
});
test('SELF browser catches a failed UI action while its response waiter later rejects',async()=>{
 const f=teacherResumeFixture({failOpen:true});await assert.rejects(f.run(),error=>error===f.openError);
 await new Promise(resolve=>setTimeout(resolve,25)); // node:test fails on an unhandled rejection here.
 assert.deepEqual(f.events,[]);
});
