import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {sjtNativePlan,sjtNativeOutputs,binding,branch,marker,publicationBoundary} from './sjt-native-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
function fixture(){
 const head='a'.repeat(40),source='b'.repeat(40),values={};
 const entries=Object.entries(binding.source).map(([file,s])=>({file,...s}));
 for(const file of binding.controls){const before=binding.controlBefore[file];entries.push({file,status:before?'M':'A',oldMode:before?'100644':'000000',newMode:'100644'});if(before)values[binding.base+':'+file]=before;}
 for(const[file,s]of Object.entries(binding.source)){if(s.before)values[binding.base+':'+file]=s.before;values[head+':'+file]=s.after;}
 for(const[c,t]of Object.entries(binding.components))values[head+':server-version/'+c]=t;
 for(const[f,b]of Object.entries(binding.publicationInputs))values[head+':'+f]=b;
 values[source+'^{tree}']=values[head+'^{tree}']='tree';
 const read=(cmd,arg)=>{if(cmd==='show')return readFileSync(arg.slice(arg.indexOf(':')+1),'utf8');assert.equal(cmd,'rev-parse');assert(arg in values,'Unexpected Git input '+arg);return values[arg];};
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_NUMBER:'999'};
 return {head,source,entries,values,read,env,plan(){return sjtNativePlan(this.entries,binding.base,this.head,this.read,this.env)}};
}
test('exact Training entry candidate disables unrelated consumers and retains fresh SAST',()=>{const p=fixture().plan(),o=sjtNativeOutputs(p);assert.equal(p.route,'sjt-native');for(const k of ['frontend','frontend_build','maintenance','run_performance_tests','ops','media2','cognitive'])assert.equal(o[k],false);assert.equal(o.codeql,true)});
test('other branches retain existing routes',()=>{const f=fixture();assert.equal(sjtNativePlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
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
test('base drift is rejected',()=>{const f=fixture();assert.throws(()=>sjtNativePlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('only an exact main merge classifies without repeated checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(sjtNativeOutputs(p).codeql,false);f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('stable gate requires actual scope qualification and CodeQL, refuses draft or skipped results',()=>{const p=fixture().plan(),outputs=Object.fromEntries(Object.entries(sjtNativeOutputs(p)).map(([k,v])=>[k,String(v)]));const n={scope:{result:'success',outputs},'sjt-native':{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','sjt-native','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert(failedChecks(n,true).length);for(const result of [undefined,'failure','skipped','cancelled'])for(const job of ['scope','sjt-native','codeql']){const a=structuredClone(n);a[job].result=result;assert(failedChecks(a,false).includes(job))}const a=structuredClone(n);a.scope.outputs.frontend='true';assert(failedChecks(a,false).includes('scope'));});
test('publication boundary checks every declared input and fixed imported class',()=>{
 const f=fixture(),d=binding.publicationDelta;
 for(const[p,b]of Object.entries(binding.publicationInputs))f.values[binding.base+':'+p]=b;
 f.values[binding.base+':'+d.file]=d.before;
 const read=(cmd,arg)=>cmd==='show'?'export class SjtTemplateError extends Error {\n}':f.read(cmd,arg);
 assert.equal(publicationBoundary(binding.base,f.head,read).unchangedScientificCatalog,true);
 f.values[binding.base+':server-version/backend/package-lock.json']='bad';
 assert.throws(()=>publicationBoundary(binding.base,f.head,read));
});
test('SJT executor does not add a reusable workflow or select full-platform tests',()=>{
 const text=readFileSync('.github/workflows/ci.yml','utf8');
 const job=text.split('  sjt-native:\n')[1].split('\n  training-entry:')[0];
 for(const required of ['postgres:17','sjt-native-migration.mjs','sjt-native-browser.mjs','if: always()','node node_modules/typescript/bin/tsc -p tsconfig.json','npm run build'])assert(job.includes(required),required);
 for(const forbidden of ['uses: ./.github/workflows/','npm test','--all','--passWithNoTests','continue-on-error'])assert(!job.includes(forbidden),forbidden);
 assert(text.includes('needs: [scope, sjt-native,'));
});
test('service container identity is evaluated only at supported step environment',()=>{
 const text=readFileSync('.github/workflows/ci.yml','utf8');
 const job=text.split('  sjt-native:\n')[1].split('\n  training-entry:')[0];
 const jobEnvironment=job.split('    env:\n')[1].split('    steps:\n')[0];
 assert(!jobEnvironment.includes('job.services'),'Job context is unavailable at job-level env');
 assert(job.includes('      - name: upgrade nonempty exact main and verify isolated database restore\n        env:\n          PG_CONTAINER: ${{ job.services.postgres.id }}\n        run: node .github/scripts/sjt-native-migration.mjs'));
});
test('shallow scope explicitly fetches the exact SJT PR source before comparing trees',()=>{
 const text=readFileSync('.github/workflows/ci.yml','utf8');
 const step=text.split('      - name: fetch exact two-candidate PR source for checkout-tree comparison\n')[1].split('      - name:')[0];
 assert(step.includes('"backup/shared-sjt-native-20261024"'));
 assert(step.includes('EXACT_SOURCE_HEAD: ${{ github.event.pull_request.head.sha }}'));
 assert(step.includes("['fetch','--no-tags','--depth=1','origin',source]"));
});
