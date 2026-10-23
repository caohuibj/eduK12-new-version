import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding} from './training-assessment-scope.mjs';
import {verifyTests} from './training-assessment-checks.mjs';
export const original={source:'4144a1d3a17f60f2f19940ee510b2d550b371101',run:39975935257,
 backend:120490727154,frontend:120490727194,sast:120490533402,
 artifact:12511501419,bytes:7963621,digest:'973ff389fdb47aa33a3d70748dfd129e811b4dbb5f26c7d3bc834d26d13fd96d',
 artifactName:'training-assessment-backend-d5d81029d9c180d091c09e19e16ee6d76f12b9e4'};
const repo='caohuibj/eduK12-new-version',git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex');

export function verifyOriginalStage(run,job,kind,now=Date.now()){
 assert(['backend','frontend','sast'].includes(kind));assert.equal(run.id,original.run);assert.equal(run.head_sha,original.source);
 assert.equal(run.head_repository.full_name,repo);assert.equal(run.head_branch,'work/training-assessment-performance-20261023');
 assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert(run.pull_requests.some(p=>p.number===343));
 assert.equal(job.id,original[kind]);assert.equal(job.head_sha,original.source);assert.equal(job.run_id,original.run);assert.equal(job.status,'completed');
 assert.equal(job.name,kind==='sast'?'codeql (javascript/typescript SAST)':'training-assessment / '+kind);
 assert.equal(job.conclusion,kind==='frontend'?'failure':'success');
 const age=now-Date.parse(job.completed_at);assert(age>=0&&age<86400000,'Official component evidence expired');
 const names=kind==='backend'?['install official locked backend dependencies','generate types from unchanged schema without a database','compile affected backend candidate once','execute selector permission and projection assertions','Run actions/upload-artifact@v4']
  :kind==='frontend'?['install official locked frontend dependencies','lint only changed frontend source and tests']:['initialize CodeQL','analyze with CodeQL'];
 for(const name of names)assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'),'Required actual stage missing: '+name);
 if(kind==='frontend')assert(job.steps.some(s=>s.name==='check affected app and cognitive TypeScript contracts once'&&s.conclusion==='failure'),'Original failed type history must remain visible');
 return {kind,originalJob:job.id,originalJobConclusion:job.conclusion,originalParentConclusion:run.conclusion,stages:names};
}

export function verifyReuseInputs(kind,read=git){
 const components=kind==='sast'?['frontend','backend']:[kind==='backend'?'backend':'frontend'];
 for(const component of components)assert.equal(read('rev-parse','HEAD:server-version/'+component),read('rev-parse',original.source+':server-version/'+component),'Original component changed: '+component);
 const previous=JSON.parse(read('show',original.source+':.github/scripts/training-assessment-bindings.json'));
 assert.deepEqual(binding.source,previous.source);assert.deepEqual(binding.components,previous.components);assert.deepEqual(binding.checks,previous.checks);
 for(const file of ['.github/scripts/training-assessment-checks.mjs','.github/scripts/training-assessment-scope.mjs'])assert.equal(read('rev-parse','HEAD:'+file),read('rev-parse',original.source+':'+file),'Original assertion program changed');
 if(kind==='sast'){
  const changed=read('diff','--name-only',original.source,'HEAD','--','.github/scripts').split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f)).sort();
  assert.deepEqual(changed,['.github/scripts/training-assessment-reuse.mjs','.github/scripts/training-assessment-reuse.test.mjs','.github/scripts/training-assessment.test.mjs']);
 }
 return {components,inputSource:original.source,unchangedAssertionProgram:true};
}

const stage=(text,name)=>{
 const a=text.indexOf('      - name: '+name+'\n');assert(a>=0);const b=text.indexOf('\n      - ',a+1);
 return text.slice(a,b<0?undefined:b).replace(/^\s+if:.*\n/gm,'').trim();
};

async function main(){
 const kind=process.argv[2];assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.version,'v24.21.0');
 assert(['backend','frontend','sast'].includes(kind));assert(process.env.GH_TOKEN);
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'Official evidence metadata unavailable');return r.json();};
 const [run,job]=await Promise.all([api('actions/runs/'+original.run),api('actions/jobs/'+original[kind])]);
 const observed=verifyOriginalStage(run,job,kind);
 execFileSync('git',['fetch','--no-tags','--depth=1','origin',original.source],{stdio:'inherit'});
 const inputs=verifyReuseInputs(kind);
 if(kind==='frontend'){
  const old=git('show',original.source+':.github/workflows/ci-training-assessment.yml'),current=readFileSync('.github/workflows/ci-training-assessment.yml','utf8');
  assert.equal(stage(old,'install official locked frontend dependencies'),stage(current,'install official locked frontend dependencies'),'Original frontend dependency recipe changed');
  const lint=stage(old,'lint only changed frontend source and tests');
  assert(lint.includes("node_modules/eslint/bin/eslint.js"));assert(lint.includes('binding.source'));
  observed.originalLintProgramSHA256=sha(lint);observed.currentLintExecuted=false;
 }
 if(kind==='backend'){
  const a=await api('actions/artifacts/'+original.artifact);assert.equal(a.expired,false);assert.equal(a.workflow_run.id,original.run);assert.equal(a.workflow_run.head_sha,original.source);assert.equal(a.name,original.artifactName);assert.equal(a.size_in_bytes,original.bytes);assert.equal(a.digest,'sha256:'+original.digest);
  const r=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+original.artifact+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(r.status,302);
  const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
  const download=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(download.status,200);const zip=Buffer.from(await download.arrayBuffer());assert.equal(zip.length,original.bytes);assert.equal(sha(zip),original.digest);
  const reports=JSON.parse(execFileSync('python3',['-c',"import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert sum(i.file_size for i in z.infolist())<100*1024*1024; names=[i.filename for i in z.infolist() if i.filename.endswith('/backend-tests.json') or i.filename=='backend-tests.json']; assert len(names)==1; assert z.getinfo(names[0]).file_size<1000000; print(z.read(names[0]).decode())"],{input:zip,encoding:'utf8',maxBuffer:2*1024*1024}));
  observed.assertions=verifyTests(reports,binding.checks.backendTestFiles);assert.equal(observed.assertions.cases,3);observed.artifact={id:original.artifact,sha256:original.digest};
 }
 if(kind==='sast'){
  const workflow=git('show',original.source+':.github/workflows/ci.yml');
  assert(stage(workflow,'initialize CodeQL').includes("'paths: [server-version/frontend/src, server-version/backend/src, .github/scripts]'"));
  assert(stage(workflow,'initialize CodeQL').includes('uses: github/codeql-action/init@v3'));assert(stage(workflow,'initialize CodeQL').includes('ram: 3500'));assert(stage(workflow,'initialize CodeQL').includes('threads: 2'));assert(stage(workflow,'analyze with CodeQL').includes('uses: github/codeql-action/analyze@v3'));
  observed.currentChangedControlScanRequired=true;observed.applicationScannedAgain=false;
 }
 mkdirSync('training-assessment-evidence',{recursive:true});writeFileSync('training-assessment-evidence/'+kind+'-official-reuse.json',JSON.stringify({kind:'official-successful-stages-reuse',currentHead:git('rev-parse','HEAD'),source:original.source,...observed,inputs},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
