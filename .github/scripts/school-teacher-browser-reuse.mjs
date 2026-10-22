// One failed diagnostic run's successful build jobs only. Never reusable browser success.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyManifest,treeDigest} from './ci-artifact.mjs';
export const prior={run:39795298845,head:'a541e986c85310b655f290df4a8090de75fb4c6e',repository:'caohuibj/eduK12-new-version',branch:'ci/school-teacher-browser-20261022',components:{
 frontend:{job:119881011306,name:'frontend / build',step:'build production frontend',artifact:12432967947,bytes:20432241,zip:'afc48810759467c7fe0137fbb90ffaa4b628b43275c743783fd5b92b4cbac281',lockDigest:'be71016d67ab0f980f10210387fa1f953bafc41f7b823e5f6ea4c0f68ddc45e0',contentDigest:'71061b250a98400b836e8f6d91bb0221471641171f5755071e83934d3aaafc31'},
 backend:{job:119881009854,name:'backend',step:'emit backend once with production tsconfig (not full npm build or tests)',artifact:12432158758,bytes:7557523,zip:'6e06911e9ec6a3ab9fdcda411152fc0ca5d6f6408bc0a13dcc6b59e8e222e79a',lockDigest:'e7ead36aea4702185f0dfcebc3089723258a402218b1addde09e03ec1c5e9b57',contentDigest:'a3a3c1fce9e2a74cde57a03c86c0758721233a6d5962f6c624301d926e33afa4'}
}};
export function expectedManifest(kind){const p=prior.components[kind];assert(p);return {schemaVersion:1,sha:prior.head,runId:String(prior.run),kind,lockDigest:p.lockDigest,contentDigest:p.contentDigest};}
export function verifyOfficial(run,job,artifact,kind){
 const p=prior.components[kind];assert(p);
 assert.equal(run.id,prior.run);assert.equal(run.run_attempt,1);assert.equal(run.head_sha,prior.head);assert.equal(run.head_branch,prior.branch);
 assert.equal(run.event,'push');assert.equal(run.path,'.github/workflows/ci-school-teacher-browser.yml');assert.equal(run.repository.full_name,prior.repository);assert.equal(run.head_repository.full_name,prior.repository);
 assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure','Original browser failure must remain failure');
 assert.equal(job.id,p.job);assert.equal(job.run_id,prior.run);assert.equal(job.run_attempt,1);assert.equal(job.head_sha,prior.head);assert.equal(job.name,p.name);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 assert(job.steps.some(s=>s.name===p.step&&s.conclusion==='success'));assert(!job.steps.some(s=>['failure','cancelled'].includes(s.conclusion)));
 assert.equal(artifact.id,p.artifact);assert.equal(artifact.name,`${kind}-dist-${prior.head}`);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,p.bytes);assert.equal(artifact.digest,'sha256:'+p.zip);
 assert.equal(artifact.workflow_run.id,prior.run);assert.equal(artifact.workflow_run.head_sha,prior.head);
}
export const allowedChanges=['.github/workflows/ci-school-teacher-browser.yml','.github/scripts/school-teacher-browser-control.mjs','.github/scripts/school-teacher-browser-control.test.mjs','.github/scripts/school-teacher-browser-reuse.mjs','server-version/e2e/school-teacher-browser.cjs','server-version/e2e/school-teacher-fixture.cjs','server-version/e2e/school-teacher-startup-contract.test.cjs'];
export function verifyChangedPaths(paths){assert(paths.length>0);for(const path of paths)assert(allowedChanges.includes(path),'Build input or unknown path changed: '+path);}
export function verifyReceipt(receipt,head,run){
 assert.equal(receipt.status,'VERIFIED_OFFICIAL_BUILDS');assert.equal(receipt.currentHead,head);assert.equal(receipt.currentRun,String(run));assert.equal(receipt.sourceHead,prior.head);assert.equal(receipt.sourceRun,String(prior.run));assert.equal(receipt.originalRunConclusion,'failure');
 for(const kind of ['frontend','backend'])assert.deepEqual(receipt.components[kind],expectedManifest(kind));
}
export const ZIP_CHECK=`import pathlib,stat,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); names=set(); total=0
for i in z.infolist():
 p=pathlib.PurePosixPath(i.filename); assert i.filename and not p.is_absolute() and '..' not in p.parts and '\\\\' not in i.filename
 assert i.filename not in names; names.add(i.filename)
 mode=i.external_attr>>16; assert not stat.S_ISLNK(mode) and (stat.S_IFMT(mode) in [0,stat.S_IFREG,stat.S_IFDIR])
 assert not i.flag_bits&1; total+=i.file_size; assert total<300*1024*1024
assert 'ci-build-manifest.json' in names
z.extractall(sys.argv[2])`;
export function verifyInputClosure(sourceHead=prior.head,cwd=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('cat-file','-e',sourceHead+'^{commit}');git('merge-base','--is-ancestor',sourceHead,'HEAD');
 verifyChangedPaths(git('diff','--name-only',sourceHead,'HEAD').split('\n').filter(Boolean));
 for(const component of ['frontend','backend'])assert.equal(git('rev-parse',`HEAD:server-version/${component}`),git('rev-parse',`${sourceHead}:server-version/${component}`));
}
export async function restoreBuilds(identity){
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),identity.sourceCommit);
 // Full history checkout provides the immutable original source. Every non-harness byte,
 // including both component trees, locks, sibling fixtures and all build tools must match.
 verifyInputClosure();
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'};assert(process.env.GH_TOKEN);
 const api=async path=>{const r=await fetch('https://api.github.com/repos/'+prior.repository+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json();};
 const run=await api('/actions/runs/'+prior.run);const components={};
 const privateRoot=resolve(process.env.RUNNER_TEMP,'school-teacher-build-reuse');assert(!existsSync(privateRoot));mkdirSync(privateRoot,{mode:0o700});
 try {for(const kind of ['frontend','backend']){
  const p=prior.components[kind];const [job,artifact]=await Promise.all([api('/actions/jobs/'+p.job),api('/actions/artifacts/'+p.artifact)]);verifyOfficial(run,job,artifact,kind);
  const r=await fetch(`https://api.github.com/repos/${prior.repository}/actions/artifacts/${p.artifact}/zip`,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(r.status,302);
  const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(!url.username&&!url.password);assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
  const downloaded=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(downloaded.status,200);const bytes=Buffer.from(await downloaded.arrayBuffer());assert.equal(bytes.length,p.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),p.zip);
  const zip=join(privateRoot,kind+'.zip');writeFileSync(zip,bytes,{mode:0o600});const destination=resolve('server-version',kind,'dist');assert(!existsSync(destination),'Never replace an existing build directory');
  execFileSync('python3',['-c',ZIP_CHECK,zip,destination],{stdio:'pipe'});
  const manifest=JSON.parse(readFileSync(join(destination,'ci-build-manifest.json')));verifyManifest(manifest,expectedManifest(kind),treeDigest(destination));
  assert.equal(createHash('sha256').update(readFileSync(`server-version/${kind}/package-lock.json`)).digest('hex'),p.lockDigest);
  assert(readFileSync(join(destination,kind==='frontend'?'index.html':'index.js')).length>0);components[kind]=manifest;
 }
 const receipt={status:'VERIFIED_OFFICIAL_BUILDS',currentHead:identity.sourceCommit,currentRun:String(identity.ciRunId),sourceHead:prior.head,sourceRun:String(prior.run),originalRunConclusion:'failure',components,buildsExecutedThisRun:false,browserMustExecute:true,mergeQualification:false};
 mkdirSync('school-teacher-evidence',{recursive:true});writeFileSync('school-teacher-evidence/reused-builds.json',JSON.stringify(receipt,null,2)+'\n');return receipt;
 } finally {rmSync(privateRoot,{recursive:true,force:true});}
}
