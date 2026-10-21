import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {integratedBinding as binding,trainingWorkspacePlan,verifyIntegratedWorkspaceBrowser} from './training-workspace-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const root=process.env.GITHUB_WORKSPACE||process.cwd(),evidence=resolve(root,'training-workspace-integrated-evidence');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',...options});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const prior={"run":39683688600,"head":"ceed5ef08404c88ee7e3b659dbedc2b047f911b2","checkout":"0f59f4d671129878f9834b088afacd8826fd38b7","jobs":{"backend":119512418354,"frontend":119512418427,"codeql":119512417440},"artifacts":{"backend":{"images":{"id":12385412992,"name":"workspace-integrated-backend-images-0f59f4d671129878f9834b088afacd8826fd38b7","size_in_bytes":805266979,"digest":"sha256:bfec7dd4437244b9dbffcd3bd07c70e9cb887f4f36098df9fec3510c0947cb25"},"reports":{"id":12384619093,"name":"workspace-integrated-backend-reports-0f59f4d671129878f9834b088afacd8826fd38b7","size_in_bytes":245747,"digest":"sha256:a68a882c319b1c8226db1bf86f91e4ac2124a9c88b73133053766240856b0820"}},"frontend":{"images":{"id":12383894682,"name":"workspace-integrated-frontend-images-0f59f4d671129878f9834b088afacd8826fd38b7","size_in_bytes":395366788,"digest":"sha256:f90a30edcab3d4026a401e8aedefaaacfc21a8caf3df9d1a2bb0dc05e3468d53"},"reports":{"id":12385437197,"name":"workspace-integrated-frontend-reports-0f59f4d671129878f9834b088afacd8826fd38b7","size_in_bytes":55293,"digest":"sha256:0d4d38d634324ff8bed3abf3c6f386aadf433f5b37a9b5717950e81395491293"}}}};
const failedSuite='src/__tests__/measurement-content/runtime-table-policy.test.ts';
export function validatePriorTests(report,selected,component){
 assert.equal(report.testResults.length,selected.length);
 let reused=0;
 for(const file of selected){const suites=report.testResults.filter(s=>s.name==='/app/'+file);assert.equal(suites.length,1);const suite=suites[0];if(component==='backend'&&file===failedSuite){assert.equal(suite.status,'failed');assert.equal(suite.assertionResults.filter(a=>a.status==='failed').length,1);continue}assert.equal(suite.status,'passed');assert(suite.assertionResults.length);assert(suite.assertionResults.every(a=>a.status==='passed'));reused+=suite.assertionResults.length}
 return reused;
}
const mode=process.argv[2];
if(mode==='codeql-config'){
 run('git',['fetch','--no-tags','https://github.com/caohuibj/eduK12-new-version.git',prior.head]);
 const paths=run('git',['diff','--name-only',prior.head,'HEAD']).trim().split('\n').filter(p=>/\.(?:[cm]?[jt]sx?)$/.test(p));assert(paths.length);
 appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify({paths})+'\n');
}else if(mode==='scope'){
 const head=run('git',['rev-parse','HEAD']).trim();
 assert.deepEqual(JSON.parse(process.env.PLAN),trainingWorkspacePlan(changedEntries(binding.base,head),binding.base,head));
 // Unchanged scientific generators/registries: compiler invocation replaces only their redundant checks.
 for(const path of binding.unchangedGeneratorInputs)assert.equal(run('git',['rev-parse',binding.base+':'+path]).trim(),run('git',['rev-parse','HEAD:'+path]).trim(),path);
 }else if(mode==='resume'){
 assert(process.env.GITHUB_TOKEN,'Read-only Actions token required');
 const api=async path=>{const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});assert(r.ok,'Official evidence unavailable');return r.json()};
 const original=await api('actions/runs/'+prior.run);assert.equal(original.head_sha,prior.head);assert.equal(original.status,'completed');assert.equal(original.conclusion,'failure');assert.equal(original.run_attempt,1);
 const jobs=await api('actions/runs/'+prior.run+'/jobs?per_page=100');
 for(const [c,id]of Object.entries(prior.jobs)){const job=jobs.jobs.find(j=>j.id===id);assert(job);assert.equal(job.conclusion,c==='backend'?'failure':'success');if(c==='backend')assert(job.steps.some(s=>s.name==='compile once and retain actual builder and runtime bytes'&&s.conclusion==='success'))}
 run('git',['fetch','--no-tags','https://github.com/caohuibj/eduK12-new-version.git',prior.head]);
 const allowedChanges=['.github/scripts/training-workspace-integrated-evidence.mjs','.github/scripts/training-workspace-integrated-checks.mjs','.github/scripts/training-workspace-integrated-recovery.mjs','.github/scripts/training-workspace-scope.test.mjs','.github/workflows/ci-training-workspace-integrated.yml'];
 const changed=run('git',['diff','--name-only',prior.head,'HEAD']).trim().split('\n');assert(changed.every(p=>allowedChanges.includes(p)));
 for(const path of ['server-version','.github/release-tools','.github/scripts/training-workspace-integrated-build.sh','.github/scripts/training-workspace-integrated-backend.sh','.github/scripts/measurement-browser-ci.py'])assert.equal(run('git',['rev-parse',prior.head+':'+path]).trim(),run('git',['rev-parse','HEAD:'+path]).trim(),path);
 const recoveryPath='.github/scripts/training-workspace-integrated-recovery.mjs';
 assert.equal(readFileSync(resolve(root,recoveryPath),'utf8').replace('(process.env.TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD||process.env.GITHUB_SHA)','process.env.GITHUB_SHA'),run('git',['show',prior.head+':'+recoveryPath]));
 for(const key of ['backendTests','frontendTests','postgresTests','unchangedGeneratorInputs'])assert.deepEqual(binding[key],JSON.parse(run('git',['show',prior.head+':.github/scripts/training-workspace-integrated-bindings.json']))[key]);
 mkdirSync(evidence,{recursive:true});
 for(const component of ['backend','frontend']){
  const dir=resolve(evidence,component);mkdirSync(dir,{recursive:true});
  for(const kind of ['reports','images']){
   const pin=prior.artifacts[component][kind],meta=await api('actions/artifacts/'+pin.id);
   for(const k of ['id','name','size_in_bytes','digest'])assert.equal(meta[k],pin[k]);assert.equal(meta.expired,false);assert.equal(meta.workflow_run.id,prior.run);assert.equal(meta.workflow_run.head_sha,prior.head);
   const archive=resolve(process.env.RUNNER_TEMP,`workspace-${component}-${kind}.zip`);
   const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+pin.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN}});assert(response.ok);
   // Stream large immutable archives; never log redirect URLs or authorization.
   const {Readable}=await import('node:stream');const {pipeline}=await import('node:stream/promises');const {createWriteStream,statSync}=await import('node:fs');
   await pipeline(Readable.fromWeb(response.body),createWriteStream(archive));assert.equal(statSync(archive).size,pin.size_in_bytes);assert.equal(hash(archive),pin.digest.slice(7));
   const destination=kind==='reports'?dir:resolve(root,'training-workspace-integrated-images',component);mkdirSync(destination,{recursive:true});
   run('python3',['-c',"import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in z.namelist()); assert z.testzip() is None; z.extractall(sys.argv[2])",archive,destination]);
  }
  assert.equal(readFileSync(resolve(dir,'source-head.txt'),'utf8').trim(),prior.checkout);assert.equal(readFileSync(resolve(dir,'source-run.txt'),'utf8').trim(),String(prior.run));
  const archive=resolve(root,'training-workspace-integrated-images',component,'images.tar.gz');assert.equal(hash(archive),readFileSync(resolve(dir,'images.sha256'),'utf8').trim().split(/\s+/)[0]);
  const report=JSON.parse(readFileSync(resolve(dir,component+'-tests.json')));const selected=binding[component+'Tests'];const reused=validatePriorTests(report,selected,component);assert.equal(reused,component==='backend'?117:284);
  if(component==='frontend'){
   assert.equal(report.numPassedTests,284);assert.equal(report.numFailedTests,0);assert.equal(JSON.parse(readFileSync(resolve(dir,'checks.json'))).status,'PASS');
   const audit=JSON.parse(readFileSync(resolve(dir,'audit.json')));assert.equal(audit.metadata.vulnerabilities.high,0);assert.equal(audit.metadata.vulnerabilities.critical,0);
   const scan=JSON.parse(readFileSync(resolve(dir,'runtime-scan.json')));assert(scan.Results?.length);assert(!scan.Results.some(r=>(r.Vulnerabilities||[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion)));
  }else {assert.equal(report.numPassedTests,122);assert.equal(report.numFailedTests,1);writeFileSync(resolve(dir,'prior-backend-tests.json'),JSON.stringify(report));}
  run('docker',['load','-i',archive],{stdio:'inherit'});const originalImages=JSON.parse(readFileSync(resolve(dir,'images.json')));assert.equal(originalImages.length,2);
  for(const kind of ['builder','runtime']){const tag=`training-workspace-integrated-${component}-${kind}:${prior.checkout}`;const current=JSON.parse(run('docker',['image','inspect',tag]))[0];const old=originalImages.find(r=>r.RepoTags.includes(tag));assert(old);assert.equal(current.Id,old.Id);assert.equal(current.Config.Labels['org.opencontainers.image.revision'],prior.checkout)}
 }
 appendFileSync(process.env.GITHUB_ENV,`TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD=${prior.checkout}\nTRAINING_WORKSPACE_FRONTEND_IMAGE_HEAD=${prior.checkout}\n`);
 writeFileSync(resolve(evidence,'prior-qualification.json'),JSON.stringify({status:'ACCEPTED_PRIOR',run:prior.run,head:prior.head,originalConclusion:'failure',frontendPassed:284,backendReusedSuites:9,backendFailedSuite:failedSuite,compilationRepeated:false}));
}else if(mode==='browser-report'){
 const directory=resolve(evidence,'browser');
 const accepted=verifyIntegratedWorkspaceBrowser(JSON.parse(readFileSync(resolve(directory,'result.json'))),{head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,directory});
 writeFileSync(resolve(evidence,'browser-accepted.json'),JSON.stringify(accepted));
}else if(mode) throw Error('Explicit known evidence mode required');
