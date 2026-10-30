// Exact PR392 continuation of successful subchecks from one cancelled parent run.
// Original producer/scanner identities remain original; only the missing browser executes.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,join}from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
export const origin={run:40977943858,head:'b45e3fe94282eb567215520f1bd57a1d48ffdfc2',checkout:'807e12c7edf061efc2ec1bd893690c7a0ca01ac3',jobs:{frontend:123810838684,backend:123810838662,audit:123810838656,'native-evidence':123810838581,'native-runtime':123811615732}};
const artifacts={
 frontend:[12943665976,'b9648e9c22bc8bfedfc4adc4162257e427f3dba218f9fd5d232676711cacfb54','frontend-checks'],
 backend:[12943890708,'9de4f403afd9065171f3ea07c76c79cd9159fe71bbfaf405baa9394846196c5f','backend-checks'],
 audit:[12943636530,'f216dbc1f987f2dbce7ce32ad81065e91e908dfb10314172363da64a2b3fa0b5','audit'],
 'native-evidence':[12942604048,'346dbe5d432ce66e3ad661d1858c949e7d8ac6daecbdaed2ad53239d4b0ca4f6','native-evidence'],
 runtime:[12944095807,'15dabfe504b04b19deaafd66dea8658eaeed6e2959cbde9827050dd429c1d931','native-runtime'],
 frontendContext:[12943576310,'51e922509563aadabd08e33a6e3134a30c51950a1adaa1cb6efe9678f1c1e3de','native-frontend-context'],
 backendContext:[12943905676,'ff69fb346efbf8a1cb3a867e18cb02069fd0f81222c8c67be33d2553812eaf9f','native-backend-context']};
const hash=x=>createHash('sha256').update(x).digest('hex');
export function verifyOriginJob(run,job,phase){
 assert.equal(run.id,origin.run);assert.equal(run.head_sha,origin.head);assert.equal(run.head_branch,'feat/education-package-runtime-20261029');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'cancelled');
 assert.equal(job.id,origin.jobs[phase]);assert.equal(job.run_id,origin.run);assert.equal(job.head_sha,origin.head);assert.equal(job.status,'completed');assert.equal(job.conclusion,phase==='native-runtime'?'failure':'success');assert.equal(job.name,'school-teacher / '+(phase==='backend'?'backend-self':phase==='audit'?'security':phase));
}
export function verifyOriginalScans(read,b){
 const r=read('native-runtime.json'),commands=read('native-runtime-commands.json');assert.equal(r.status,'SCANNED_BROWSER_PENDING');assert.equal(r.head,origin.checkout);assert.equal(r.runId,String(origin.run));
 assert.deepEqual(commands.map(c=>c.name),['trivy-version','node-pull','node-digest','nginx-pull','nginx-digest','frontend-manifest','frontend-image','frontend-image-id','frontend-scan','backend-manifest','backend-image','backend-image-id','backend-native','backend-scan','package-browser']);assert(commands.slice(0,-1).every(c=>c.exitCode===0));assert.equal(commands.at(-1).exitCode,1);
 assert.deepEqual(r.results.map(x=>x.component),['frontend','backend']);for(const item of r.results){const c=item.context;assert.equal(c.head,origin.checkout);assert.equal(c.runId,String(origin.run));assert.equal(c.attempt,'1');assert.equal(c.tree,b[item.component+'Tree']);const scan=read('native-'+item.component+'-trivy.json');assert.equal(scan.Metadata.ImageID,item.imageId);assert(scan.Results.length);assert(!scan.Results.flatMap(v=>v.Vulnerabilities||[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion));}
 return r;
}
export function verifyApplicationSast(r,j,git){
  assert.equal(r.id,40980640181);assert.equal(r.head_sha,'f3ac63d2c56ea21c1dbea9833c73aa9c3846fd2b');assert.equal(r.event,'pull_request');assert.equal(r.path,'.github/workflows/ci.yml');assert.equal(r.status,'completed');assert.equal(r.conclusion,'failure');
  assert.equal(j.id,123819670249);assert.equal(j.run_id,r.id);assert.equal(j.head_sha,r.head_sha);assert.equal(j.name,'codeql (javascript/typescript SAST)');assert.equal(j.status,'completed');assert.equal(j.conclusion,'success');for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(j.steps.some(s=>s.name===name&&s.conclusion==='success'));
  for(const component of ['frontend','backend'])assert.equal(git('rev-parse','HEAD:server-version/'+component),git('rev-parse',r.head_sha+':server-version/'+component));
  assert.equal(git('diff','--name-only',r.head_sha,'HEAD','--','*.py'),'','Unchanged Python belongs to the original successful scan');
  return {originalRun:r.id,originalJob:j.id,originalHead:r.head_sha,originalParentConclusion:r.conclusion,originalJobConclusion:j.conclusion,currentChangedControlScanRequired:true,applicationScannedAgain:false};
}
export async function resumePackagePhase(phase,b,plan,d){
 assert.equal(plan.publicPackage,true);assert.equal(plan.continuation,'package-browser-only');assert.equal(b.execution.officialContinuation,origin.run);assert.equal(b.branch,'feat/education-package-runtime-20261029');
 for(const component of ['frontend','backend'])assert.equal(d.git('rev-parse','HEAD:server-version/'+component),d.git('rev-parse',origin.head+':server-version/'+component));
 for(const p of ['server-version/shared','server-version/scripts/ci-install-canvas-deps.sh','.github/release-tools'])assert.equal(d.git('ls-tree','-r','HEAD','--',p),d.git('ls-tree','-r',origin.head,'--',p));
 const old=JSON.parse(d.git('show',origin.head+':.github/scripts/school-teacher-package-bindings.json'));assert.deepEqual(b.evidence,old.evidence);assert.deepEqual(b.execution.runtime,old.execution.runtime);
 const run=await d.officialApi('/actions/runs/'+origin.run),job=await d.officialApi('/actions/jobs/'+origin.jobs[phase]);verifyOriginJob(run,job,phase);
 const zip=async key=>{const[id,digest,suffix]=artifacts[key];return d.officialZip(id,digest,'school-teacher-'+suffix+'-'+origin.checkout,origin.run,origin.head)};
 let applicationSast;
 if(phase==='audit'&&b.execution.sastContinuation===40980640181)applicationSast=verifyApplicationSast(await d.officialApi('/actions/runs/40980640181'),await d.officialApi('/actions/jobs/123819670249'),d.git);
 const proof={status:'VERIFIED_OFFICIAL_SUBCHECKS',currentHead:plan.head,currentRun:process.env.GITHUB_RUN_ID,originalRun:origin.run,originalHead:origin.head,originalCheckout:origin.checkout,originalJob:job.id,originalJobConclusion:job.conclusion,originalParentConclusion:run.conclusion,applicationExecuted:false,buildExecuted:false,auditExecuted:false,...(applicationSast?{applicationSast}: {})};
 if(phase!=='native-runtime'){
  const read=d.jsonZip(await zip(phase)),file=phase==='audit'?'audit.json':phase==='native-evidence'?'native-reviewed-local-evidence.json':phase+'-fresh-build.json';proof.original=read(file);d.receipt(phase+'-official-continuation',proof);return;
 }
 const runtimeZip=await zip('runtime'),read=d.jsonZip(runtimeZip),runtime=verifyOriginalScans(read,b);
 for(const item of runtime.results){const raw=spawnSync('unzip',['-p',runtimeZip,'native-'+item.component+'-trivy.json']);assert.equal(raw.status,0);assert.equal(hash(raw.stdout),item.reportSha256);}const out=resolve('school-teacher-evidence');mkdirSync(out,{recursive:true});
 for(const item of runtime.results){
  const key=item.component,file=await zip(key+'Context'),directory=resolve('native-runtime-inputs',key),names=spawnSync('unzip',['-Z1',file],{encoding:'utf8'});assert.equal(names.status,0);assert.deepEqual(names.stdout.trim().split('\n').sort(),[key+'-runtime-context.json',key+'-runtime.tar.gz'].sort());mkdirSync(directory,{recursive:true});
  for(const name of names.stdout.trim().split('\n')){const raw=spawnSync('unzip',['-p',file,name],{maxBuffer:256*1024*1024});assert.equal(raw.status,0);writeFileSync(join(directory,name),raw.stdout);}
  assert.deepEqual(JSON.parse(readFileSync(join(directory,key+'-runtime-context.json'))),item.context);assert.equal(hash(readFileSync(join(directory,key+'-runtime.tar.gz'))),item.context.archiveSha256);
 }
 writeFileSync(join(out,'original-native-runtime.json'),JSON.stringify(runtime,null,2));d.receipt('runtime-official-continuation',proof);
 d.command('native-runtime','python3',['.github/scripts/school-teacher-native-runtime.py']);
}
