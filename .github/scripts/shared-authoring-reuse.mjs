import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {binding,branch} from './shared-authoring-scope.mjs';
export const original={run:39903131297,head:'62949663112b0e19518b019f29fa691fdcd61d4d',backend:120249077938,sast:120249022752};
export const artifactPin={id:12479427511,name:'shared-authoring-backend-51ff982a2c75d63266294064c7ea0f9071bc9c88',size:7669633,sha256:'d97c94e132cba937d73a9860a6cf8246fd733ee9ad494fd0e5f2aad933193fe8'};
export const repaired={run:39905348476,head:'dc0b17d786e554a222a46e3a3615f15b25ba619b',frontend:120256060844,sast:120255988282};
export const frontendPin={id:12481080458,name:'shared-authoring-frontend-50e7b0f76af16869a9f98b540e78da5913a4d1a6',size:20916288,sha256:'8d104080ce0e553a5d399f7b2c21b1b3d5b5caed375313d452bbd67a583b517f'};
const repo='caohuibj/eduK12-new-version';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function verifyOfficial(run,job,mode,now=Date.now(),source=original){
 assert.ok(['backend','sast','frontend'].includes(mode));assert.equal(run.id,source.run);assert.equal(run.head_sha,source.head);
 assert.equal(run.repository.full_name,repo);assert.equal(run.head_repository.full_name,repo);
 assert.equal(run.head_branch,branch);assert.equal(run.event,'pull_request');assert.equal(run.status,'completed');
 // A successful component of a failed parent remains a component success only.
 assert.equal(run.conclusion,'failure');assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);
 assert.equal(job.id,source[mode]);assert.equal(job.name,mode==='backend'?'shared-authoring / backend':mode==='frontend'?'shared-authoring / frontend':'codeql (javascript/typescript SAST)');
 assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert.ok(Number.isFinite(age)&&age>=0&&age<=24*60*60*1000,'Original job exceeds 24 hours');
 const stages=mode==='backend'?['install official locked backend dependencies and exact Prisma client','missing backend dependency security audit','compile current backend once without repeating accepted semantic types','prepare only the disposable service database','actual compiled publication, frozen participant and released-report material chain']:mode==='frontend'?['install official locked frontend dependencies','missing frontend dependency security audit','verify the new dependency with current app types and sanitizer boundary regressions','compile the repaired current frontend once']:['initialize CodeQL','analyze with CodeQL'];
 for(const name of stages){const matches=job.steps.filter(s=>s.name===name);assert.equal(matches.length,1,name);assert.equal(matches[0].status,'completed');assert.equal(matches[0].conclusion,'success');}
 return {originalRun:run.id,originalHead:run.head_sha,originalJob:job.id,parentRunConclusion:run.conclusion,originalJobConclusion:job.conclusion,originalCompletedAt:job.completed_at};
}
export function verifyArtifact(a,now=Date.now(),pin=artifactPin,source=original){
 assert.equal(a.id,pin.id);assert.equal(a.name,pin.name);assert.equal(a.size_in_bytes,pin.size);assert.equal(a.digest,'sha256:'+pin.sha256);assert.equal(a.expired,false);
 assert.equal(a.workflow_run.id,source.run);assert.equal(a.workflow_run.head_sha,source.head);assert.equal(a.workflow_run.head_branch,branch);assert.equal(a.workflow_run.repository_id,1338215995);assert.equal(a.workflow_run.head_repository_id,1338215995);
 const age=now-Date.parse(a.created_at);assert.ok(Number.isFinite(age)&&age>=0&&age<=86400000);assert.ok(Date.parse(a.expires_at)>now);
}
export function verifyClosure(mode,read=git,head='HEAD'){
 const obj=(ref,path)=>read('rev-parse',ref+':'+path);
 assert.equal(obj(head,'server-version/backend'),obj(original.head,'server-version/backend'),'Backend tree changed');
 assert.equal(obj(head,'server-version/backend'),binding.components.backend);
 if(mode==='frontend'){
  assert.equal(obj(head,'server-version/frontend'),obj(repaired.head,'server-version/frontend'),'Compiled frontend tree changed');
  assert.equal(obj(head,'server-version/frontend'),binding.components.frontend);
 }else if(mode==='backend'){
  for(const path of ['.github/scripts/shared-authoring-frozen.cjs'])assert.equal(obj(head,path),obj(original.head,path),'Frozen consumer changed');
 }else{
  const changed=read('diff','--name-only','--no-renames',original.head,head,'--','server-version/backend/src','server-version/backend/scripts','server-version/frontend/src');
  assert.equal(changed,'server-version/frontend/src/utils/__tests__/sanitize.test.ts','Unscanned application source changed');
  assert.equal(obj(head,changed),binding.source[changed].after);
 }
 return {backendTree:binding.components.backend,applicationSourceUnchangedExceptFreshSanitizerTests:mode==='sast'};
}
export function verifyControlClosure(read=git,head='HEAD'){
 const scope=['.github/scripts/shared-authoring-scope.mjs','.github/scripts/shared-authoring-checks.mjs','.github/scripts/shared-authoring.test.mjs','.github/scripts/shared-authoring-reuse.mjs','.github/scripts/shared-authoring-reuse.test.mjs','.github/scripts/shared-authoring-browser.mjs','.github/scripts/shared-authoring-frozen.cjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','server-version/frontend/src/utils'];
 const changed=read('diff','--name-only','--no-renames',repaired.head,head,'--',...scope).split('\n').filter(Boolean).sort();
 assert.deepEqual(changed,['.github/scripts/shared-authoring-browser.mjs','.github/scripts/shared-authoring-checks.mjs','.github/scripts/shared-authoring-reuse.mjs','.github/scripts/shared-authoring-reuse.test.mjs','.github/scripts/shared-authoring.test.mjs'].sort(),'Previously scanned controls changed outside fresh scan');
 return {previousControlScan:repaired.run,freshControlPaths:changed};
}
export function verifyFrozenReceipt(r){
 assert.equal(r.status,'PASS');assert.equal(r.compiledBackend,true);assert.equal(r.syntheticAccounts,true);assert.equal(r.loginUiManuallyAccepted,false);
 assert.equal(r.checks.length,7);assert.equal(new Set(r.checks).size,7);assert.ok(r.checks.every(c=>typeof c==='string'&&c.length>0));
}
async function api(path){
 const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'Official API failed: '+r.status);return r.json();
}
async function verifiedZip(pin,source){
 const artifact=await api('actions/artifacts/'+pin.id);verifyArtifact(artifact,Date.now(),pin,source);
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+pin.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
 const download=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.ok(download.ok);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,pin.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);return bytes;
}
async function run(mode){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.ok(process.env.GH_TOKEN);
 const source=mode==='frontend'?repaired:original;
 const closure=verifyClosure(mode),[run,job]=await Promise.all([api('actions/runs/'+source.run),api('actions/jobs/'+source[mode])]);
 const receipt={kind:'official-successful-component-reuse',...verifyOfficial(run,job,mode,Date.now(),source),...closure,currentHead:git('rev-parse','HEAD'),currentCompilationExecuted:false,currentFrozenChecksExecuted:false};
 mkdirSync('shared-authoring-evidence',{recursive:true});
 if(mode==='backend'){
  const bytes=await verifiedZip(artifactPin,original);
  const zip='shared-authoring-evidence/original-backend.zip';writeFileSync(zip,bytes);
  try{
   const text=execFileSync('python3',['-c',`import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 matches=[i for i in z.infolist() if i.filename=='shared-authoring-evidence/frozen-chain.json']
 assert len(matches)==1 and matches[0].file_size<32768 and not matches[0].is_dir()
 print(z.read(matches[0]).decode('utf-8'))`,zip],{encoding:'utf8',maxBuffer:65536});
   const frozen=JSON.parse(text);verifyFrozenReceipt(frozen);receipt.artifact={...artifactPin};receipt.originalFrozenReceipt=frozen;
  }finally{unlinkSync(zip);}
 }else if(mode==='frontend'){
  const zip='shared-authoring-evidence/original-frontend.zip';writeFileSync(zip,await verifiedZip(frontendPin,repaired));
  try{
   const text=execFileSync('python3',['-c',`import zipfile,json,sys,pathlib,stat,hashlib
root=pathlib.Path('server-version/frontend/dist').resolve()
assert not root.exists()
files={}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert sum(i.file_size for i in z.infolist())<250*1024*1024
 for i in z.infolist():
  p=pathlib.PurePosixPath(i.filename)
  assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)
  if i.is_dir(): continue
  assert i.filename not in files and i.file_size<40*1024*1024
  data=z.read(i);target=root.joinpath(*p.parts)
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  files[i.filename]=hashlib.sha256(data).hexdigest()
assert 'index.html' in files and any(n.startswith('assets/') and n.endswith('.js') for n in files)
print(json.dumps(files))`,zip],{encoding:'utf8',maxBuffer:2*1024*1024});
   receipt.artifact={...frontendPin};receipt.restoredFilesSHA256=JSON.parse(text);
  }finally{unlinkSync(zip);}
 }else if(mode==='sast'){
  const [previousRun,previousJob]=await Promise.all([api('actions/runs/'+repaired.run),api('actions/jobs/'+repaired.sast)]);
  receipt.previousControls={...verifyOfficial(previousRun,previousJob,'sast',Date.now(),repaired),...verifyControlClosure()};
 }
 writeFileSync('shared-authoring-evidence/official-'+mode+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run(process.argv[2]);
