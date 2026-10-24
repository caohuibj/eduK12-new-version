import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,surveyReviewPlan,surveyReviewOutputs} from './survey-review-scope.mjs';
import {verifyLocal,verifyReport,verifyOriginal,admittedCases} from './survey-review-checks.mjs';
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
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_NUMBER:'350'};
 return {head,source,entries,values,read,env,plan(){return surveyReviewPlan(this.entries,binding.base,this.head,this.read,this.env)}};
}
test('exact participant candidate disables unrelated consumers and retains fresh SAST',()=>{const p=fixture().plan(),o=surveyReviewOutputs(p);assert.equal(p.route,'survey-review');for(const k of ['frontend','frontend_build','maintenance','run_performance_tests','ops','media2','cognitive'])assert.equal(o[k],false);assert.equal(o.codeql,true)});
test('other branches retain existing routes',()=>{const f=fixture();assert.equal(surveyReviewPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
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
test('base drift is rejected',()=>{const f=fixture();assert.throws(()=>surveyReviewPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('only an exact main merge classifies without repeated checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(surveyReviewOutputs(p).codeql,false);f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('stable gate requires actual scope qualification and CodeQL, refuses draft or skipped results',()=>{const p=fixture().plan(),outputs=Object.fromEntries(Object.entries(surveyReviewOutputs(p)).map(([k,v])=>[k,String(v)]));const n={scope:{result:'success',outputs},'survey-review':{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','survey-review','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert(failedChecks(n,true).length);for(const result of [undefined,'failure','skipped','cancelled'])for(const job of ['scope','survey-review','codeql']){const a=structuredClone(n);a[job].result=result;assert(failedChecks(a,false).includes(job))}const a=structuredClone(n);a.scope.outputs.frontend='true';assert(failedChecks(a,false).includes('scope'));});
test('admits exactly 49 unchanged local FINAL assertions with retained failures',()=>{
 const r=verifyLocal();assert.equal(r.passed,49);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert(r.originalFailuresRetained.length);
});
test('refuses local report tampering and fixture drift',()=>{
 assert.throws(()=>verifyLocal(p=>p.endsWith('final-local.json')?Buffer.from('{}'):readFileSync(p)));
 assert.throws(()=>verifyLocal(p=>p.endsWith('SurveyPublicApp.final.test.tsx')?Buffer.from('changed test'):readFileSync(p)));
 assert.throws(()=>verifyLocal(readFileSync,()=> '0'.repeat(40)));
});
test('requires complete named reports without skipped, failed or unexpected cases',()=>{
 const r={success:true,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{name:'/root/src/one.test.ts',assertionResults:[{fullName:'one',status:'passed'}]}]};
 assert.equal(verifyReport(r,['src/one.test.ts']).passed,1);assert.throws(()=>verifyReport(r,['src/missing.test.ts']));
 r.numPendingTests=1;assert.throws(()=>verifyReport(r,['src/one.test.ts']));r.numPendingTests=0;r.testResults[0].assertionResults[0].status='failed';assert.throws(()=>verifyReport(r,['src/one.test.ts']));
});
function officialFixture(){
 const r=binding.original,run={head_sha:r.source,event:'pull_request',path:'.github/workflows/ci.yml',pull_requests:[{number:350}]};
 const jobs={[r.backendJob]:{run_id:r.run,head_sha:r.source,name:'PR light / backend compile',status:'completed',conclusion:'failure',completed_at:new Date().toISOString(),steps:[{name:'build (tsc)',status:'completed',conclusion:'success'}]},[r.frontendJob]:{run_id:r.run,head_sha:r.source,name:'PR light / frontend lint + typecheck',status:'completed',conclusion:'failure',completed_at:new Date().toISOString(),steps:[{name:'lint',status:'completed',conclusion:'success'}]}};
 return {run,jobs,api:async path=>path.startsWith('actions/runs/')?run:jobs[path.split('/').at(-1)],object:(cmd,...args)=>{assert.equal(cmd,'diff');return args.at(-1).endsWith('frontend')?binding.frontendLintChanged.map(p=>'server-version/frontend/'+p).join('\n'):'server-version/backend/src/__tests__/parent-portal/routes.test.ts'}};
}
test('reuses only actual successful stages while retaining failed parent jobs',async()=>{
 const f=officialFixture(),r=await verifyOriginal(f.api,f.object);assert.equal(r.parentJobsRemainFailed,true);assert.equal(r.backendCompilationReplayed,false);
});
for(const [name,mutate]of [
 ['wrong source',f=>{f.run.head_sha='wrong'}],['wrong PR',f=>{f.run.pull_requests=[]}],
 ['failed stage',f=>{f.jobs[binding.original.backendJob].steps[0].conclusion='failure'}],
 ['expired stage',f=>{f.jobs[binding.original.backendJob].completed_at='2026-01-01T00:00:00Z'}],
 ['pending stage',f=>{f.jobs[binding.original.frontendJob].steps[0].status='in_progress'}],
 ['compiler input drift',f=>{f.object=()=> 'server-version/backend/src/index.ts'}],
])test('official admission refuses '+name,async()=>{const f=officialFixture();mutate(f);await assert.rejects(()=>verifyOriginal(f.api,f.object))});
test('workflow isolates PR350, prepares backend types and executes migration protection without platform suites',()=>{
 const y=readFileSync('.github/workflows/ci.yml','utf8');const job=y.slice(y.indexOf('  survey-review:\n'),y.indexOf('  pr-light-backend:\n'));
 assert(job.includes("application_route == 'survey-review'"));assert(job.includes('survey-review-checks.mjs upgrade'));assert(job.includes('survey-review-checks.mjs restore'));assert(job.includes('prisma/build/index.js generate'));assert(!job.includes('npm test'));assert(!job.includes('npm run build'));assert.equal((job.match(/vite\/bin\/vite.js build/g)||[]).length,1);assert(!job.includes('miniprogram'));assert(y.includes('needs: [scope, survey-review,'));
});

test('official continuation requires every accepted dependency and retains the complete disjoint union',()=>{
 const e=JSON.parse(readFileSync('.github/evidence/survey-review/continuation.json'));const r=admittedCases(e);assert.equal(r.accepted+r.missing,367);assert.equal(r.originalFailed,22);
 assert.throws(()=>admittedCases(e,()=> '0'.repeat(40)));const tampered=structuredClone(e);tampered.missing.push(tampered.accepted[0]);assert.throws(()=>admittedCases(tampered));
});
