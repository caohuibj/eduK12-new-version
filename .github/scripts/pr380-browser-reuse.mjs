// One exact failed PR380 invocation: restore its successful build, never its job as PASS.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
export const PIN=Object.freeze({repository:'caohuibj/eduK12-new-version',branch:'perf/four-entry-postlogin-20261028',runId:40670919279,attempt:1,sourceHead:'4df165136380da89c52ff8980e73dfa08549299d',mergeHead:'d408f935308ac2cff57d7a9f0e59e27d51b31a80',jobId:122757285402,jobName:'reviewed onboarding evidence admission',artifactId:12808261716,artifactName:'onboarding-admission-d408f935308ac2cff57d7a9f0e59e27d51b31a80',zipBytes:22345765,zipSHA256:'ba9f4974215108ffb9b2e43ebff915a97781d05667f54e52a7e25b2c41d35bf1',frontendTree:'2c12784be9807b9d653dcee5bc781be279aaac9c',backendTree:'b7fe981eea351ebb94232571479894e921e53bcd'});
const hashes={'admission.json':'7183c298b96b15c7e8fd44aefeb809a4a693a17993cc12bfe3b80433d73b5dd2','postlogin/browser.json':'d7f24fb788357afbff1485625d3d1b78e248f281da17d0275a2714652bb8bf3d','postlogin/build.log':'120879c0e26e5917ee468f943e92d6329abaf2277daae3ac741cf2c0db9bf0a3','postlogin/manifest.json':'55a4c8e64340f2193143b7153fa8c0660c2296438b88c5aea9ea1951f15c0e5d'};
export const ALLOWED=Object.freeze(['.github/scripts/pr380-browser.mjs','.github/scripts/pr380-browser-reuse.mjs','.github/scripts/pr380-browser-reuse.test.mjs','.github/scripts/onboarding-bindings.json','.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-controls.test.mjs','.github/workflows/ci.yml','docs/performance/postlogin-20261028/README.md']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyOfficial(run,job,artifact,now=Date.now()){
 assert.equal(run.id,PIN.runId);assert.equal(run.run_attempt,PIN.attempt);assert.equal(run.head_sha,PIN.sourceHead);assert.equal(run.head_branch,PIN.branch);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.repository?.full_name,PIN.repository);assert.equal(run.head_repository?.full_name,PIN.repository);assert(run.pull_requests?.some(p=>p.number===380));assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');
 assert.equal(job.id,PIN.jobId);assert.equal(job.run_id,PIN.runId);assert.equal(job.run_attempt,PIN.attempt);assert.equal(job.head_sha,PIN.sourceHead);assert.equal(job.name,PIN.jobName);assert.equal(job.status,'completed');assert.equal(job.conclusion,'failure','Original failed job must remain failed');
 const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000,'Original evidence exceeds 24 hours');
 for(const name of ['verify exact candidate and original local results without application replay','install only missing reviewed browser consumer dependencies'])assert.equal(job.steps.filter(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success').length,1,name);
 assert.deepEqual(job.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),['build once and verify bounded postlogin task and editor loading']);
 assert.equal(artifact.id,PIN.artifactId);assert.equal(artifact.name,PIN.artifactName);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,PIN.zipBytes);assert.equal(artifact.digest,'sha256:'+PIN.zipSHA256);assert.equal(artifact.workflow_run?.id,PIN.runId);assert.equal(artifact.workflow_run?.head_sha,PIN.sourceHead);assert.equal(artifact.workflow_run?.head_branch,PIN.branch);assert(Date.parse(artifact.expires_at)>now);const artifactAge=now-Date.parse(artifact.created_at);assert(Number.isFinite(artifactAge)&&artifactAge>=0&&artifactAge<=86400000);
 return {runId:PIN.runId,attempt:PIN.attempt,sourceHead:PIN.sourceHead,mergeHead:PIN.mergeHead,jobId:PIN.jobId,artifactId:PIN.artifactId,artifactName:PIN.artifactName,zipBytes:PIN.zipBytes,zipSHA256:PIN.zipSHA256,originalRunConclusion:'failure',originalJobConclusion:'failure',originalCompletedAt:job.completed_at};
}
export function verifyInputClosure(read,sourceHead){
 assert.match(sourceHead??'',/^[a-f0-9]{40}$/);read('merge-base','--is-ancestor',PIN.sourceHead,sourceHead);
 assert.equal(read('rev-parse',sourceHead+'^{tree}'),read('rev-parse','HEAD^{tree}'),'Current source/merge tree mismatch');
 for(const [component,tree] of [['frontend',PIN.frontendTree],['backend',PIN.backendTree]])for(const ref of [PIN.sourceHead,sourceHead,'HEAD'])assert.equal(read('rev-parse',ref+':server-version/'+component),tree,'Application tree changed');
 const changes=read('diff','--raw','--no-abbrev','--no-renames',PIN.sourceHead,'HEAD').split('\n').filter(Boolean);
 for(const line of changes){const match=/^:(100644|000000) (100644) [a-f0-9]{40} [a-f0-9]{40} ([AM])\t(.+)$/.exec(line);assert(match,'Unknown raw diff/mode: '+line);assert(ALLOWED.includes(match[4]),'Build input/unknown control changed: '+match[4]);assert.equal(match[1]==='000000',match[3]==='A');}
 assert.equal(read('diff','--name-only','HEAD','--'),'','Dirty tracked checkout');
 const locks={'server-version/frontend/package-lock.json':'ee290a304e22c10e760cc55eb55bb6815cb34fb57773c0af77985450306916fe','server-version/backend/package-lock.json':'01b51f001193cf54c5f09b9b78fa20a46efa65ad08175d1199e588e33f9a0450','.github/release-tools/package-lock.json':'cfc4c4410a57210cf1459d626f34c41960aa009cbac687bd7cdd5665f536175f'};
 // Raw diff closure also fixes package manifests, Vite config, runtime/sandbox tools and sibling inputs.
 for(const [path,digest] of Object.entries(locks))assert.equal(sha(read('show','HEAD:'+path)),digest,'Locked toolchain changed: '+path);
 return {frontendTree:PIN.frontendTree,backendTree:PIN.backendTree,lockSHA256:locks,changedControls:changes.map(row=>row.split('\t')[1])};
}
export const ZIP_RESTORE=String.raw`import hashlib,json,pathlib,stat,sys,zipfile
archive,dest,out=map(pathlib.Path,sys.argv[1:4]); expected=json.loads(sys.argv[4]); files={}; data={}; names=set(); total=0
assert not dest.exists(), 'Never replace an existing dist'
with zipfile.ZipFile(archive) as z:
 for i in z.infolist():
  p=pathlib.PurePosixPath(i.filename); mode=i.external_attr>>16
  assert i.filename and not p.is_absolute() and all(x not in ('..','.') for x in i.filename.split('/')) and '\\' not in i.filename and ':' not in i.filename
  assert str(p)==i.filename.rstrip('/') and i.filename not in names; names.add(i.filename)
  assert not stat.S_ISLNK(mode) and stat.S_IFMT(mode) in (0,stat.S_IFREG,stat.S_IFDIR) and not i.flag_bits&1
  total+=i.file_size; assert total<80*1024*1024 and i.file_size<20*1024*1024
  if i.is_dir(): continue
  assert i.filename in expected or i.filename.startswith('postlogin/dist/') or i.filename in ('postlogin/school-student-navigation.png','postlogin/teacher-list-without-answer-code.png')
  data[i.filename]=z.read(i)
for n,h in expected.items(): assert hashlib.sha256(data[n]).hexdigest()==h, n
report=json.loads(data['postlogin/browser.json']); admission=json.loads(data['admission.json'])
assert report['head']=='d408f935308ac2cff57d7a9f0e59e27d51b31a80' and report['status']=='FAIL'
assert report['build']['exitCode']==0 and report['build']['command']=='npm run build -- --manifest'
assert [(c['name'],c['status']) for c in report['cases']]==[('school-student-navigation','PASS'),('teacher-list-without-answer-code','PASS'),('teacher-selected-practice-form','FAIL')]
assert 'strict mode violation' in report['cases'][2]['error'] and '课堂实践1' in report['cases'][2]['error']
assert admission['runId']=='40670919279' and admission['attempt']=='1' and admission['source']['sourceHead']=='4df165136380da89c52ff8980e73dfa08549299d' and admission['source']['pr']==380
assert admission['source']['head']==report['head'] and admission['source']['components']=={'frontend':'2c12784be9807b9d653dcee5bc781be279aaac9c','backend':'b7fe981eea351ebb94232571479894e921e53bcd'}
assert report['sandbox']['ok'] is True
manifest=json.loads(data['postlogin/manifest.json']); assert 'index.html' in manifest
assert 'postlogin/dist/index.html' in data and any(n.startswith('postlogin/dist/assets/') and n.endswith('.js') for n in data)
for v in manifest.values():
 for n in [v['file']]+v.get('css',[])+v.get('assets',[]): assert 'postlogin/dist/'+n in data, n
for n,b in data.items():
 if not n.startswith('postlogin/dist/'): continue
 relative=n[len('postlogin/dist/'):]; assert relative and not relative.startswith('.vite/')
 files[relative]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
# All validation precedes extraction. No archive path is used outside this fresh dist.
dest.mkdir(parents=True)
for n in files:
 target=dest/n; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data['postlogin/dist/'+n])
# upload-artifact omitted hidden files; retain the separately archived manifest as metadata.
(dest/'.vite').mkdir(); (dest/'.vite/manifest.json').write_bytes(data['postlogin/manifest.json'])
out.mkdir(parents=True,exist_ok=True)
for original,target in [('postlogin/browser.json','original-browser.json'),('postlogin/build.log','build.log')]: (out/target).write_bytes(data[original])
print(json.dumps({'files':files,'archivedManifestSHA256':hashlib.sha256(data['postlogin/manifest.json']).hexdigest()}))`;
export function restoreArchive(zipPath,{cwd=process.cwd(),out=resolve(cwd,'onboarding-evidence/postlogin')}={}){
 const bytes=readFileSync(zipPath);assert.equal(bytes.length,PIN.zipBytes);assert.equal(sha(bytes),PIN.zipSHA256,'Official ZIP digest mismatch');
 const restored=JSON.parse(execFileSync('python3',['-c',ZIP_RESTORE,resolve(zipPath),resolve(cwd,'server-version/frontend/dist'),resolve(out),JSON.stringify(hashes)],{encoding:'utf8',maxBuffer:4*1024*1024}));
 return {report:JSON.parse(readFileSync(resolve(out,'original-browser.json'))),...restored};
}
export async function restoreBrowserBuild({cwd=process.cwd(),out=resolve(cwd,'onboarding-evidence/postlogin'),zipPath,token=process.env.GH_TOKEN,fetcher=fetch,now=Date.now()}={}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,PIN.repository);assert(token,'Existing GH_TOKEN required');
 const read=(...args)=>{const value=execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});return args[0]==='show'?value:value.replace(/\n$/,'');};
 const closure=verifyInputClosure(read,process.env.CI_SOURCE_HEAD),currentHead=read('rev-parse','HEAD');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const api=async path=>{const r=await fetcher('https://api.github.com/repos/'+PIN.repository+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'Official API failed: '+r.status);return r.json();};
 const [run,job,artifact]=await Promise.all([api('/actions/runs/'+PIN.runId+'/attempts/'+PIN.attempt),api('/actions/jobs/'+PIN.jobId),api('/actions/artifacts/'+PIN.artifactId)]),official=verifyOfficial(run,job,artifact,now);
 let temporary;try{
  if(!zipPath){temporary=mkdtempSync(join(process.env.RUNNER_TEMP||tmpdir(),'pr380-build-reuse-'));zipPath=join(temporary,'official.zip');
   const r=await fetcher('https://api.github.com/repos/'+PIN.repository+'/actions/artifacts/'+PIN.artifactId+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(!url.username&&!url.password);assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'),'Non-official artifact redirect');
   const download=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(download.status,200);writeFileSync(zipPath,Buffer.from(await download.arrayBuffer()),{mode:0o600});
  }
  const restored=restoreArchive(zipPath,{cwd,out});const origin={kind:'pr380-exact-official-build-continuation',...official,...closure,currentHead,currentSourceHead:process.env.CI_SOURCE_HEAD,currentRunId:process.env.GITHUB_RUN_ID,currentAttempt:process.env.GITHUB_RUN_ATTEMPT,currentBuildExecuted:false,originalBuild:restored.report.build,originalBrowserStatus:'FAIL',originalBrowserSHA256:hashes['postlogin/browser.json'],originalBuildLogSHA256:hashes['postlogin/build.log'],archivedDistFiles:restored.files,archivedManifestSHA256:restored.archivedManifestSHA256,hiddenManifest:'Restored from separately archived postlogin/manifest.json; original hidden dist manifest was not uploaded',browserContinuationRequired:true,mergeQualification:false};
  mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'reused-build-origin.json'),JSON.stringify(origin,null,2)+'\n');return {report:restored.report,origin};
 }finally{if(temporary)rmSync(temporary,{recursive:true,force:true});}
}
