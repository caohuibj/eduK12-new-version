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
export function validateQualifiedPostgres(report,selected){
 assert.equal(report.success,true);assert.equal(report.numPassedTests,20);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,1);assert.equal(report.testResults.length,selected.length);
 let excluded=0,passed=0;
 for(const file of selected){const suites=report.testResults.filter(s=>s.name==='/app/'+file);assert.equal(suites.length,1);const suite=suites[0];assert.equal(suite.status,'passed');assert(suite.assertionResults.length);
  for(const item of suite.assertionResults){if(file==='src/__tests__/integration/checkinSchedule.postgres.integration.test.ts'&&item.fullName==='checkin schedule PostgreSQL transaction contract live API scheduler publishes a due disposable fixture without a browser remaining open'){assert.equal(item.status,'skipped');excluded++}else {assert.equal(item.status,'passed');passed++}}
 }assert.equal(excluded,1);assert.equal(passed,20);return 20;
}
const mode=process.argv[2];
if(mode==='codeql-config'){
 const lastSuccessfulAnalysisHead='af05a63aeec023ee98cbba004ada90b52e5b6dc6';
 run('git',['fetch','--no-tags','https://github.com/caohuibj/eduK12-new-version.git',lastSuccessfulAnalysisHead]);
 const paths=run('git',['diff','--name-only',lastSuccessfulAnalysisHead,'HEAD']).trim().split('\n').filter(p=>/\.(?:[cm]?[jt]sx?)$/.test(p));assert(paths.length);
 appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify({paths})+'\n');
}else if(mode==='scope'){
 const head=run('git',['rev-parse','HEAD']).trim();
 assert.deepEqual(JSON.parse(process.env.PLAN),trainingWorkspacePlan(changedEntries(binding.base,head),binding.base,head));
 // Unchanged scientific generators/registries: compiler invocation replaces only their redundant checks.
 for(const path of binding.unchangedGeneratorInputs)assert.equal(run('git',['rev-parse',binding.base+':'+path]).trim(),run('git',['rev-parse','HEAD:'+path]).trim(),path);
 }else if(mode==='resume'){
 assert(process.env.GITHUB_TOKEN,'Read-only Actions token required');
 const api=async path=>{const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});assert(r.ok,'Official evidence unavailable');return r.json()};
 const latestAnalysisRun=await api('actions/runs/39688107827');assert.equal(latestAnalysisRun.head_sha,'af05a63aeec023ee98cbba004ada90b52e5b6dc6');assert.equal(latestAnalysisRun.status,'completed');assert.equal(latestAnalysisRun.conclusion,'failure');const latestAnalysisJobs=await api('actions/runs/39688107827/jobs?per_page=100');assert.equal(latestAnalysisJobs.jobs.find(j=>j.id===119527306747)?.conclusion,'success');
 const original=await api('actions/runs/'+prior.run);assert.equal(original.head_sha,prior.head);assert.equal(original.status,'completed');assert.equal(original.conclusion,'failure');assert.equal(original.run_attempt,1);
 const jobs=await api('actions/runs/'+prior.run+'/jobs?per_page=100');
 for(const [c,id]of Object.entries(prior.jobs)){const job=jobs.jobs.find(j=>j.id===id);assert(job);assert.equal(job.conclusion,c==='backend'?'failure':'success');if(c==='backend')assert(job.steps.some(s=>s.name==='compile once and retain actual builder and runtime bytes'&&s.conclusion==='success'))}
 run('git',['fetch','--no-tags','https://github.com/caohuibj/eduK12-new-version.git',prior.head]);
 const allowedChanges=['.github/scripts/training-workspace-integrated-evidence.mjs','.github/scripts/training-workspace-integrated-checks.mjs','.github/scripts/training-workspace-integrated-recovery.mjs','.github/scripts/training-workspace-scope.test.mjs','.github/workflows/ci-training-workspace-integrated.yml','.github/scripts/training-workspace-integrated-bindings.json','server-version/frontend/src/training/training-workspace.css','server-version/e2e/training-workspace-integration-browser.cjs'];
 const changed=run('git',['diff','--name-only',prior.head,'HEAD']).trim().split('\n');assert(changed.every(p=>allowedChanges.includes(p)));
 for(const path of ['server-version/backend','.github/release-tools','.github/scripts/training-workspace-integrated-build.sh','.github/scripts/training-workspace-integrated-backend.sh','.github/scripts/measurement-browser-ci.py'])assert.equal(run('git',['rev-parse',prior.head+':'+path]).trim(),run('git',['rev-parse','HEAD:'+path]).trim(),path);
 const frontChanges=run('git',['diff','--name-only',prior.head,'HEAD','--','server-version/frontend']).trim().split('\n');assert.deepEqual(frontChanges,['server-version/frontend/src/training/training-workspace.css']);
 assert.equal(hash(resolve(root,'.github/scripts/training-workspace-integrated-recovery.mjs')),'b33c4df99112b8e0f85c83e1651fbb5dec0afe232a86b17d3cb1910c52a130ca');
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
 const qualified={"run":39685055338,"head":"2faae47d745fa2d53bc130c987f08817ba52f76c","componentJob":119517024530,"connectedJob":119517829888,"artifact":{"id":12386845537,"name":"training-workspace-integrated-connected-bbf9fbe4c57e7c74db9cbca236cd963798216c2d","size_in_bytes":397348,"digest":"sha256:9959f4825acbb9ee71da52a8c1350e23de176a19b0bb0196e63666d3225eb5d2"}};
 const qualifiedRun=await api('actions/runs/'+qualified.run);assert.equal(qualifiedRun.head_sha,qualified.head);assert.equal(qualifiedRun.conclusion,'failure');assert.equal(qualifiedRun.status,'completed');assert.equal(qualifiedRun.run_attempt,1);
 const qualifiedJobs=await api('actions/runs/'+qualified.run+'/jobs?per_page=100');assert.equal(qualifiedJobs.jobs.find(j=>j.id===qualified.componentJob)?.conclusion,'success');
 const connected=qualifiedJobs.jobs.find(j=>j.id===qualified.connectedJob);assert.equal(connected?.conclusion,'failure');assert(connected.steps.some(s=>s.name==='upgrade old synthetic schema and retain historical rows'&&s.conclusion==='success'));
 run('git',['fetch','--no-tags','https://github.com/caohuibj/eduK12-new-version.git',qualified.head]);assert.equal(run('git',['rev-parse',qualified.head+':server-version/backend']).trim(),run('git',['rev-parse','HEAD:server-version/backend']).trim());
 const pin=qualified.artifact,meta=await api('actions/artifacts/'+pin.id);for(const k of ['id','name','size_in_bytes','digest'])assert.equal(meta[k],pin[k]);assert.equal(meta.expired,false);assert.equal(meta.workflow_run.id,qualified.run);assert.equal(meta.workflow_run.head_sha,qualified.head);
 const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+pin.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN}});assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,pin.size_in_bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.digest.slice(7));
 const zip=resolve(process.env.RUNNER_TEMP,'workspace-qualified.zip'),accepted=resolve(evidence,'accepted-qualification');writeFileSync(zip,bytes);mkdirSync(accepted,{recursive:true});run('python3',['-c',"import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in z.namelist()); assert z.testzip() is None; z.extractall(sys.argv[2])",zip,accepted]);
 const backend=JSON.parse(readFileSync(resolve(accepted,'backend/backend-tests.json')));assert.equal(validatePriorTests(backend,[failedSuite],'frontend'),6);assert.equal(backend.numFailedTests,0);
 const checks=JSON.parse(readFileSync(resolve(accepted,'backend/checks.json')));assert.equal(checks.status,'PASS');assert.equal(checks.reportSHA256,hash(resolve(accepted,'backend/backend-tests.json')));
 const audit=JSON.parse(readFileSync(resolve(accepted,'backend/audit.json')));assert.equal(audit.metadata.vulnerabilities.high,0);assert.equal(audit.metadata.vulnerabilities.critical,0);
 const scan=JSON.parse(readFileSync(resolve(accepted,'backend/runtime-scan.json')));assert(scan.Results?.length);assert(!scan.Results.some(r=>(r.Vulnerabilities||[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion)));
 const runtimeTag='training-workspace-integrated-backend-runtime:'+prior.checkout;const runtimeImage=JSON.parse(run('docker',['image','inspect',runtimeTag]))[0];assert.equal(scan.Metadata.ImageID,runtimeImage.Id);assert.equal(scan.ArtifactName,runtimeTag);
 assert.equal(checks.ciRunId,String(qualified.run));assert.deepEqual(checks.suites,[failedSuite]);
 const pg=JSON.parse(readFileSync(resolve(accepted,'postgres/postgres-tests.json')));validateQualifiedPostgres(pg,binding.postgresTests);
 const migration=JSON.parse(readFileSync(resolve(accepted,'postgres/migration.json')));assert.equal(migration.status,'PASS');assert.equal(migration.base,binding.base);assert.deepEqual(migration.newEnums,['MEDIA_ASSET','FORM_TEMPLATE']);assert.equal(migration.productionMigrationClaim,false);assert(Object.values(migration.legacyDigests).every(x=>/^[a-f0-9]{32}$/.test(x)));
 assert.deepEqual(JSON.parse(readFileSync(resolve(accepted,'cleanup.json'))),{exitStatus:0,privateMaterialRemoved:true});
 writeFileSync(resolve(evidence,'qualified-continuation.json'),JSON.stringify({status:'ACCEPTED_PRIOR',run:qualified.run,head:qualified.head,originalConclusion:'failure',backendAdditionalPassed:6,postgresPassed:20,excludedOptionalLive:1,upgradeAccepted:true,restoreAndBrowserPreviouslyExecuted:false}));

 const restored={run:39686281699,head:'b85b3b767a269aa5ac1254accadf07f85cc8b710',job:119521962650,artifact:{"id": 12386987125, "name": "training-workspace-integrated-connected-4bea684fb63ddb5bbe60ac349881718a95e2c9ea", "size_in_bytes": 793912, "digest": "sha256:a9873de61236f90442d8c8cbad953d0ba4d54f3187244f8cc8164799850183c2"}};
 const restoreRun=await api('actions/runs/'+restored.run);assert.equal(restoreRun.head_sha,restored.head);assert.equal(restoreRun.status,'completed');assert.equal(restoreRun.conclusion,'failure');assert.equal(restoreRun.run_attempt,1);
 const restoreJobs=await api('actions/runs/'+restored.run+'/jobs?per_page=100');assert.equal(restoreJobs.jobs.find(j=>j.id===119521146466)?.conclusion,'success');const restoreJob=restoreJobs.jobs.find(j=>j.id===restored.job);assert.equal(restoreJob?.conclusion,'failure');assert(restoreJob.steps.some(s=>s.name==='nonempty bounded synthetic backup and restore'&&s.conclusion==='success'));
 const restorePin=restored.artifact,restoreMeta=await api('actions/artifacts/'+restorePin.id);for(const k of ['id','name','size_in_bytes','digest'])assert.equal(restoreMeta[k],restorePin[k]);assert.equal(restoreMeta.expired,false);assert.equal(restoreMeta.workflow_run.id,restored.run);assert.equal(restoreMeta.workflow_run.head_sha,restored.head);
 const restoreResponse=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+restorePin.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN}});assert(restoreResponse.ok);const restoreBytes=Buffer.from(await restoreResponse.arrayBuffer());assert.equal(restoreBytes.length,restorePin.size_in_bytes);assert.equal(createHash('sha256').update(restoreBytes).digest('hex'),restorePin.digest.slice(7));
 const restoreZip=resolve(process.env.RUNNER_TEMP,'workspace-restore.zip'),restoreDir=resolve(evidence,'accepted-restore');writeFileSync(restoreZip,restoreBytes);mkdirSync(restoreDir,{recursive:true});run('python3',['-c',"import sys,zipfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in z.namelist()); assert z.testzip() is None; z.extractall(sys.argv[2])",restoreZip,restoreDir]);
 assert.equal(hash(resolve(restoreDir,'postgres/restore.json')),'25327a30443da694503dd330e4c2f0da3e4050a63077a59176413884385e36a5');assert.equal(JSON.parse(readFileSync(resolve(restoreDir,'postgres/restore.json'))).status,'PASS');assert.deepEqual(JSON.parse(readFileSync(resolve(restoreDir,'cleanup.json'))),{exitStatus:0,privateMaterialRemoved:true});
 writeFileSync(resolve(evidence,'restore-accepted.json'),JSON.stringify({status:'ACCEPTED_PRIOR',run:restored.run,head:restored.head,originalConclusion:'failure',restoreReportSHA256:hash(resolve(restoreDir,'postgres/restore.json')),browserAccepted:false}));
 appendFileSync(process.env.GITHUB_ENV,`TRAINING_WORKSPACE_BACKEND_IMAGE_HEAD=${prior.checkout}\nTRAINING_WORKSPACE_FRONTEND_IMAGE_HEAD=${prior.checkout}\n`);
 writeFileSync(resolve(evidence,'prior-qualification.json'),JSON.stringify({status:'ACCEPTED_PRIOR',run:prior.run,head:prior.head,originalConclusion:'failure',frontendPassed:284,frontendChecksScope:'Unchanged TypeScript, logic tests and lock audit only; old image scan is PRIOR_IMAGE_ONLY after library CSS change',backendReusedSuites:9,backendFailedSuite:failedSuite,compilationRepeated:false}));
}else if(mode==='library-contrast'){
 const css=readFileSync(resolve(root,'server-version/frontend/src/training/training-workspace.css'),'utf8');
 const selectors=['.training-workspace-tabs a','.training-library-heading p','.training-library-toolbar label','.training-library-filter button','.training-library-filter>span','.training-library-badge','.training-library-kind','.training-library-description','.training-library-meta','.training-library-footnote','.training-library-empty'];
 const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 const ratios=[];for(const selector of selectors){const start=css.indexOf(selector+'{');assert(start>=0);const block=css.slice(start,css.indexOf('}',start));assert.match(block,/color:#526451(?:;|$)/);for(const background of ['#f8f5ee','#ffffff','#f4f6ef','#edf1e8']){const ratio=(luminance(background)+.05)/(luminance('#526451')+.05);assert(ratio>=4.5);ratios.push({selector,foreground:'#526451',background,ratio})}}
 assert(css.includes('.training-library input::placeholder{color:#526451;opacity:1}'));
 writeFileSync(resolve(evidence,'frontend/library-contrast.json'),JSON.stringify({status:'PASS',sourceCommit:process.env.GITHUB_SHA,ciRunId:process.env.GITHUB_RUN_ID,cssSHA256:hash(resolve(root,'server-version/frontend/src/training/training-workspace.css')),ratios,renderedAxeClaim:false}));
}else if(mode==='frontend-current'){
 const dir=resolve(evidence,'frontend-current'),archive=resolve(root,'training-workspace-integrated-images/frontend-current/images.tar.gz');
 assert.equal(readFileSync(resolve(dir,'source-head.txt'),'utf8').trim(),process.env.GITHUB_SHA);assert.equal(readFileSync(resolve(dir,'source-run.txt'),'utf8').trim(),process.env.GITHUB_RUN_ID);
 assert.equal(hash(archive),readFileSync(resolve(dir,'images.sha256'),'utf8').trim().split(/\s+/)[0]);run('docker',['load','-i',archive],{stdio:'inherit'});
 const expected=JSON.parse(readFileSync(resolve(dir,'images.json')));assert.equal(expected.length,2);
 for(const kind of ['builder','runtime']){const tag=`training-workspace-integrated-frontend-${kind}:${process.env.GITHUB_SHA}`,actual=JSON.parse(run('docker',['image','inspect',tag]))[0],old=expected.find(i=>i.RepoTags.includes(tag));assert(old);assert.equal(actual.Id,old.Id);assert.equal(actual.Config.Labels['org.opencontainers.image.revision'],process.env.GITHUB_SHA)}
 const scan=JSON.parse(readFileSync(resolve(dir,'runtime-scan.json')));const tag='training-workspace-integrated-frontend-runtime:'+process.env.GITHUB_SHA;assert.equal(scan.ArtifactName,tag);assert.equal(scan.Metadata.ImageID,JSON.parse(run('docker',['image','inspect',tag]))[0].Id);assert(scan.Results?.length);assert(!scan.Results.some(r=>(r.Vulnerabilities||[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion)));
 const contrast=JSON.parse(readFileSync(resolve(dir,'library-contrast.json')));assert.equal(contrast.status,'PASS');assert.equal(contrast.cssSHA256,hash(resolve(root,'server-version/frontend/src/training/training-workspace.css')));assert.equal(contrast.sourceCommit,process.env.GITHUB_SHA);assert.equal(contrast.ciRunId,process.env.GITHUB_RUN_ID);
 appendFileSync(process.env.GITHUB_ENV,`TRAINING_WORKSPACE_FRONTEND_IMAGE_HEAD=${process.env.GITHUB_SHA}\n`);
}else if(mode==='browser-report'){
 const directory=resolve(evidence,'browser');
 const accepted=verifyIntegratedWorkspaceBrowser(JSON.parse(readFileSync(resolve(directory,'result.json'))),{head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,directory});
 writeFileSync(resolve(evidence,'browser-accepted.json'),JSON.stringify(accepted));
}else if(mode) throw Error('Explicit known evidence mode required');
