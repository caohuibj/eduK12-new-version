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
export const deliveredFrontend={run:40436352177,head:'edb119f64768787bd4fd3028e59859bc55ef846d',checkout:'0019a9aea629687c693b9e4197f86388352bc980',tree:'c82f81537ef8ff164fcaf20f42c7e2119ecdbd49',frontendTree:'1bb800f156220de1e5a2f043a82208f713cfa273',scopeJobs:[121965824219,121965905570]};
export const deliveredArtifacts={
 build:{id:12704057621,sha:'decfa1befeace0a009d26018eae93461743017725d317dc8a3335dc6f3f5a92e',prefix:'pr357-frontend-',job:121965972676},
 checks:{id:12703623377,sha:'b954b12f1ad078817f3b52b045ac185e7dbdebf2c8bd940c35c80e61b78fcb61',prefix:'pr357-frontend-checks-',job:121965972676},
};
export const databaseProgress={run:40439156003,head:'61c3d874a2b546971ed27a0eadf7ec111794b844',checkout:'b971270af5d2b20ab1de57ca6d9e7e7803ccce39',tree:'030d01d05d7dc0a705c7e7b3fe69539cc1ac09e5',scopeJobs:[121975025416,121975105035]};
export const progressArtifacts={checks:{id:12704938910,sha:'441b7c3007dc9af8eb13a306f33e61bce3ac5e291070fdf3a3547f56e466a21f',prefix:'pr357-backend-checks-',job:121975194420}};
export const quotaProgress={run:40440930935,head:'976e854339e046dba7dfe268794b498d171b51bc',checkout:'7a9c922d943a0967b8dabcc1d43bed264325c611',tree:'2dbb191477b23dcbd540666c1dc29bfc6613a09d',scopeJobs:[121980832682,121980920294]};
export const quotaArtifacts={checks:{id:12706064269,sha:'86578174eda2c428141a891dd2d5e5a9c8b36da1f65099236fe88132be5469f1',prefix:'pr357-backend-checks-',job:121980995966}};
export const deliveredBackend={run:40441725961,head:'c8fef09433e536f8049d3a74c959de55d35c3c8a',checkout:'d1a1dda7f1b16558e59a28c830579a50ba5efedd',tree:'29eb1ceace745f80a511617b7f48fed944082d06',scopeJobs:[121983405334,121983495599]};
export const backendArtifacts={checks:{id:12707500412,sha:'407f558c8e76984faf3b51d2c96e2d62359e271291ba4dba62582903e9a3ffd1',prefix:'pr357-backend-checks-',job:121983573857},build:{id:12707045680,sha:'4d0d603fc5b05944d42072839f36f18d8beb932031ec4edae616c0ef4206c81a',prefix:'pr357-backend-',job:121983573857}};
export const styledFrontend={run:40446467080,head:'6675aaa90f6940b93ec13cf2ac37c08103f8fe1e',checkout:'990678ca46891a4a8b4e2b13ee543a0bdcf06dc3',tree:'6955b6769d89f6b5356172a995f5947ca21a74ba',frontendTree:'438a7e9db83feadaaa3ebf080cc3a11c7f685d44',scopeJobs:[121998838739,121998958509]};
export const styleArtifacts={checks:{id:12709080774,sha:'efc902e767c62ecfb6363e3b09190f9b8050153eb0125c551caa3a11588557e3',prefix:'pr357-frontend-checks-',job:121999019564},build:{id:12708916208,sha:'bf976a51b75625b185cbea2ed0d392e7070abaaae85b270c5d3992705c9502a8',prefix:'pr357-frontend-',job:121999019564}};
export const focusedFrontend={run:40449223254,head:'3af54d387fd2c51fc193b578b0dd056d918156b0',checkout:'45118036bf53ba6fa28699cece17fd132eb044d4',tree:'e9119a5a2721f29e028de80b2147422e0222cab7',frontendTree:'eff42512c7a727c347fabea865dbad281d698bb1',scopeJobs:[122007732503,122007807562]};
export const focusArtifacts={checks:{id:12710005978,sha:'beb1ba8bcac5cdbadd67a6441b24eaea1061910f6211865e97fb999fa8b80cce',prefix:'pr357-frontend-checks-',job:122007883724},build:{id:12709388165,sha:'e81ba2ec55edbaaeeb63e96ac3fc47581a40bb28ebb27eb56f69c7f680cfcc68',prefix:'pr357-frontend-',job:122007883724}};
function evidencePins(delivered){assert([false,true,'database','quota','backend','style','focus'].includes(delivered));return delivered==='focus'?[focusedFrontend,focusArtifacts]:delivered==='style'?[styledFrontend,styleArtifacts]:delivered==='backend'?[deliveredBackend,backendArtifacts]:delivered==='quota'?[quotaProgress,quotaArtifacts]:delivered==='database'?[databaseProgress,progressArtifacts]:delivered?[deliveredFrontend,deliveredArtifacts]:[original,artifacts];}
export const changedFixtureFiles=['src/huiteacher/HuiteacherAssessmentMediaHost.test.tsx','src/school/SchoolBoundContinuation.test.tsx'];
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),sha=x=>createHash('sha256').update(x).digest('hex');
export function verifyContinuationInputs(read=git){
 assert.equal(read('rev-parse',original.head+'^{tree}'),original.tree);
 assert.equal(read('rev-parse','HEAD:server-version/backend'),original.backendTree,'Backend source/dependency/config changed; original build and DB evidence inapplicable');
 assert.equal(read('rev-parse',original.head+':server-version/backend'),original.backendTree);
 const changed=read('diff','--name-only',original.head,'HEAD','--','server-version/frontend').split('\n').filter(Boolean).sort();
 const focusBlobs={'server-version/frontend/src/components/questionnaire/ScalePlayer.tsx':'f988062ee9af5bde281ab05c40938baeb73aa58d','server-version/frontend/src/components/questionnaire/__tests__/ScalePlayer.test.tsx':'f63ce50417009e7f08f5642c95aff5fbdf2db183'};
 for(const [file,blob]of Object.entries(focusBlobs))if(changed.includes(file)){assert.equal(read('rev-parse','HEAD:'+file),blob,'Only the exact keyboard focus fix is admitted');changed.splice(changed.indexOf(file),1);}
 const css='server-version/frontend/src/school/school-landing.css';
 if(changed.includes(css)){assert.equal(read('rev-parse','HEAD:'+css),'f4d993753daa178944a5b14ec7d7af58fe0e8bdd','Only the exact mobile contrast correction is admitted');changed.splice(changed.indexOf(css),1);}
 assert.deepEqual(changed,changedFixtureFiles.map(p=>'server-version/frontend/'+p).sort(),'Only the two failed fixtures and exact contrast CSS may differ');
 const old=JSON.parse(read('show',original.head+':.github/scripts/pr357-bindings.json'));
 assert.deepEqual(binding.tests,old.tests,'Cannot drop/change requested consumers while admitting prior files');
 return {original,backendTree:original.backendTree,changedFrontendFixtures:changedFixtureFiles};
}
export function verifyOriginalArtifact(meta,kind,now=Date.now(),delivered=false){
 const [pin,map]=evidencePins(delivered),a=map[kind];assert(a);assert.equal(meta.id,a.id);assert.equal(meta.name,a.prefix+pin.checkout);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+a.sha);assert.equal(meta.workflow_run.id,pin.run);assert.equal(meta.workflow_run.head_sha,pin.head);assert.equal(meta.workflow_run.head_branch,binding.branch);assert(meta.size_in_bytes>0&&meta.size_in_bytes<32*1024*1024);
 const age=now-Date.parse(meta.created_at);assert(age>=0&&age<86400000,'Original evidence outside bounded freshness window');return a;
}
async function trustedGet(url,options={}){let last;for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});if(![502,503,504].includes(response.status)||attempt===2)return response;await response.body?.cancel();}catch(error){last=error;if(attempt===2)throw error;}await new Promise(done=>setTimeout(done,1000*(attempt+1)));}throw last??new Error('Official GET unavailable');}
async function api(path){assert(process.env.GH_TOKEN,'Official Actions read token required');const r=await trustedGet('https://api.github.com/repos/'+repo+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'Official evidence read failed');return r.json();}
export async function loadOriginal(kind,delivered=false){
 assert.equal(process.env.GITHUB_ACTIONS,'true');verifyContinuationInputs();const [pin,map]=evidencePins(delivered),a=map[kind];assert(a);
 const run=await api('/actions/runs/'+pin.run);assert.equal(run.head_sha,pin.head);assert.equal(run.event,'pull_request');assert.equal(run.head_branch,binding.branch);assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.run_attempt,1);
 for(const id of (pin.scopeJobs??[121952530408,121952617241])){const source=await api('/actions/jobs/'+id);assert.equal(source.run_id,pin.run);assert.equal(source.head_sha,pin.head);assert.equal(source.conclusion,'success');}
 const meta=await api('/actions/artifacts/'+a.id);verifyOriginalArtifact(meta,kind,Date.now(),delivered);
 const job=await api('/actions/jobs/'+a.job);assert.equal(job.run_id,pin.run);assert.equal(job.head_sha,pin.head);assert.equal(job.status,'completed');assert.equal(job.conclusion,delivered===true||delivered==='backend'||delivered==='style'||delivered==='focus'||kind==='audit'?'success':'failure');
 if(kind==='build'&&!delivered)for(const name of ['compile backend once using the unchanged production build dependencies','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'),'Original producer step did not succeed');
 const response=await trustedGet('https://api.github.com/repos/'+repo+'/actions/artifacts/'+a.id+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual'});let bytes;
 if(response.status===302){const location=new URL(response.headers.get('location'));assert.equal(location.protocol,'https:');assert(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|s3\.amazonaws\.com)$/.test(location.hostname),'Unexpected artifact storage host');const r=await trustedGet(location);assert.equal(r.status,200);bytes=Buffer.from(await r.arrayBuffer());}
 else{assert.equal(response.status,200);bytes=Buffer.from(await response.arrayBuffer());}
 assert(bytes.length<32*1024*1024);assert.equal(sha(bytes),a.sha,'Original ZIP digest mismatch');
 const root=resolve(process.env.RUNNER_TEMP),dir=join(root,'pr357-original-'+(delivered==='focus'?'focus-complete-':delivered==='style'?'style-complete-':delivered==='backend'?'backend-complete-':delivered==='quota'?'quota-':delivered==='database'?'database-':delivered?'delivered-':'')+kind),zip=dir+'.zip';mkdirSync(dir,{recursive:false});writeFileSync(zip,bytes,{mode:0o600});
 const names=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n');assert.equal(new Set(names).size,names.length);assert(names.every(n=>/^[A-Za-z0-9_./-]+$/.test(n)&&!n.startsWith('/')&&!n.split('/').includes('..')));
 execFileSync('unzip',['-q',zip,'-d',dir]);
 return {dir,proof:{run:pin.run,head:pin.head,checkout:pin.checkout,artifactId:a.id,zipSHA256:a.sha,jobId:a.job,originalJobConclusion:job.conclusion},read:name=>JSON.parse(readFileSync(join(dir,name),'utf8'))};
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
  config:'paths: [.github/scripts, server-version/scripts/release, server-version/e2e/school-teacher-ui.cjs, server-version/e2e/school-teacher-ui.test.cjs, server-version/e2e/school-teacher-browser.cjs, server-version/frontend/src/components/questionnaire/ScalePlayer.tsx, server-version/frontend/src/components/questionnaire/__tests__/ScalePlayer.test.tsx, '+changedFixtureFiles.map(p=>'server-version/frontend/'+p).join(', ')+']'};
}
export async function originalSast(){
 verifyContinuationInputs();const run=await api('/actions/runs/'+original.run);assert.equal(run.head_sha,original.head);assert.equal(run.run_attempt,1);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 return verifyOriginalSastJob(await api('/actions/jobs/121952617174'));
}

export async function copyDeliveredFrontend(checksOnly=false){
 verifyContinuationInputs();assert.equal(git('rev-parse',deliveredFrontend.head+'^{tree}'),deliveredFrontend.tree);if(checksOnly){assert.deepEqual(git('diff','--name-only',deliveredFrontend.head,'HEAD','--','server-version/frontend').split('\n').sort(),(checksOnly==='focus'?['server-version/frontend/src/components/questionnaire/ScalePlayer.tsx','server-version/frontend/src/components/questionnaire/__tests__/ScalePlayer.test.tsx','server-version/frontend/src/school/school-landing.css']:['server-version/frontend/src/school/school-landing.css']).sort());}else assert.equal(git('rev-parse','HEAD:server-version/frontend'),deliveredFrontend.frontendTree);assert.equal(git('rev-parse',deliveredFrontend.head+':server-version/frontend'),deliveredFrontend.frontendTree);
 const prior=await testContinuation('frontend'),checks=await loadOriginal('checks',true),verified=checks.read('frontend-verified.json'),fresh=checks.read('frontend-tests.json');
 assert.equal(verified.status,'PASS_WITH_PINNED_PRIOR');assert.equal(verified.candidate.head,deliveredFrontend.checkout);assert.equal(verified.candidate.run,String(deliveredFrontend.run));assert.equal(verified.candidate.tree,deliveredFrontend.tree);
 assert.deepEqual(verified.prior.accepted,prior.accepted);assert.equal(verified.prior.proof.artifactId,artifacts.frontend.id);assert.equal(verified.prior.proof.zipSHA256,artifacts.frontend.sha);assert.equal(verified.prior.originalReportSuccess,false);assert.equal(verified.prior.priorPassedCases,560);
 assert.equal(fresh.success,true);assert.equal(fresh.numPassedTests,10);assert.equal(fresh.numFailedTests,0);assert.equal(fresh.numPendingTests,0);assert.equal(fresh.testResults.length,2);assert(fresh.testResults.every(row=>row.status==='passed'&&row.assertionResults.length>0&&row.assertionResults.every(a=>a.status==='passed')));assert.deepEqual(fresh.testResults.map(row=>'src/'+row.name.split('/src/').at(-1)).sort(),[...prior.fresh].sort());assert.deepEqual(fresh.testResults.flatMap(row=>row.assertionResults.map(a=>a.fullName)).sort(),prior.expectedFreshNames);
 const scan=checks.read('frontend-scan.json');assert.equal(scan.ArtifactID,'sha256:fcb1c6da11c7ffdebde7757625cb3b60f1ba19a8d690f50c787cf8cd1721105a');assert(Array.isArray(scan.Results));assert(!scan.Results.some(row=>(row.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity))));
 if(checksOnly)return {status:checksOnly==='focus'?'ORIGINAL_QUALIFICATION_INPUTS_FOR_AFFECTED_CONSUMER_SELECTION':'REUSED_UNCHANGED_TS_QUALIFICATION_CSS_BUILD_AND_BROWSER_REQUIRED',checksProof:checks.proof,originalQualification:verified,...(checksOnly==='focus'?{reports:[JSON.parse(readFileSync(join(resolve(process.env.RUNNER_TEMP),'pr357-original-frontend','frontend-tests.json'),'utf8')),fresh]}:{})};
 const built=await loadOriginal('build',true),manifest=built.read('ci-build-manifest.json');verifyManifest(manifest,{schemaVersion:1,kind:'frontend',sha:deliveredFrontend.checkout,runId:String(deliveredFrontend.run),lockDigest:sha(readFileSync('server-version/frontend/package-lock.json'))},treeDigest(built.dir));cpSync(built.dir,resolve('server-version/frontend/dist'),{recursive:true,errorOnExist:true,force:false});
 return {status:'REUSED_COMPLETE_FRONTEND_QUALIFICATION_NOT_REBUILT',componentTree:deliveredFrontend.frontendTree,originalManifest:manifest,buildProof:built.proof,checksProof:checks.proof,originalQualification:verified,originalScanArtifactId:scan.ArtifactID};
}

// Fixed partial-run continuation: original failure remains a failure. Only the
// one pre-connect Redis-guard case is reexecuted; never infer a full-file pass.
export const rosterFile='src/__tests__/integration/educationRosterJobs.postgres.integration.test.ts';
export const quotaName='whole roster jobs over real HTTP and isolated PostgreSQL completes 5000 rows with production Redis quota, shared-IP refusal and explicit continuation';
export function verifyProgressReports(read,prior){
 const unit=read('backend-unit.json'),receipt=read('backend-unit-continuation.json');
 assert.equal(receipt.candidate.head,databaseProgress.checkout);assert.equal(receipt.candidate.tree,databaseProgress.tree);assert.equal(receipt.candidate.run,String(databaseProgress.run));
 assert.deepEqual(receipt.prior,prior);assert.equal(receipt.status,'PASS_WITH_PINNED_PRIOR');
 const whole=(report,files,count)=>{assert.equal(report.success,true);assert.equal(report.numPassedTests,count);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,0);assert.deepEqual(report.testResults.map(r=>'src/'+r.name.split('/src/').at(-1)).sort(),[...files].sort());assert(report.testResults.every(r=>r.status==='passed'&&r.assertionResults.length>0&&r.assertionResults.every(a=>a.status==='passed')));assert.equal(report.testResults.reduce((n,r)=>n+r.assertionResults.length,0),count);};
 whole(unit,prior.fresh,121);
 const pg=binding.tests.backend.filter(p=>p.includes('.postgres.'));assert.equal(pg[5],rosterFile);
 const passedPg=[15,19,21,4,3].map((count,i)=>{const report=read('postgres-'+i+'.json');whole(report,[pg[i]],count);return {index:i,file:pg[i],report};});
 const roster=read('postgres-5.json');assert.equal(roster.success,false);assert.equal(roster.numPassedTests,16);assert.equal(roster.numFailedTests,1);assert.equal(roster.numPendingTests,0);assert.equal(roster.testResults.length,1);
 const row=roster.testResults[0];assert(row.name.endsWith('/'+rosterFile));assert.equal(row.status,'failed');assert.equal(row.assertionResults.length,17);
 const failed=row.assertionResults.filter(a=>a.status==='failed');assert.equal(failed.length,1);assert.equal(failed[0].fullName,quotaName);assert.match(failed[0].failureMessages.join('\n'),/expected '\/5' to be '\/14'/);
 const accepted=row.assertionResults.filter(a=>a.status==='passed').map(a=>a.fullName).sort();assert.equal(accepted.length,16);assert.equal(new Set([...accepted,quotaName]).size,17);
 return {unit,unitReceipt:receipt,passedPg,originalRoster:roster,acceptedRosterNames:accepted};
}
export async function databaseContinuation(prior){
 assert.equal(git('rev-parse',databaseProgress.head+'^{tree}'),databaseProgress.tree);assert.equal(git('rev-parse',databaseProgress.head+':server-version/backend'),original.backendTree);
 const old=await loadOriginal('checks','database');return {...verifyProgressReports(old.read,prior),proof:old.proof};
}
export function verifyQuotaContinuation(report,accepted){
 assert.equal(report.success,true);assert.equal(report.numPassedTests,1);assert.equal(report.numFailedTests,0);assert.equal(report.numPendingTests,16);assert.equal(report.testResults.length,1);
 const row=report.testResults[0];assert(row.name.endsWith('/'+rosterFile));assert.equal(row.status,'passed');assert.equal(row.assertionResults.length,17);
 assert.deepEqual(row.assertionResults.filter(a=>a.status==='passed').map(a=>a.fullName),[quotaName]);
 assert.deepEqual(row.assertionResults.filter(a=>a.status==='skipped').map(a=>a.fullName).sort(),accepted);
 return {freshPassed:1,filteredPriorPassed:16,originalFailedCase:quotaName,status:'PASS_ONE_CASE_WITH_EXACT_PRIOR_16_NOT_RERUN'};
}

export async function quotaContinuation(progress){
 assert.equal(git('rev-parse',quotaProgress.head+'^{tree}'),quotaProgress.tree);assert.equal(git('rev-parse',quotaProgress.head+':server-version/backend'),original.backendTree);
 const old=await loadOriginal('checks','quota'),report=old.read('postgres-5.json');
 return {proof:old.proof,originalReport:report,qualification:verifyQuotaContinuation(report,progress.acceptedRosterNames)};
}

export async function copyDeliveredBackend(){
 verifyContinuationInputs();assert.equal(git('rev-parse',deliveredBackend.head+'^{tree}'),deliveredBackend.tree);assert.equal(git('rev-parse',deliveredBackend.head+':server-version/backend'),original.backendTree);
 const prior=await testContinuation('backend'),progress=await databaseContinuation(prior),quota=await quotaContinuation(progress),checks=await loadOriginal('checks','backend');
 const candidate=r=>{assert.equal(r.candidate.head,deliveredBackend.checkout);assert.equal(r.candidate.tree,deliveredBackend.tree);assert.equal(r.candidate.run,String(deliveredBackend.run));assert.equal(r.candidate.attempt,'1');};
 const counts=[1,1,3,2,2,4,4],files=binding.tests.backend.filter(p=>p.includes('.postgres.')),reports=[];
 for(const [label,file,count]of [...counts.map((total,i)=>['postgres-'+(i+6),files[i+6],total]),['compact-report',files[11],4]]){
  const r=checks.read(label+'.json'),v=checks.read(label+'-verified.json');candidate(v);assert.deepEqual({files:v.files,passed:v.passed,failed:v.failed,pending:v.pending},{files:1,passed:count,failed:0,pending:0});
  assert.equal(r.success,true);assert.equal(r.numPassedTests,count);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert.equal(r.testResults.length,1);assert(r.testResults[0].name.endsWith('/'+file));assert.equal(r.testResults[0].status,'passed');assert.equal(r.testResults[0].assertionResults.length,count);assert(r.testResults[0].assertionResults.every(a=>a.status==='passed'));reports.push({label,report:r,verification:v});
 }
 const restore=checks.read('restore.json');candidate(restore);assert.equal(restore.status,'PASS');assert.deepEqual(restore.tables.map(t=>[t.table,t.count]),[['campus_personnel_import_batches',1],['campus_personnel',1],['campus_personnel_assignments',0],['campus_personnel_credentials',0],['education_roster_import_jobs',1],['education_roster_import_parts',1]]);assert(restore.tables.every(t=>/^[a-f0-9]{64}$/.test(t.hash)));
 const scan=checks.read('backend-scan.json');assert.equal(scan.ArtifactID,'sha256:6bab0b9dcd168a7836d193aa3ab8acb7cded40ec7ab5c069ec55b69f38d9cdbf');assert(Array.isArray(scan.Results));assert(!scan.Results.some(r=>(r.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity))));
 const built=await loadOriginal('build','backend'),manifest=built.read('ci-build-manifest.json');verifyManifest(manifest,{schemaVersion:1,kind:'backend',sha:deliveredBackend.checkout,runId:String(deliveredBackend.run),lockDigest:sha(readFileSync('server-version/backend/package-lock.json'))},treeDigest(built.dir));cpSync(built.dir,resolve('server-version/backend/dist'),{recursive:true,errorOnExist:true,force:false});
 return {status:'REUSED_COMPLETE_BACKEND_QUALIFICATION_NOT_RETESTED_OR_REBUILT',componentTree:original.backendTree,originalManifest:manifest,buildProof:built.proof,checksProof:checks.proof,prior,progress,quota,reports,restore,scan};
}

export async function copyStyledFrontend(){
 const prior=await copyDeliveredFrontend(true);assert.equal(git('rev-parse','HEAD:server-version/frontend'),styledFrontend.frontendTree);assert.equal(git('rev-parse',styledFrontend.head+'^{tree}'),styledFrontend.tree);
 const checks=await loadOriginal('checks','style'),receipt=checks.read('frontend-style-reuse.json');assert.equal(receipt.candidate.head,styledFrontend.checkout);assert.equal(receipt.candidate.run,String(styledFrontend.run));assert.equal(receipt.candidate.tree,styledFrontend.tree);assert.equal(receipt.status,prior.status);assert.deepEqual(receipt.originalQualification,prior.originalQualification);assert.deepEqual(receipt.checksProof,prior.checksProof);
 const scan=checks.read('frontend-scan.json');assert.equal(scan.ArtifactID,'sha256:e8b25b9a1cfa3f9538828c4d92f9f4946920710f5e68adf52eb6ab207076b29d');assert(Array.isArray(scan.Results));assert(!scan.Results.some(r=>(r.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity))));
 const built=await loadOriginal('build','style'),manifest=built.read('ci-build-manifest.json');verifyManifest(manifest,{schemaVersion:1,kind:'frontend',sha:styledFrontend.checkout,runId:String(styledFrontend.run),lockDigest:sha(readFileSync('server-version/frontend/package-lock.json'))},treeDigest(built.dir));cpSync(built.dir,resolve('server-version/frontend/dist'),{recursive:true,errorOnExist:true,force:false});
 return {status:'REUSED_COMPLETE_STYLED_FRONTEND_NOT_REBUILT',componentTree:styledFrontend.frontendTree,originalManifest:manifest,buildProof:built.proof,checksProof:checks.proof,originalQualification:receipt,scan};
}

export const focusConsumers=["src/components/__tests__/FinalCompositeAssessment.test.tsx", "src/components/__tests__/FinalCompositePresentationReuse.test.tsx", "src/huiteacher/HuiteacherAssessmentMediaHost.test.tsx", "src/huiteacher/HuiteacherMyScaleTasks.test.tsx", "src/school/SchoolBoundContinuation.test.tsx", "src/school/SchoolCompositeRunner.test.tsx", "src/school/SchoolParentTasks.test.tsx", "src/school/SchoolStudentTasks.test.tsx", "src/school/SchoolTeacherTasks.test.tsx", "src/huiteacher/HuiteacherScaleSession.test.tsx", "src/components/questionnaire/__tests__/ScalePlayer.test.tsx"];
export function selectUnchangedFrontend(prior){
 const expected=binding.tests.frontend.filter(file=>!focusConsumers.includes(file)),accepted=[];
 for(const file of expected){const rows=prior.reports.flatMap(r=>r.testResults).filter(r=>r.name.endsWith('/'+file)&&r.status==='passed'&&r.assertionResults.length>0&&r.assertionResults.every(a=>a.status==='passed'));assert.equal(rows.length,1,'Unchanged file needs one original fully passing report');accepted.push({file,originalReport:rows[0]});}
 assert.equal(new Set([...expected,...focusConsumers]).size,binding.tests.frontend.length+1);return {accepted,passed:accepted.reduce((n,r)=>n+r.originalReport.assertionResults.length,0),fresh:focusConsumers};
}

export async function copyFocusedFrontend(){
 const prior=await copyDeliveredFrontend('focus'),selection=selectUnchangedFrontend(prior);assert.equal(git('rev-parse','HEAD:server-version/frontend'),focusedFrontend.frontendTree);assert.equal(git('rev-parse',focusedFrontend.head+'^{tree}'),focusedFrontend.tree);
 const checks=await loadOriginal('checks','focus'),receipt=checks.read('frontend-focus-verified.json'),raw=checks.read('frontend-focus-tests.json');
 assert.equal(receipt.candidate.head,focusedFrontend.checkout);assert.equal(receipt.candidate.run,String(focusedFrontend.run));assert.equal(receipt.candidate.tree,focusedFrontend.tree);assert.equal(receipt.status,'PASS_WITH_UNCHANGED_CASES');assert.deepEqual(receipt.selection,selection);assert.deepEqual(receipt.fresh,{files:11,passed:108,failed:0,pending:0});
 assert.equal(raw.success,true);assert.equal(raw.numPassedTests,108);assert.equal(raw.numFailedTests,0);assert.equal(raw.numPendingTests,0);assert.deepEqual(raw.testResults.map(r=>'src/'+r.name.split('/src/').at(-1)).sort(),[...focusConsumers].sort());assert(raw.testResults.every(r=>r.status==='passed'&&r.assertionResults.length>0&&r.assertionResults.every(a=>a.status==='passed')));assert.equal(raw.testResults.reduce((n,r)=>n+r.assertionResults.length,0),108);
 const scan=checks.read('frontend-scan.json');assert.equal(scan.ArtifactID,'sha256:86d6ab63e8d173bd591a6102271356397f2dc6c9439449ad3fe2b6d2783d0ff4');assert(Array.isArray(scan.Results));assert(!scan.Results.some(r=>(r.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity))));
 const built=await loadOriginal('build','focus'),manifest=built.read('ci-build-manifest.json');verifyManifest(manifest,{schemaVersion:1,kind:'frontend',sha:focusedFrontend.checkout,runId:String(focusedFrontend.run),lockDigest:sha(readFileSync('server-version/frontend/package-lock.json'))},treeDigest(built.dir));cpSync(built.dir,resolve('server-version/frontend/dist'),{recursive:true,errorOnExist:true,force:false});
 return {status:'REUSED_COMPLETE_FOCUS_FRONTEND_NOT_REBUILT',componentTree:focusedFrontend.frontendTree,originalManifest:manifest,buildProof:built.proof,checksProof:checks.proof,originalQualification:receipt,raw,scan};
}
