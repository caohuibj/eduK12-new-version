import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,surveyManualUIPlan,surveyManualUIOutputs} from './survey-manual-ui-scope.mjs';
import {verifyReviewedEvidence} from './survey-manual-ui-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
// Historical acceptance stays bound to its original controls, never the current tree.
function historicalEvidenceRead(file){
 const record=JSON.parse(readFileSync('.github/evidence/survey-manual-ui/reviewed-local.json','utf8'));
 return Object.hasOwn(record.controlSHA256,file)?execFileSync('git',['show','dd41e47cfea797fa03a31062a268e2357ea5f70e:'+file]):readFileSync(file);
}
function fixture(){
 const head='a'.repeat(40),source='b'.repeat(40),env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_NUMBER:'340',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version'};
 const entries=[...Object.entries(binding.source).map(([file,s])=>({file,status:s.status,oldMode:s.oldMode,newMode:s.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
 const values={[head+'^{tree}']:'same-tree',[source+'^{tree}']:'same-tree'};
 for(const[file,s]of Object.entries(binding.source)){if(s.before)values[binding.base+':'+file]=s.before;values[head+':'+file]=s.after;}
 for(const[file,b]of Object.entries(binding.controlBefore))if(b)values[binding.base+':'+file]=b;
 for(const[c,t]of Object.entries(binding.components))values[head+':server-version/'+c]=t;
 for(const[f,b]of Object.entries(binding.protectedInputs))values[head+':'+f]=b;
 const read=(command,ref)=>{assert.equal(command,'rev-parse');assert.ok(Object.hasOwn(values,ref),'Unknown fixture ref '+ref);return values[ref];};
 return {head,source,env,entries,values,read,plan(){return surveyManualUIPlan(entries,binding.base,head,read,env)}};
}
test('exact Survey PR is bounded to product and named controls with no heavy output',()=>{
 const f=fixture(),p=f.plan(),o=surveyManualUIOutputs(p);assert.equal(p.route,'survey-manual-ui');assert.equal(p.postMerge,false);
 for(const k of ['frontend','frontend_build','run_performance_tests','maintenance','app_shell','ops'])assert.equal(o[k],false,k);assert.equal(o.codeql,true);
});
test('unchanged candidates stay on their existing routing',()=>{const f=fixture();assert.equal(surveyManualUIPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
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
 ['wrong PR',f=>{f.env.CI_PR_NUMBER='341'}],
 ['wrong branch',f=>{f.env.CI_HEAD_REF='training'}],
 ['manual probe',f=>{f.env.CI_EVENT='workflow_dispatch'}],
 ['forced full platform',f=>{f.env.CI_FORCE_FULL='true'}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>f.plan())});
test('refuses changed frozen main',()=>{const f=fixture();assert.throws(()=>surveyManualUIPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('exact main merge only classifies and never replays checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(surveyManualUIOutputs(p).codeql,false)});
test('only main may use push classification',()=>{const f=fixture();f.env.CI_EVENT='push';f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('admission verifies original reports and retains failed invocations',()=>{const r=verifyReviewedEvidence(historicalEvidenceRead);assert.ok(r.acceptedUniqueCases>=80);assert.equal(r.ciExecuted,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.originalFailuresRetained,true)});
test('rejects changed evidence bytes',()=>{assert.throws(()=>verifyReviewedEvidence(file=>file.endsWith('reviewed-local.json')?Buffer.from('{}'):historicalEvidenceRead(file)))});
test('rejects changed admission controls',()=>{assert.throws(()=>verifyReviewedEvidence(file=>file.endsWith('ci-survey-manual-ui.yml')?Buffer.from('tampered'):historicalEvidenceRead(file)),/Control drift: .*ci-survey-manual-ui\.yml/ )});
test('ready gate requires all selected actual successes and refuses draft or forged scope',()=>{
 const p=fixture().plan(),o=Object.fromEntries(Object.entries(surveyManualUIOutputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs:o},'survey-manual-ui':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(n,false),['scope','survey-manual-ui','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert.ok(failedChecks(n,true).length);
 for(const status of ['skipped','failure','cancelled',undefined])for(const name of ['scope','survey-manual-ui','codeql']){const c=structuredClone(n);c[name].result=status;assert.ok(failedChecks(c,false).includes(name))}
 const c=structuredClone(n);c.scope.outputs.frontend='true';assert.ok(failedChecks(c,false).includes('scope'));
 const d=structuredClone(n);d.scope.outputs.survey_manual_ui_plan='invalid';assert.ok(failedChecks(d,false).includes('scope'));
});

test('workflow fetches the exact PR source before classification and selects bounded SAST',()=>{const text=readFileSync('.github/workflows/ci.yml','utf8');const start=text.indexOf('      - name: fetch exact Survey manual UI PR source');const classify=text.indexOf('      - id: documentation-scope');assert.ok(start>0&&start<classify);assert.ok(text.slice(start,classify).includes("['fetch','--no-tags','--depth=1','origin',source]"));const codeql=text.slice(text.indexOf('  codeql:\n'),text.indexOf('  miniprogram:\n'));assert.ok(codeql.split('    runs-on:')[0].includes("application_route == 'survey-manual-ui'"));assert.ok(codeql.includes('server-version/frontend/public/entry-brand.js'));});

test('current controls cannot admit frozen historical evidence',()=>{assert.throws(()=>verifyReviewedEvidence(),/Control drift:/)});
