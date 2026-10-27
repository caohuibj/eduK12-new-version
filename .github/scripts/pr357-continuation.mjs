/** One bounded continuation of the original official PR357 run. Not a general
 * evidence importer: fixed source/run/jobs/artifacts, exact unchanged inputs,
 * original failure reports preserved, only wholly passing files reusable. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {binding} from './pr357-scope.mjs';
import {treeDigest,verifyManifest} from './ci-artifact.mjs';
export const original={run:40432261300,head:'667b7fec3f19716aeb0fbf15811f4887b15da4c5',checkout:'2fa23b853f1cc31efecbbd45a8869733cd6287a6',tree:'a7556c0de9834cd27b3b983a6ec369c17a9468ba',backendTree:'100ae07d90a1bf9fc53b1df0a610008571f565dd'};
const repo='caohuibj/eduK12-new-version';
export const artifacts={
 frontend:{id:12703175288,sha:'0a99039587482a0e77c0e323ac177a5304f61fc843e6b26e45fd68b4e847beb7',prefix:'pr357-frontend-checks-',job:121952713677},
 backend:{id:12702122948,sha:'1c1f858e091b4f9f3594422fc88d1ba6e2e1916dce47bff5da94778c800b54cd',prefix:'pr357-backend-checks-',job:121952713588},
 build:{id:12702422597,sha:'86fd8bab952095ca943c75ecf89111883b7c04a1de6b8bded18d3dd5f8a1c49c',prefix:'pr357-backend-',job:121952713588},
 audit:{id:12703000745,sha:'dcd01c97d3c09251f7f960c994d2948746e4ab9838e6673e0ea9824d49bc32ee',prefix:'pr357-audit-',job:121952713641},
};
export const changedFixtureFiles=['src/huiteacher/HuiteacherAssessmentMediaHost.test.tsx','src/school/SchoolBoundContinuation.test.tsx'];
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),sha=x=>createHash('sha256').update(x).digest('hex');
export function verifyContinuationInputs(read=git){
 assert.equal(read('rev-parse',original.head+'^{tree}'),original.tree);
 assert.equal(read('rev-parse','HEAD:server-version/backend'),original.backendTree,'Backend source/dependency/config changed; original build and DB evidence inapplicable');
 assert.equal(read('rev-parse',original.head+':server-version/backend'),original.backendTree);
 const changed=read('diff','--name-only',original.head,'HEAD','--','server-version/frontend').split('\n').filter(Boolean).sort();
 assert.deepEqual(changed,changedFixtureFiles.map(p=>'server-version/frontend/'+p).sort(),'Only the two failed frontend fixtures may differ');
 const old=JSON.parse(read('show',original.head+':.github/scripts/pr357-bindings.json'));
 assert.deepEqual(binding.tests,old.tests,'Cannot drop/change requested consumers while admitting prior files');
 return {original,backendTree:original.backendTree,changedFrontendFixtures:changedFixtureFiles};
}
export function verifyOriginalArtifact(meta,kind,now=Date.now()){
 const a=artifacts[kind];assert(a);assert.equal(meta.id,a.id);assert.equal(meta.name,a.prefix+original.checkout);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+a.sha);assert.equal(meta.workflow_run.id,original.run);assert.equal(meta.workflow_run.head_sha,original.head);assert.equal(meta.workflow_run.head_branch,binding.branch);assert(meta.size_in_bytes>0&&meta.size_in_bytes<32*1024*1024);
 const age=now-Date.parse(meta.created_at);assert(age>=0&&age<86400000,'Original evidence outside bounded freshness window');return a;
}
async function trustedGet(url,options={}){let last;for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});if(![502,503,504].includes(response.status)||attempt===2)return response;await response.body?.cancel();}catch(error){last=error;if(attempt===2)throw error;}await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}throw last??new Error('Official GET unavailable');}
async function api(path){assert(process.env.GH_TOKEN,'Official Actions read token required');const r=await trustedGet('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'Official evidence read failed');return r.json();}
export async function loadOriginal(kind){
 assert.equal(process.env.GITHUB_ACTIONS,'true');verifyContinuationInputs();const a=artifacts[kind];assert(a);
 const run=await api('/actions/runs/'+original.run);assert.equal(run.head_sha,original.head);assert.equal(run.event,'pull_request');assert.equal(run.head_branch,binding.branch);assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.run_attempt,1);
 for(const id of [121952530408,121952617241]){const source=await api('/actions/jobs/'+id);assert.equal(source.run_id,original.run);assert.equal(source.head_sha,original.head);assert.equal(source.conclusion,'success');}
 const meta=await api('/actions/artifacts/'+a.id);verifyOriginalArtifact(meta,kind);
 const job=await api('/actions/jobs/'+a.job);assert.equal(job.run_id,original.run);assert.equal(job.head_sha,original.head);assert.equal(job.status,'completed');assert.equal(job.conclusion,kind==='audit'?'success':'failure');
 if(kind==='build')for(const name of ['compile backend once using the unchanged production build dependencies','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'),'Original producer step did not succeed');
 const response=await trustedGet('https://api.github.com/repos/'+repo+'/actions/artifacts/'+a.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual'});let bytes;
 if(response.status===302){const location=new URL(response.headers.get('location'));assert.equal(location.protocol,'https:');assert(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|s3\.amazonaws\.com)$/.test(location.hostname),'Unexpected artifact storage host');const r=await trustedGet(location);assert.equal(r.status,200);bytes=Buffer.from(await r.arrayBuffer());}
 else{assert.equal(response.status,200);bytes=Buffer.from(await response.arrayBuffer());}
 assert(bytes.length<32*1024*1024);assert.equal(sha(bytes),a.sha,'Original ZIP digest mismatch');
 const root=resolve(process.env.RUNNER_TEMP),dir=join(root,'pr357-original-'+kind),zip=dir+'.zip';mkdirSync(dir,{recursive:false});writeFileSync(zip,bytes,{mode:0o600});
 const names=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n');assert.equal(new Set(names).size,names.length);assert(names.every(n=>/^[A-Za-z0-9_./-]+$/.test(n)&&!n.startsWith('/')&&!n.split('/').includes('..')));
 execFileSync('unzip',['-q',zip,'-d',dir]);
 return {dir,proof:{run:original.run,head:original.head,checkout:original.checkout,artifactId:a.id,zipSHA256:a.sha,jobId:a.job,originalJobConclusion:job.conclusion},read:name=>JSON.parse(readFileSync(join(dir,name),'utf8'))};
}
export function selectUnfinished(report,expectedFiles){
 assert.equal(report.success,false,'Preserve original failure state');assert.equal(report.numPendingTests,0);assert.equal(report.testResults.length,expectedFiles.length);
 const rows=new Map();for(const row of report.testResults){const name='src/'+row.name.split('/src/').at(-1);assert(expectedFiles.includes(name)&&!rows.has(name));rows.set(name,row);}
 const accepted=[],fresh=[];let passed=0;
 for(const file of expectedFiles){const row=rows.get(file);assert(row);if(row.status==='passed'&&row.assertionResults.length&&row.assertionResults.every(a=>a.status==='passed')){accepted.push(file);passed+=row.assertionResults.length;}else fresh.push(file);}
 return {accepted,fresh,expectedFreshNames:fresh.flatMap(file=>rows.get(file).assertionResults.map(a=>a.fullName)).sort(),priorPassedCases:passed,originalReportSuccess:report.success};
}
export async function testContinuation(kind){const old=await loadOriginal(kind),files=kind==='frontend'?binding.tests.frontend:binding.tests.backend.filter(p=>!p.includes('.postgres.'));const report=old.read(kind==='frontend'?'frontend-tests.json':'backend-unit.json'),selection=selectUnfinished(report,files);
 for(const file of selection.accepted)assert.equal(git('rev-parse','HEAD:server-version/'+kind+'/'+file),git('rev-parse',original.head+':server-version/'+kind+'/'+file));
 if(kind==='frontend'){assert.deepEqual(selection.fresh.sort(),[...changedFixtureFiles].sort());assert.equal(selection.priorPassedCases,560);}else{assert.deepEqual(selection.accepted.sort(),['src/__tests__/education-roster/jobs-limits.test.ts','src/__tests__/education-roster/workbook.test.ts','src/__tests__/huiteacher/consensus-approval-once.test.ts','src/__tests__/huiteacher/formal-feedback-once.test.ts','src/__tests__/reporting/education-scale-personal-report.service.test.ts'].sort());assert.equal(selection.priorPassedCases,33);assert.equal(selection.fresh.length,8);}
 return {...selection,proof:old.proof,...(kind==='backend'?{upgrade:old.read('upgrade.json')}:{} )};}
export async function copyOriginalBackend(){const old=await loadOriginal('build'),manifest=old.read('ci-build-manifest.json');verifyManifest(manifest,{schemaVersion:1,kind:'backend',sha:original.checkout,runId:String(original.run),lockDigest:sha(readFileSync('server-version/backend/package-lock.json'))},treeDigest(old.dir));
 cpSync(old.dir,resolve('server-version/backend/dist'),{recursive:true,errorOnExist:true,force:false});return {...old.proof,originalManifest:manifest,componentTree:original.backendTree,status:'REPACKAGED_IDENTICAL_COMPONENT_NOT_RECOMPILED'};}
export async function originalAudit(){const old=await loadOriginal('audit');for(const c of ['backend','frontend']){assert.equal(git('rev-parse','HEAD:server-version/'+c+'/package-lock.json'),git('rev-parse',original.head+':server-version/'+c+'/package-lock.json'));const report=old.read(c+'-audit.json');assert(!report.error);assert.equal(report.metadata.vulnerabilities.high,0);assert.equal(report.metadata.vulnerabilities.critical,0);}return {...old.proof,status:'REUSED_EXACT_LOCKFILE_AUDIT'};}
export function verifyOriginalSastJob(job,now=Date.now()){
 assert.equal(job.id,121952617174);assert.equal(job.run_id,original.run);assert.equal(job.head_sha,original.head);assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
 const age=now-Date.parse(job.completed_at);assert(age>=0&&age<86400000);
 return {status:'REUSED_UNCHANGED_APPLICATION_SAST_FRESH_CONTROLS_REQUIRED',run:original.run,head:original.head,jobId:job.id,completedAt:job.completed_at,
  config:'paths: [.github/scripts, server-version/scripts/release, '+changedFixtureFiles.map(p=>'server-version/frontend/'+p).join(', ')+']'};
}
export async function originalSast(){
 verifyContinuationInputs();const run=await api('/actions/runs/'+original.run);assert.equal(run.head_sha,original.head);assert.equal(run.run_attempt,1);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 return verifyOriginalSastJob(await api('/actions/jobs/121952617174'));
}
