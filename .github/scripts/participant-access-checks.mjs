import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,participantAccessPlan} from './participant-access-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Checkout and historical objects are immutable during one qualification process.
// Share identical object reads across the per-case imported-source closures.
const gitObjects=new Map();
const git=(...a)=>{const key=JSON.stringify(a);if(!gitObjects.has(key))gitObjects.set(key,execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());return gitObjects.get(key);};
const output='participant-access-evidence';
const receipt=(name,data)=>{mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n');};
export function verifyEvidence(read=readFileSync,resolve=git){
 const bytes=read('.github/evidence/participant-access/reviewed-local.json');assert.equal(sha(bytes),binding.evidenceSHA256,'Evidence bytes changed');
 const e=JSON.parse(bytes);assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);assert.equal(e.product,binding.product);
 const reports={};for(const r of e.reports){const raw=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});assert.equal(sha(raw),r.sha256);assert.equal(raw.length,r.bytes);const d=JSON.parse(raw);assert.equal(d.numPassedTests,r.passed);assert.equal(d.numFailedTests,r.failed);reports[r.id]=d;}
 const seen=new Set();for(const c of e.accepted){const key=c.file+'\n'+c.name;assert(!seen.has(key),'Duplicate admitted assertion');seen.add(key);
  const suite=reports[c.report]?.testResults.find(s=>s.name.endsWith('/'+c.file));assert.equal(suite?.assertionResults.find(t=>t.fullName===c.name)?.status,'passed','Missing original passed assertion');
  for(const[file,blob]of Object.entries(c.inputs)){assert.match(blob,/^[a-f0-9]{40}$/);assert.equal(resolve('rev-parse','HEAD:'+file),blob,'Admitted input drift: '+file);assert.equal(resolve('rev-parse',c.source+':'+file),blob,'Reviewed source input mismatch: '+file);}
 }
 assert.equal(seen.size,binding.acceptedCases);assert.equal(e.missing.length,binding.missingCases);
 assert.equal(new Set(e.missing.map(c=>c.file+'\n'+c.name)).size,e.missing.length);
 for(const c of e.missing)assert(!seen.has(c.file+'\n'+c.name),'A passed current case must not be rerun');
 const types=e.localChecks.frontendTypes;assert.equal(types.kind,'reviewed-local-execution');assert.equal(types.contemporaneousReceiptFile,false);assert.equal(types.toolResultCopiedFromObservedExecution.exit_code,0);assert.equal(types.sourceTree,binding.components.frontend);assert.equal(types.command,'node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit');
 const build=e.localChecks.frontendBuild;assert.equal(build.kind,'reviewed-local-build');assert.equal(build.sourceTree,binding.components.frontend);const buildLog=gunzipSync(Buffer.from(build.gzipBase64,'base64'),{maxOutputLength:1024*1024});assert.equal(sha(buildLog),build.logSha256);assert(buildLog.toString().includes('built in 16.71s'));
 for(const[file,digest]of Object.entries(build.artifactManifest.source_hashes))assert.equal(sha(read('server-version/frontend/'+file)),digest,'Built source drift: '+file);
 assert(Object.keys(build.artifactManifest.files).length>600,'Original artifact manifest missing');
 for(const[file,digest]of Object.entries(e.controlSHA256))assert.equal(sha(read(file)),digest,'Admission control drift: '+file);
 assert.deepEqual(Object.keys(e.controlSHA256).sort(),binding.controls.filter(f=>f!=='.github/scripts/participant-access-bindings.json'&&!f.startsWith('.github/evidence/')).sort());
 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,acceptedUniqueCases:seen.size,missingCases:e.missing.length,originalFailuresRetained:true,limits:e.limits};
}
export function verifyMissingReport(report,expected){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);
 const actual=report.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='passed').map(t=>({file:s.name.split('/server-version/')[1]?'server-version/'+s.name.split('/server-version/')[1]:s.name,name:t.fullName})));
 const keys=rows=>rows.map(c=>c.file+'\n'+c.name).sort();assert.deepEqual(keys(actual),keys(expected),'Missing or unexpected current assertions');return {passed:actual.length,filtered:report.numPendingTests};
}
async function officialAudit(){
 const r=binding.audit;assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 const api=async path=>{const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(response.status,200,'Official audit unavailable');return response;};
 const [run,job,artifact]=await Promise.all([api(`actions/runs/${r.run}`).then(x=>x.json()),api(`actions/jobs/${r.job}`).then(x=>x.json()),api(`actions/artifacts/${r.artifact}`).then(x=>x.json())]);
 assert.equal(run.head_sha,r.source);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.source);assert.equal(job.name,'school-teacher / security');assert.equal(job.conclusion,'success');assert.equal(job.status,'completed');
 assert(job.steps.some(s=>s.name==='run current frontend and backend HIGH CRITICAL dependency audits'&&s.conclusion==='success'));
 const age=Date.now()-Date.parse(job.completed_at);assert(age>=0&&age<86400000,'Official audit expired');
 assert.equal(artifact.workflow_run.id,r.run);assert.equal(artifact.workflow_run.head_sha,r.source);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,r.bytes);assert.equal(artifact.digest,'sha256:'+r.sha256);assert.equal(artifact.name,r.name);
 for(const f of r.inputs){assert.equal(git('rev-parse',r.source+':'+f),git('rev-parse','HEAD:'+f),'Audit input changed: '+f);}
 const zip=Buffer.from(await(await api(`actions/artifacts/${r.artifact}/zip`)).arrayBuffer());assert.equal(zip.length,r.bytes);assert.equal(sha(zip),r.sha256);
 const files=JSON.parse(execFileSync('python3',['-c',"import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert all(i.filename.endswith('.json') and i.file_size<1000000 and not i.filename.startswith('/') and '..' not in i.filename.split('/') for i in z.infolist()); assert sum(i.file_size for i in z.infolist())<2000000; print(json.dumps({i.filename:z.read(i).decode() for i in z.infolist()}))"],{input:zip,encoding:'utf8',maxBuffer:4*1024*1024}));
 const read=name=>{const found=Object.entries(files).filter(([p])=>p.split('/').at(-1)===name);assert.equal(found.length,1);return JSON.parse(found[0][1]);};
 const {verifyCompletedAudit}=await import('./school-teacher-checks.mjs');const completed=verifyCompletedAudit(read);
 receipt('official-audit-reuse',{kind:'official-successful-component-reuse',originalRun:r.run,originalJob:r.job,originalSource:r.source,artifact:r.artifact,sha256:r.sha256,currentAuditExecuted:false,completed});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');assert.deepEqual(participantAccessPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));receipt('local-admission',{...verifyEvidence(),head,components:binding.components});
 }else if(action==='audit')await officialAudit();
 else if(action==='missing'){
  const e=JSON.parse(readFileSync('.github/evidence/participant-access/reviewed-local.json'));assert.equal(sha(readFileSync('.github/evidence/participant-access/reviewed-local.json')),binding.evidenceSHA256);
  const files=[...new Set(e.missing.map(c=>c.file.replace('server-version/frontend/','')))];assert(files.every(f=>f.startsWith('src/')));
  const regex='^(?:'+e.missing.map(c=>c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
  execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','-t',regex,'--reporter=json',`--outputFile=../../${output}/missing-tests.json`],{cwd:'server-version/frontend',stdio:'inherit'});
  receipt('missing-tests-verified',verifyMissingReport(JSON.parse(readFileSync(`${output}/missing-tests.json`)),e.missing));
 }else throw Error('Unknown participant access qualification action');
}
