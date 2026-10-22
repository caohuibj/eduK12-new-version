import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binding} from './survey-workspace-scope.mjs';
const repo='caohuibj/eduK12-new-version',origin='https://api.github.com/repos/'+repo;
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function verifyApplicationDelta(read=git){
 const r=binding.resume;assert.equal(r.run,39811690734);assert.equal(r.source,'90ca44116069071224ffcef735680fd708955df4');
 assert.equal(read('rev-parse','HEAD:server-version/backend'),r.backendTree);
 const files=read('diff','--name-only',r.source,'HEAD','--','server-version').split('\n');
 assert.deepEqual(files,['server-version/frontend/src/survey/survey-appearance.css'],'Only the reviewed analytics header CSS fix can reuse application evidence');
 const old=read('show',r.source+':'+files[0]),current=read('show','HEAD:'+files[0]);
 assert.equal(current.replace('.bg-slate-50,.bg-slate-100,.bg-gray-50','.bg-slate-50,.bg-gray-50'),old,'Unreviewed CSS delta');
 for(const file of ['.github/scripts/survey-workspace-fixture.mjs','.github/scripts/survey-workspace-migration.mjs','server-version/frontend/package-lock.json','server-version/frontend/tsconfig.app.json','server-version/frontend/vite.config.ts','server-version/backend/package-lock.json'])assert.equal(read('rev-parse',r.source+':'+file),read('rev-parse','HEAD:'+file),'Executor/config input drift: '+file);
 return r;
}
export function verifyRun(run){
 const r=binding.resume;assert.equal(run.id,r.run);assert.equal(run.head_sha,r.source);assert.equal(run.head_branch,'work/survey-visual-20261022');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.path,'.github/workflows/ci.yml');assert.ok(run.pull_requests.some(p=>p.number===336));
 // Preserve the parent failure. Only separately successful jobs or individual
 // completed browser checks are accepted; the failed run never becomes green.
 assert.equal(run.conclusion,'failure');
}
export function verifyJob(job,id,name,stages,now=Date.now()){
 assert.equal(job.id,id);assert.equal(job.run_id,binding.resume.run);assert.equal(job.name,name);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 const age=now-Date.parse(job.completed_at);assert.ok(Number.isFinite(age)&&age>=-300_000&&age<=24*60*60*1000,'Official evidence expired');
 for(const stage of stages){const s=job.steps.find(x=>x.name===stage);assert.equal(s?.status,'completed');assert.equal(s?.conclusion,'success',stage);}
}
export function verifyBrowser(report){
 const names=['entry-settings','form','scale','scale-application','composition','publish','reports'];assert.equal(report.status,'running');assert.equal(report.compiledDist,true);assert.equal(report.syntheticOnly,true);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpectedRequests,[]);assert.equal(report.checks.length,8);
 const accepted=report.checks.slice(0,7);assert.deepEqual(accepted.map(c=>c.scene),names);
 for(const c of accepted){assert.equal(c.width,1440);assert.equal(c.theme,'dark');assert.equal(c.overflow,false);assert.deepEqual(c.white,[]);assert.deepEqual(c.violations,[]);}
 const failed=report.checks[7];assert.equal(failed.scene,'data');assert.equal(failed.width,1440);assert.ok(failed.violations.some(v=>v.id==='color-contrast'));
 return accepted;
}
async function api(path,binary=false){
 assert.ok(process.env.GH_TOKEN,'GitHub read token required');const response=await fetch(origin+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.ok(response.ok,'Official GitHub request failed: '+response.status);return binary?Buffer.from(await response.arrayBuffer()):response.json();
}
async function artifact(id,digest,name,inner){
 const meta=await api('/actions/artifacts/'+id);assert.equal(meta.id,id);assert.equal(meta.name,name);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+digest);assert.equal(meta.workflow_run.id,binding.resume.run);assert.equal(meta.workflow_run.head_sha,binding.resume.source);
 const age=Date.now()-Date.parse(meta.created_at);assert.ok(Number.isFinite(age)&&age>=-300_000&&age<=86400000,'Official artifact expired');
 const bytes=await api('/actions/artifacts/'+id+'/zip',true);assert.equal(sha(bytes),digest,'Official artifact ZIP drift');
 const temp=mkdtempSync(join(tmpdir(),'survey-official-'));
 try{const file=join(temp,'artifact.zip');writeFileSync(file,bytes);const body=execFileSync('unzip',['-p',file,inner],{maxBuffer:8*1024*1024});return {body:JSON.parse(body),innerSha256:sha(body),zipSha256:digest,artifactId:id};}finally{rmSync(temp,{recursive:true,force:true});}
}
export async function verifyOfficial(mode='admission'){
 const r=verifyApplicationDelta();const run=await api('/actions/runs/'+r.run);verifyRun(run);
 const result={kind:'official-successful-component-reuse',originalRun:r.run,originalSource:r.source,originalParentConclusion:'failure',currentHead:git('rev-parse','HEAD'),mode,applicationRecompiled:false,sameRunFullJourneyClaim:false};
 if(mode==='backend'){
  const j=await api('/actions/jobs/119939669541');verifyJob(j,119939669541,'survey-workspace / backend',['validate and generate the corrected Prisma model','upgrade from main and restore only disposable synthetic database']);
  const a=await artifact(12440287737,'58145d0c0f73c83516d3b21ba14020834c18c7f87d0bddf244c353cbc31f1d8a','survey-workspace-backend-'+r.merge,'migration-restore.json');
  for(const key of ['disposableSyntheticOnly','baselinePreserved','existingDraftsRemainIncomplete','completionConstraint','selectionPreserved','nativeDumpRestore'])assert.equal(a.body[key],true);assert.equal(a.body.status,'passed');assert.equal(a.body.base,binding.base);assert.equal(a.body.head,r.merge);result.backend={jobId:j.id,...a};
 }else if(mode==='sast'){
  const j=await api('/actions/jobs/119939517555');verifyJob(j,119939517555,'codeql (javascript/typescript SAST)',['initialize CodeQL','analyze with CodeQL']);result.applicationSast={jobId:j.id,unchangedApplicationJsTs:true,currentControlScanRequired:true};
 }else{
  assert.equal(mode,'admission');const j=await api('/actions/jobs/119939669432');verifyJob(j,119939669432,'survey-workspace / frontend',['typecheck the integrated application','compile frontend exactly once']);result.frontendTypes={jobId:j.id,cssNotConsumedByTypeScript:true,currentCssCompilationRequired:true};
  const failedBrowser=await api('/actions/jobs/119940351992');assert.equal(failedBrowser.run_id,r.run);assert.equal(failedBrowser.name,'survey-workspace / browser');assert.equal(failedBrowser.status,'completed');assert.equal(failedBrowser.conclusion,'failure');
  const a=await artifact(12440726926,'b76aa6bc7e4d1b3609018ff96d04bc8ec916b577054199c775eea65ee9d8cfd7','survey-workspace-browser-'+r.merge,'browser.json');assert.equal(a.innerSha256,'4c8bda31b276e1f241419066055b2eca030e479939738bb66a8923e8b8961d07');result.acceptedBrowser=verifyBrowser(a.body);result.browserSource={artifactId:a.artifactId,zipSha256:a.zipSha256,innerSha256:a.innerSha256};
 }
 mkdirSync('survey-workspace-evidence',{recursive:true});writeFileSync('survey-workspace-evidence/official-'+mode+'.json',JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyOfficial(process.argv[2]||'admission')));
