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

export const changedApplicationFiles=[
 'server-version/frontend/src/modules/assessment-media/__tests__/media-2.adapter.test.tsx',
 'server-version/frontend/src/modules/cognitive/core/useRunnerPreparation.ts',
];
export const changedControlFiles=[
 '.github/scripts/training-assessment-reuse.mjs','.github/scripts/training-assessment-reuse.test.mjs',
 '.github/scripts/training-assessment-scope.mjs','.github/scripts/training-assessment.test.mjs',
 '.github/scripts/training-assessment-native-idb.js',
].sort();
export function verifyReuseInputs(kind,read=git){
 assert.equal(read('rev-parse','HEAD:server-version/backend'),read('rev-parse',original.source+':server-version/backend'),'Original backend component changed');
 const previous=JSON.parse(read('show',original.source+':.github/scripts/training-assessment-bindings.json'));
 assert.deepEqual(binding.checks.backendTestFiles,previous.checks.backendTestFiles);
 if(kind!=='backend')assert.deepEqual(read('diff','--name-only',original.source,'HEAD','--','server-version/frontend','server-version/backend').split('\n').filter(Boolean).sort(),changedApplicationFiles);
 const checker='.github/scripts/training-assessment-checks.mjs';assert.equal(read('rev-parse','HEAD:'+checker),read('rev-parse',original.source+':'+checker),'Original assertion program changed');
 const scope='.github/scripts/training-assessment-scope.mjs';
 const current=read('show','HEAD:'+scope).replace(`assert.equal(binding.product,'${binding.product}');`,`assert.equal(binding.product,'${previous.product}');`);
 assert.equal(current,read('show',original.source+':'+scope),'Only the exact product-identity literal may change in the original scope program');
 if(kind==='sast')assert.deepEqual(read('diff','--name-only',original.source,'HEAD','--','.github/scripts').split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f)).sort(),changedControlFiles);
 return {inputSource:original.source,unchangedBackend:true,changedApplicationFiles:kind==='backend'?[]:changedApplicationFiles};
}

const stage=(text,name)=>{
 const a=text.indexOf('      - name: '+name+'\n');assert(a>=0);const b=text.indexOf('\n      - ',a+1);
 return text.slice(a,b<0?undefined:b).replace(/^\s+if:.*\n/gm,'').trim();
};

async function main(){
 if(process.argv[2]==='frontend-cases')return executeFrontendCases();
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


export const caseSource={source:'7e6300400b0ba261960046452c0e0a69af002ca1',run:39977819707,job:120497186585,
 artifact:12511464019,bytes:14833,digest:'5b3f73a8020b23db6ab0ecbd718a3e4df3a47d4be7f662fb56d972be98351242',name:'training-assessment-frontend-5a2278b9fb213d5299921a31ff9cb03400b8ad90'};
const caseKey=c=>c.file+'\n'+c.name;
export function caseRows(report){return report.testResults.flatMap(s=>s.assertionResults.map(t=>({file:'src/'+s.name.split('/src/').at(-1),name:t.fullName,status:t.status})));}
export function verifyCaseCoverage(originalReport,currentReport,reused,required){
 const old=new Map(caseRows(originalReport).map(c=>[caseKey(c),c]));
 for(const c of reused)assert.equal(old.get(caseKey(c))?.status,'passed','Only actually passed assertions can be reused');
 assert.equal(currentReport.success,true);assert.equal(currentReport.numFailedTests,0);assert.equal(currentReport.numTodoTests,0);
 const fresh=caseRows(currentReport).filter(c=>c.status!=='pending'&&c.status!=='skipped');assert(fresh.every(c=>c.status==='passed'));
 const keys=[...reused,...fresh].map(caseKey);assert.equal(new Set(keys).size,keys.length,'A current passed assertion was rerun');
 assert.deepEqual(keys.sort(),required.map(caseKey).sort(),'Current assertion coverage is incomplete or unexpected');
 return {officialReusedAssertions:reused.length,freshAssertions:fresh.length,uniqueNodeAssertions:keys.length};
}

async function executeFrontendCases(){
 assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.version,'v24.21.0');assert(process.env.GH_TOKEN);
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'};
 const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers,redirect:'error'});assert.equal(r.status,200,'Official case metadata unavailable');return r.json();};
 const [run,job,artifact]=await Promise.all([api('actions/runs/'+caseSource.run),api('actions/jobs/'+caseSource.job),api('actions/artifacts/'+caseSource.artifact)]);
 assert.equal(run.head_sha,caseSource.source);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.head_repository.full_name,repo);assert.equal(run.head_branch,'work/training-assessment-performance-20261023');assert(run.pull_requests.some(p=>p.number===343));
 assert.equal(job.head_sha,caseSource.source);assert.equal(job.run_id,caseSource.run);assert.equal(job.name,'training-assessment / frontend');assert.equal(job.status,'completed');assert.equal(job.conclusion,'failure');
 const age=Date.now()-Date.parse(job.completed_at);assert(age>=0&&age<86400000);
 for(const name of ['check affected app TypeScript after supplying missing dependency types','check affected cognitive TypeScript for the first time','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'));
 assert(job.steps.some(s=>s.name==='execute only affected runner media and persistence assertions'&&s.conclusion==='failure'));
 assert.equal(artifact.workflow_run.id,caseSource.run);assert.equal(artifact.workflow_run.head_sha,caseSource.source);assert.equal(artifact.expired,false);assert.equal(artifact.digest,'sha256:'+caseSource.digest);assert.equal(artifact.name,caseSource.name);assert.equal(artifact.size_in_bytes,caseSource.bytes);
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+caseSource.artifact+'/zip',{headers,redirect:'manual'});assert.equal(r.status,302);
 const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
 const download=await fetch(url,{redirect:'error'});assert.equal(download.status,200);const zip=Buffer.from(await download.arrayBuffer());assert.equal(zip.length,caseSource.bytes);assert.equal(sha(zip),caseSource.digest);
 const old=JSON.parse(execFileSync('python3',['-c',"import sys,io,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); n=[i.filename for i in z.infolist() if i.filename.endswith('frontend-tests.json')]; assert len(n)==1; assert z.getinfo(n[0]).file_size<2000000; print(z.read(n[0]).decode())"],{input:zip,encoding:'utf8',maxBuffer:3*1024*1024}));
 assert.equal(old.numPassedTests,230);assert.equal(old.numFailedTests,3);assert.equal(old.numPendingTests,3);assert.equal(old.numTotalTests,236);
 execFileSync('git',['fetch','--no-tags','--depth=1','origin',original.source,caseSource.source],{stdio:'inherit'});
 verifyReuseInputs('frontend');
 const nativeRaw=readFileSync('.github/evidence/training-assessment/native-idb.json');assert.equal(sha(nativeRaw),binding.nativeIdbSHA256);const native=JSON.parse(nativeRaw);
 assert.equal(native.kind,'recorded-local-native-indexeddb');assert.equal(native.ciExecuted,false);assert.equal(native.originalExecutionSigned,false);assert.equal(native.nativeIndexedDb,true);assert.equal(native.results.length,5);assert(native.results.every(c=>c.status==='passed'));
 assert.equal(native.sourceGitBlob,git('rev-parse','HEAD:server-version/frontend/src/services/persistence/finalDraftStore.ts'));assert.equal(native.harnessSHA256,sha(readFileSync('.github/scripts/training-assessment-native-idb.js')));assert.equal(native.originalTestSourceSHA256,sha(readFileSync('server-version/frontend/src/services/persistence/__tests__/answerReplacement.test.ts')));
 const rows=caseRows(old),skips=rows.filter(c=>c.status==='skipped');assert.equal(skips.length,3);assert.deepEqual(skips.map(c=>c.name),native.results.slice(0,3).map(c=>c.name));
 const required=rows.filter(c=>c.status==='passed'||c.status==='failed');assert.equal(required.length,233);assert.equal(new Set(required.map(caseKey)).size,required.length);
 assert.deepEqual([...new Set(rows.map(c=>c.file))].sort(),[...binding.checks.frontendTestFiles].sort());
 // Recompute the full relative import closure with the same locked TypeScript
 // parser. No check is reused merely because a test body looks unchanged.
 const ts=(await import('../../server-version/frontend/node_modules/typescript/lib/typescript.js')).default;
 const path=await import('node:path'),cache=new Map(),absent=new Set(),ids=new Map();
 const readOld=f=>{if(!cache.has(f))cache.set(f,execFileSync('git',['show',caseSource.source+':'+f],{encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}));return cache.get(f);};
 const exists=f=>{if(absent.has(f))return false;try{readOld(f);return true}catch{absent.add(f);return false}};
 const closure=(f,seen=new Set())=>{
  if(seen.has(f))return seen;seen.add(f);if(!/\.[cm]?[jt]sx?$/.test(f))return seen;
  const parsed=ts.preProcessFile(readOld(f),true,true);
  for(const ref of [...parsed.importedFiles,...parsed.referencedFiles])if(ref.fileName.startsWith('.')){
   const base=path.posix.normalize(path.posix.join(path.posix.dirname(f),ref.fileName.split('?')[0]));
   const withoutJs=base.endsWith('.js')?base.slice(0,-3):base;
   const child=[base,withoutJs+'.ts',withoutJs+'.tsx',base+'.js',base+'.jsx',base+'/index.ts',base+'/index.tsx'].find(exists);
   if(child)closure(child,seen);
  }
  return seen;
 };
 const changed=f=>{if(!ids.has(f)){let now='missing';try{now=git('rev-parse','HEAD:'+f)}catch{}ids.set(f,now!==git('rev-parse',caseSource.source+':'+f));}return ids.get(f);};
 const suites=new Map();for(const file of binding.checks.frontendTestFiles){const inputs=[...closure('server-version/frontend/'+file)];suites.set(file,{inputs,drift:inputs.filter(changed)});}
 for(const f of ['package.json','package-lock.json','vitest.config.ts','tsconfig.app.json','tsconfig.cognitive.json','src/test/setup.ts'])assert.equal(git('rev-parse','HEAD:server-version/frontend/'+f),git('rev-parse',caseSource.source+':server-version/frontend/'+f),'Tool/config input changed');
 const reused=required.filter(c=>c.status==='passed'&&!suites.get(c.file).drift.length),missing=required.filter(c=>!reused.some(p=>caseKey(p)===caseKey(c)));
 assert(missing.length>0&&missing.length<100,'Unexpected affected scope; stop rather than repeat the full suite');
 const files=[...new Set(missing.map(c=>c.file))],regex='^(?:'+missing.map(c=>c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
 mkdirSync('training-assessment-evidence',{recursive:true});writeFileSync('training-assessment-evidence/original-frontend-cases.json',JSON.stringify(old));
 writeFileSync('training-assessment-evidence/case-input-plan.json',JSON.stringify({original:caseSource,originalFailuresRetained:true,originalJsdomSkips:skips,localNativeIndexedDb:native,reused,missing,suites:Object.fromEntries(suites)},null,2));
 execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','-t',regex,'--reporter=json','--outputFile=../../training-assessment-evidence/current-frontend-cases.json'],{cwd:'server-version/frontend',stdio:'inherit'});
 const current=JSON.parse(readFileSync('training-assessment-evidence/current-frontend-cases.json'));const qualified=verifyCaseCoverage(old,current,reused,required);
 writeFileSync('training-assessment-evidence/frontend-assertions.json',JSON.stringify({...qualified,originalRun:caseSource.run,originalFailedJob:caseSource.job,originalJsdomSkippedCases:3,nativeIdbPassedLocally:5,localNativeChecksClaimedAsCI:false},null,2)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
