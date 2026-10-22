import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bindings} from './admin-authenticator-scope.mjs';
const repository='caohuibj/eduK12-new-version';
export function verifyOfficialSource(run,job,component,now=Date.now()){
 const b=bindings.officialReuse,s=b[component];assert.ok(s);
 assert.equal(run.id,b.runId);assert.equal(run.head_sha,b.head);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(run.head_repository.full_name,repository);assert.ok(run.pull_requests.some(pr=>pr.number===333));
 assert.equal(job.id,s.jobId);assert.equal(job.run_id,b.runId);assert.equal(job.name,s.jobName);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert.ok(age>=0&&age<24*60*60*1000,'Expired official evidence');
 assert.ok(job.steps.length>0);assert.ok(!job.steps.some(step=>['failure','cancelled'].includes(step.conclusion)));
 const step=component==='sast'?'analyze with CodeQL':component==='backend'?'integrated administrator schema and one backend compilation':'integrated app types and one frontend compilation';
 assert.ok(job.steps.some(s=>s.name===step&&s.conclusion==='success'));
 if(component!=='sast')assert.ok(job.steps.some(s=>s.name==='audit actual production dependency closure at HIGH threshold'&&s.conclusion==='success'));
}
export function compiledDigest(directory){
 const files=[];function walk(p){for(const n of readdirSync(join(directory,p))){const f=join(p,n);if(statSync(join(directory,f)).isDirectory())walk(f);else files.push(f);}}walk('dist');
 assert.ok(files.length);const digest=createHash('sha256');for(const f of files.sort()){digest.update(f);digest.update(readFileSync(join(directory,f)));}return {count:files.length,hash:digest.digest('hex')};
}
async function main(){
 const component=process.argv[2];assert.ok(['backend','frontend','sast'].includes(component));assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.ok(process.env.GH_TOKEN);
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'};
 const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repository+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json();};
 const b=bindings.officialReuse,s=b[component],head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 for(const[c,tree]of Object.entries(bindings.components))assert.equal(execFileSync('git',['rev-parse','HEAD:server-version/'+c],{encoding:'utf8'}).trim(),tree);
 const[run,job]=await Promise.all([api('/actions/runs/'+b.runId),api('/actions/jobs/'+s.jobId)]);verifyOfficialSource(run,job,component);
 mkdirSync('admin-authenticator-evidence',{recursive:true});
 if(component!=='sast'){
  const a=s.artifact,metadata=await api('/actions/artifacts/'+a.id);assert.equal(metadata.expired,false);assert.equal(metadata.workflow_run.id,b.runId);assert.equal(metadata.workflow_run.head_sha,b.head);assert.equal(metadata.name,a.name);assert.equal(metadata.digest,a.digest);assert.ok(metadata.size_in_bytes>0&&metadata.size_in_bytes<50*1024*1024);
  const response=await fetch('https://api.github.com/repos/'+repository+'/actions/artifacts/'+a.id+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(response.status,302);
  const location=new URL(response.headers.get('location'));assert.equal(location.protocol,'https:');assert.ok(location.hostname.endsWith('.blob.core.windows.net')||location.hostname.endsWith('.actions.githubusercontent.com'));
  const download=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,metadata.size_in_bytes);assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),a.digest);
  const zip=resolve('admin-authenticator-evidence/'+component+'-source.zip');writeFileSync(zip,bytes);
  execFileSync('python3',['-c',`import zipfile,sys,pathlib,stat
z=zipfile.ZipFile(sys.argv[1]);assert sum(i.file_size for i in z.infolist())<300*1024*1024
for i in z.infolist():
 p=pathlib.PurePosixPath(i.filename);assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)
 assert i.filename.startswith(('admin-authenticator-evidence/','server-version/'+sys.argv[2]+'/dist/'))
z.extractall('.')`,zip,component],{stdio:'inherit'});unlinkSync(zip);
  const report=JSON.parse(readFileSync('admin-authenticator-evidence/'+component+'-integrated.json'));assert.equal(report.head,b.merge);assert.equal(report.component,component);assert.equal(report.productionDependenciesAudit,'passed HIGH/CRITICAL threshold');
  const digest=compiledDigest('server-version/'+component);assert.equal(digest.count,report.compiledFiles);assert.equal(digest.hash,report.compiledTreeSha256);
 }
 const receipt={status:'REUSED_OFFICIAL_SUCCESSFUL_JOB',currentHead:head,sourceRun:b.runId,sourceJob:s.jobId,sourceHead:b.head,sourceMerge:b.merge,component,sourceArtifact:s.artifact||null,originalOverallConclusion:run.conclusion,originalBrowserFailureRetained:true,productionDeploymentQualified:false};
 writeFileSync('admin-authenticator-evidence/'+component+'-reuse.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
