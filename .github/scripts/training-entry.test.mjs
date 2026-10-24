import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {binding,branch,marker,trainingEntryPlan,trainingEntryOutputs} from './training-entry-scope.mjs';
import {verifyEvidence,verifyFreshReport,requireApproval} from './training-entry-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
function fixture(){
 const head='a'.repeat(40),source='b'.repeat(40),values={};
 const entries=Object.entries(binding.source).map(([file,s])=>({file,...s}));
 for(const file of binding.controls){const before=binding.controlBefore[file];entries.push({file,status:before?'M':'A',oldMode:before?'100644':'000000',newMode:'100644'});if(before)values[binding.base+':'+file]=before;}
 for(const[file,s]of Object.entries(binding.source)){if(s.before)values[binding.base+':'+file]=s.before;values[head+':'+file]=s.after;}
 for(const[c,t]of Object.entries(binding.components))values[head+':server-version/'+c]=t;
 for(const[f,b]of Object.entries(binding.protectedInputs))values[head+':'+f]=b;
 values[source+'^{tree}']=values[head+'^{tree}']='tree';
 const read=(cmd,arg)=>{assert.equal(cmd,'rev-parse');assert(arg in values,'Unexpected Git input '+arg);return values[arg];};
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_NUMBER:'999'};
 return {head,source,entries,values,read,env,plan(){return trainingEntryPlan(this.entries,binding.base,this.head,this.read,this.env)}};
}
test('exact Training entry candidate disables unrelated consumers and retains fresh SAST',()=>{const p=fixture().plan(),o=trainingEntryOutputs(p);assert.equal(p.route,'training-entry');for(const k of ['frontend','frontend_build','maintenance','run_performance_tests','ops','media2','cognitive'])assert.equal(o[k],false);assert.equal(o.codeql,true)});
test('other branches retain existing routes',()=>{const f=fixture();assert.equal(trainingEntryPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
for(const[name,change]of [
 ['missing marker',f=>f.entries.splice(f.entries.findIndex(e=>e.file===marker),1)],
 ['unknown path',f=>{f.entries[0].file='server-version/backend/new.ts'}],
 ['missing path',f=>f.entries.pop()],['duplicate path',f=>{f.entries[0]=f.entries[1]}],
 ['executable mode',f=>{f.entries[0].newMode='100755'}],['deleted file',f=>{f.entries[0].status='D'}],
 ['changed source',f=>{f.values[f.head+':'+Object.keys(binding.source)[0]]='c'.repeat(40)}],
 ['changed frontend',f=>{f.values[f.head+':server-version/frontend']='c'.repeat(40)}],
 ['changed backend',f=>{f.values[f.head+':server-version/backend']='c'.repeat(40)}],
 ['mismatched merge tree',f=>{f.values[f.source+'^{tree}']='other'}],
 ['wrong repository',f=>{f.env.CI_PR_REPOSITORY='other/repo'}],['wrong branch',f=>{f.env.CI_HEAD_REF='other'}],
 ['missing PR identity',f=>{delete f.env.CI_PR_NUMBER}],['manual request',f=>{f.env.CI_EVENT='workflow_dispatch'}],
 ['full fallback',f=>{f.env.CI_FORCE_FULL='true'}],['full acceptance',f=>{f.env.CI_FULL_ACCEPTANCE='true'}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>f.plan())});
test('base drift is rejected',()=>{const f=fixture();assert.throws(()=>trainingEntryPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('only an exact main merge classifies without repeated checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(trainingEntryOutputs(p).codeql,false);f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('requires every selected assertion with no filtered or missing files',()=>{const files=['src/one.test.ts'];const r={success:true,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{name:'/runner/src/one.test.ts',assertionResults:[{fullName:'one',status:'passed'}]}]};assert.equal(verifyFreshReport(r,files).cases,1);assert.throws(()=>verifyFreshReport(r,['src/two.test.ts']));r.testResults[0].assertionResults[0].status='pending';assert.throws(()=>verifyFreshReport(r,files));});
test('stable gate requires actual scope qualification and CodeQL, refuses draft or skipped results',()=>{const p=fixture().plan(),outputs=Object.fromEntries(Object.entries(trainingEntryOutputs(p)).map(([k,v])=>[k,String(v)]));const n={scope:{result:'success',outputs},'training-entry':{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','training-entry','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert(failedChecks(n,true).length);for(const result of [undefined,'failure','skipped','cancelled'])for(const job of ['scope','training-entry','codeql']){const a=structuredClone(n);a[job].result=result;assert(failedChecks(a,false).includes(job))}const a=structuredClone(n);a.scope.outputs.frontend='true';assert(failedChecks(a,false).includes('scope'));});


test('no implicit repeat or rebuild permission',()=>{
 for(const key of ['earlyChecksRepeat','frontendRebuild']){
  assert.throws(()=>requireApproval({},key));
  assert.throws(()=>requireApproval({authorization:{[key]:true}},key));
  requireApproval({authorization:{[key]:true,sourceMessage:'Sentinel_0123456789abcdef'}},key);
 }
});
test('tampered or unfrozen local evidence cannot qualify',()=>{
 assert.throws(()=>verifyEvidence(()=>Buffer.from('{}')));
});
test('workflow stays bounded and blocks broad manual probes before any work',()=>{
 const main=readFileSync('.github/workflows/ci.yml','utf8'),wf=readFileSync('.github/workflows/ci-training-entry.yml','utf8');
 assert(main.includes('training_entry_plan: ${{ steps.scope.outputs.training_entry_plan }}'));
 assert(main.includes('uses: ./.github/workflows/ci-training-entry.yml'));
 assert(main.includes("application_route != 'training-entry'"));
 assert(main.includes('"perf/training-entry-20261023","work/measurement-version-final-20261020"'));
 assert(wf.includes('needs: [admission, backend, frontend, browser]'));
 assert(wf.includes('training-entry-checks.mjs build-permission'));
 assert(wf.includes('training-entry-browser.mjs'));
 for(const forbidden of ['npm test','npm run typecheck','docker build','migrate deploy','--grep','--passWithNoTests'])assert(!wf.includes(forbidden),forbidden);
});

function evidenceFixture(change=()=>{}){
 const digest=v=>createHash('sha256').update(v).digest('hex'),file='server-version/frontend/src/test.test.tsx',blob='d'.repeat(40),source='e'.repeat(40);
 const inputs={[file]:blob,'server-version/frontend/package.json':blob,'server-version/frontend/package-lock.json':blob};
 const log=Buffer.from('Test Files  1 passed (1)\n     Tests  1 passed (1)\n');
 const record={id:'synthetic-original',sha256:digest(log),bytes:log.length,gzipBase64:gzipSync(log).toString('base64')};
 const controls=binding.controls.filter(f=>!f.endsWith('training-entry-bindings.json')&&!f.startsWith('.github/evidence/'));
 const e={kind:'reviewed-local-evidence',product:binding.product,ciExecuted:false,originalExecutionSigned:false,reviewStatus:'INDEPENDENTLY_REVIEWED',blockers:[],
  limits:['Original execution was unsigned.','Historical full node_modules identity missing.'],controlSHA256:Object.fromEntries(controls.map(f=>[f,digest('control '+f)])),historicalReports:[record],
  groups:[{id:'synthetic',reviewStatus:'INDEPENDENTLY_REVIEWED',reviewNote:'Independent review establishes exact selected original file and its unchanged complete imports.',executions:[{
   source,kind:'whole-file-tests',cwd:'server-version/frontend',command:null,commandSource:'reviewed-historical-scope-reconstruction',commandEvidence:'Retained worker named full-file scope, explicitly not original argv.',reviewedInvocation:{files:[file],filter:null},
   originalExecutionSigned:false,ciExecuted:false,files:[file],inputs,sourceObjectMode:'preserved-reviewed-local-manifest',originalManifestSource:source,originalManifestSHA256:digest(JSON.stringify(inputs)),historicalSourceReconstructed:true,originalManifestReview:'Reviewed immutable local Git source closure, not a contemporaneous cryptographic execution record.',
   reportId:record.id,logSHA256:record.sha256,logBytes:record.bytes,logGzipBase64:record.gzipBase64,observedExitCode:0,failed:0,filtered:0,todo:0,passedAssertions:1,admittedAssertions:1,
  }]}]};
 change(e,e.groups[0].executions[0]);const bytes=Buffer.from(JSON.stringify(e));
 const original={requiredGroups:binding.requiredGroups,evidenceSHA256:binding.evidenceSHA256,reviewedGroupFiles:binding.reviewedGroupFiles};
 Object.assign(binding,{requiredGroups:['synthetic'],evidenceSHA256:digest(bytes),reviewedGroupFiles:{synthetic:[file]}});
 try{return verifyEvidence(f=>f.endsWith('/reviewed.json')?bytes:Buffer.from('control '+f),()=>blob);}finally{Object.assign(binding,original);}
}
test('admits only independently reviewed whole-file evidence without invented case names',()=>{const r=evidenceFixture();assert.equal(r.acceptedWholeFiles,1);assert.equal(r.acceptedWholeFileAssertions,1)});
for(const[name,change]of [
 ['filtered scope',(_e,x)=>x.reviewedInvocation.filter='only one'],
 ['filtered original command',(_e,x)=>{x.commandSource='original-record-or-parent-observed-command';x.command='vitest run src/test.test.tsx --testNamePattern=one'}],
 ['false count',(_e,x)=>x.passedAssertions=2],
 ['inferred case identity',(_e,x)=>x.cases=[{name:'fabricated',status:'passed'}]],
 ['failed original invocation',(_e,x)=>x.observedExitCode=1],
 ['skipped original assertions',(_e,x)=>x.filtered=1],
 ['wrong named file',(_e,x)=>{x.files=['server-version/frontend/src/other.test.tsx'];x.reviewedInvocation.files=x.files}],
 ['duplicate file qualification',(e,x)=>e.groups[0].executions.push(structuredClone(x))],
 ['missing required file',(_e,x)=>{x.kind='lint';x.retrospectiveReceipt=true;x.exitEvidence='Observed genuine tool exit, synthetic test fixture';}],
 ['changed imported input without exact review',(_e,x)=>{x.originalInputs={...x.inputs};x.originalInputs[x.files[0]]='f'.repeat(40);x.originalManifestSHA256=createHash('sha256').update(JSON.stringify(x.originalInputs)).digest('hex')}],
])test('historical admission refuses '+name,()=>assert.throws(()=>evidenceFixture(change)));


test('browser consumes exact same-run build bytes and refuses drift without rebuilding',async()=>{
 const {verifyBrowserInput}=await import('./training-entry-checks.mjs');
 const files={'index.html':{sha256:'a'.repeat(64),bytes:1},'.vite/manifest.json':{sha256:'b'.repeat(64),bytes:2}};
 const expected={source:'s',sourceHead:'h',tree:'t',run:'123',attempt:'2'};
 const manifest={...expected,componentTree:'t',attempt:'1',files};
 verifyBrowserInput(manifest,files,expected);
 for(const key of ['source','sourceHead','componentTree','run','attempt'])assert.throws(()=>verifyBrowserInput({...manifest,[key]:key==='attempt'?'3':'wrong'},files,expected));
 assert.throws(()=>verifyBrowserInput(manifest,{},expected));
 assert.throws(()=>verifyBrowserInput(manifest,{...files,'extra.js':files['index.html']},expected));
 assert.throws(()=>verifyBrowserInput(manifest,{...files,'index.html':{sha256:'c'.repeat(64),bytes:1}},expected));
 const wf=readFileSync('.github/workflows/ci-training-entry.yml','utf8');
 const browser=wf.split('  browser:')[1].split('  qualified:')[0];
 assert(browser.includes('needs: frontend'));assert(browser.includes('artifact-ids: ${{ needs.frontend.outputs.artifact }}'));
 assert(browser.includes('training-entry-checks.mjs browser-input'));
 for(const action of ['frontend-build','frontend-later','checks.mjs frontend','checks.mjs lint'])assert(!browser.includes(action));
 assert(wf.includes('["admission","backend","frontend","browser"]'));
 assert(browser.includes('timeout-minutes: 8'));
});
