/** Fixed first-run continuation. No latest-success lookup or application replay. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const original=JSON.parse(readFileSync(new URL('./pr363-continuation-pins.json',import.meta.url)));
const repo='caohuibj/eduK12-new-version',out='pr363-evidence';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex');
export const allowedDelta=['.github/scripts/pr363-continuation.mjs','.github/scripts/pr363-continuation-pins.json','.github/scripts/pr363-continuation.test.mjs','.github/scripts/pr363-bindings.json','.github/scripts/pr363-scope.mjs','.github/scripts/pr363-controls.test.mjs','.github/scripts/pr363-checks.mjs','.github/workflows/ci.yml','server-version/e2e/pr363-fixture.cjs'];
export function unchanged(read=git){
 assert.equal(read('rev-parse',original.head+'^{tree}'),original.tree);
 for(const [c,t]of Object.entries(original.components))assert.equal(read('rev-parse','HEAD:server-version/'+c),t,'Original application input changed');
 const changes=read('diff','--name-only',original.head,'HEAD').split('\n').filter(Boolean);assert(changes.every(p=>allowedDelta.includes(p)),'Unreviewed continuation delta');
 const old=JSON.parse(read('show',original.head+':.github/scripts/pr363-bindings.json')),now=JSON.parse(readFileSync('.github/scripts/pr363-bindings.json'));
 for(const p of ['backend','frontend','pg'])assert.deepEqual(now.execution[p],old.execution[p],'Qualified execution input changed');
 assert.deepEqual(now.historicalAdmissions,old.historicalAdmissions);assert.deepEqual(now.execution.feedbackModes,old.execution.feedbackModes);
 assert.deepEqual(now.execution.browser.steps,old.execution.browser.steps);assert.deepEqual(now.execution.browser.environment,old.execution.browser.environment);
 return {originalHead:original.head,components:original.components,changes};
}
async function get(url,options={}){for(let n=0;n<3;n++){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(![502,503,504].includes(r.status)||n===2)return r;await r.body?.cancel();await new Promise(r=>setTimeout(r,1000));}}
async function api(path){assert(process.env.GH_TOKEN);const r=await get('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'Official read '+path);return r.json();}
export function verifyJob(j,name){assert.equal(j.id,original.jobs[name]);assert.equal(j.name,name);assert.equal(j.run_id,original.run);assert.equal(j.head_sha,original.head);assert.equal(j.run_attempt,1);assert.equal(j.status,'completed');assert.equal(j.conclusion,'success');return j;}
export function verifyArtifact(m,key,now=Date.now()){
 const a=original.artifacts[key];assert(a);assert.equal(m.id,a.id);assert.equal(m.name,a.name);assert.equal(m.digest,'sha256:'+a.sha256);assert.equal(m.size_in_bytes,a.size);assert.equal(m.expired,false);assert.equal(m.workflow_run.id,original.run);assert.equal(m.workflow_run.head_sha,original.head);assert.equal(m.workflow_run.head_branch,'perf/four-entry-feedback-20261027');const age=now-Date.parse(m.created_at);assert(age>=0&&age<86400000,'Evidence outside24h');return a;
}
export async function authenticate(name,keys=[]){
 assert.equal(process.env.GITHUB_ACTIONS,'true');const inputs=unchanged();const r=await api('/actions/runs/'+original.run);assert.equal(r.head_sha,original.head);assert.equal(r.event,'pull_request');assert.equal(r.path,'.github/workflows/ci.yml');assert.equal(r.run_attempt,1);assert.equal(r.status,'completed');assert.equal(r.head_branch,'perf/four-entry-feedback-20261027');
 verifyJob(await api('/actions/jobs/'+original.jobs['classify changed content']),'classify changed content');
 const job=verifyJob(await api('/actions/jobs/'+original.jobs[name]),name),artifacts={};for(const key of keys)artifacts[key]=verifyArtifact(await api('/actions/artifacts/'+original.artifacts[key].id),key);
 return {originalRun:original.run,originalSource:original.head,originalCheckout:original.checkout,originalJob:job.id,originalJobConclusion:job.conclusion,originalRunConclusion:r.conclusion,currentConsumerHead:git('rev-parse','HEAD'),currentConsumerRun:process.env.GITHUB_RUN_ID,applicationExecuted:false,inputs,artifacts};
}
async function readReport(key){
 const a=original.artifacts[key];assert(a.size<8*1024*1024);const r=await get('https://api.github.com/repos/'+repo+'/actions/artifacts/'+a.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual'});assert.equal(r.status,302);const u=new URL(r.headers.get('location'));assert.equal(u.protocol,'https:');assert(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|s3\.amazonaws\.com)$/.test(u.hostname));const d=await get(u);assert.equal(d.status,200);const bytes=Buffer.from(await d.arrayBuffer());assert.equal(bytes.length,a.size);assert.equal(hash(bytes),a.sha256);
 const dir=resolve(process.env.RUNNER_TEMP,'pr363-original-'+key);mkdirSync(dir);const zip=dir+'.zip';writeFileSync(zip,bytes,{mode:0o600});const names=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n');assert.equal(new Set(names).size,names.length);assert(names.every(n=>/^[A-Za-z0-9_.\/-]+$/.test(n)&&!n.startsWith('/')&&!n.split('/').includes('..')));execFileSync('unzip',['-q',zip,'-d',dir]);return name=>JSON.parse(readFileSync(resolve(dir,name)));
}
function save(name,data){mkdirSync(out,{recursive:true});writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2)+'\n');}
export function artifactIdentity(){unchanged();return {sha:original.checkout,runId:String(original.run)};}
async function main(){const phase=process.argv[2];
 if(phase==='browser'){const proof=await authenticate('pr363-backend-build',['backend-images','backend-dist']);const front=await authenticate('pr363-frontend-build',['frontend-images','frontend-dist']);save('original-browser-inputs',{proof,front});return;}
 if(phase==='sast'){const proof=await authenticate('codeql (javascript/typescript SAST)');const j=await api('/actions/jobs/'+original.jobs['codeql (javascript/typescript SAST)']);for(const n of ['initialize CodeQL','analyze with CodeQL'])assert(j.steps.some(s=>s.name===n&&s.conclusion==='success'));save('original-sast',proof);return;}
 if(phase.startsWith('build-')){const c=phase.slice(6);assert(['backend','frontend'].includes(c));const proof=await authenticate('pr363-'+c+'-build',[c+'-images',c+'-dist',c+'-build-reports']);const read=await readReport(c+'-build-reports');const m=read(c+'-images.json');assert.equal(m.head,original.checkout);assert.equal(String(m.runId),String(original.run));assert.equal(String(m.producerAttempt),'1');save(c+'-producer-reused',{proof,originalReceipt:m});assert(process.env.GITHUB_OUTPUT);appendFileSync(process.env.GITHUB_OUTPUT,`images_id=${original.artifacts[c+'-images'].id}\ndist_id=${original.artifacts[c+'-dist'].id}\n`);return;}
 const map={backend:'backend-checks',frontend:'frontend-checks',pg:'pg',audit:'audit','scan-backend':'backend-scan','scan-frontend':'frontend-scan'},kind=map[phase];assert(kind);const key=kind+'-reports',proof=await authenticate('pr363-'+kind,[key]),read=await readReport(key);
 if(['backend','frontend','pg'].includes(phase)){const b=JSON.parse(readFileSync('.github/scripts/pr363-bindings.json'));assert.deepEqual(read(phase+'-outcomes.json').outcomes.slice().sort(),b.execution[phase].requiredOutcomes.slice().sort());}
 if(phase==='audit')assert.deepEqual(read('audit-outcomes.json').results,[{component:'backend',status:'passed'},{component:'frontend',status:'passed'}]);
 if(phase.startsWith('scan-')){const scan=read(phase.slice(5)+'-scan.json');assert(Array.isArray(scan.Results));assert(!scan.Results.some(r=>(r.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion)));}
 save(phase+'-official-reuse',{status:'ORIGINAL_SUCCESS_REUSED',proof});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
