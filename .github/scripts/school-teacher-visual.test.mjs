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
 for(const command of ['school-teacher-visual-reuse.mjs','school-teacher-visual-browser.cjs','google-chrome --version','if: always()'])assert.ok(w.includes(command),command);
 for(const forbidden of ['verifyReviewedEvidence','npm test','services:','prisma migrate','DATABASE_URL','secrets.','--no-sandbox','sysctl'])assert.ok(!w.includes(forbidden),forbidden);
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


test('official failed run only contributes exact successful frontend stages and original SAST',async()=>{
 const {original:o,verifyOfficial}=await import('./school-teacher-visual-reuse.mjs');
 const run={id:o.run,run_attempt:1,head_sha:o.head,head_branch:branch,event:'pull_request',path:'.github/workflows/ci.yml',repository:{full_name:'caohuibj/eduK12-new-version'},head_repository:{full_name:'caohuibj/eduK12-new-version'},status:'completed',conclusion:'failure'};
 const steps=[[4,'verify selected source and scope controls'],[5,'install locked frontend and compile-only backend type dependencies'],[6,'changed product lint and complete frontend types'],[7,'targeted entry authorization navigation and draft consumers'],[8,'build production frontend once and bind official artifact'],[10,'real production App and complete CSS synthetic browser matrix','failure'],[11,'Run actions/upload-artifact@v4']].map(([number,name,conclusion='success'])=>({number,name,conclusion,status:'completed'}));
 const job={id:o.job,run_id:o.run,run_attempt:1,head_sha:o.head,name:'school-teacher-visual / frontend',status:'completed',conclusion:'failure',steps};
 const sast={...job,id:o.sast,name:'codeql (javascript/typescript SAST)',conclusion:'success',steps:[[16,'initialize CodeQL'],[17,'analyze with CodeQL']].map(([number,name])=>({number,name,status:'completed',conclusion:'success'}))};
 const artifact={id:o.artifact,name:'school-teacher-visual-'+o.merge,expired:false,size_in_bytes:o.size,digest:'sha256:'+o.digest,created_at:'2026-10-23T15:32:01Z',expires_at:'2026-10-26T15:31:59Z',workflow_run:{id:o.run,head_sha:o.head,head_branch:branch,repository_id:1338215995,head_repository_id:1338215995}};
 const now=Date.parse('2026-10-23T16:00:00Z');verifyOfficial(run,job,sast,artifact,now);
 for(const field of ['id','run_attempt','head_sha','head_branch','event','path','conclusion'])assert.throws(()=>verifyOfficial({...run,[field]:'invalid'},job,sast,artifact,now));
 for(const result of ['skipped','cancelled','failure',undefined])for(const n of [4,5,6,7,8,11]){const j=structuredClone(job);j.steps.find(s=>s.number===n).conclusion=result;assert.throws(()=>verifyOfficial(run,j,sast,artifact,now))}
 assert.throws(()=>verifyOfficial(run,{...job,steps:steps.filter(s=>s.number!==8)},sast,artifact,now));
 assert.throws(()=>verifyOfficial(run,job,{...sast,conclusion:'failure'},artifact,now));
 for(const patch of [{id:1},{expired:true},{digest:'sha256:wrong'},{size_in_bytes:1},{workflow_run:{...artifact.workflow_run,head_sha:'wrong'}}])assert.throws(()=>verifyOfficial(run,job,sast,{...artifact,...patch},now));
 assert.throws(()=>verifyOfficial(run,job,sast,artifact,Date.parse('2026-10-27T00:00:00Z')));
});
test('reuse protects exact original merge, all other files, and old artifact identity',async()=>{
 const {original:o,cssPolish,verifyClosure,verifyMerge,verifyReceipt,manifest}=await import('./school-teacher-visual-reuse.mjs');
 const read=(cmd,ref,...rest)=>cmd==='diff'?(rest.includes('--')?cssPolish:'.github/scripts/school-teacher-visual-browser.cjs'):ref.endsWith('^{tree}')?o.tree:ref.endsWith(':server-version/frontend')?binding.components.frontend:ref.endsWith(':server-version/backend')?binding.components.backend:ref.endsWith('ci-school-teacher-visual.yml')?'96243bb4328b896b1ee74c2b1ecc5e54debe9ba6':'d0b2cab09f6e829b89d9fa2c0e9bfbb68d89a5b2';
 verifyClosure(read);assert.throws(()=>verifyClosure((cmd,...a)=>cmd==='diff'?'server-version/frontend/src/App.tsx':read(cmd,...a)));assert.throws(()=>verifyClosure(()=> 'wrong'));
 const merge={sha:o.merge,tree:{sha:o.tree},parents:[{sha:binding.base},{sha:o.head}]};verifyMerge(merge);assert.throws(()=>verifyMerge({...merge,parents:[]}));
 const receipt={kind:'official-frontend-stages-reuse',currentHead:'new',currentRun:'1',sourceHead:o.head,sourceRun:String(o.run),semanticChecksReexecuted:false,originalRunConclusion:'failure',originalBrowserConclusion:'failure',originalCodeQLConclusion:'success',browserReused:false,buildReused:false,originalArtifact:manifest};verifyReceipt(receipt,'new',1);
 for(const patch of [{currentHead:'old'},{browserReused:true},{originalArtifact:{...manifest,sha:'new'}},{originalRunConclusion:'success'}])assert.throws(()=>verifyReceipt({...receipt,...patch},'new',1));
});

test('CSS polish is tightly scoped and current browser uses only the new dist',()=>{
 const css=readFileSync('server-version/frontend/src/pages/admin/education-admin-shell.css','utf8');
 for(const product of ['huischool','huiteacher'])assert.ok(css.includes(`a[href="/admin/login?returnTo=%2Fadmin%2F${product}"]+.education-admin-entry-back[href="/admin/login?returnTo=%2Fadmin%2F${product}"]`));
 assert.ok(css.includes('.education-admin-entry-card .hui-product .hui-status--info'));
 const b=readFileSync('.github/scripts/school-teacher-visual-browser.cjs','utf8');
 assert.ok(b.includes('sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID'));
 assert.ok(b.indexOf("await proof(product+'-admin-login'")<b.indexOf("name:'管理员登录',exact:true}).click()"));
 assert.ok(b.includes('admin-login-invalid-viewport'));assert.ok(b.includes('Exactly one visible return-to-login link'));
});
