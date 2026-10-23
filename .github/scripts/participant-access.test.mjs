import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,participantAccessPlan,participantAccessOutputs} from './participant-access-scope.mjs';
import {verifyEvidence,verifyMissingReport} from './participant-access-checks.mjs';
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
 return {head,source,entries,values,read,env,plan(){return participantAccessPlan(this.entries,binding.base,this.head,this.read,this.env)}};
}
test('exact participant candidate disables unrelated consumers and retains fresh SAST',()=>{const p=fixture().plan(),o=participantAccessOutputs(p);assert.equal(p.route,'participant-access');for(const k of ['frontend','frontend_build','maintenance','run_performance_tests','ops','media2','cognitive'])assert.equal(o[k],false);assert.equal(o.codeql,true)});
test('other branches retain existing routes',()=>{const f=fixture();assert.equal(participantAccessPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
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
test('base drift is rejected',()=>{const f=fixture();assert.throws(()=>participantAccessPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('only an exact main merge classifies without repeated checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(participantAccessOutputs(p).codeql,false);f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('reviewed reports retain actual failures and do not claim signed CI execution',()=>{const r=verifyEvidence();assert.equal(r.acceptedUniqueCases,binding.acceptedCases);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.originalFailuresRetained,true)});
test('tampered evidence and controls are refused',()=>{assert.throws(()=>verifyEvidence(f=>f.endsWith('reviewed-local.json')?Buffer.from('{}'):readFileSync(f)));assert.throws(()=>verifyEvidence(f=>f.endsWith('ci-participant-access.yml')?Buffer.from('tampered'):readFileSync(f)))});
test('admitted imported source must still match its reviewed anchor',()=>{assert.throws(()=>verifyEvidence(readFileSync,()=> 'c'.repeat(40)))});
test('fresh cases must be complete with no extra admitted cases rerun',()=>{const c={file:'server-version/frontend/src/synthetic.test.ts',name:'only missing case'};const r={success:true,numFailedTests:0,numPendingTests:0,testResults:[{name:'/runner/'+c.file,assertionResults:[{fullName:c.name,status:'passed'}]}]};assert.equal(verifyMissingReport(r,[c]).passed,1);assert.throws(()=>verifyMissingReport(r,[]));r.testResults[0].assertionResults[0].status='failed';assert.throws(()=>verifyMissingReport(r,[c]))});
test('stable gate refuses draft missing skipped failed cancelled and forged results',()=>{const p=fixture().plan(),outputs=Object.fromEntries(Object.entries(participantAccessOutputs(p)).map(([k,v])=>[k,String(v)]));const n={scope:{result:'success',outputs},'participant-access':{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','participant-access','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert(failedChecks(n,true).length);for(const result of [undefined,'failure','skipped','cancelled'])for(const job of ['scope','participant-access','codeql']){const a=structuredClone(n);a[job].result=result;assert(failedChecks(a,false).includes(job))}const a=structuredClone(n);a.scope.outputs.frontend='true';assert(failedChecks(a,false).includes('scope'));const b=structuredClone(n);b.scope.outputs.participant_access_plan='{}';assert(failedChecks(b,false).includes('scope'))});
test('main workflow connects exact source scope qualified candidate and SAST',()=>{const s=readFileSync('.github/workflows/ci.yml','utf8');assert(s.indexOf('fetch exact participant access PR source')<s.indexOf('      - id: documentation-scope'));assert(s.includes('participant_access_plan: ${{ steps.scope.outputs.participant_access_plan }}'));assert(s.includes('uses: ./.github/workflows/ci-participant-access.yml'));assert(s.includes("application_route == 'participant-access'"));assert(s.includes("application_route != 'participant-access'"));assert(s.includes('needs: [scope, training-manual-ui, survey-manual-ui, participant-access,'));const w=readFileSync('.github/workflows/ci-participant-access.yml','utf8');assert(!w.includes('services:'));assert(!w.includes('npm test'));assert(!w.includes('npm run build'));assert(w.includes('needs: [admission, missing, backend]'));assert(w.includes('typescript/bin/tsc -p tsconfig.json'))});
