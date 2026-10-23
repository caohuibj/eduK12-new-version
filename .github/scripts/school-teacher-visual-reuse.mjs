// Only the first School/Teacher run's successful frontend stages. Browser must run anew.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {treeDigest,verifyManifest} from './ci-artifact.mjs';
import {binding,branch} from './school-teacher-visual-scope.mjs';
export const original={run:39978740371,head:'fa4f965db26bb9dae58a3b41bccd3456f35fd8fb',merge:'f7c76831c15ff48efa787ac1a32e288f4f54e469',tree:'ef0642ed4c04767f20af1dc7d5852af7f27b2598',job:120500244074,sast:120500240873,artifact:12512682055,size:21728753,digest:'86162deabc760c7d114cc407b87ea33b13170dfda2f27592d2ba4df4541354f7'};
const repo='caohuibj/eduK12-new-version';
export const manifest={schemaVersion:1,sha:original.merge,runId:String(original.run),kind:'frontend',lockDigest:'ee290a304e22c10e760cc55eb55bb6815cb34fb57773c0af77985450306916fe',contentDigest:'a51355bcda909b8acf8a86b89e48988e1b0274f9cdf4414b3dd58de9436d8ee3'};
export const allowed=['.github/scripts/school-teacher-visual-reuse.mjs','.github/scripts/school-teacher-visual-browser.cjs','.github/scripts/school-teacher-visual-bindings.json','.github/scripts/school-teacher-visual.test.mjs','.github/workflows/ci-school-teacher-visual.yml','.github/workflows/ci.yml'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function verifyClosure(read=git){
 assert.equal(read('rev-parse',original.head+'^{tree}'),original.tree);
 assert.equal(read('rev-parse',original.head+':.github/workflows/ci-school-teacher-visual.yml'),'96243bb4328b896b1ee74c2b1ecc5e54debe9ba6');
 assert.equal(read('rev-parse',original.head+':.github/workflows/ci.yml'),'d0b2cab09f6e829b89d9fa2c0e9bfbb68d89a5b2');
 const paths=read('diff','--name-only','--no-renames',original.head,'HEAD').split('\n').filter(Boolean);assert(paths.length>0);for(const p of paths)assert(allowed.includes(p),'Unexpected reuse input change: '+p);
 for(const[c,t]of Object.entries(binding.components))assert.equal(read('rev-parse','HEAD:server-version/'+c),t);
 // Complete diff whitelist protects all other build inputs, tools, environment and locks.
 return paths;
}
function step(job,number,name,conclusion='success'){const s=job.steps.find(s=>s.number===number);assert(s);assert.equal(s.name,name);assert.equal(s.status,'completed');assert.equal(s.conclusion,conclusion);}
export function verifyOfficial(run,job,sast,artifact,now=Date.now()){
 assert.equal(run.id,original.run);assert.equal(run.run_attempt,1);assert.equal(run.head_sha,original.head);assert.equal(run.head_branch,branch);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.repository.full_name,repo);assert.equal(run.head_repository.full_name,repo);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');
 for(const[j,id,name,result]of [[job,original.job,'school-teacher-visual / frontend','failure'],[sast,original.sast,'codeql (javascript/typescript SAST)','success']]){assert.equal(j.id,id);assert.equal(j.run_id,original.run);assert.equal(j.run_attempt,1);assert.equal(j.head_sha,original.head);assert.equal(j.name,name);assert.equal(j.status,'completed');assert.equal(j.conclusion,result);}
 step(job,4,'verify selected source and scope controls');step(job,5,'install locked frontend and compile-only backend type dependencies');step(job,6,'changed product lint and complete frontend types');step(job,7,'targeted entry authorization navigation and draft consumers');step(job,8,'build production frontend once and bind official artifact');step(job,10,'real production App and complete CSS synthetic browser matrix','failure');step(job,11,'Run actions/upload-artifact@v4');
 step(sast,16,'initialize CodeQL');step(sast,17,'analyze with CodeQL');
 assert.equal(artifact.id,original.artifact);assert.equal(artifact.name,'school-teacher-visual-'+original.merge);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,original.size);assert.equal(artifact.digest,'sha256:'+original.digest);assert.equal(artifact.workflow_run.id,original.run);assert.equal(artifact.workflow_run.head_sha,original.head);assert.equal(artifact.workflow_run.head_branch,branch);assert.equal(artifact.workflow_run.repository_id,1338215995);assert.equal(artifact.workflow_run.head_repository_id,1338215995);assert.ok(Date.parse(artifact.created_at)<=now&&now<Date.parse(artifact.expires_at));
}
export const zipCheck=`import pathlib,stat,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); seen=set(); total=0; prefix='server-version/frontend/dist/'
for i in z.infolist():
 p=pathlib.PurePosixPath(i.filename); assert i.filename and not p.is_absolute() and '..' not in p.parts and '\\\\' not in i.filename
 assert i.filename not in seen; seen.add(i.filename); mode=i.external_attr>>16
 assert not stat.S_ISLNK(mode) and stat.S_IFMT(mode) in [0,stat.S_IFREG,stat.S_IFDIR] and not i.flag_bits&1
 total+=i.file_size; assert total<300*1024*1024
assert prefix+'ci-build-manifest.json' in seen
for i in z.infolist():
 if i.filename.startswith(prefix) and not i.is_dir():
  target=pathlib.Path(sys.argv[2])/i.filename[len(prefix):]; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(z.read(i))
`;
export function verifyMerge(m){assert.equal(m.sha,original.merge);assert.equal(m.tree.sha,original.tree);assert.deepEqual(m.parents.map(p=>p.sha).sort(),[binding.base,original.head].sort());}
export function verifyReceipt(r,head,run){assert.equal(r.kind,'official-frontend-stages-reuse');assert.equal(r.currentHead,head);assert.equal(r.currentRun,String(run));assert.equal(r.sourceHead,original.head);assert.equal(r.sourceRun,String(original.run));assert.equal(r.frontendReexecuted,false);assert.equal(r.originalRunConclusion,'failure');assert.equal(r.originalBrowserConclusion,'failure');assert.equal(r.originalCodeQLConclusion,'success');assert.equal(r.browserReused,false);assert.deepEqual(r.artifact,manifest);}
async function restore(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.ok(process.env.GH_TOKEN);const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);
 const changes=verifyClosure(),headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'};
 const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json()};
 const [run,job,sast,artifact]=await Promise.all([api('/actions/runs/'+original.run),api('/actions/jobs/'+original.job),api('/actions/jobs/'+original.sast),api('/actions/artifacts/'+original.artifact)]);verifyOfficial(run,job,sast,artifact);verifyMerge(await api('/git/commits/'+original.merge));
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+original.artifact+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(!url.username&&!url.password);assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
 const download=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,original.size);assert.equal(sha(bytes),original.digest);
 const temporary=resolve(process.env.RUNNER_TEMP,'school-teacher-visual-original.zip');assert(!existsSync(temporary));writeFileSync(temporary,bytes,{mode:0o600});
 const destination=resolve('server-version/frontend/dist');assert(!existsSync(destination));
 try{execFileSync('python3',['-c',zipCheck,temporary,destination],{stdio:'pipe'})}finally{rmSync(temporary,{force:true})}
 verifyManifest(JSON.parse(readFileSync(join(destination,'ci-build-manifest.json'))),manifest,treeDigest(destination));assert.equal(sha(readFileSync('server-version/frontend/package-lock.json')),manifest.lockDigest);
 const receipt={kind:'official-frontend-stages-reuse',currentHead:head,currentRun:process.env.GITHUB_RUN_ID,sourceHead:original.head,sourceRun:String(original.run),originalRunConclusion:'failure',originalBrowserConclusion:'failure',originalCodeQLConclusion:'success',browserReused:false,frontendReexecuted:false,artifact:manifest,changes};
 mkdirSync('school-teacher-visual-evidence',{recursive:true});writeFileSync('school-teacher-visual-evidence/official-reuse.json',JSON.stringify(receipt,null,2)+'\n');console.log('Verified official frontend stages and original dist; browser still required');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await restore();
