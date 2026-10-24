import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {binding,trainingAdminIntegrationPlan} from './training-admin-integration-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const objects=new Map();const git=(...a)=>{const key=JSON.stringify(a);if(!objects.has(key))objects.set(key,execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());return objects.get(key)};
const output='training-admin-integration-evidence';
const receipt=(name,data)=>{mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n')};
export function verifyReviewedEvidence(read=readFileSync,object=git){
 const bytes=read('.github/evidence/training-admin-integration/reviewed-local.json');assert.equal(sha(bytes),binding.evidenceSHA256,'Reviewed evidence drift');
 const e=JSON.parse(bytes);assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 const reports={};for(const [id,r]of Object.entries(e.reports)){const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(raw.length,r.bytes);assert.equal(sha(raw),r.sha256);reports[id]=JSON.parse(raw)}
 assert.equal(reports.courseExit.exitCode,0);assert.equal(reports.course.numFailedTests,0);assert.equal(reports.course.numPassedTests,16);
 const suite=reports.course.testResults.find(x=>x.name.endsWith('/src/training/TrainingAdminCourses.test.tsx'));assert.equal(suite.assertionResults.length,16);assert(suite.assertionResults.every(x=>x.status==='passed'));
 for(const [file,blob]of Object.entries(e.courseInputs)){assert.equal(object('rev-parse',e.source+':'+file),blob);assert.equal(object('rev-parse','HEAD:'+file),blob,'Reused course input changed: '+file)}
 for(const [file,digest]of Object.entries(e.testedSourceSHA256))assert.equal(sha(read(file)),digest,'Original course input changed: '+file);
 assert.equal(reports.courseLint.exitCode,0);assert.equal(reports.resourceChecks.find(x=>x.name==='lint').exitCode,0);
 for(const [file,digest]of Object.entries(e.lintInputs))assert.equal(sha(read(file)),digest,'Reused lint input changed: '+file);
 for(const [file,blob]of Object.entries(e.lintConfigInputs))assert.equal(object('rev-parse','HEAD:'+file),blob,'Reused lint configuration changed');
 for(const [file,digest]of Object.entries(e.controlSHA256))assert.equal(sha(read(file)),digest,'Reviewed qualification control drift: '+file);
 assert.deepEqual(Object.keys(e.controlSHA256).sort(),binding.controls.filter(f=>f!=='.github/scripts/training-admin-integration-bindings.json'&&!f.startsWith('.github/evidence/')).sort());
 const c=e.controlObservation;assert.equal(c.exitCode,1);assert.equal(c.passed,23);assert.equal(c.total,24);assert.equal(c.acceptedUnchangedCases,0);assert(c.invalidation);
 const original=gunzipSync(Buffer.from(c.testSourceGzipBase64,'base64'));assert.equal(sha(original),c.testSourceSHA256);

 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,acceptedCases:16,acceptedUnchangedControlCases:0,acceptedLintFiles:Object.keys(e.lintInputs),limits:e.limits};
}
export function verifyTests(report,files){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.equal(report.numTodoTests,0);
 const normalized=s=>s.replace(/\\/g,'/').split('/src/').at(-1);
 assert.deepEqual(report.testResults.map(s=>normalized(s.name)).sort(),files.map(f=>f.replace(/^src\//,'')).sort());
 for(const s of report.testResults){assert.equal(s.status,'passed');assert(s.assertionResults.length);assert(s.assertionResults.every(x=>x.status==='passed'))}
 return {cases:report.numPassedTests,files:files.length};
}
async function verifyOfficial(kind){
 const r=binding.resume;assert.ok(process.env.GH_TOKEN,'Official Actions read token required');assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 const api=async path=>{const x=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(x.status,200,'Original official evidence unavailable');return x};
 const run=await(await api('actions/runs/'+r.run)).json();assert.equal(run.head_sha,r.source);assert.equal(run.head_branch,'work/survey-training-branding-20261023');assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 const id=kind==='sast'?r.sastJob:r.admissionJob,job=await(await api('actions/jobs/'+id)).json();assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.source);assert.equal(job.status,'completed');assert.equal(job.name,kind==='sast'?'codeql (javascript/typescript SAST)':'training-admin-admission');
 const age=Date.now()-Date.parse(job.completed_at);assert(age>=-300000&&age<86400000,'Original stage expired');
 if(kind==='sast'){
  assert.equal(job.conclusion,'success');for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'));
  for(const [c,tree]of Object.entries(binding.components)){assert.equal(git('rev-parse',r.source+':server-version/'+c),tree);assert.equal(git('rev-parse','HEAD:server-version/'+c),tree)}
  const changed=git('diff','--name-only','--no-renames',r.source,'HEAD').split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f));assert.deepEqual(changed.sort(),[...r.changedCodeqlFiles].sort(),'Unreviewed application/SAST input drift');
  receipt('official-sast-reuse',{kind:'official-successful-stage-reuse',run:r.run,job:id,source:r.source,originalConclusion:job.conclusion,unchangedApplicationRescanned:false,changedControls:r.changedCodeqlFiles});
  return r.changedCodeqlFiles;
 }
 assert.equal(job.conclusion,'failure','Retain original failed job');assert(job.steps.some(s=>s.name==='admit exact existing course assertions and source-bound lint'&&s.conclusion==='success'));
 const bytes=Buffer.from(await(await api('actions/jobs/'+id+'/logs')).arrayBuffer());assert.equal(sha(bytes),r.logSHA256,'Original control log drift');
 const text=bytes.toString().replace(/\x1b\[[0-9;]*m/g,'');const passed=[...text.matchAll(/✔ (.*?) \([\d.]+ms\)/g)].map(x=>x[1]);assert.equal(passed.length,23);assert(text.includes('undefined !== 1'));
 assert.equal(r.acceptedControlCases.length,21);for(const name of r.acceptedControlCases)assert(passed.includes(name));
 for(const file of ['.github/scripts/training-admin-integration-scope.mjs','.github/scripts/merge-gate.mjs'])assert.equal(git('rev-parse',r.source+':'+file),git('rev-parse','HEAD:'+file));
 const old=JSON.parse(execFileSync('git',['show',r.source+':.github/scripts/training-admin-integration-bindings.json'],{encoding:'utf8'}));for(const key of ['base','product','source','controls','controlBefore','components','protectedInputs','frontendTests','backendTests'])assert.deepEqual(binding[key],old[key],'Passed control input drift: '+key);
 const omitted=['requires every selected assertion','admits only original unchanged','bounded inline workflow'];const stable=t=>t.split('\n').filter(line=>!omitted.some(x=>line.startsWith("test('"+x))).join('\n');assert.equal(stable(readFileSync('.github/scripts/training-admin-integration.test.mjs','utf8')),stable(execFileSync('git',['show',r.source+':.github/scripts/training-admin-integration.test.mjs'],{encoding:'utf8'})));
 receipt('official-control-reuse',{kind:'official-passed-assertion-reuse',run:r.run,job:id,source:r.source,originalJobConclusion:'failure',logSHA256:r.logSHA256,accepted:21,currentAffectedCases:3,wholeOriginalInvocationPassed:false});
 return 21;
}
const run=(args,cwd)=>execFileSync(process.execPath,args,{cwd,stdio:'inherit',timeout:300000});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(trainingAdminIntegrationPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));receipt('admission',{...verifyReviewedEvidence(),head,officialAcceptedControls:await verifyOfficial('controls')});
 }else if(action==='frontend'||action==='backend'){
  const files=binding[action+'Tests'];assert(files.length);assert(files.every(f=>/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(f)));
  if(action==='frontend'){
   const accepted=new Set(Object.keys(JSON.parse(readFileSync('.github/evidence/training-admin-integration/reviewed-local.json')).lintInputs));
   const changed=Object.keys(binding.source).filter(f=>f.startsWith('server-version/frontend/src/')&&/\.tsx?$/.test(f)&&!accepted.has(f)).map(f=>f.replace('server-version/frontend/',''));
   run(['node_modules/eslint/bin/eslint.js',...changed],'server-version/frontend');
  }
  const file=resolve(output,action+'-tests.json');mkdirSync(output,{recursive:true});
  run(['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+file],'server-version/'+action);
  receipt(action+'-verified',verifyTests(JSON.parse(readFileSync(file)),files));
 }else if(action==='codeql-config'){
  const paths=await verifyOfficial('sast');assert.equal(paths.length,2);writeFileSync(process.env.GITHUB_OUTPUT,`config=${JSON.stringify({paths})}\n`,{flag:'a'});
 }else throw Error('Unknown bounded action');
}
