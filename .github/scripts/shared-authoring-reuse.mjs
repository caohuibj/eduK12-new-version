import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {binding,branch} from './shared-authoring-scope.mjs';
export const original={run:39903131297,head:'62949663112b0e19518b019f29fa691fdcd61d4d',backend:120249077938,sast:120249022752};
export const artifactPin={id:12479427511,name:'shared-authoring-backend-51ff982a2c75d63266294064c7ea0f9071bc9c88',size:7669633,sha256:'d97c94e132cba937d73a9860a6cf8246fd733ee9ad494fd0e5f2aad933193fe8'};
const repo='caohuibj/eduK12-new-version';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function verifyOfficial(run,job,mode,now=Date.now()){
 assert.ok(['backend','sast'].includes(mode));assert.equal(run.id,original.run);assert.equal(run.head_sha,original.head);
 assert.equal(run.repository.full_name,repo);assert.equal(run.head_repository.full_name,repo);
 assert.equal(run.head_branch,branch);assert.equal(run.event,'pull_request');assert.equal(run.status,'completed');
 // A successful component of a failed parent remains a component success only.
 assert.equal(run.conclusion,'failure');assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);
 assert.equal(job.id,original[mode]);assert.equal(job.name,mode==='backend'?'shared-authoring / backend':'codeql (javascript/typescript SAST)');
 assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert.ok(Number.isFinite(age)&&age>=0&&age<=24*60*60*1000,'Original job exceeds 24 hours');
 const stages=mode==='backend'?['install official locked backend dependencies and exact Prisma client','missing backend dependency security audit','compile current backend once without repeating accepted semantic types','prepare only the disposable service database','actual compiled publication, frozen participant and released-report material chain']:['initialize CodeQL','analyze with CodeQL'];
 for(const name of stages){const matches=job.steps.filter(s=>s.name===name);assert.equal(matches.length,1,name);assert.equal(matches[0].status,'completed');assert.equal(matches[0].conclusion,'success');}
 return {originalRun:run.id,originalHead:run.head_sha,originalJob:job.id,parentRunConclusion:run.conclusion,originalJobConclusion:job.conclusion,originalCompletedAt:job.completed_at};
}
export function verifyArtifact(a,now=Date.now()){
 assert.equal(a.id,artifactPin.id);assert.equal(a.name,artifactPin.name);assert.equal(a.size_in_bytes,artifactPin.size);assert.equal(a.digest,'sha256:'+artifactPin.sha256);assert.equal(a.expired,false);
 assert.equal(a.workflow_run.id,original.run);assert.equal(a.workflow_run.head_sha,original.head);assert.equal(a.workflow_run.head_branch,branch);assert.equal(a.workflow_run.repository_id,1338215995);assert.equal(a.workflow_run.head_repository_id,1338215995);
 const age=now-Date.parse(a.created_at);assert.ok(Number.isFinite(age)&&age>=0&&age<=86400000);assert.ok(Date.parse(a.expires_at)>now);
}
export function verifyClosure(mode,read=git,head='HEAD'){
 const obj=(ref,path)=>read('rev-parse',ref+':'+path);
 assert.equal(obj(head,'server-version/backend'),obj(original.head,'server-version/backend'),'Backend tree changed');
 assert.equal(obj(head,'server-version/backend'),binding.components.backend);
 if(mode==='backend'){
  for(const path of ['.github/scripts/shared-authoring-frozen.cjs'])assert.equal(obj(head,path),obj(original.head,path),'Frozen consumer changed');
 }else{
  const changed=read('diff','--name-only','--no-renames',original.head,head,'--','server-version/backend/src','server-version/backend/scripts','server-version/frontend/src');
  assert.equal(changed,'server-version/frontend/src/utils/__tests__/sanitize.test.ts','Unscanned application source changed');
  assert.equal(obj(head,changed),binding.source[changed].after);
 }
 return {backendTree:binding.components.backend,applicationSourceUnchangedExceptFreshSanitizerTests:mode==='sast'};
}
export function verifyFrozenReceipt(r){
 assert.equal(r.status,'PASS');assert.equal(r.compiledBackend,true);assert.equal(r.syntheticAccounts,true);assert.equal(r.loginUiManuallyAccepted,false);
 assert.equal(r.checks.length,7);assert.equal(new Set(r.checks).size,7);assert.ok(r.checks.every(c=>typeof c==='string'&&c.length>0));
}
async function api(path){
 const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GH_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'Official API failed: '+r.status);return r.json();
}
async function run(mode){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.ok(process.env.GH_TOKEN);
 const closure=verifyClosure(mode),[run,job]=await Promise.all([api('actions/runs/'+original.run),api('actions/jobs/'+original[mode])]);
 const receipt={kind:'official-successful-component-reuse',...verifyOfficial(run,job,mode),...closure,currentHead:git('rev-parse','HEAD'),currentCompilationExecuted:false,currentFrozenChecksExecuted:false};
 mkdirSync('shared-authoring-evidence',{recursive:true});
 if(mode==='backend'){
  const artifact=await api('actions/artifacts/'+artifactPin.id);verifyArtifact(artifact);
  const r=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+artifactPin.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  const download=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.ok(download.ok);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,artifactPin.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifactPin.sha256);
  const zip='shared-authoring-evidence/original-backend.zip';writeFileSync(zip,bytes);
  try{
   const text=execFileSync('python3',['-c',`import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 matches=[i for i in z.infolist() if i.filename=='shared-authoring-evidence/frozen-chain.json']
 assert len(matches)==1 and matches[0].file_size<32768 and not matches[0].is_dir()
 print(z.read(matches[0]).decode('utf-8'))`,zip],{encoding:'utf8',maxBuffer:65536});
   const frozen=JSON.parse(text);verifyFrozenReceipt(frozen);receipt.artifact={...artifactPin};receipt.originalFrozenReceipt=frozen;
  }finally{unlinkSync(zip);}
 }
 writeFileSync('shared-authoring-evidence/official-'+mode+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run(process.argv[2]);
