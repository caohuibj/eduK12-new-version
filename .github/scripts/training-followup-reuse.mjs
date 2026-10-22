import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {followup,trainingFollowupPlan} from './training-followup-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const repository='caohuibj/eduK12-new-version';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

export function verifySourceJob(run,job,component,now=Date.now()){
 assert.ok(['frontend','backend'].includes(component));
 const binding=followup.reuse,selected=binding[component];
 assert.equal(run.id,binding.runId);assert.equal(run.head_sha,binding.head);
 assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(run.head_branch,'work/training-followup-integrated-20261022');
 assert.equal(run.head_repository.full_name,repository);assert.ok(run.pull_requests.some(pr=>pr.number===332));
 assert.equal(job.id,selected.jobId);assert.equal(job.run_id,binding.runId);
 assert.equal(job.name,selected.jobName);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert.ok(age>=0&&age<24*60*60*1000);
 const step=component==='frontend'?'affected lint, integrated types, four direct contracts and one build':'integrated types, disposable migration and seven form authority contracts';
 assert.ok(job.steps.some(item=>item.name===step&&item.conclusion==='success'));
 assert.ok(!job.steps.some(item=>['failure','cancelled'].includes(item.conclusion)));
}
async function main(){
 const component=process.argv[2];assert.ok(['frontend','backend'].includes(component));
 assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.ok(process.env.GH_TOKEN);
 assert.equal(process.version,'v24.21.0');
 const head=git('rev-parse','HEAD'),binding=followup.reuse,selected=binding[component];
 assert.deepEqual(JSON.parse(process.env.PLAN),trainingFollowupPlan(changedEntries(followup.base,head),followup.base,head));
 assert.equal(git('rev-parse',head+':server-version/'+component),git('rev-parse',binding.head+':server-version/'+component));
 for(const ref of [head,binding.head])assert.equal(git('rev-parse',ref+':.github/scripts/training-followup-checks.mjs'),binding.checkerBlob);
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'};
 async function api(path){const response=await fetch('https://api.github.com/repos/'+repository+path,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);return response.json();}
 const [run,job]=await Promise.all([api('/actions/runs/'+binding.runId),api('/actions/jobs/'+selected.jobId)]);
 verifySourceJob(run,job,component);
 const directory=resolve('training-followup-evidence');mkdirSync(directory,{recursive:true});
 async function archive(expected,label){
  const metadata=await api('/actions/artifacts/'+expected.id);
  assert.equal(metadata.expired,false);assert.equal(metadata.workflow_run.id,binding.runId);
  assert.equal(metadata.workflow_run.head_sha,binding.head);assert.equal(metadata.name,expected.name);assert.equal(metadata.digest,expected.digest);
  assert.ok(metadata.size_in_bytes>0&&metadata.size_in_bytes<(label==='build'?50*1024*1024:5*1024*1024));
  const response=await fetch('https://api.github.com/repos/'+repository+'/actions/artifacts/'+expected.id+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});assert.equal(response.status,302);
  const location=new URL(response.headers.get('location'));assert.equal(location.protocol,'https:');assert.ok(location.hostname.endsWith('.blob.core.windows.net')||location.hostname.endsWith('.actions.githubusercontent.com'));
  const download=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(download.status,200);
  const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,metadata.size_in_bytes);assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),expected.digest);
  const path=resolve(directory,component+'-'+label+'-source.zip');writeFileSync(path,bytes);return path;
 }
 const reportArchive=await archive(selected.report,'report');
 const readZip=name=>JSON.parse(execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read(sys.argv[2]).decode())',reportArchive,name],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const report=readZip(component+'-tests.json'),commands=readZip(component+'-commands.json');
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.equal(report.numPassedTests,selected.passed);
 for(const file of followup[component+'Tests'])assert.ok(report.testResults.some(test=>test.name.endsWith('/server-version/'+component+'/'+file)&&test.status==='passed'&&test.assertionResults.length&&test.assertionResults.every(item=>item.status==='passed')),file);
 assert.equal(commands.head,binding.merge);assert.equal(commands.product,followup.product);assert.equal(commands.node,'v24.21.0');assert.equal(commands.componentTree,followup.components[component]);
 assert.equal(commands.commands.length,4);assert.ok(commands.commands.every(command=>command.exitCode===0));unlinkSync(reportArchive);
 if(component==='frontend'){
  const build=await archive(selected.build,'build');
  execFileSync('python3',['-c',`import zipfile,sys,pathlib,stat
z=zipfile.ZipFile(sys.argv[1]); assert sum(i.file_size for i in z.infolist())<300*1024*1024
for i in z.infolist():
 p=pathlib.PurePosixPath(i.filename); assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)
assert 'index.html' in z.namelist()
z.extractall('server-version/frontend/dist')`,build],{stdio:'inherit'});unlinkSync(build);
 }
 const receipt={status:'REUSED_OFFICIAL_PASSED_STAGES',currentHead:head,component,componentTree:followup.components[component],sourceHead:binding.head,sourceMerge:binding.merge,sourceRun:binding.runId,sourceJob:selected.jobId,sourceReport:selected.report,sourceBuild:selected.build??null,passed:report.numPassedTests,originalOverallRunConclusion:run.conclusion,originalBrowser:'failure retained; not admitted; new HTTPS browser check required'};
 writeFileSync(resolve(directory,component+'-reuse.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
