import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding,branch,marker,schoolTeacherVisualPlan,schoolTeacherVisualOutputs} from './school-teacher-visual-scope.mjs';
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
 return {head,source,env,entries,values,read,plan(){return schoolTeacherVisualPlan(entries,binding.base,head,read,env)}};
}
test('exact School Teacher PR is bounded to product and named controls with no heavy output',()=>{
 const f=fixture(),p=f.plan(),o=schoolTeacherVisualOutputs(p);assert.equal(p.route,'school-teacher-visual');assert.equal(p.postMerge,false);
 for(const k of ['frontend','frontend_build','run_performance_tests','maintenance','app_shell','ops'])assert.equal(o[k],false,k);assert.equal(o.codeql,true);
});
test('unchanged candidates stay on their existing routing',()=>{const f=fixture();assert.equal(schoolTeacherVisualPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
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
 ['missing PR',f=>{f.env.CI_PR_NUMBER=''}],
 ['wrong branch',f=>{f.env.CI_HEAD_REF='training'}],
 ['manual probe',f=>{f.env.CI_EVENT='workflow_dispatch'}],
 ['forced full platform',f=>{f.env.CI_FORCE_FULL='true'}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>f.plan())});
test('refuses changed frozen main',()=>{const f=fixture();assert.throws(()=>schoolTeacherVisualPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('exact main merge only classifies and never replays checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(schoolTeacherVisualOutputs(p).codeql,false)});
test('only main may use push classification',()=>{const f=fixture();f.env.CI_EVENT='push';f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('ready gate requires all selected actual successes and refuses draft or forged scope',()=>{
 const p=fixture().plan(),o=Object.fromEntries(Object.entries(schoolTeacherVisualOutputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs:o},'school-teacher-visual':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(n,false),['scope','school-teacher-visual','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert.ok(failedChecks(n,true).length);
 for(const status of ['skipped','failure','cancelled',undefined])for(const name of ['scope','school-teacher-visual','codeql']){const c=structuredClone(n);c[name].result=status;assert.ok(failedChecks(c,false).includes(name))}
 const c=structuredClone(n);c.scope.outputs.frontend='true';assert.ok(failedChecks(c,false).includes('scope'));
 const d=structuredClone(n);d.scope.outputs.school_teacher_visual_plan='invalid';assert.ok(failedChecks(d,false).includes('scope'));
});

test('only real frontend execution qualifies and browser consumes the same official dist',()=>{
 const w=readFileSync('.github/workflows/ci-school-teacher-visual.yml','utf8');
 assert.equal((w.match(/npm run build/g)||[]).length,1);
 for(const command of ['tsc -p tsconfig.app.json --noEmit','vitest.mjs run','eslint/bin/eslint.js','ci-artifact.mjs" write frontend','ci-artifact.mjs" verify frontend','school-teacher-visual-browser.cjs'])assert.ok(w.includes(command),command);
 for(const forbidden of ['verifyReviewedEvidence','npm test','services:','prisma migrate','DATABASE_URL','secrets.'])assert.ok(!w.includes(forbidden),forbidden);
 const b=readFileSync('.github/scripts/school-teacher-visual-browser.cjs','utf8');
 assert.ok(b.includes('server-version/frontend/dist'));assert.ok(b.includes('body:fs.readFileSync(file)'));
 assert.ok(b.includes('report.unexpected,[]'));assert.ok(b.includes('report.pageErrors,[]'));assert.ok(!b.includes('vite dev'));
});
test('manual full and all probe entries reject this branch before any business job',()=>{
 const w=readFileSync('.github/workflows/ci.yml','utf8');
 const lines=w.split('\n').filter(l=>l.includes('contains(fromJSON(\'["work/measurement-version-final-20261020"'));
 assert.ok(lines.length>=10);for(const line of lines)assert.ok(line.includes(branch));
 assert.ok(w.includes('school_teacher_visual_plan: ${{ steps.scope.outputs.school_teacher_visual_plan }}'));
 assert.ok(w.includes('uses: ./.github/workflows/ci-school-teacher-visual.yml'));
 assert.ok(w.includes('needs: [scope, training-manual-ui, survey-manual-ui, school-teacher-visual,'));
});
test('synthetic API refuses unknown reads and every mutation, while preserving denied auth',async()=>{
 const {default:f}=await import('./school-teacher-visual-fixtures.cjs');
 assert.throws(()=>f.apiResponse('POST','/api/auth/login','',{}),/Unexpected mutation/);
 assert.throws(()=>f.apiResponse('GET','/api/unknown','',{}),/Unexpected API/);
 assert.equal(f.apiResponse('GET','/api/auth/me','',{}).status,401);
 assert.deepEqual(f.apiResponse('GET','/api/auth/me','',{adminSession:true,denied:true}).data.entryGrants,[]);
});
