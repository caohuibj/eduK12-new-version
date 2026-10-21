// Admit only the named successful stages of the preserved first official run.
// The failed browser stage and failed overall frontend job remain failures.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {binding} from './training-workspace-scope.mjs';
const component=process.argv[2];assert.ok(['frontend','backend'].includes(component));
const repo='caohuibj/eduK12-new-version',runId=39583731562,source='09a84bf276b15c2d7584538fe1720b5d6b036007',merge='a91226a7d759a4f0ab75151d240667678a11b101';
const jobId=component==='frontend'?119167465186:119167465197;
assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.ok(process.env.GH_TOKEN);
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const head=git('rev-parse','HEAD');
assert.equal(git('rev-parse',head+':server-version/'+component),git('rev-parse',source+':server-version/'+component));
for(const path of ['.github/scripts/training-workspace-bindings.json','.github/scripts/training-workspace-checks.mjs'])assert.equal(git('rev-parse',head+':'+path),git('rev-parse',source+':'+path));
async function api(path){const response=await fetch('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);return response.json()}
const run=await api('/actions/runs/'+runId),job=await api('/actions/jobs/'+jobId);
assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.head_sha,source);assert.equal(run.head_branch,'fix/training-course-pagination-20261021');assert.ok(run.pull_requests.some(p=>p.number===324));assert.equal(job.run_id,runId);
assert.equal(job.name,'training-workspace / '+component+' affected contracts');assert.equal(job.conclusion,component==='frontend'?'failure':'success');
const age=Date.now()-Date.parse(job.completed_at);assert.ok(age>=0&&age<24*60*60*1000);
for(const name of ['verify frozen diff and plan on the actual checkout','install locked component dependencies from official registry','affected types, lint and non-empty regression contracts','audit locked component dependencies'])assert.ok(job.steps.some(s=>s.name===name&&s.conclusion==='success'),name);
if(component==='frontend'){assert.ok(job.steps.some(s=>s.name==='compile changed frontend once'&&s.conclusion==='success'));assert.deepEqual(job.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),['rendered affected Training journeys'])}
const artifacts=await api('/actions/runs/'+runId+'/artifacts?per_page=100'),name='training-workspace-'+component+'-'+merge;
const matches=artifacts.artifacts.filter(a=>a.name===name&&!a.expired);assert.equal(matches.length,1);const artifact=matches[0];assert.equal(artifact.workflow_run.id,runId);
const response=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+artifact.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(response.status,302);
const location=new URL(response.headers.get('location'));assert.equal(location.protocol,'https:');assert.ok(location.hostname.endsWith('.blob.core.windows.net')||location.hostname.endsWith('.actions.githubusercontent.com'));
const download=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.ok(bytes.length<1024*1024);assert.equal(artifact.digest,'sha256:'+createHash('sha256').update(bytes).digest('hex'));
mkdirSync('training-workspace-evidence',{recursive:true});const archive='training-workspace-evidence/'+component+'-original.zip';writeFileSync(archive,bytes);
const report=JSON.parse(execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read(sys.argv[2]).decode())',archive,component+'-tests.json'],{encoding:'utf8',maxBuffer:4*1024*1024}));
assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.ok(report.numPassedTests>0);
for(const file of binding[component+'Tests'])assert.ok(report.testResults.some(r=>r.name.endsWith('/server-version/'+component+'/'+file)&&r.status==='passed'&&r.assertionResults.length&&r.assertionResults.every(a=>a.status==='passed')));
const receipt={status:'REUSED_OFFICIAL_PASSED_STAGES',component,currentHead:head,source,merge,runId,jobId,artifactId:artifact.id,artifactDigest:artifact.digest,passedTests:report.numPassedTests,originalJobConclusion:job.conclusion,originalBrowser:'failure; not admitted',currentBrowser:'must execute separately',buildArtifact:'not retained in original failed job; not admitted'};
if(component==='frontend'){
 const buildRun=await api('/actions/runs/39584656927'),buildJob=await api('/actions/jobs/119170563207'),build=await api('/actions/artifacts/12339492405');
 assert.equal(buildRun.head_sha,'cecf9ef589edaa7b23168ca329e7eba9fca4a706');assert.equal(buildRun.event,'pull_request');assert.equal(buildRun.path,'.github/workflows/ci.yml');assert.ok(buildRun.pull_requests.some(p=>p.number===324));
 assert.equal(buildJob.run_id,39584656927);assert.equal(buildJob.name,'training-workspace / frontend affected contracts');assert.equal(buildJob.conclusion,'failure');assert.ok(buildJob.steps.some(s=>s.name==='compile changed frontend once'&&s.conclusion==='success'));assert.deepEqual(buildJob.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),['rendered affected Training journeys']);
 assert.equal(git('rev-parse',buildRun.head_sha+':server-version/frontend'),git('rev-parse',head+':server-version/frontend'));
 assert.equal(build.workflow_run.id,39584656927);assert.equal(build.name,'training-workspace-frontend-dist-3741eb4acf4a48d74d4bde921bb1f8f77c47b5b1');assert.equal(build.expired,false);assert.equal(build.digest,'sha256:abc8304fc1cc76327792c093df09d2278e3301189b3857f5a6e8c9e5109e785b');assert.ok(Date.now()-Date.parse(build.created_at)<24*60*60*1000);
 const redirect=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+build.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(redirect.status,302);
 const url=new URL(redirect.headers.get('location'));assert.equal(url.protocol,'https:');assert.ok(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
 const fetched=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(fetched.status,200);const compiled=Buffer.from(await fetched.arrayBuffer());assert.equal(compiled.length,build.size_in_bytes);assert.equal('sha256:'+createHash('sha256').update(compiled).digest('hex'),build.digest);
 const path='training-workspace-evidence/compiled-original.zip';writeFileSync(path,compiled);
 execFileSync('python3',['-c',`import zipfile,sys,pathlib,stat
z=zipfile.ZipFile(sys.argv[1]); assert sum(i.file_size for i in z.infolist())<200*1024*1024
for i in z.infolist():
 p=pathlib.PurePosixPath(i.filename); assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)
z.extractall('server-version/frontend/dist')`,path],{stdio:'inherit'});
 const {unlinkSync}=await import('node:fs');unlinkSync(path);
 receipt.buildArtifact={status:'REUSED_EXACT_COMPILED_BYTES',runId:39584656927,jobId:119170563207,artifactId:build.id,digest:build.digest};appendFileSync(process.env.GITHUB_OUTPUT,'build_reused=true\n');
}
writeFileSync('training-workspace-evidence/'+component+'-reuse.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));appendFileSync(process.env.GITHUB_OUTPUT,'reused=true\n');
