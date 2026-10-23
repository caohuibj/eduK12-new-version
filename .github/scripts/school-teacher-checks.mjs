import assert from 'node:assert/strict';
import {verifyManifest,treeDigest} from './ci-artifact.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {binding,actualPlan,requireSuccess,sha256,git} from './school-teacher-scope.mjs';
const out=resolve('school-teacher-evidence');
function receipt(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n')}
const RESUME={run:39867718449,head:'dcbc58483c6b6ce8a81526ddbc124a8b1c1c993c',checkout:'81ee1f6d6a097e0c9e0aca3da05582f614325878',frontendJob:120134202466,auditJob:120134202442,sastJob:120134095190,frontendArtifact:12465090917,frontendDigest:'7663300255799eff7bd3e8f4ac7f79fef42e3ad62af40da66d5f947876241451',auditArtifact:12464502959,auditDigest:'dac8363a31ff8e8a05809ec80d9b31929624e0be9a9f06bc549d2fb0e66fda1b',workflowSha256:'3711b141411280f2775ba9475d72b4011ecbfd664789b5228114eefee58331d7'};

export const COMPLETED_BACKEND={run:39877023519,head:'b717cddfdeb957bc3665ed3e69f8a680befa021b',checkout:'db477157b097556dc8e59cda1f6bda71f06a71f6',job:120165263496,checksArtifact:12469685064,checksDigest:'f83a39e33cf010471c9244fd4abe87eb76cba63200e77e2b812a1dbc1af121fa',buildArtifact:12469580004,buildDigest:'64032cdebcfbf855622f3dbaa53f6b31bffb1b5d9f965ef719b3d3faad469d18',buildSize:7590065,compileDigest:'8689278a86c4571e8a5f251338c56d164f3626ec76520c5e27c44350c76b323d'};

export const COMPLETED_REMAINDER={run:39879553519,head:'60f13df9121eeb66c221dfe8b1f0535082a4a59c',checkout:'c291aec6bbd2009e8c18f783e3eb42d0791ad1bb',job:120173687384,artifact:12469743626,digest:'42b84f8368cddc43318cf792e9e658a949e7a1c2e1e8b199e8f2ea17e8e5bd0c',sastJob:120173456048,sastArtifact:12469478123,sastDigest:'f745dfc73d4945e0b03f6566c50d087cf93248b4cc73b99ffa3759785e8625d0',workflowSha256:'cd00d184e3be6dfad1a8a9685ee51aeb2d76d0d4f93310dbd114f21d6557cf11'};
export function verifySixthJob(run,job,kind,now=Date.now()){
 assert(['remainder','sast'].includes(kind));assert.equal(run.id,COMPLETED_REMAINDER.run);assert.equal(run.head_sha,COMPLETED_REMAINDER.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));assert.equal(job.id,kind==='sast'?COMPLETED_REMAINDER.sastJob:COMPLETED_REMAINDER.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,kind==='sast'?'codeql (javascript/typescript SAST)':'school-teacher / connected');assert.equal(job.status,'completed');assert.equal(job.conclusion,kind==='sast'?'success':'failure');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);
 for(const name of kind==='sast'?['initialize CodeQL','analyze with CodeQL']:['run only the five missing service and PostgreSQL cases'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
 if(kind==='remainder')assert(job.steps.some(s=>s.name==='apply the confirmed temporary runner Chrome write-permission tightening'&&s.conclusion==='failure'));
}
export function verifyCompletedRemainder(read,b){
 const verified=[];for(let i=6;i<9;i++){successfulCommand(read('command-backend-tests-'+i+'.json'),'backend-tests-'+i);const actual=read('backend-tests-'+i+'-actual.json'),batch=b.execution.backend.batches[i];assert.equal(actual.invocationSuccess,true);assert(actual.cases.every(c=>typeof c.name==='string'&&!Object.hasOwn(c,'unreviewedNameSha256')));const result=verifyTestReport({success:true,numFailedTests:actual.cases.filter(c=>c.status==='failed').length,testResults:[{assertionResults:actual.cases.map(c=>({fullName:c.name,status:c.status}))}]},batch),normalized=read('backend-tests-'+i+'.json');assert.equal(normalized.sourceHead,COMPLETED_REMAINDER.checkout);assert.equal(normalized.reportSha256,actual.rawSha256);assert.equal(normalized.wholeInvocationSucceeded,true);assert.deepEqual([...normalized.caseNames].sort(),[...result.caseNames].sort());verified.push(result)}
 assert.equal(verified.reduce((n,r)=>n+r.passed,0),5);assert.equal(verified.reduce((n,r)=>n+r.filtered,0),20);const failure=read('chrome-permissions.json');assert.equal(failure.status,'FAILED');assert.equal(failure.source.head,COMPLETED_REMAINDER.checkout);assert.equal(failure.source.runId,String(COMPLETED_REMAINDER.run));assert.equal(failure.permissionChangeAttempted,false);assert.equal(failure.completedChanges,0);assert.equal(failure.browserLaunched,false);assert.equal(failure.outcome,'NO_PERMISSION_CHANGE');return {passed:5,filtered:20,originalJobConclusion:'failure',originalJobQualified:false,browserExecuted:false};
}
async function reuseCompletedRemainder(b){
 assert.deepEqual(b.execution.officialBackendRemainder,COMPLETED_REMAINDER);assert.equal(git('rev-parse',COMPLETED_REMAINDER.head+'^{tree}'),git('rev-parse',COMPLETED_REMAINDER.checkout+'^{tree}'));verifyPolicyOnlyBackendDelta(COMPLETED_REMAINDER.checkout);
 const previous=JSON.parse(git('show',COMPLETED_REMAINDER.checkout+':.github/scripts/school-teacher-bindings.json'));assert.deepEqual(b.execution.backend.batches.slice(6),previous.execution.backend.batches.slice(6));for(const batch of b.execution.backend.batches.slice(6))verifyClosure(batch.inputClosure);
 const run=await officialApi('/actions/runs/'+COMPLETED_REMAINDER.run),job=await officialApi('/actions/jobs/'+COMPLETED_REMAINDER.job);verifySixthJob(run,job,'remainder');const zip=await officialZip(COMPLETED_REMAINDER.artifact,COMPLETED_REMAINDER.digest,'school-teacher-connected-'+COMPLETED_REMAINDER.checkout,COMPLETED_REMAINDER.run,COMPLETED_REMAINDER.head);const completed=verifyCompletedRemainder(jsonZip(zip),b);receipt('official-backend-remainder-reuse',{currentHead:git('rev-parse','HEAD'),currentRun:process.env.GITHUB_RUN_ID,originalRun:COMPLETED_REMAINDER.run,originalJob:COMPLETED_REMAINDER.job,completed,currentBusinessTestsExecuted:false});return completed;
}

export const FIXTURE_PATH='server-version/backend/src/__tests__/survey/tool-publication.postgres.integration.test.ts';
export const POLICY_PATH='server-version/backend/scripts/runtime-table-policy.json';
export const POLICY_OLD='c7a33ee0e2d700ba39a9a99a82c6a5cb052a08f8',POLICY_NEW='ace85218711a03301aef8b4626f0cf9951cb7b4e';
export function backendCompileDigest(list){const lines=list.trimEnd().split('\n');assert.equal(lines.filter(l=>l.split('\t')[1]===FIXTURE_PATH).length,1);assert.equal(lines.filter(l=>l.split('\t')[1]===POLICY_PATH).length,1);const normalized=lines.filter(l=>l.split('\t')[1]!==FIXTURE_PATH).map(l=>{if(l.split('\t')[1]!==POLICY_PATH)return l;assert([POLICY_OLD,POLICY_NEW].some(blob=>l==='100644 blob '+blob+'\t'+POLICY_PATH),'Only the exact reviewed noncompiled runtime policy delta is allowed');return '100644 blob '+POLICY_OLD+'\t'+POLICY_PATH});return sha256(normalized.join('\n')+'\n')}
export function verifyPolicyOnlyBackendDelta(original,read=git){assert.equal(read('diff','--name-only',original,'HEAD','--','server-version/backend'),POLICY_PATH,'Backend difference must be only the reviewed runtime policy');assert.equal(read('rev-parse',original+':'+POLICY_PATH),POLICY_OLD);assert.equal(read('rev-parse','HEAD:'+POLICY_PATH),POLICY_NEW);return verifyBackendEquivalent(original,read)}

export function verifyBackendCompileInputs(read=git,expectedDigest=COMPLETED_BACKEND.compileDigest){
 assert.equal(read('rev-parse','HEAD:'+POLICY_PATH),POLICY_NEW,'Current runtime policy must be the exact reviewed repair');
 const digest=backendCompileDigest(read('ls-tree','-r','HEAD','--','server-version/backend'));assert.equal(digest,expectedDigest,'Backend input other than the single excluded fixture changed');
 const config=JSON.parse(read('show','HEAD:server-version/backend/tsconfig.json'));assert.deepEqual(config.include,['src/**/*']);assert(config.exclude.includes('src/__tests__/**/*'));
 // This exact digest also pins all production imports, independently reviewed not to reference the excluded fixture.
 return digest;
}
function verifyBackendEquivalent(original,read=git){assert.equal(backendCompileDigest(read('ls-tree','-r',original,'--','server-version/backend')),COMPLETED_BACKEND.compileDigest);return verifyBackendCompileInputs(read)}
export function verifyCompletedBackendJob(run,job,now=Date.now()){
 assert.equal(run.id,COMPLETED_BACKEND.run);assert.equal(run.head_sha,COMPLETED_BACKEND.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));
 assert.equal(job.id,COMPLETED_BACKEND.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'school-teacher / connected');assert.equal(job.status,'completed');assert.equal(job.conclusion,'failure');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);
 for(const name of ['compile affected backend exactly once without full npm lifecycle','prove nonempty exact-base upgrade with synthetic frozen baseline rows'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
 assert(job.steps.some(s=>s.name==='run deduplicated affected service and real PostgreSQL cases'&&s.conclusion==='failure'));
}
export function verifyCompletedBackend(read,b){
 for(const stage of ['backend-compile','backend-manifest','extract-baseline','migrate-old','migrate-current'])successfulCommand(read('command-'+stage+'.json'),stage);
 const results=[];for(let i=0;i<6;i++){successfulCommand(read('command-backend-tests-'+i+'.json'),'backend-tests-'+i);const actual=read('backend-tests-'+i+'-actual.json'),batch=b.execution.backend.batches[i];assert.equal(actual.invocationSuccess,true);assert(actual.cases.every(c=>typeof c.name==='string'&&!Object.hasOwn(c,'unreviewedNameSha256')));const result=verifyTestReport({success:true,numFailedTests:actual.cases.filter(c=>c.status==='failed').length,testResults:[{assertionResults:actual.cases.map(c=>({fullName:c.name,status:c.status}))}]},batch),normalized=read('backend-tests-'+i+'.json');assert.equal(normalized.sourceHead,COMPLETED_BACKEND.checkout);assert.equal(normalized.reportSha256,actual.rawSha256);assert.equal(normalized.wholeInvocationSucceeded,true);assert.deepEqual([...normalized.caseNames].sort(),[...result.caseNames].sort());results.push(result)}
 assert.equal(results.reduce((n,r)=>n+r.passed,0),105);assert.equal(results.reduce((n,r)=>n+r.filtered,0),6);
 const migration=read('migration.json');assert.equal(migration.status,'PASSED');assert.equal(migration.base,b.base);assert.equal(migration.sourceHead,COMPLETED_BACKEND.checkout);assert.deepEqual(migration.preserved.map(r=>r.table),b.execution.migration.preserveTables);for(const row of migration.preserved){assert.equal(row.count,1);assert(Array.isArray(row.columns)&&row.columns.length>0);assert.match(row.sha256,/^[a-f0-9]{64}$/)}
 assert.equal(read('phase-postgres-failure.json').status,'FAILED');return {passed:105,filtered:6,compile:true,nonemptyMigration:true,originalJobConclusion:'failure',originalJobQualified:false,migration};
}
export function verifyBackendBuildReceipt(r,{head,runId,manifest,lockDigest,contentDigest,compileDigest}){
 assert.equal(r.schemaVersion,1);assert.equal(r.status,'VERIFIED_OFFICIAL_BACKEND_BUILD');assert.equal(r.currentHead,head);assert.equal(r.currentRun,runId);assert.equal(r.originalRun,COMPLETED_BACKEND.run);assert.equal(r.originalHead,COMPLETED_BACKEND.head);assert.equal(r.originalCheckout,COMPLETED_BACKEND.checkout);assert.equal(r.originalJob,COMPLETED_BACKEND.job);assert.equal(r.originalJobConclusion,'failure');assert.equal(r.originalArtifact,COMPLETED_BACKEND.buildArtifact);assert.equal(r.originalArtifactSha256,COMPLETED_BACKEND.buildDigest);assert.equal(r.backendCompileDigest,COMPLETED_BACKEND.compileDigest);assert.equal(compileDigest,r.backendCompileDigest);assert.deepEqual(r.manifest,manifest);assert.deepEqual(Object.keys(manifest).sort(),['contentDigest','kind','lockDigest','runId','schemaVersion','sha']);verifyManifest(manifest,{schemaVersion:1,sha:COMPLETED_BACKEND.checkout,runId:String(COMPLETED_BACKEND.run),kind:'backend',lockDigest},contentDigest);return r;
}
function verifyConnectedBackend(){const dir=resolve('server-version/backend/dist'),r=JSON.parse(readFileSync(join(out,'official-backend-build-reuse.json'))),manifest=JSON.parse(readFileSync(join(dir,'ci-build-manifest.json')));return verifyBackendBuildReceipt(r,{head:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID,manifest,lockDigest:sha256(readFileSync('server-version/backend/package-lock.json')),contentDigest:treeDigest(dir),compileDigest:verifyBackendCompileInputs()})}
async function reuseCompletedBackend(b){
 assert.deepEqual(b.execution.officialBackendBuild,COMPLETED_BACKEND);assert.equal(git('rev-parse',COMPLETED_BACKEND.head+'^{tree}'),git('rev-parse',COMPLETED_BACKEND.checkout+'^{tree}'));verifyBackendEquivalent(COMPLETED_BACKEND.checkout);
 const previous=JSON.parse(git('show',COMPLETED_BACKEND.checkout+':.github/scripts/school-teacher-bindings.json'));assert.deepEqual(b.execution.backend.batches.slice(0,6),previous.execution.backend.batches.slice(0,6));assert.deepEqual(b.execution.migration,previous.execution.migration);assert.equal(b.base,previous.base);
 const run=await officialApi('/actions/runs/'+COMPLETED_BACKEND.run),job=await officialApi('/actions/jobs/'+COMPLETED_BACKEND.job);verifyCompletedBackendJob(run,job);
 const checks=await officialZip(COMPLETED_BACKEND.checksArtifact,COMPLETED_BACKEND.checksDigest,'school-teacher-connected-'+COMPLETED_BACKEND.checkout,COMPLETED_BACKEND.run,COMPLETED_BACKEND.head);const completed=verifyCompletedBackend(jsonZip(checks),b);receipt('official-backend-checks-reuse',{status:'VERIFIED_OFFICIAL_SUBCHECKS',currentHead:git('rev-parse','HEAD'),currentRun:process.env.GITHUB_RUN_ID,originalRun:COMPLETED_BACKEND.run,originalJob:COMPLETED_BACKEND.job,completed});
 const zip=await officialZip(COMPLETED_BACKEND.buildArtifact,COMPLETED_BACKEND.buildDigest,'school-teacher-backend-'+COMPLETED_BACKEND.checkout,COMPLETED_BACKEND.run,COMPLETED_BACKEND.head,COMPLETED_BACKEND.buildSize);
 const listing=spawnSync('python3',['-c',"import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([{'name':i.filename,'mode':i.external_attr>>16,'encrypted':bool(i.flag_bits&1)} for i in z.infolist()]))",zip],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(listing.status,0);validateDistEntries(JSON.parse(listing.stdout),'backend');const dir=resolve('server-version/backend/dist');assert(!existsSync(dir),'No stale backend dist accepted');mkdirSync(dir,{recursive:true});assert.equal(spawnSync('unzip',['-q',zip,'-d',dir]).status,0);
 const manifest=JSON.parse(readFileSync(join(dir,'ci-build-manifest.json'))),result={schemaVersion:1,status:'VERIFIED_OFFICIAL_BACKEND_BUILD',currentHead:git('rev-parse','HEAD'),currentRun:process.env.GITHUB_RUN_ID,originalRun:COMPLETED_BACKEND.run,originalHead:COMPLETED_BACKEND.head,originalCheckout:COMPLETED_BACKEND.checkout,originalJob:COMPLETED_BACKEND.job,originalJobConclusion:'failure',originalArtifact:COMPLETED_BACKEND.buildArtifact,originalArtifactSha256:COMPLETED_BACKEND.buildDigest,backendCompileDigest:verifyBackendCompileInputs(),manifest};receipt('official-backend-build-reuse',result);verifyConnectedBackend();
}
async function prepareCurrentDatabase(b){verifyConnectedBackend();const reused=JSON.parse(readFileSync(join(out,'official-backend-checks-reuse.json')));assert.equal(reused.currentHead,git('rev-parse','HEAD'));assert.equal(reused.currentRun,process.env.GITHUB_RUN_ID);assert.equal(reused.completed.nonemptyMigration,true);databaseGuard();command('prepare-current-schema',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],resolve('server-version/backend'));receipt('migration',{status:'PASSED',qualification:'fixed-official-nonempty-upgrade',originalRun:COMPLETED_BACKEND.run,originalCheckout:COMPLETED_BACKEND.checkout,currentDatabasePrepared:true,original:reused.completed.migration})}

const C05='C05 shared structured constraints preserve Survey V2 total zero and row choice bounds';
const fullSastPaths='paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]';
const previousControlSastPaths='paths: [.github/scripts/school-teacher-bindings.json, .github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher-scope.mjs, .github/scripts/school-teacher.test.mjs, server-version/e2e/school-teacher-browser.cjs, server-version/e2e/school-teacher-chrome-permissions.cjs, server-version/e2e/school-teacher-chrome-permissions.test.cjs, server-version/e2e/school-teacher-chrome.cjs, server-version/e2e/school-teacher-frontend-receipt.test.cjs, server-version/e2e/school-teacher-preflight-resume.test.cjs, server-version/e2e/school-teacher-ui.cjs]';
const sixthControlSastPaths='paths: [.github/scripts/school-teacher-bindings.json, .github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher-scope.mjs, .github/scripts/school-teacher.test.mjs, server-version/backend/src/__tests__/survey/tool-publication.postgres.integration.test.ts, server-version/e2e/school-teacher-backend-receipt.test.cjs, server-version/e2e/school-teacher-browser.cjs, server-version/e2e/school-teacher-ui.cjs]';
const seventhControlSastPaths='paths: [.github/scripts/school-teacher-bindings.json, .github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher.test.mjs, server-version/e2e/school-teacher-chrome-permissions.cjs, server-version/e2e/school-teacher-chrome-permissions.test.cjs]';
const eighthControlSastPaths='paths: [.github/scripts/school-teacher-bindings.json, .github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher.test.mjs, server-version/e2e/school-teacher-chrome.cjs, server-version/e2e/school-teacher-chrome.test.cjs, server-version/e2e/school-teacher-ui.test.cjs]';
const controlSastPaths='paths: [.github/scripts/school-teacher-bindings.json, .github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher-scope.mjs, .github/scripts/school-teacher.test.mjs, server-version/backend/scripts/runtime-table-policy.json, server-version/e2e/school-teacher-backend-receipt.test.cjs, server-version/e2e/school-teacher-browser.cjs, server-version/e2e/school-teacher-fixture.cjs, server-version/e2e/school-teacher-font.test.cjs, server-version/e2e/school-teacher-ui.cjs]';
export const EIGHTH_SAST={run:39882718321,head:'526987d5b973cf2103930195fa9db9fd65bf015b',checkout:'0cd324ab77c1ee64a2cbc0df40ac95bba1d46d8b',job:120183710421,artifact:12471531102,digest:'1360a4a4488b0b2f24e07c622ea584cd92dc37237e31dcd1eec80c2af575f831',workflowSha256:'b48c72f3b0905f39da0f766d3508becb59d49dfec14bad4412257add9c9e3033'};
export const SEVENTH_SAST={run:39881194083,head:'ccb5eb227577d623cf6279e89fee548bb9b50feb',checkout:'221dd40ab3513e8d73194ace63cc43445d5a3482',job:120178785529,artifact:12470831712,digest:'09aa7f407b0c5ca0f51b8a610324f25b4bb0d8eb1bc4ee2d0317bc4c2f831a6d',workflowSha256:'3c63e23c4b1b4f1fc46496fd61e3296bac748e7998618a28e8066c65543c305a'};
const FIFTH_SAST={job:120165047522,artifact:12467744375,digest:'6c8f2e59061b0802affcdb973f086ff48d3b76a45c3df493d6c4049bc49348f6',workflowSha256:'3e276ddf0f899857eeca44c4db92b413661ddcb9ded7a30e79f8235036840f4c'};
export function verifyOfficialJob(run,job,kind,now=Date.now()){
 assert.equal(run.id,RESUME.run);assert.equal(run.head_sha,RESUME.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));
 assert.equal(job.id,RESUME[kind+'Job']);assert.equal(job.run_id,RESUME.run);assert.equal(job.head_sha,RESUME.head);assert.equal(job.status,'completed');assert.equal(job.conclusion,kind==='frontend'?'failure':'success');
 const names={frontend:'school-teacher / frontend',audit:'school-teacher / security',sast:'codeql (javascript/typescript SAST)'};assert.equal(job.name,names[kind]);const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000,'Official evidence expired');
 const stages=kind==='sast'?['initialize CodeQL','analyze with CodeQL']:kind==='audit'?['retain HIGH CRITICAL production dependency threshold without rebuilding']:['prepare exact backend contracts for frontend types without native lifecycle builds'];
 for(const name of stages)assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'),'Required original stage missing');
 if(kind==='frontend')assert(job.steps.some(s=>s.name==='run only frozen affected checks then compile once and bind dist'&&s.conclusion==='failure'),'Original frontend failure must remain explicit');
}
export const FRONTEND_STYLES=[{"path":"server-version/frontend/src/components/education-tools/education-private-tools.css","before":"dbd4770e7f869846a0a8b071bfffbcbddfc1f26e","after":"b201a22096f47f2a4facf944bdc536e28719a9c0"},{"path":"server-version/frontend/src/huiteacher/huiteacher-theme.css","before":"dfd21ad922f0d01bea45dec599632a428257cd3f","after":"2cb909e09399388b36a2ea669fbec4be1b2767d1"},{"path":"server-version/frontend/src/school/school-theme.css","before":"f73afdffd1be70194987a7dde3e231a87f956756","after":"48e8a3529d7812632631301b5b56d084cec56c8e"}];
export function verifyFrontendCheckInputs(ref,read=git){
 if(read('rev-parse',ref+':server-version/frontend')===read('rev-parse','HEAD:server-version/frontend'))return {cssOnly:false};
 const expected=FRONTEND_STYLES.map(row=>':100644 100644 '+row.before+' '+row.after+' M\t'+row.path).join('\n');
 assert.equal(read('diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40',ref,'HEAD','--','server-version/frontend'),expected,
  'Only the three reviewed CSS blob pairs may differ; all JS, tests, dependencies and config must match');
 return {cssOnly:true,styles:FRONTEND_STYLES,oldBuildReusable:false};
}
export function verifyCurrentFrontendReceipt(receipt,manifest,{head,runId,frontendTree,lockDigest,contentDigest}){
 assert.equal(receipt.status,'BUILT_CURRENT_CSS_ONLY');assert.equal(receipt.sourceHead,head);assert.equal(receipt.runId,runId);assert.equal(receipt.frontendTree,frontendTree);
 assert.equal(receipt.freshBuild,true);assert.equal(receipt.oldBuildReused,false);assert.equal(receipt.originalChecksRun,39870012962);
 assert.deepEqual(receipt.manifest,manifest);assert.deepEqual(Object.keys(manifest).sort(),['contentDigest','kind','lockDigest','runId','schemaVersion','sha']);
 verifyManifest(manifest,{schemaVersion:1,kind:'frontend',sha:head,runId,lockDigest},contentDigest);return true;
}
export function verifyResumeInputs(b,read=git,backendVerifier=verifyBackendEquivalent){
 assert.deepEqual(b.execution.officialResume,RESUME);assert.equal(read('rev-parse',RESUME.head+'^{tree}'),read('rev-parse',RESUME.checkout+'^{tree}'));
 const inputs={};for(const path of ['server-version/frontend','server-version/backend']){inputs[path]=read('rev-parse',RESUME.checkout+':'+path);if(path==='server-version/backend')backendVerifier(RESUME.checkout,read);else verifyFrontendCheckInputs(RESUME.checkout,read)}
 const previous=JSON.parse(read('show',RESUME.checkout+':.github/scripts/school-teacher-bindings.json'));
 const old=structuredClone(previous.execution.frontend);old.batches[3].expectedFiltered=old.batches[3].expectedFiltered.map(s=>s==='Survey Research Builder editing widgets '+C05?C05:s);assert.deepEqual(b.execution.frontend,old,'Only the corrected filtered C05 title may differ from the successful command selections');
 return inputs;
}
function successfulCommand(record,stage){assert.equal(record.stage,stage);assert.equal(record.exitCode,0);assert.equal(record.signal,null);assert.equal(record.status,'COMMAND_SUCCEEDED');assert.match(record.rawSha256,/^[a-f0-9]{64}$/)}
export function verifyCompletedFrontend(read,b){
 for(const stage of ['frontend-types','frontend-lint'])successfulCommand(read('command-'+stage+'.json'),stage);
 const verified=[];for(let i=0;i<4;i++){
  successfulCommand(read('command-frontend-tests-'+i+'.json'),'frontend-tests-'+i);const actual=read('frontend-tests-'+i+'-actual.json'),batch=b.execution.frontend.batches[i];assert.equal(actual.invocationSuccess,true);assert.match(actual.rawSha256,/^[a-f0-9]{64}$/);
  const known=[...batch.expectedPassed,...batch.expectedFiltered],cases=actual.cases.map(c=>{const keys=Object.keys(c).sort();assert.deepEqual(keys,c.name?['name','status']:['status','unreviewedNameSha256']);const matches=c.name?[c.name]:known.filter(n=>sha256(n)===c.unreviewedNameSha256);assert.equal(matches.length,1,'Unknown or ambiguous original case identity');assert(known.includes(matches[0]));return {fullName:matches[0],status:c.status}});
  const result=verifyTestReport({success:true,numFailedTests:cases.filter(c=>c.status==='failed').length,testResults:[{assertionResults:cases}]},batch);verified.push(result);
  if(i<3){const original=read('frontend-tests-'+i+'.json');assert.equal(original.sourceHead,RESUME.checkout);assert.equal(original.reportSha256,actual.rawSha256);assert.equal(original.wholeInvocationSucceeded,true);assert.deepEqual([...original.caseNames].sort(),[...result.caseNames].sort())}
 }
 const failure=read('phase-frontend-failure.json');assert.equal(failure.phase,'frontend');assert.equal(failure.status,'FAILED');assert.equal(verified.reduce((n,r)=>n+r.passed,0),10);assert.equal(verified.reduce((n,r)=>n+r.filtered,0),8);return {types:true,lint:true,passed:10,filtered:8,batches:verified,originalJobConclusion:'failure',originalJobQualified:false};
}
export function verifyCompletedAudit(read){
 const results={};for(const component of ['frontend','backend']){const command=read('command-'+component+'-audit.json');successfulCommand(command,component+'-audit');const report=read(component+'-audit-summary.json');assert.equal(report.rawSha256,command.rawSha256);assert.equal(report.stage,component+'-audit');assert.equal(report.threshold,'HIGH/CRITICAL');requireNpmAuditSuccess(report.exitCode,report);results[component]={counts:report.counts,originalRawSha256:report.rawSha256}}
 assert.deepEqual(read('audit.json'),{status:'PASSED',threshold:'HIGH/CRITICAL',components:[{component:'frontend',status:'PASSED'},{component:'backend',status:'PASSED'}]});return results;
}
export function verifySastDelta(read=git){assert.deepEqual(read('diff','--name-only',EIGHTH_SAST.checkout,'HEAD','--','.github/scripts','server-version/e2e','server-version/backend').split('\n'),[".github/scripts/school-teacher-bindings.json", ".github/scripts/school-teacher-checks.mjs", ".github/scripts/school-teacher-scope.mjs", ".github/scripts/school-teacher.test.mjs", "server-version/backend/scripts/runtime-table-policy.json", "server-version/e2e/school-teacher-backend-receipt.test.cjs", "server-version/e2e/school-teacher-browser.cjs", "server-version/e2e/school-teacher-fixture.cjs", "server-version/e2e/school-teacher-font.test.cjs", "server-version/e2e/school-teacher-ui.cjs"]);return true}
export function verifySastConfig(original,current){
 const stage=(text,name)=>{const start=text.indexOf('      - name: '+name+'\n');assert(start>=0);const end=text.indexOf('\n      - ',start+1);return text.slice(start,end<0?undefined:end)};
 assert(stage(original,'initialize CodeQL').includes("application_route == 'school-teacher' && '"+fullSastPaths+"'"));
 assert.equal(stage(current,'initialize CodeQL'),stage(original,'initialize CodeQL').replace(fullSastPaths,controlSastPaths),'SAST language/query/action/resource configuration changed');assert.equal(stage(current,'analyze with CodeQL'),stage(original,'analyze with CodeQL'));
}
export function verifySastLog(log){assert(log.includes('config: '+fullSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+RESUME.checkout+'(?:\\r?\\n|$)').test(log),'Original actual SAST checkout differs');}
async function officialApi(path,binary=false){assert(process.env.GH_TOKEN,'Official Actions read token required');const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(response.status,200,'Official evidence unavailable');return binary?Buffer.from(await response.arrayBuffer()):response.json()}
async function officialZip(id,digest,name,run,head,size){
 const meta=await officialApi('/actions/artifacts/'+id);assert.equal(meta.id,id);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+digest);assert.equal(meta.workflow_run.id,run);assert.equal(meta.workflow_run.head_sha,head);assert.equal(meta.name,name);if(size!==undefined)assert.equal(meta.size_in_bytes,size);
 const bytes=await officialApi('/actions/artifacts/'+id+'/zip',true);assert.equal(sha256(bytes),digest,'Original ZIP digest changed');if(size!==undefined)assert.equal(bytes.length,size);const file=join(privateRoot(),'official-'+id+'.zip');writeFileSync(file,bytes,{mode:0o600});return file;
}
function jsonZip(file){const list=spawnSync('unzip',['-Z1',file],{encoding:'utf8'});assert.equal(list.status,0);const names=list.stdout.trim().split('\n');assert.equal(names.length,new Set(names).size);assert(names.every(n=>/^[a-z0-9-]+\.json$/.test(n)));return name=>{assert(names.includes(name),'Missing original receipt '+name);const result=spawnSync('unzip',['-p',file,name],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(result.status,0);return JSON.parse(result.stdout)}}
async function readOfficialArtifact(kind){return jsonZip(await officialZip(RESUME[kind+'Artifact'],RESUME[kind+'Digest'],'school-teacher-'+(kind==='frontend'?'frontend-checks':'audit')+'-'+RESUME.checkout,RESUME.run,RESUME.head))}

async function reuseOfficial(kind,b){
 if(kind==='sast')return reuseEighthSast(b);
 const inputs=verifyResumeInputs(b),run=await officialApi('/actions/runs/'+RESUME.run),job=await officialApi('/actions/jobs/'+RESUME[kind+'Job']);verifyOfficialJob(run,job,kind);
 const result={kind:'official-successful-subcheck-reuse',originalRun:RESUME.run,originalHead:RESUME.head,originalCheckout:RESUME.checkout,originalJob:job.id,originalParentConclusion:'failure',originalJobConclusion:job.conclusion,currentHead:git('rev-parse','HEAD'),inputs};
 if(kind==='frontend')result.completed=verifyCompletedFrontend(await readOfficialArtifact(kind),b);
 else if(kind==='audit')result.completed=verifyCompletedAudit(await readOfficialArtifact(kind));
 else throw Error('Unknown fixed reuse kind');
 receipt('official-'+kind+'-reuse',result);return result;
}

export function verifyFifthSastJob(run,job,now=Date.now()){
 assert.equal(run.id,COMPLETED_BACKEND.run);assert.equal(run.head_sha,COMPLETED_BACKEND.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));assert.equal(job.id,FIFTH_SAST.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
}
export function verifyFifthSastReceipt(r){assert.deepEqual(r,{kind:'official-successful-subcheck-reuse',originalRun:RESUME.run,originalHead:RESUME.head,originalCheckout:RESUME.checkout,originalJob:RESUME.sastJob,originalParentConclusion:'failure',originalJobConclusion:'success',currentHead:COMPLETED_BACKEND.checkout,inputs:{'server-version/frontend':COMPLETED_FRONTEND.frontendTree,'server-version/backend':COMPLETED_FRONTEND.backendTree},originalJobLogSha256:'ddc7bf9707c19a72449064af3e40c7325b25690be0d46ea5d2d988f16ff7d13c',applicationScannedAgain:false,currentChangedControlScanRequired:true});return true}
export function verifyFifthSastLog(log){assert(log.includes('config: '+previousControlSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+COMPLETED_BACKEND.checkout+'(?:\\r?\\n|$)').test(log),'Fifth SAST checkout differs');}

export function verifySixthSastReceipt(r){assert.equal(r.kind,'fixed-fifth-successful-sast-reuse');assert.equal(r.currentHead,COMPLETED_REMAINDER.checkout);assert.equal(r.originalRun,COMPLETED_BACKEND.run);assert.equal(r.originalCheckout,COMPLETED_BACKEND.checkout);assert.equal(r.originalJob,FIFTH_SAST.job);assert.equal(r.originalJobConclusion,'success');assert.equal(r.originalParentConclusion,'failure');assert.match(r.originalJobLogSha256,/^[a-f0-9]{64}$/);verifyFifthSastReceipt(r.originalApplicationEvidence);assert.deepEqual(r.inputs, r.originalApplicationEvidence.inputs);assert.equal(r.applicationScannedAgain,false);assert.equal(r.currentChangedControlScanRequired,true);return true}
export function verifySixthSastLog(log){assert(log.includes('config: '+sixthControlSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+COMPLETED_REMAINDER.checkout+'(?:\\r?\\n|$)').test(log),'Sixth SAST checkout differs');}

export function verifySeventhSastJob(run,job,now=Date.now()){
 assert.equal(run.id,SEVENTH_SAST.run);assert.equal(run.head_sha,SEVENTH_SAST.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));assert.equal(job.id,SEVENTH_SAST.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
}
export function verifySeventhSastReceipt(r){assert.equal(r.kind,'fixed-sixth-successful-sast-reuse');assert.equal(r.currentHead,SEVENTH_SAST.checkout);assert.equal(r.originalRun,COMPLETED_REMAINDER.run);assert.equal(r.originalCheckout,COMPLETED_REMAINDER.checkout);assert.equal(r.originalJob,COMPLETED_REMAINDER.sastJob);assert.equal(r.originalJobConclusion,'success');assert.equal(r.originalParentConclusion,'failure');assert.match(r.originalJobLogSha256,/^[a-f0-9]{64}$/);verifySixthSastReceipt(r.originalApplicationEvidence);assert.deepEqual(r.inputs,r.originalApplicationEvidence.inputs);assert.equal(r.applicationScannedAgain,false);assert.equal(r.currentChangedControlScanRequired,true);return true}
export function verifySeventhSastLog(log){assert(log.includes('config: '+seventhControlSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+SEVENTH_SAST.checkout+'(?:\\r?\\n|$)').test(log),'Seventh SAST checkout differs');}

export function verifyEighthSastJob(run,job,now=Date.now()){
 assert.equal(run.id,EIGHTH_SAST.run);assert.equal(run.head_sha,EIGHTH_SAST.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));assert.equal(job.id,EIGHTH_SAST.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);for(const name of ['initialize CodeQL','analyze with CodeQL'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
}
export function verifyEighthSastReceipt(r){assert.equal(r.kind,'fixed-seventh-successful-sast-reuse');assert.equal(r.currentHead,EIGHTH_SAST.checkout);assert.equal(r.originalRun,SEVENTH_SAST.run);assert.equal(r.originalCheckout,SEVENTH_SAST.checkout);assert.equal(r.originalJob,SEVENTH_SAST.job);assert.equal(r.originalJobConclusion,'success');assert.equal(r.originalParentConclusion,'failure');assert.match(r.originalJobLogSha256,/^[a-f0-9]{64}$/);verifySeventhSastReceipt(r.originalApplicationEvidence);assert.deepEqual(r.inputs,r.originalApplicationEvidence.inputs);assert.equal(r.applicationScannedAgain,false);assert.equal(r.currentChangedControlScanRequired,true);return true}
export function verifyEighthSastLog(log){assert(log.includes('config: '+eighthControlSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+EIGHTH_SAST.checkout+'(?:\\r?\\n|$)').test(log),'Eighth SAST checkout differs');}
async function reuseEighthSast(b){
 const inputs=verifyResumeInputs(b);assert.equal(git('rev-parse',EIGHTH_SAST.head+'^{tree}'),git('rev-parse',EIGHTH_SAST.checkout+'^{tree}'));verifyFrontendCheckInputs(EIGHTH_SAST.checkout);verifyPolicyOnlyBackendDelta(EIGHTH_SAST.checkout);
 const run=await officialApi('/actions/runs/'+EIGHTH_SAST.run),job=await officialApi('/actions/jobs/'+EIGHTH_SAST.job);verifyEighthSastJob(run,job);
 const old=git('show',RESUME.checkout+':.github/workflows/ci.yml'),previous=git('show',EIGHTH_SAST.checkout+':.github/workflows/ci.yml'),current=readFileSync('.github/workflows/ci.yml','utf8').trimEnd();assert.equal(sha256(old+'\n'),RESUME.workflowSha256);assert.equal(sha256(previous+'\n'),EIGHTH_SAST.workflowSha256);verifySastConfig(old,current);verifySastConfig(old,previous.replace(eighthControlSastPaths,controlSastPaths));
 const zip=await officialZip(EIGHTH_SAST.artifact,EIGHTH_SAST.digest,'school-teacher-sast-reuse-'+EIGHTH_SAST.checkout,EIGHTH_SAST.run,EIGHTH_SAST.head,984);const prior=jsonZip(zip)('official-sast-reuse.json');verifyEighthSastReceipt(prior);
 const log=(await officialApi('/actions/jobs/'+EIGHTH_SAST.job+'/logs',true)).toString('utf8');verifyEighthSastLog(log);verifySastDelta();receipt('official-sast-reuse',{kind:'fixed-eighth-successful-sast-reuse',currentHead:git('rev-parse','HEAD'),originalRun:EIGHTH_SAST.run,originalCheckout:EIGHTH_SAST.checkout,originalJob:EIGHTH_SAST.job,originalJobConclusion:'success',originalParentConclusion:'failure',originalJobLogSha256:sha256(log),originalApplicationEvidence:prior,inputs,applicationScannedAgain:false,currentChangedControlScanRequired:true});
}

const COMPLETED_FRONTEND={run:39870012962,head:'81947063451c5a5e2ee028ee41256671b19ef201',checkout:'dadcef2d497ed51f4d75458c12b46bbb2fc6d82b',job:120141983273,checksArtifact:12465423930,checksDigest:'208b349c606215236ca7e33070ae2b13e8ea4d1ea3f09c3dad65dc121d355198',buildArtifact:12466106464,buildDigest:'bdfeec8e3b06220e5a611d607caa167badcdf6c9dd35827ea2c379fd6b352b35',buildSize:21207434,frontendTree:'c1e34b8fdd1a0127a155a208187a8c6bb2f8760f',backendTree:'1d3a5ac4e2d2b5e73d8563f15c191eaaf0893bf8'};
export function verifyCompletedFrontendJob(run,job,now=Date.now()){
 assert.equal(run.id,COMPLETED_FRONTEND.run);assert.equal(run.head_sha,COMPLETED_FRONTEND.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));
 assert.equal(job.id,COMPLETED_FRONTEND.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'school-teacher / frontend');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);
 assert(job.steps.some(s=>s.name==='verify completed official frontend subchecks then run missing cases and compile once'&&s.status==='completed'&&s.conclusion==='success'));
}
export function verifyCompletedFrontendRemainder(read,b,previous){
 assert.deepEqual(read('frontend.json'),{status:'PASSED',freshBuild:true,typesExecuted:false,typesAndLintOfficiallyReused:true,previousPassedCasesReused:10,currentCasesRequired:13});
 const prior=read('official-frontend-reuse.json');assert.equal(prior.kind,'official-successful-subcheck-reuse');assert.equal(prior.inputs['server-version/frontend'],COMPLETED_FRONTEND.frontendTree);assert.equal(prior.inputs['server-version/backend'],COMPLETED_FRONTEND.backendTree);assert.equal(prior.originalRun,RESUME.run);assert.equal(prior.originalHead,RESUME.head);assert.equal(prior.originalCheckout,RESUME.checkout);assert.equal(prior.originalJob,RESUME.frontendJob);assert.equal(prior.originalParentConclusion,'failure');assert.equal(prior.originalJobConclusion,'failure');assert.equal(prior.currentHead,COMPLETED_FRONTEND.checkout);assert.deepEqual(prior.completed,previous);
 for(const stage of ['frontend-build','frontend-manifest'])successfulCommand(read('command-'+stage+'.json'),stage);
 const results=[];for(let i=4;i<9;i++){successfulCommand(read('command-frontend-tests-'+i+'.json'),'frontend-tests-'+i);const actual=read('frontend-tests-'+i+'-actual.json'),batch=b.execution.frontend.batches[i];assert.equal(actual.invocationSuccess,true);assert(actual.cases.every(c=>typeof c.name==='string'&&!Object.hasOwn(c,'unreviewedNameSha256')));const result=verifyTestReport({success:true,numFailedTests:actual.cases.filter(c=>c.status==='failed').length,testResults:[{assertionResults:actual.cases.map(c=>({fullName:c.name,status:c.status}))}]},batch),normalized=read('frontend-tests-'+i+'.json');assert.equal(normalized.sourceHead,COMPLETED_FRONTEND.checkout);assert.equal(normalized.reportSha256,actual.rawSha256);assert.equal(normalized.wholeInvocationSucceeded,true);assert.deepEqual([...normalized.caseNames].sort(),[...result.caseNames].sort());results.push(result)}
 assert.equal(results.reduce((n,r)=>n+r.passed,0),13);assert.equal(results.reduce((n,r)=>n+r.filtered,0),11);return {passed:23,filtered:19,types:true,lint:true,build:true,originalFrontendJobConclusion:'success',earlierFrontendJobConclusion:'failure',earlierPassedCases:10,subsequentPassedCases:13};
}
export function validateDistEntries(entries,kind='frontend'){assert(['frontend','backend'].includes(kind));
 assert(Array.isArray(entries)&&entries.length>0);const names=new Set();for(const e of entries){assert.equal(typeof e.name,'string');assert(!/[\x00-\x1f\x7f\\]/.test(e.name)&&!e.name.startsWith('/'));const parts=e.name.replace(/\/$/,'').split('/');assert(parts.every(p=>p&&p!=='.'&&p!=='..'));assert(!names.has(e.name));names.add(e.name);assert([0,0o100000,0o040000].includes(e.mode&0o170000),'Artifact special entries forbidden');assert.equal(e.encrypted,false)}assert(names.has(kind==='frontend'?'index.html':'index.js')&&names.has('ci-build-manifest.json'));return true;
}
export const RUN15_FRONTEND={run:39899292976,head:'051d8eb0f869c166b09739132ff8ea8e9a666613',checkout:'6337343de882ba07999a47c1f5a2c71a58b1a597',job:120237022790,buildArtifact:12478381269,buildDigest:'9d5d62c0f6279092502b76a880fedfbb600b8a590395a6d3adde0432756c1f83',buildSize:21208007,frontendTree:'4c089c44c21c156f416879896c41ade98c40309a',lockDigest:'ee290a304e22c10e760cc55eb55bb6815cb34fb57773c0af77985450306916fe',contentDigest:'3634f79f3b286012bb409e8b6e1de2f80e9d0ea3db6b4c59dee3c650e4270441'};
export function verifyRun15FrontendJob(run,job,now=Date.now()){
 assert.equal(run.id,RUN15_FRONTEND.run);assert.equal(run.head_sha,RUN15_FRONTEND.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));
 assert.equal(job.id,RUN15_FRONTEND.job);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.equal(job.name,'school-teacher / frontend');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000);
 assert(job.steps.some(s=>s.name==='verify unchanged official frontend checks and build the exact CSS repair once'&&s.status==='completed'&&s.conclusion==='success'));
}
export function verifyFrontendBuildReceipt(r,{head,runId,manifest,lockDigest,contentDigest,frontendTree}){
 assert.equal(lockDigest,RUN15_FRONTEND.lockDigest);assert.equal(contentDigest,RUN15_FRONTEND.contentDigest);
 const {validateOfficialFrontendReceipt}=createRequire(import.meta.url)('../../server-version/e2e/school-teacher-ui.cjs');
 return validateOfficialFrontendReceipt(r,{head,runId,frontend:manifest,frontendTree,frontendLockDigest:lockDigest,frontendContentDigest:contentDigest});
}
async function reuseCompletedFrontend(b){
 assert.equal(b.frontendBuildDecision,'fixed-run15-frontend-build');assert.deepEqual(b.execution.officialFrontendBuild,COMPLETED_FRONTEND);
 const cssDelta=verifyFrontendCheckInputs(COMPLETED_FRONTEND.checkout);assert.equal(cssDelta.cssOnly,true,'This lane requires the exact reviewed stylesheet repairs');
 const previous=await reuseOfficial('frontend',b);assert.equal(git('rev-parse',COMPLETED_FRONTEND.head+'^{tree}'),git('rev-parse',COMPLETED_FRONTEND.checkout+'^{tree}'));verifyBackendEquivalent(COMPLETED_FRONTEND.checkout);
 const run=await officialApi('/actions/runs/'+COMPLETED_FRONTEND.run),job=await officialApi('/actions/jobs/'+COMPLETED_FRONTEND.job);verifyCompletedFrontendJob(run,job);
 const checks=await officialZip(COMPLETED_FRONTEND.checksArtifact,COMPLETED_FRONTEND.checksDigest,'school-teacher-frontend-checks-'+COMPLETED_FRONTEND.checkout,COMPLETED_FRONTEND.run,COMPLETED_FRONTEND.head);
 const historicalChecks=verifyCompletedFrontendRemainder(jsonZip(checks),b,previous.completed);
 assert.equal(git('rev-parse','HEAD:server-version/frontend'),RUN15_FRONTEND.frontendTree);
 assert.equal(git('rev-parse',RUN15_FRONTEND.head+'^{tree}'),git('rev-parse',RUN15_FRONTEND.checkout+'^{tree}'));assert.equal(git('rev-parse',RUN15_FRONTEND.checkout+':server-version/frontend'),RUN15_FRONTEND.frontendTree);
 verifyRun15FrontendJob(await officialApi('/actions/runs/'+RUN15_FRONTEND.run),await officialApi('/actions/jobs/'+RUN15_FRONTEND.job));
 const zip=await officialZip(RUN15_FRONTEND.buildArtifact,RUN15_FRONTEND.buildDigest,'school-teacher-frontend-'+RUN15_FRONTEND.checkout,RUN15_FRONTEND.run,RUN15_FRONTEND.head,RUN15_FRONTEND.buildSize);
 const listing=spawnSync('python3',['-c',"import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([{'name':i.filename,'mode':i.external_attr>>16,'encrypted':bool(i.flag_bits&1)} for i in z.infolist()]))",zip],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(listing.status,0);validateDistEntries(JSON.parse(listing.stdout),'frontend');
 const cwd=resolve('server-version/frontend'),dir=join(cwd,'dist');assert(!existsSync(dir),'No stale frontend dist accepted');mkdirSync(dir,{recursive:true});assert.equal(spawnSync('unzip',['-q',zip,'-d',dir]).status,0);
 const manifest=JSON.parse(readFileSync(join(dir,'ci-build-manifest.json'))),result={schemaVersion:1,status:'VERIFIED_OFFICIAL_FRONTEND_BUILD',currentHead:git('rev-parse','HEAD'),currentRun:process.env.GITHUB_RUN_ID,originalRun:RUN15_FRONTEND.run,originalHead:RUN15_FRONTEND.head,originalCheckout:RUN15_FRONTEND.checkout,originalJob:RUN15_FRONTEND.job,originalArtifact:RUN15_FRONTEND.buildArtifact,originalArtifactSha256:RUN15_FRONTEND.buildDigest,frontendTree:RUN15_FRONTEND.frontendTree,manifest};
 verifyFrontendBuildReceipt(result,{head:result.currentHead,runId:result.currentRun,manifest,frontendTree:git('rev-parse','HEAD:server-version/frontend'),lockDigest:sha256(readFileSync(join(cwd,'package-lock.json'))),contentDigest:treeDigest(dir)});
 receipt('official-frontend-build-reuse',result);receipt('frontend',{status:'VERIFIED_OFFICIAL_FRONTEND_BUILD',freshBuild:false,originalBuildRun:RUN15_FRONTEND.run,originalBuildJobConclusion:'success',originalBuildParentConclusion:'failure',originalChecksRun:COMPLETED_FRONTEND.run,cssDelta,historicalChecks});
}
function verifyConnectedFrontend(){
 assert.equal(binding().frontendBuildDecision,'fixed-run15-frontend-build');
 const dir=resolve('server-version/frontend/dist'),manifest=JSON.parse(readFileSync(join(dir,'ci-build-manifest.json'))),receiptValue=JSON.parse(readFileSync(join(out,'official-frontend-build-reuse.json')));
 return verifyFrontendBuildReceipt(receiptValue,{head:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID,manifest,frontendTree:git('rev-parse','HEAD:server-version/frontend'),lockDigest:sha256(readFileSync('server-version/frontend/package-lock.json')),contentDigest:treeDigest(dir)});
}

const FONT_PACKAGE_URL='https://archive.ubuntu.com/ubuntu/pool/universe/f/fonts-wqy-zenhei/fonts-wqy-zenhei_0.9.45-8_all.deb';
export function verifyFontMetadata(text){const field=n=>{const values=[...String(text).matchAll(new RegExp('^'+n+': (.+)$','gm'))].map(m=>m[1]);assert.equal(values.length,1);return values[0]};assert.equal(field('Package'),'fonts-wqy-zenhei');assert.equal(field('Version'),'0.9.45-8');assert.equal(field('Architecture'),'all');assert.equal(field('Filename'),'pool/universe/f/fonts-wqy-zenhei/fonts-wqy-zenhei_0.9.45-8_all.deb');const digest=field('SHA256');assert.match(digest,/^[a-f0-9]{64}$/);return digest}
function prepareFonts(){let stage='font-inventory';try{
 if(command(stage,'fc-list',[':lang=zh','file']).trim()){receipt('font-preparation-status',{status:'SYSTEM_FONTS_PRESENT',visualQualification:false});return}
 stage='font-package-metadata';const debSha256=verifyFontMetadata(command(stage,'apt-cache',['show','fonts-wqy-zenhei=0.9.45-8']));const root=privateRoot(),deb=join(root,'school-teacher-font.deb'),extracted=join(root,'school-teacher-font');
 stage='font-package-download';command(stage,'curl',['--proto','=https','--tlsv1.2','--fail','--location','--show-error','--max-time','60','--retry','1',FONT_PACKAGE_URL,'-o',deb]);assert.equal(sha256(readFileSync(deb)),debSha256,'Official package digest mismatch');
 stage='font-package-extract';command(stage,'dpkg-deb',['--extract',deb,extracted]);const source=join(extracted,'usr/share/fonts/truetype/wqy/wqy-zenhei.ttc');assert.equal(realpathSync(source),source);const copiedFontSha256=sha256(readFileSync(source)),relativeSuffix='.local/share/fonts/school-teacher-ci/wqy-zenhei.ttc';assert(process.env.HOME);const target=join(realpathSync(process.env.HOME),relativeSuffix);mkdirSync(dirname(target),{recursive:true});assert.equal(realpathSync(dirname(target)),dirname(target));assert(!existsSync(target),'Never overwrite an existing user font');
 stage='font-copy';command(stage,'cp',[source,target]);assert.equal(realpathSync(target),target);assert.equal(sha256(readFileSync(target)),copiedFontSha256);stage='font-cache';command(stage,'fc-cache',['-f',dirname(target)]);
 receipt('official-font-preparation',{schemaVersion:1,scope:'official-cjk-font-preparation',currentHead:git('rev-parse','HEAD'),ciRunId:process.env.GITHUB_RUN_ID,package:'fonts-wqy-zenhei',version:'0.9.45-8',architecture:'all',metadataSource:'apt-cache:fonts-wqy-zenhei=0.9.45-8',packageUrl:FONT_PACKAGE_URL,debSha256,copiedFontSha256,relativeSuffix});receipt('font-preparation-status',{status:'PREPARED_NOT_VISUALLY_QUALIFIED',visualQualification:false});
 }catch{receipt('font-preparation-status',{status:'BLOCKED',failedStage:stage,visualQualification:false,businessCollectionMayContinue:true})}}

function privateRoot(){assert(process.env.RUNNER_TEMP);const root=realpathSync(process.env.RUNNER_TEMP),p=join(root,'school-teacher-checks-private');if(!existsSync(p))mkdirSync(p,{mode:0o700});assert.equal(realpathSync(p),p);return p}
export function safeDiagnostic(raw){const text=String(raw),locations=[...text.matchAll(/(?:server-version\/)?(?:src|scripts|prisma)\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]sx?|prisma)(?::\d+(?::\d+)?|\(\d+,\d+\))/g)].map(m=>m[0]),codes=[...text.matchAll(/\berror TS\d{4,5}\b/g)].map(m=>m[0]);return {rawSha256:sha256(text),codeLocations:[...new Set(locations)].slice(0,100),compilerCodes:[...new Set(codes)],rawRetainedAfterRunnerDestruction:false};}
export function safeTestFailure(messages,allowedSourcePaths){
 const text=(Array.isArray(messages)?messages:[]).filter(v=>typeof v==='string').join('\n');
 const types=[...text.matchAll(/(?:^|\n)(TypeError|ReferenceError|SyntaxError|RangeError|AssertionError|Error):/g)].map(m=>m[1]);
 const codeLocations=safeDiagnostic(text).codeLocations.filter(location=>allowedSourcePaths.has(location.replace(/(?::\d+(?::\d+)?|\(\d+,\d+\))$/,'')));
 return {errorTypes:[...new Set(types)],codeLocations:codeLocations.slice(0,20),diagnosticSha256:sha256(text)};
}
export function parseSeedDiagnostic(raw,contract){
 const prefix='SCHOOL_TEACHER_SEED_DIAGNOSTIC ',lines=String(raw).split(/\r?\n/).filter(line=>line.startsWith(prefix));
 if(lines.length===0)return {status:'MISSING_SAFE_DIAGNOSTIC'};
 if(lines.length!==1||lines[0].length>1024)return {status:'INVALID_SAFE_DIAGNOSTIC'};
 try{const r=JSON.parse(lines[0].slice(prefix.length));assert.deepEqual(Object.keys(r).sort(),['code','errorName','schemaVersion','stage','status']);assert.equal(r.schemaVersion,1);assert.equal(r.status,'FAILED');for(const [key,list]of [['stage','stages'],['errorName','errorNames'],['code','codes']]){assert.equal(typeof r[key],'string');assert(Array.isArray(contract[list])&&contract[list].includes(r[key]))}return r}catch{return {status:'INVALID_SAFE_DIAGNOSTIC'}}
}
function seedDiagnostic(raw){try{const {seedDiagnosticContract}=createRequire(resolve('server-version/e2e/school-teacher-fixture.cjs'))(resolve('server-version/e2e/school-teacher-fixture.cjs'));return parseSeedDiagnostic(raw,seedDiagnosticContract)}catch{return {status:'CONTRACT_UNAVAILABLE'}}}
function command(stage,exe,args,cwd=process.cwd(),env=process.env){
 const result=spawnSync(exe,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:12*60*1000});
 writeFileSync(join(privateRoot(),stage+'.log'),(result.stdout||'')+(result.stderr||''),{mode:0o600});
 receipt('command-'+stage,{stage,exitCode:result.status,signal:result.signal||null,status:result.status===0?'COMMAND_SUCCEEDED':'COMMAND_FAILED',...safeDiagnostic((result.stdout||'')+(result.stderr||'')),...(stage==='browser-fixture'&&result.status!==0?{seedDiagnostic:seedDiagnostic((result.stdout||'')+(result.stderr||''))}:{})});
 assert.equal(result.status,0,stage+' failed; private diagnostic SHA256 '+sha256((result.stdout||'')+(result.stderr||'')));
 return result.stdout;
}
export function inspectHistoricalCase(group,report,index,bytes){assert.equal(group.originalExecutionSigned,false);assert.equal(group.ciExecuted,false);assert.equal(sha256(bytes),report.sha256);
 const parsed=JSON.parse(bytes),actual=parsed.testResults.flatMap(s=>s.assertionResults||[])[index],saved=report.cases[index];assert(actual&&saved);
 assert.deepEqual({name:actual.fullName,status:actual.status},saved);return {caseName:saved.name,status:saved.status,invocationSuccess:parsed.success===true,originalExecutionSigned:false,ciExecuted:false,admitted:false};}
const auditSeverities=['info','low','moderate','high','critical'];
const npmErrorCodes=new Set(['ENOLOCK','EAUDITNOLOCK','ENOAUDIT','EUSAGE','EJSONPARSE','ENOTFOUND','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','EINTEGRITY','E400','E401','E402','E403','E404','E405','E408','E409','E413','E429','E500','E502','E503','E504']);
function safeAuditRange(value){
 if(typeof value!=='string'||value.length>200)return null;
 const token=/^(?:[<>=~^]{1,2})?(?:v?\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]{1,40})?(?:\+[0-9A-Za-z.-]{1,40})?$/;
 return value.replace(/([<>=~^]+)\s+/g,'$1').trim().split(/\s+/).every(s=>s==='||'||s==='-'||token.test(s))?value:null;
}
export function safeNpmAudit(raw,allowedPackages){
 let parsed;try{parsed=JSON.parse(raw)}catch{return {format:'OUTPUT_UNPARSEABLE',errorCode:'OUTPUT_UNPARSEABLE',counts:null,vulnerabilities:[]}};
 if(!parsed||typeof parsed!=='object')return {format:'OUTPUT_UNPARSEABLE',errorCode:'OUTPUT_UNPARSEABLE',counts:null,vulnerabilities:[]};
 const c=parsed.metadata?.vulnerabilities,counts=c&&[...auditSeverities,'total'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)?Object.fromEntries([...auditSeverities,'total'].map(k=>[k,c[k]])):null;
 const errorCode=parsed.error?(npmErrorCodes.has(parsed.error.code)?parsed.error.code:'UNRECOGNIZED_ERROR'):null;
 const vulnerabilities=[];
 for(const [name,v] of Object.entries(parsed.vulnerabilities||{})){
  if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)||!allowedPackages.has(name)||!v||typeof v!=='object'||!auditSeverities.includes(v.severity))continue;
  const advisories=[];
  for(const a of Array.isArray(v.via)?v.via:[]){
   if(!a||typeof a!=='object')continue;
   const entry={};if(Number.isSafeInteger(a.source)&&a.source>0)entry.source=a.source;
   const ghsa=typeof a.url==='string'&&a.url.match(/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/i);if(ghsa)entry.advisoryId=ghsa[1];
   if(auditSeverities.includes(a.severity))entry.severity=a.severity;
   const range=safeAuditRange(a.range);if(range!==null)entry.range=range;
   if(entry.source||entry.advisoryId)advisories.push(entry);
  }
  vulnerabilities.push({name,severity:v.severity,range:safeAuditRange(v.range),advisories});
 }
 return {format:parsed.auditReportVersion===2?'NPM_AUDIT_V2':'UNRECOGNIZED_FORMAT',errorCode,counts,vulnerabilities};
}
export function requireNpmAuditSuccess(exitCode,report){
 assert.equal(exitCode,0,'npm audit returned a nonzero result');assert.equal(report.format,'NPM_AUDIT_V2');assert.equal(report.errorCode,null);assert(report.counts);
 assert.equal(report.counts.total,auditSeverities.reduce((sum,k)=>sum+report.counts[k],0));assert.equal(report.counts.high,0);assert.equal(report.counts.critical,0);
}
function auditComponent(component){
 const cwd=resolve('server-version',component),stage=component+'-audit';
 const result=spawnSync('npm',['audit','--package-lock-only','--omit=dev','--audit-level=high','--json'],{cwd,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:12*60*1000});
 const raw=(result.stdout||'')+(result.stderr||'');writeFileSync(join(privateRoot(),stage+'.log'),raw,{mode:0o600});
 receipt('command-'+stage,{stage,exitCode:result.status,signal:result.signal||null,status:result.status===0?'COMMAND_SUCCEEDED':'COMMAND_FAILED',...safeDiagnostic(raw)});
 const lock=JSON.parse(readFileSync(join(cwd,'package-lock.json'),'utf8')),names=new Set(Object.keys(lock.packages||{}).filter(p=>p.includes('node_modules/')).map(p=>p.split('node_modules/').at(-1)));
 const diagnostic=safeNpmAudit(result.stdout||'',names);receipt(stage+'-summary',{stage,exitCode:result.status,threshold:'HIGH/CRITICAL',...diagnostic,rawSha256:sha256(raw),rawRetainedAfterRunnerDestruction:false});
 requireNpmAuditSuccess(result.status,diagnostic);
}

export function requireReviewedCase(group,report,index,r){assert.equal(group.reviewStatus,'INDEPENDENTLY_REVIEWED');assert.match(group.reviewSha256||'',/^[a-f0-9]{64}$/);assert(group.inputClosure&&/^[a-f0-9]{64}$/.test(group.inputClosure.sha256||''));assert.equal(r.status,'passed');assert(group.admittedCaseKeys.includes(report.sha256+':'+index));return {...r,admitted:true,historicalKind:'reviewed-historical-local'};}
export function verifyTestReport(report,batch){
 assert.equal(report.success,true);assert.equal(report.numFailedTests,0);const cases=report.testResults.flatMap(s=>s.assertionResults||[]);
 const passed=cases.filter(c=>c.status==='passed').map(c=>c.fullName),filtered=cases.filter(c=>['pending','skipped'].includes(c.status)).map(c=>c.fullName);
 assert(passed.length>0,'Zero matched cases');assert.equal(new Set(passed).size,passed.length,'Ambiguous duplicate case name');
 assert.deepEqual(passed.sort(),[...batch.expectedPassed].sort(),'Actual selected assertion set drift');
 assert.deepEqual(filtered.sort(),[...batch.expectedFiltered].sort(),'Unexpected filtering');assert.equal(cases.length,passed.length+filtered.length);
 return {passed:passed.length,filtered:filtered.length,caseNames:passed,wholeInvocationSucceeded:true};
}
function verifyClosure(closure){assert(closure&&Array.isArray(closure.files)&&closure.files.length>0);assert.equal(sha256(JSON.stringify(closure.files)),closure.sha256);for(const f of closure.files){assert.match(f.path,/^(server-version\/|\.github\/)/);assert(!f.path.split('/').includes('..'));assert.equal(git('rev-parse','HEAD:'+f.path),f.blob)}}
export function reviewedCases(group){
 assert.equal(group.originalExecutionSigned,false);assert.equal(group.ciExecuted,false);
 assert(Array.isArray(group.admittedCaseKeys)&&group.admittedCaseKeys.length>0);assert.equal(new Set(group.admittedCaseKeys).size,group.admittedCaseKeys.length);
 const consumed=[],accepted=[];
 for(const r of group.reports){assert.deepEqual(Object.keys(r).sort(),['cases','invocationSuccess','sha256']);assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.equal(typeof r.invocationSuccess,'boolean');
  for(const [i,c]of r.cases.entries()){assert.deepEqual(Object.keys(c).sort(),['name','status']);assert.equal(typeof c.name,'string');assert(['passed','failed','pending','skipped','todo'].includes(c.status));
   const key=r.sha256+':'+i;if(group.admittedCaseKeys.includes(key)){assert(!consumed.includes(key));consumed.push(key);accepted.push({...requireReviewedCase(group,r,i,{caseName:c.name,status:c.status,invocationSuccess:r.invocationSuccess,originalExecutionSigned:false,ciExecuted:false,admitted:false}),originalRawSha256:r.sha256,originalCaseIndex:i,originalRawVerifiedByCI:false});}
  }
 }assert.deepEqual(consumed.sort(),[...group.admittedCaseKeys].sort(),'Missing reviewed case record');return accepted;
}
export function requireNoHistoricalAcceptance(evidence){assert.deepEqual(evidence,{schemaVersion:1,acceptedGroups:[]},'No historical assertions admitted after dependency inputs changed');}
export function auditComponents(components,run,emit){
 assert.deepEqual(components,['frontend','backend'],'Both exact component audits required');
 const results=[];for(const component of components){try{run(component);results.push({component,status:'PASSED'})}catch{results.push({component,status:'FAILED'})}}
 const passed=results.every(r=>r.status==='PASSED');emit({status:passed?'PASSED':'FAILED',threshold:'HIGH/CRITICAL',components:results});
 assert(passed,'One or more component audits failed; inspect each safe component receipt');return results;
}
export function verifyExecutionInputs(b,read=path=>readFileSync(resolve(path),'utf8')){
 const paths=new Set(['.github/scripts/ci-artifact.mjs','.github/release-tools/package.json','.github/release-tools/package-lock.json','server-version/scripts/ci-install-canvas-deps.sh',
  'server-version/frontend/tsconfig.app.json','server-version/frontend/vitest.config.ts','server-version/frontend/src/test/setup.ts','server-version/frontend/vite.config.ts',
  'server-version/backend/tsconfig.json','server-version/backend/vitest.config.ts','server-version/backend/prisma/schema.prisma',
  'server-version/backend/scripts/runtime-table-policy.json','server-version/backend/scripts/runtime-role-defaults.sql','server-version/backend/scripts/runtime-role-contract.mjs','server-version/backend/scripts/release-schema-contract.mjs',
  'server-version/backend/src/modules/survey/builder.compiler.ts','server-version/backend/src/config/database.ts','server-version/backend/src/utils/password.ts','server-version/backend/src/modules/organization/structure.ts','server-version/backend/src/modules/campus/admission.service.ts','server-version/backend/src/services/cacheService.ts',
  'server-version/e2e/school-teacher-fixture.cjs','server-version/e2e/school-teacher-browser.cjs','server-version/e2e/school-teacher-chrome.cjs','server-version/e2e/school-teacher-chrome-permissions.cjs','server-version/e2e/school-teacher-ui.cjs',b.execution.browserHelper]);
 for(const component of ['frontend','backend']){
  const prefix='server-version/'+component+'/';paths.add(prefix+'package.json');paths.add(prefix+'package-lock.json');
  for(const batch of b.execution[component].batches){for(const f of batch.files)paths.add(prefix+f);for(const f of batch.inputClosure.files)paths.add(f.path)}
 }
 for(const f of b.execution.frontend.lintFiles)paths.add('server-version/frontend/'+f);
 for(const p of paths){assert(typeof p==='string'&&!p.startsWith('/')&&!p.split('/').includes('..'));assert(read(p).length>0,'Missing or empty configured source: '+p)}
 const frontend=JSON.parse(read('server-version/frontend/package.json')),backend=JSON.parse(read('server-version/backend/package.json'));
 assert.equal(frontend.scripts?.build,'vite build','Frontend build script changed');assert.equal(backend.scripts?.['db:generate'],'prisma generate','Backend client generation script changed');
 assert.equal(sha256(b.execution.migration.baselineFixtureSql),b.execution.migration.baselineFixtureSha256);
 return {sourcePathsChecked:paths.size,npmScriptsChecked:2,inlineBaselineFixtureHashVerified:true};
}
function admission(b,plan){
 const evidence=JSON.parse(readFileSync('.github/scripts/school-teacher-evidence.json','utf8'));requireNoHistoricalAcceptance(evidence);
 const inputs=verifyExecutionInputs(b);receipt('admission',{status:'PASSED',plan,inputs,historicalAcceptedCases:0,acceptedCases:[]});
}
function batches(component,selected,offset=0){const cwd=resolve('server-version',component),allowedSourcePaths=new Set(git('ls-files','server-version/'+component+'/src').split('\n').map(p=>p.slice(('server-version/'+component+'/').length)));assert(Array.isArray(selected));for(const [index,b] of selected.entries()){const i=index+offset;
 assert(Array.isArray(b.files)&&b.files.length);for(const f of b.files)assert(/^src\/.+\.test\.tsx?$/.test(f)&&!f.split('/').includes('..'));
 assert(b.expectedPassed?.length>0&&Array.isArray(b.expectedFiltered));verifyClosure(b.inputClosure);
 const file=join(privateRoot(),component+'-'+i+'.json'),args=['node_modules/vitest/vitest.mjs','run',...b.files,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile='+file];
 if(b.namePattern){assert.equal(typeof b.namePattern,'string');args.push('-t',b.namePattern)}
 try{command(component+'-tests-'+i,process.execPath,args,cwd)}finally{if(existsSync(file)){const raw=readFileSync(file),report=JSON.parse(raw),known=new Set([...b.expectedPassed,...b.expectedFiltered]);receipt(component+'-tests-'+i+'-actual',{rawSha256:sha256(raw),invocationSuccess:report.success===true,cases:report.testResults.flatMap(s=>s.assertionResults||[]).map(c=>({...known.has(c.fullName)?{name:c.fullName}:{unreviewedNameSha256:sha256(String(c.fullName))},status:['passed','failed','pending','skipped','todo'].includes(c.status)?c.status:'UNKNOWN',...(c.status==='failed'?{failure:safeTestFailure(c.failureMessages,allowedSourcePaths)}:{})})),rawRetainedAfterRunnerDestruction:false})}}
 const raw=readFileSync(file);receipt(component+'-tests-'+i,{...verifyTestReport(JSON.parse(raw),b),reportSha256:sha256(raw),sourceHead:git('rev-parse','HEAD')});
 }}
export function verifyFreshManifest(manifest,{kind,head,runId,lockDigest,contentDigest}){
 assert(['frontend','backend'].includes(kind));assert.match(head,/^[a-f0-9]{40}$/);assert.match(runId,/^\d+$/);
 verifyManifest(manifest,{schemaVersion:1,sha:head,runId,kind,lockDigest},contentDigest);
 return manifest;
}
function freshArtifact(kind){
 for(const name of ['official-frontend-build-reuse','official-backend-build-reuse'])assert.equal(existsSync(join(out,name+'.json')),false,'Fresh qualification cannot consume historical build receipts');
 const dir=resolve('server-version',kind,'dist'),manifest=JSON.parse(readFileSync(join(dir,'ci-build-manifest.json')));
 return verifyFreshManifest(manifest,{kind,head:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID,lockDigest:sha256(readFileSync(resolve('server-version',kind,'package-lock.json'))),contentDigest:treeDigest(dir)});
}
function freshBuild(kind){
 const cwd=resolve('server-version',kind);rmSync(join(cwd,'dist'),{recursive:true,force:true});
 if(kind==='frontend')command('frontend-build','npm',['run','build'],cwd);
 else command('backend-build',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],cwd);
 command(kind+'-manifest',process.execPath,['.github/scripts/ci-artifact.mjs','write',kind]);
 receipt(kind+'-fresh-build',{status:'PASSED',qualification:'fresh-current-source',manifest:freshArtifact(kind)});
}
async function frontend(b){
 if(b.qualification!=='fresh-integrated-authoring'){await reuseCompletedFrontend(b);return}
 const cwd=resolve('server-version/frontend');
 command('frontend-types',process.execPath,['node_modules/typescript/bin/tsc','-b'],cwd);
 if(b.execution.frontend.lintFiles.length)command('frontend-lint',process.execPath,['node_modules/eslint/bin/eslint.js',...b.execution.frontend.lintFiles],cwd);
 batches('frontend',b.execution.frontend.batches);freshBuild('frontend');
}

function databaseGuard(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test');
 assert.equal(existsSync(resolve('server-version/backend/.env')),false,'No developer env allowed');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/school_teacher_browser_ci_test');assert.equal(u.username,'ptool');assert(process.env.DATABASE_URL===process.env.RELEASE_INTEGRATION_DATABASE_URL,'Release test endpoint mismatch');assert(process.env.DATABASE_URL===process.env.SCHOOL_TEACHER_TEST_DATABASE_URL,'School test endpoint mismatch');assert.match(process.env.CI_POSTGRES_SERVICE_ID||'',/^[a-f0-9]{64}$/);
 const d=JSON.parse(command('verify-postgres-service','docker',['inspect',process.env.CI_POSTGRES_SERVICE_ID]))[0];assert.equal(d.Config.Image,'postgres:16.15-bookworm');assert.equal(d.State.Running,true);assert(d.Config.Env.includes('POSTGRES_DB=school_teacher_browser_ci_test'));assert(d.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));assert(d.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===u.port));return u;
}
const identifier=x=>{assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(x));return '"'+x+'"'};
export async function snapshots(client,tables){assert(tables.length>0);const rows=[];for(const entry of tables){const table=typeof entry==='string'?entry:entry.table;identifier(table);const columns=typeof entry==='string'||!entry.columns?(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name):entry.columns;assert(columns.length>0);const projection=columns.map(identifier).join(',');const q=await client.query('SELECT to_jsonb(t)::text AS row FROM (SELECT '+projection+' FROM '+identifier(table)+') t ORDER BY to_jsonb(t)::text');const expectEmpty=typeof entry==='object'&&entry.expectEmpty===true;if(expectEmpty){assert.equal(table,'assessment_result_facts','Only explicitly disabled compact storage may be empty');assert.equal(q.rows.length,0,'Disabled compact storage must remain empty')}else assert(q.rows.length>0,'Nonempty preservation table required: '+table);rows.push({table,columns,count:q.rows.length,sha256:sha256(JSON.stringify(q.rows)),...(expectEmpty?{expectEmpty:true}:{})})}return rows}

async function migrate(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg');const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{const m=b.execution.migration;assert(m.baselineFixtureSql&&m.preserveTables.length);assert.equal(sha256(m.baselineFixtureSql),m.baselineFixtureSha256);
  const dir=mkdtempSync(join(privateRoot(),'baseline-'));const archive=join(privateRoot(),'baseline.tar');
  // Binary git archive uses a direct binary spawn rather than the text diagnostic helper.
  const tar=spawnSync('git',['archive','--format=tar',b.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});assert.equal(tar.status,0);writeFileSync(archive,tar.stdout,{mode:0o600});command('extract-baseline','tar',['-xf',archive,'-C',dir]);
  command('migrate-old',process.execPath,[resolve('server-version/backend/node_modules/prisma/build/index.js'),'migrate','deploy','--schema',join(dir,'server-version/backend/prisma/schema.prisma')]);
  await client.query(m.baselineFixtureSql);const before=await snapshots(client,m.preserveTables);
  command('migrate-current',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],resolve('server-version/backend'));const after=await snapshots(client,before);assert.deepEqual(after,before);receipt('migration',{status:'PASSED',base:b.base,sourceHead:git('rev-parse','HEAD'),preserved:after});
 }finally{await client.end()}}
export function restoreStorageTables(tables,report,identity){
 assert.equal(report.status,'PASSED');assert.equal(report.source.head,identity.head);assert.equal(report.runId,identity.runId);
 assert.deepEqual(report.startups.map(x=>x.product),['SCHOOL','TEACHER']);
 for(const startup of report.startups)assert.equal(startup.ready,true);
 assert.deepEqual(report.storageModes,[{product:'SCHOOL',compactFactsEnabled:false},{product:'TEACHER',compactFactsEnabled:false}],'This qualification verifies the actual default inline storage mode');
 for(const table of ['assessments','composite_form_answers','composite_form_section_attempts','composite_assessment_attempts','assessment_run_executions','relational_assessment_assignments','assessment_result_facts'])assert(tables.includes(table),'Required real result storage must be restored: '+table);
 return tables.map(table=>table==='assessment_result_facts'?{table,expectEmpty:true}:table);
}
async function restore(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg'),u=new URL(process.env.DATABASE_URL),owner=new Client({connectionString:u.href});await owner.connect();const db='school_teacher_restore_ci_test',svc=process.env.CI_POSTGRES_SERVICE_ID;let bodyFailed=false,preserved;
 try{const browserReport=JSON.parse(readFileSync(join(out,'browser.json')));const tables=restoreStorageTables(b.execution.migration.restoreTables,browserReport,{head:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID});const before=await snapshots(owner,tables);preserved=before;await owner.query('CREATE DATABASE '+identifier(db));
  command('dump-current','docker',['exec',svc,'pg_dump','-U','ptool','-d','school_teacher_browser_ci_test','--format=custom','--file=/tmp/school-teacher.dump']);
  command('restore-current','docker',['exec',svc,'pg_restore','-U','ptool','-d',db,'--exit-on-error','/tmp/school-teacher.dump']);u.pathname='/'+db;const restored=new Client({connectionString:u.href});await restored.connect();try{assert.deepEqual(await snapshots(restored,before),before)}finally{await restored.end()}
  const fixtureModule=await import(pathToFileURL(resolve('server-version/e2e/school-teacher-fixture.cjs'))),fixture=(fixtureModule.default||fixtureModule).readFixture().value;const runtimeUrl=new URL(fixture.runtimeUrl);assert.equal(runtimeUrl.hostname,u.hostname);runtimeUrl.pathname='/'+db;const {PrismaClient}=createRequire(resolve('server-version/backend/package.json'))('@prisma/client');const runtime=new PrismaClient({datasources:{db:{url:runtimeUrl.href}}});try{const {verifyRuntimePrivileges}=await import(pathToFileURL(resolve('server-version/backend/scripts/runtime-role-contract.mjs'))),{verifyReleaseSchema}=await import(pathToFileURL(resolve('server-version/backend/scripts/release-schema-contract.mjs')));assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole,true);await verifyReleaseSchema(runtime);}finally{await runtime.$disconnect()}
 }catch(error){bodyFailed=true;throw error}finally{
  const failures=[];
  for(const [stage,cleanup] of [
   ['drop-restore-database',()=>owner.query('DROP DATABASE IF EXISTS '+identifier(db)+' WITH (FORCE)')],
   ['close-restore-owner',()=>owner.end()],
   ['remove-private-dump',()=>command('remove-private-dump','docker',['exec',svc,'rm','-f','/tmp/school-teacher.dump'])]
  ]){try{await cleanup()}catch(error){failures.push({stage,messageHash:sha256(String(error))})}}
  if(failures.length){
   try{receipt('restore-cleanup',{status:'FAILED',errors:failures})}catch{/* Preserve primary error, or fail below. */}
   if(!bodyFailed)throw Error('Restore cleanup failed; no passing restore receipt was written');
  }
 }
 receipt('restore',{status:'PASSED',preserved,restrictedRuntimeRole:true,releaseSchemaVerified:true});
}
function cleanup(){const root=realpathSync(process.env.RUNNER_TEMP);for(const name of ['school-teacher-private','school-teacher-checks-private','school-teacher-seed.log']){const p=join(root,name);if(existsSync(p)){assert.equal(realpathSync(p),p);rmSync(p,{recursive:true})}}receipt('cleanup',{privateMaterialRemoved:true})}
async function main(){const phase=process.argv[2];if(phase==='cleanup'){cleanup();return}assert.equal(process.version,'v24.21.0');const b=binding(),plan=actualPlan();assert.deepEqual(plan,JSON.parse(process.env.PLAN));const fresh=b.qualification==='fresh-integrated-authoring';
 if(phase==='admission')admission(b,plan);
 else if(phase==='frontend')await frontend(b);
 else if(phase==='verify-frontend-artifact')fresh?freshArtifact('frontend'):verifyConnectedFrontend();
 else if(phase==='backend'){if(fresh)freshBuild('backend');else await reuseCompletedBackend(b);}
 else if(phase==='verify-backend-artifact')fresh?freshArtifact('backend'):verifyConnectedBackend();
 else if(phase==='migrate'){if(fresh){freshArtifact('backend');await migrate(b)}else await prepareCurrentDatabase(b);}
 else if(phase==='postgres'){if(fresh){freshArtifact('backend');databaseGuard();assert.notEqual(process.env.EDUCATION_MATERIAL_CAPACITY_PROBE_STUB,'true','Real upload admission capacity required');batches('backend',b.execution.backend.batches)}else{verifyConnectedBackend();await reuseCompletedRemainder(b)}}
 else if(phase==='fonts')prepareFonts();
 else if(phase==='seed'){databaseGuard();command('browser-fixture',process.execPath,['server-version/e2e/school-teacher-fixture.cjs','seed']);}
 else if(phase==='restore')await restore(b);
 else if(phase==='browser-report'){const module=await import(pathToFileURL(resolve(b.execution.browserHelper))),helper=module.default||module;assert.equal(typeof helper.verifyReport,'function');const report=JSON.parse(readFileSync(join(out,'browser.json'))),frontend=JSON.parse(readFileSync('server-version/frontend/dist/ci-build-manifest.json')),backend=JSON.parse(readFileSync('server-version/backend/dist/ci-build-manifest.json'));const result=helper.verifyReport(report,{head:plan.head,tree:plan.sourceTree,runId:process.env.GITHUB_RUN_ID,frontend,backend,...(fresh?{frontend:freshArtifact('frontend'),backend:freshArtifact('backend')}:{officialFrontendReuse:verifyConnectedFrontend(),officialBackendReuse:verifyConnectedBackend(),backendCompileDigest:verifyBackendCompileInputs()}),backendLockDigest:sha256(readFileSync('server-version/backend/package-lock.json')),backendContentDigest:treeDigest(resolve('server-version/backend/dist')),frontendTree:git('rev-parse','HEAD:server-version/frontend'),frontendLockDigest:sha256(readFileSync('server-version/frontend/package-lock.json')),frontendContentDigest:treeDigest(resolve('server-version/frontend/dist'))},file=>{assert(/^screenshots\/[a-z0-9-]+\.png$/.test(file));return readFileSync(join(out,file))});receipt('browser-acceptance',result);}
 else if(phase==='audit'){if(fresh)auditComponents(b.execution.auditComponents,auditComponent,value=>receipt('audit',value));else await reuseOfficial('audit',b);}
 else if(phase==='sast-reuse'){assert.equal(fresh,false,'Fresh qualification requires actual SAST, never historical reuse');await reuseOfficial('sast',b);}
 else if(phase==='aggregate')requireSuccess(plan,JSON.parse(process.env.NEEDS_JSON));
 else throw Error('Unknown phase');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main()}catch(error){const phase=process.argv[2];assert(/^[a-z-]+$/.test(phase||''));const raw=String(error?.stack||error);writeFileSync(join(privateRoot(),'phase-'+phase+'.log'),raw,{mode:0o600});receipt('phase-'+phase+'-failure',{phase,status:'FAILED',...safeDiagnostic(raw)});console.error('School Teacher phase failed: '+phase+'; see safe diagnostic SHA '+sha256(raw));process.exitCode=1;}}
