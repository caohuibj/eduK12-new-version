import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,trainingManualUIPlan,trainingManualUIOutputs} from './training-manual-ui-scope.mjs';
import {verifyReviewedEvidence} from './training-manual-ui-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
function fixture(){
 const head='a'.repeat(40),source='b'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_NUMBER:'341',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
 const entries=[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
 const values={[head+'^{tree}']:'same-tree',[source+'^{tree}']:'same-tree'};
 for(const[file,s]of Object.entries(binding.source)){if(s.before)values[binding.base+':'+file]=s.before;values[head+':'+file]=s.after;}
 for(const[file,b]of Object.entries(binding.controlBefore))if(b)values[binding.base+':'+file]=b;
 for(const[c,t]of Object.entries(binding.components))values[head+':server-version/'+c]=t;
 for(const[f,b]of Object.entries(binding.protectedInputs))values[head+':'+f]=b;
 const read=(command,ref)=>{assert.equal(command,'rev-parse');assert.ok(Object.hasOwn(values,ref),'Unknown fixture ref '+ref);return values[ref];};
 return {head,source,env,entries,values,read,plan(){return trainingManualUIPlan(entries,binding.base,head,read,env)}};
}
test('exact Training PR is bounded to product and named controls with no heavy output',()=>{
 const f=fixture(),p=f.plan(),o=trainingManualUIOutputs(p);assert.equal(p.route,'training-manual-ui');assert.equal(p.postMerge,false);
 for(const k of ['frontend','frontend_build','run_performance_tests','maintenance','app_shell','ops'])assert.equal(o[k],false,k);assert.equal(o.codeql,true);
});
test('unchanged candidates stay on their existing routing',()=>{const f=fixture();assert.equal(trainingManualUIPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
for(const [name,change]of [
 ['missing marker',f=>{f.entries.splice(f.entries.findIndex(e=>e.file===marker),1)}],
 ['unknown path',f=>{f.entries[0].file='server-version/backend/src/new-business.ts'}],
 ['missing product',f=>{f.entries.splice(0,1)}],
 ['duplicate path',f=>{f.entries[0]=f.entries[1]}],
 ['executable mode',f=>{f.entries[0].newMode='100755'}],
 ['deleted product',f=>{f.entries[0].status='D'}],
 ['source content drift',f=>{f.values[f.head+':'+Object.keys(binding.source)[0]]='c'.repeat(40)}],
 ['frontend tree drift',f=>{f.values[f.head+':server-version/frontend']='c'.repeat(40)}],
 ['backend tree drift',f=>{f.values[f.head+':server-version/backend']='c'.repeat(40)}],
 ['PR source/merge mismatch',f=>{f.values[f.source+'^{tree}']='different-tree'}],
 ['wrong repository',f=>{f.env.CI_PR_REPOSITORY='other/repo'}],
 ['wrong PR',f=>{f.env.CI_PR_NUMBER='342'}],
 ['wrong branch',f=>{f.env.CI_HEAD_REF='training'}],
 ['manual probe',f=>{f.env.CI_EVENT='workflow_dispatch'}],
 ['forced full platform',f=>{f.env.CI_FORCE_FULL='true'}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>f.plan())});
test('refuses changed frozen main',()=>{const f=fixture();assert.throws(()=>trainingManualUIPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('exact main merge only classifies and never replays checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(trainingManualUIOutputs(p).codeql,false)});
test('only main may use push classification',()=>{const f=fixture();f.env.CI_EVENT='push';f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('admission verifies original reports and retains failed invocations',()=>{const r=verifyReviewedEvidence();assert.equal(r.acceptedUniqueCases,11);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.originalFailuresRetained,true)});
test('rejects changed evidence bytes',()=>{assert.throws(()=>verifyReviewedEvidence(file=>file.endsWith('reviewed-local.json')?Buffer.from('{}'):readFileSync(file)))});
test('rejects changed admission controls',()=>{assert.throws(()=>verifyReviewedEvidence(file=>file.endsWith('ci-training-manual-ui.yml')?Buffer.from('tampered'):readFileSync(file)))});
test('ready gate requires all selected actual successes and refuses draft or forged scope',()=>{
 const p=fixture().plan(),o=Object.fromEntries(Object.entries(trainingManualUIOutputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs:o},'training-manual-ui':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(n,false),['scope','training-manual-ui','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert.ok(failedChecks(n,true).length);
 for(const status of ['skipped','failure','cancelled',undefined])for(const name of ['scope','training-manual-ui','codeql']){const c=structuredClone(n);c[name].result=status;assert.ok(failedChecks(c,false).includes(name))}
 const c=structuredClone(n);c.scope.outputs.frontend='true';assert.ok(failedChecks(c,false).includes('scope'));
 const d=structuredClone(n);d.scope.outputs.training_manual_ui_plan='invalid';assert.ok(failedChecks(d,false).includes('scope'));
});

test('workflow fetches the exact PR source before classification and selects bounded SAST',()=>{const text=readFileSync('.github/workflows/ci.yml','utf8');const start=text.indexOf('      - name: fetch exact Training manual UI PR source');const classify=text.indexOf('      - id: documentation-scope');assert.ok(start>0&&start<classify);assert.ok(text.slice(start,classify).includes("['fetch','--no-tags','--depth=1','origin',source]"));const codeql=text.slice(text.indexOf('  codeql:\n'),text.indexOf('  miniprogram:\n'));assert.ok(codeql.split('    runs-on:')[0].includes("application_route == 'training-manual-ui'"));assert.ok(codeql.includes('server-version/frontend/src'));});

test('Training workflow is connected to the scoped plan and required gate',()=>{const text=readFileSync('.github/workflows/ci.yml','utf8');const start=text.indexOf('  training-manual-ui:\n');const end=text.indexOf('  survey-manual-ui:\n',start);const job=text.slice(start,end);assert.ok(text.slice(text.indexOf('      - id: documentation-scope'),text.indexOf('      - id: scope')).includes('.github/scripts/training-manual-ui-bindings.json'));assert.ok(job.includes('needs: scope'));assert.ok(job.includes('uses: ./.github/workflows/ci-training-manual-ui.yml'));assert.ok(job.includes('plan: ${{ needs.scope.outputs.training_manual_ui_plan }}'));assert.ok(text.includes('needs: [scope, training-manual-ui, survey-manual-ui,'));const workflow=readFileSync('.github/workflows/ci-training-manual-ui.yml','utf8');assert.ok(workflow.includes('integrated application types'));assert.ok(workflow.includes('compile the new integrated frontend once'));assert.equal((workflow.match(/npm run build/g)||[]).length,1);assert.ok(!workflow.includes('services:'));assert.ok(!workflow.includes('npm test'));});
