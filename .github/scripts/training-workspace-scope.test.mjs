import assert from 'node:assert/strict';
import {test} from 'node:test';
import {binding,bindingPath,trainingWorkspacePlan,trainingWorkspaceOutputs} from './training-workspace-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40);
const entries=()=>[...Object.entries(binding.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),{file:bindingPath,status:'A',oldMode:'000000',newMode:'100644'}];
const read=(_,ref)=>{const [sha,file]=ref.split(':');return binding.source[file]?.[sha===binding.base?'before':'after']};
test('admits exactly the frozen integrated application and no unrelated acceptance',()=>{
 const p=trainingWorkspacePlan(entries(),binding.base,head,read),out=trainingWorkspaceOutputs(p);
 assert.equal(p.sourceCount,60);assert.equal(out.perf_smoke,false);assert.equal(out.ops,false);assert.equal(out.frontend_build,false);
 assert.deepEqual(requiredChecks({scope:{outputs:out}},false),['scope','training-workspace','codeql']);
});
for(const [label,mutate]of [
 ['unknown source',e=>e.push({file:'server-version/backend/prisma/schema.prisma',status:'M',oldMode:'100644',newMode:'100644'})],
 ['missing source',e=>e.splice(0,1)],['deletion',e=>{e[0].status='D';e[0].newMode='000000'}],
 ['symlink',e=>{e[0].newMode='120000'}],['duplicate',e=>e.push({...e[0]})],['changed binding',e=>{e.at(-1).status='M';e.at(-1).oldMode='100644'}],
])test('rejects '+label,()=>{const e=entries();mutate(e);assert.throws(()=>trainingWorkspacePlan(e,binding.base,head,read))});
test('rejects changed product blobs and moved base',()=>{
 assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,()=>head));
 assert.throws(()=>trainingWorkspacePlan(entries(),head,head,read));
 assert.equal(trainingWorkspacePlan([],binding.base,head),null);
});
test('requires all real jobs and refuses draft, failure, missing and skipped qualification',()=>{
 const outputs=Object.fromEntries(Object.entries(trainingWorkspaceOutputs(trainingWorkspacePlan(entries(),binding.base,head,read))).map(([k,v])=>[k,String(v)]));
 const needs={scope:{result:'success',outputs},'training-workspace':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(failedChecks(needs,false),[]);assert.ok(failedChecks(needs,true).length);
 for(const key of ['scope','training-workspace','codeql'])for(const result of ['failure','skipped','cancelled',undefined])assert.ok(failedChecks({...needs,[key]:{...needs[key],result}},false).length);
 assert.ok(failedChecks({...needs,scope:{...needs.scope,outputs:{...outputs,perf_smoke:'true'}}},false).length);
});
test('rejects full/manual execution rather than using the platform fallback',()=>{
 const previous={event:process.env.CI_EVENT,force:process.env.CI_FORCE_FULL};
 try{process.env.CI_EVENT='workflow_dispatch';assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,read));process.env.CI_EVENT='pull_request';process.env.CI_FORCE_FULL='true';assert.throws(()=>trainingWorkspacePlan(entries(),binding.base,head,read))}
 finally{for(const[k,v]of Object.entries({CI_EVENT:previous.event,CI_FORCE_FULL:previous.force})){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});

import {integratedBinding,integratedBindingPath,integratedWorkspacePlan} from './training-workspace-scope.mjs';
import {readFileSync} from 'node:fs';
const integratedEntries=()=>[...Object.entries(integratedBinding.source).map(([file,b])=>({file,status:b.before?'M':'A',oldMode:b.before?'100644':'000000',newMode:'100644'})),...integratedBinding.controls.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
const integratedRead=(_,ref)=>{const [sha,file]=ref.split(':');return integratedBinding.source[file]?.[sha===integratedBinding.base?'before':'after']};
test('second exact workspace candidate keeps the same real merge gate without changing historical admission',()=>{
 const plan=trainingWorkspacePlan(integratedEntries(),integratedBinding.base,head,integratedRead);
 assert.equal(plan.candidate,'mac-integrated');assert.equal(plan.sourceCount,Object.keys(integratedBinding.source).length);
 assert.deepEqual(requiredChecks({scope:{outputs:trainingWorkspaceOutputs(plan)}},false),['scope','training-workspace','codeql']);
 assert.equal(trainingWorkspacePlan(entries(),binding.base,head,read).candidate,undefined);
});
test('integrated candidate fails on missing extra drift duplicate mode and base changes',()=>{
 for(const mutate of [e=>e.pop(),e=>e.push({...e[0]}),e=>e.push({file:'unexpected.ts',status:'A',oldMode:'000000',newMode:'100644'}),e=>{e[0].newMode='120000'},e=>{e.find(x=>x.file===integratedBindingPath).status='M'}]){const e=integratedEntries();mutate(e);assert.throws(()=>integratedWorkspacePlan(e,integratedBinding.base,head,integratedRead))}
 assert.throws(()=>integratedWorkspacePlan(integratedEntries(),head,head,integratedRead));assert.throws(()=>integratedWorkspacePlan(integratedEntries(),integratedBinding.base,head,()=>head));
});
test('integrated continuation restores exact products and runs only missing qualification',()=>{
 const workflow=readFileSync(new URL('../workflows/ci-training-workspace-integrated.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/integrated-build.sh|component: \[backend, frontend\]|docker build/);
 assert.equal((workflow.match(/integrated-evidence.mjs resume/g)||[]).length,2);
 assert.doesNotMatch(workflow,/integrated-checks.mjs|setup-trivy|npm audit/);
 assert.doesNotMatch(workflow,/integrated-checks.mjs\" frontend/);
 assert.match(workflow,/backend-runtime:\$TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD/);
 assert.match(workflow,/if-no-files-found: error/);assert.match(workflow,/connection_limit=4/);
 assert.doesNotMatch(workflow,/integrated-recovery.mjs upgrade/);assert.match(workflow,/integrated-recovery.mjs prepare-restore/);assert.match(workflow,/integrated-recovery.mjs restore/);
 assert.match(workflow,/browserProfileTrustApproved!==true/);assert.match(workflow,/integration-browser.cjs/);assert.match(workflow,/integrated-evidence.mjs browser-report/);
 assert.doesNotMatch(workflow,/training-workspace-reuse.mjs|training-workspace-browser.mjs|scale-library-governance-resume|ignoreHTTPSErrors|disable-web-security/);
 const wrapper=readFileSync(new URL('../workflows/ci-training-workspace.yml',import.meta.url),'utf8');
 assert.match(wrapper,/candidate == 'mac-integrated'/);assert.match(wrapper,/candidate != 'mac-integrated'/);
 assert.equal(integratedBinding.postgresTests.length,4);
 for(const file of [...integratedBinding.backendTests,...integratedBinding.frontendTests,...integratedBinding.postgresTests])assert.match(file,/^src\/.+\.test\.tsx?$/);
 const backend=readFileSync(new URL('./training-workspace-integrated-backend.sh',import.meta.url),'utf8');assert.doesNotMatch(backend,/worker\) docker/);
});

import {verifyIntegratedWorkspaceBrowser} from './training-workspace-scope.mjs';
const sampleBrowser=()=>{
 const r={schemaVersion:1,status:'PASS',phase:'complete',sourceCommit:head,ciRunId:'327',checks:['real-virtual-ctap2-administrator-session','real-exact-publication-review-grant','toolkit-exact-readonly','authorized-form-private-copy','student-course-frozen-native-mode','forged-hint-and-nonmember-denied','revoke-denies-new-use','frozen-final-historical-report-back-reload'],browserErrors:[],blockedExternalRequests:0,physicalSecurityKeyVerified:false,frozen:{publicationMode:'RUNNER_DEFAULT',runnerMode:'ONE_BY_ONE',allAtOnceRequalified:false,releaseId:'synthetic',contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64)},lifecycle:{newUseDenied:true,existingFrozenCompleted:true,historicalReportReloaded:true,newCopyResponseCount:0,newCopyTokenCount:0,sourcePrivateEndpointsDenied:true},screenshots:[],layoutChecks:[],accessibility:[],keyboard:[]};
 for(const name of ['toolkit-granted-scale','toolkit-authorized-form','learner-course','learner-frozen-scale','learner-historical-report'])for(const width of [1440,390]){r.screenshots.push({name,width,file:`${name}-${width}.png`});r.layoutChecks.push({name,width,overflow:false});r.accessibility.push({name,width,passes:1,violations:[]});r.keyboard.push({name,width,reached:true,tabPresses:1})}return r;
};
const browserOptions={head,runId:'327',directory:'/synthetic-only',read(file){const b=Buffer.alloc(104);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(file.includes('1440')?1440:390,16);b.writeUInt32BE(960,20);return b}};
test('browser validator accepts only its complete declared matrix and fails every missing or unsafe result',()=>{
 assert.equal(verifyIntegratedWorkspaceBrowser(sampleBrowser(),browserOptions).checkpoints,8);
 for(const change of [r=>r.status='FAIL',r=>r.sourceCommit='b'.repeat(40),r=>r.checks.pop(),r=>r.accessibility[0].violations.push({id:'synthetic'}),r=>r.layoutChecks[0].overflow=true,r=>r.keyboard[0].reached=false,r=>r.screenshots.pop(),r=>r.blockedExternalRequests=1,r=>r.frozen.allAtOnceRequalified=true,r=>r.lifecycle.sourcePrivateEndpointsDenied=false]){const r=sampleBrowser();change(r);assert.throws(()=>verifyIntegratedWorkspaceBrowser(r,browserOptions))}
});

import {validatePriorTests} from './training-workspace-integrated-evidence.mjs';
test('prior qualification rejects missing suite, hook failure and failed assertions',()=>{
 const report={testResults:[{name:'/app/src/unchanged.test.ts',status:'passed',assertionResults:[{status:'passed'}]}]};
 assert.equal(validatePriorTests(report,['src/unchanged.test.ts'],'frontend'),1);
 for(const mutate of [r=>r.testResults[0].status='failed',r=>r.testResults[0].assertionResults[0].status='pending',r=>r.testResults=[],r=>r.testResults.push(r.testResults[0])]){const r=structuredClone(report);mutate(r);assert.throws(()=>validatePriorTests(r,['src/unchanged.test.ts'],'frontend'))}
});

import {validateQualifiedPostgres} from './training-workspace-integrated-evidence.mjs';
test('qualified PG accepts only the one named excluded live scheduler case',()=>{
 const file='src/__tests__/integration/checkinSchedule.postgres.integration.test.ts';const r={success:true,numPassedTests:20,numFailedTests:0,numPendingTests:1,testResults:[{name:'/app/'+file,status:'passed',assertionResults:[{fullName:'checkin schedule PostgreSQL transaction contract live API scheduler publishes a due disposable fixture without a browser remaining open',status:'skipped'},...Array.from({length:20},(_,i)=>({fullName:'real contract '+i,status:'passed'}))]}]};assert.equal(validateQualifiedPostgres(r,[file]),20);
 for(const mutate of [r=>r.testResults[0].assertionResults[1].status='skipped',r=>r.testResults[0].status='failed',r=>r.testResults[0].assertionResults[0].fullName='other skipped',r=>r.numFailedTests=1]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateQualifiedPostgres(bad,[file]))}
});
