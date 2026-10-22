import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {binding,actualPlan,requireSuccess,sha256,git} from './school-teacher-scope.mjs';
const out=resolve('school-teacher-evidence');
function receipt(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n')}
const RESUME={run:39867718449,head:'dcbc58483c6b6ce8a81526ddbc124a8b1c1c993c',checkout:'81ee1f6d6a097e0c9e0aca3da05582f614325878',frontendJob:120134202466,auditJob:120134202442,sastJob:120134095190,frontendArtifact:12465090917,frontendDigest:'7663300255799eff7bd3e8f4ac7f79fef42e3ad62af40da66d5f947876241451',auditArtifact:12464502959,auditDigest:'dac8363a31ff8e8a05809ec80d9b31929624e0be9a9f06bc549d2fb0e66fda1b',workflowSha256:'3711b141411280f2775ba9475d72b4011ecbfd664789b5228114eefee58331d7'};
const C05='C05 shared structured constraints preserve Survey V2 total zero and row choice bounds';
const fullSastPaths='paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]';
const controlSastPaths='paths: [.github/scripts/school-teacher-checks.mjs, .github/scripts/school-teacher.test.mjs, .github/scripts/school-teacher-bindings.json]';
export function verifyOfficialJob(run,job,kind,now=Date.now()){
 assert.equal(run.id,RESUME.run);assert.equal(run.head_sha,RESUME.head);assert.equal(run.head_branch,'work/school-teacher-review-20261022');assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert(run.pull_requests.some(p=>p.number===338));
 assert.equal(job.id,RESUME[kind+'Job']);assert.equal(job.run_id,RESUME.run);assert.equal(job.head_sha,RESUME.head);assert.equal(job.status,'completed');assert.equal(job.conclusion,kind==='frontend'?'failure':'success');
 const names={frontend:'school-teacher / frontend',audit:'school-teacher / security',sast:'codeql (javascript/typescript SAST)'};assert.equal(job.name,names[kind]);const age=now-Date.parse(job.completed_at);assert(Number.isFinite(age)&&age>=0&&age<=86400000,'Official evidence expired');
 const stages=kind==='sast'?['initialize CodeQL','analyze with CodeQL']:kind==='audit'?['retain HIGH CRITICAL production dependency threshold without rebuilding']:['prepare exact backend contracts for frontend types without native lifecycle builds'];
 for(const name of stages)assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'),'Required original stage missing');
 if(kind==='frontend')assert(job.steps.some(s=>s.name==='run only frozen affected checks then compile once and bind dist'&&s.conclusion==='failure'),'Original frontend failure must remain explicit');
}
export function verifyResumeInputs(b,read=git){
 assert.deepEqual(b.execution.officialResume,RESUME);assert.equal(read('rev-parse',RESUME.head+'^{tree}'),read('rev-parse',RESUME.checkout+'^{tree}'));
 const inputs={};for(const path of ['server-version/frontend','server-version/backend','server-version/e2e']){inputs[path]=read('rev-parse',RESUME.checkout+':'+path);assert.equal(read('rev-parse','HEAD:'+path),inputs[path],'Previously checked component input changed: '+path)}
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
export function verifySastConfig(original,current){
 const stage=(text,name)=>{const start=text.indexOf('      - name: '+name+'\n');assert(start>=0);const end=text.indexOf('\n      - ',start+1);return text.slice(start,end<0?undefined:end)};
 assert(stage(original,'initialize CodeQL').includes("application_route == 'school-teacher' && '"+fullSastPaths+"'"));
 assert.equal(stage(current,'initialize CodeQL'),stage(original,'initialize CodeQL').replace(fullSastPaths,controlSastPaths),'SAST language/query/action/resource configuration changed');assert.equal(stage(current,'analyze with CodeQL'),stage(original,'analyze with CodeQL'));
}
export function verifySastLog(log){assert(log.includes('config: '+fullSastPaths));assert(log.includes('languages: javascript-typescript'));assert(new RegExp('\\n[0-9T:.-]+Z '+RESUME.checkout+'(?:\\r?\\n|$)').test(log),'Original actual SAST checkout differs');}
async function officialApi(path,binary=false){assert(process.env.GH_TOKEN,'Official Actions read token required');const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(response.status,200,'Official evidence unavailable');return binary?Buffer.from(await response.arrayBuffer()):response.json()}
async function readOfficialArtifact(kind){
 const id=RESUME[kind+'Artifact'],digest=RESUME[kind+'Digest'],meta=await officialApi('/actions/artifacts/'+id);assert.equal(meta.id,id);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+digest);assert.equal(meta.workflow_run.id,RESUME.run);assert.equal(meta.workflow_run.head_sha,RESUME.head);assert.equal(meta.name,'school-teacher-'+(kind==='frontend'?'frontend-checks':'audit')+'-'+RESUME.checkout);
 const bytes=await officialApi('/actions/artifacts/'+id+'/zip',true);assert.equal(sha256(bytes),digest,'Original ZIP digest changed');const file=join(privateRoot(),'official-'+kind+'.zip');writeFileSync(file,bytes,{mode:0o600});const list=spawnSync('unzip',['-Z1',file],{encoding:'utf8'});assert.equal(list.status,0);const names=list.stdout.trim().split('\n');assert.equal(names.length,new Set(names).size);assert(names.every(n=>/^[a-z0-9-]+\.json$/.test(n)));
 return name=>{assert(names.includes(name),'Missing original receipt '+name);const result=spawnSync('unzip',['-p',file,name],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(result.status,0);return JSON.parse(result.stdout)};
}
async function reuseOfficial(kind,b){
 const inputs=verifyResumeInputs(b),run=await officialApi('/actions/runs/'+RESUME.run),job=await officialApi('/actions/jobs/'+RESUME[kind+'Job']);verifyOfficialJob(run,job,kind);
 const result={kind:'official-successful-subcheck-reuse',originalRun:RESUME.run,originalHead:RESUME.head,originalCheckout:RESUME.checkout,originalJob:job.id,originalParentConclusion:'failure',originalJobConclusion:job.conclusion,currentHead:git('rev-parse','HEAD'),inputs};
 if(kind==='frontend')result.completed=verifyCompletedFrontend(await readOfficialArtifact(kind),b);
 else if(kind==='audit')result.completed=verifyCompletedAudit(await readOfficialArtifact(kind));
 else{assert.equal(kind,'sast');const original=git('show',RESUME.checkout+':.github/workflows/ci.yml');assert.equal(sha256(original+'\n'),RESUME.workflowSha256,'Original workflow bytes changed');verifySastConfig(original,readFileSync('.github/workflows/ci.yml','utf8').trimEnd());const logs=(await officialApi('/actions/jobs/'+RESUME.sastJob+'/logs',true)).toString('utf8');verifySastLog(logs);result.originalJobLogSha256=sha256(logs);assert.deepEqual(git('diff','--name-only',RESUME.checkout,'HEAD','--','.github/scripts').split('\n'),['.github/scripts/school-teacher-bindings.json','.github/scripts/school-teacher-checks.mjs','.github/scripts/school-teacher.test.mjs']);result.applicationScannedAgain=false;result.currentChangedControlScanRequired=true;}
 receipt('official-'+kind+'-reuse',result);return result;
}

function privateRoot(){assert(process.env.RUNNER_TEMP);const root=realpathSync(process.env.RUNNER_TEMP),p=join(root,'school-teacher-checks-private');if(!existsSync(p))mkdirSync(p,{mode:0o700});assert.equal(realpathSync(p),p);return p}
export function safeDiagnostic(raw){const text=String(raw),locations=[...text.matchAll(/(?:server-version\/)?(?:src|scripts|prisma)\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]sx?|prisma)(?::\d+(?::\d+)?|\(\d+,\d+\))/g)].map(m=>m[0]),codes=[...text.matchAll(/\berror TS\d{4,5}\b/g)].map(m=>m[0]);return {rawSha256:sha256(text),codeLocations:[...new Set(locations)].slice(0,100),compilerCodes:[...new Set(codes)],rawRetainedAfterRunnerDestruction:false};}
function command(stage,exe,args,cwd=process.cwd(),env=process.env){
 const result=spawnSync(exe,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:12*60*1000});
 writeFileSync(join(privateRoot(),stage+'.log'),(result.stdout||'')+(result.stderr||''),{mode:0o600});
 receipt('command-'+stage,{stage,exitCode:result.status,signal:result.signal||null,status:result.status===0?'COMMAND_SUCCEEDED':'COMMAND_FAILED',...safeDiagnostic((result.stdout||'')+(result.stderr||''))});
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
  'server-version/e2e/school-teacher-fixture.cjs','server-version/e2e/school-teacher-browser.cjs','server-version/e2e/school-teacher-chrome.cjs','server-version/e2e/school-teacher-ui.cjs',b.execution.browserHelper]);
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
function batches(component,selected,offset=0){const cwd=resolve('server-version',component);assert(Array.isArray(selected));for(const [index,b] of selected.entries()){const i=index+offset;
 assert(Array.isArray(b.files)&&b.files.length);for(const f of b.files)assert(/^src\/.+\.test\.tsx?$/.test(f)&&!f.split('/').includes('..'));
 assert(b.expectedPassed?.length>0&&Array.isArray(b.expectedFiltered));verifyClosure(b.inputClosure);
 const file=join(privateRoot(),component+'-'+i+'.json'),args=['node_modules/vitest/vitest.mjs','run',...b.files,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile='+file];
 if(b.namePattern){assert.equal(typeof b.namePattern,'string');args.push('-t',b.namePattern)}
 try{command(component+'-tests-'+i,process.execPath,args,cwd)}finally{if(existsSync(file)){const raw=readFileSync(file),report=JSON.parse(raw),known=new Set([...b.expectedPassed,...b.expectedFiltered]);receipt(component+'-tests-'+i+'-actual',{rawSha256:sha256(raw),invocationSuccess:report.success===true,cases:report.testResults.flatMap(s=>s.assertionResults||[]).map(c=>({...known.has(c.fullName)?{name:c.fullName}:{unreviewedNameSha256:sha256(String(c.fullName))},status:['passed','failed','pending','skipped','todo'].includes(c.status)?c.status:'UNKNOWN'})),rawRetainedAfterRunnerDestruction:false})}}
 const raw=readFileSync(file);receipt(component+'-tests-'+i,{...verifyTestReport(JSON.parse(raw),b),reportSha256:sha256(raw),sourceHead:git('rev-parse','HEAD')});
 }}
async function frontend(b){const cwd=resolve('server-version/frontend'),p=b.execution.frontend;await reuseOfficial('frontend',b);
 batches('frontend',p.batches.slice(4),4);command('frontend-build','npm',['run','build'],cwd);command('frontend-manifest',process.execPath,['.github/scripts/ci-artifact.mjs','write','frontend']);receipt('frontend',{status:'PASSED',freshBuild:true,typesExecuted:false,typesAndLintOfficiallyReused:true,previousPassedCasesReused:10,currentCasesRequired:13});
}
function databaseGuard(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test');
 assert.equal(existsSync(resolve('server-version/backend/.env')),false,'No developer env allowed');const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/school_teacher_browser_ci_test');assert.equal(u.username,'ptool');assert(process.env.DATABASE_URL===process.env.RELEASE_INTEGRATION_DATABASE_URL,'Release test endpoint mismatch');assert(process.env.DATABASE_URL===process.env.SCHOOL_TEACHER_TEST_DATABASE_URL,'School test endpoint mismatch');assert.match(process.env.CI_POSTGRES_SERVICE_ID||'',/^[a-f0-9]{64}$/);
 const d=JSON.parse(command('verify-postgres-service','docker',['inspect',process.env.CI_POSTGRES_SERVICE_ID]))[0];assert.equal(d.Config.Image,'postgres:16.15-bookworm');assert.equal(d.State.Running,true);assert(d.Config.Env.includes('POSTGRES_DB=school_teacher_browser_ci_test'));assert(d.Mounts.every(m=>m.Type==='volume'&&/^[a-f0-9]{64}$/.test(m.Name)));assert(d.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort===u.port));return u;
}
const identifier=x=>{assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(x));return '"'+x+'"'};
async function snapshots(client,tables){assert(tables.length>0);const rows=[];for(const entry of tables){const table=typeof entry==='string'?entry:entry.table;identifier(table);const columns=typeof entry==='string'?(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name):entry.columns;assert(columns.length>0);const projection=columns.map(identifier).join(',');const q=await client.query('SELECT to_jsonb(t)::text AS row FROM (SELECT '+projection+' FROM '+identifier(table)+') t ORDER BY to_jsonb(t)::text');assert(q.rows.length>0,'Nonempty preservation table required: '+table);rows.push({table,columns,count:q.rows.length,sha256:sha256(JSON.stringify(q.rows))})}return rows}

async function migrate(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg');const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{const m=b.execution.migration;assert(m.baselineFixtureSql&&m.preserveTables.length);assert.equal(sha256(m.baselineFixtureSql),m.baselineFixtureSha256);
  const dir=mkdtempSync(join(privateRoot(),'baseline-'));const archive=join(privateRoot(),'baseline.tar');
  // Binary git archive uses a direct binary spawn rather than the text diagnostic helper.
  const tar=spawnSync('git',['archive','--format=tar',b.base,'server-version/backend/prisma'],{maxBuffer:32*1024*1024});assert.equal(tar.status,0);writeFileSync(archive,tar.stdout,{mode:0o600});command('extract-baseline','tar',['-xf',archive,'-C',dir]);
  command('migrate-old',process.execPath,[resolve('server-version/backend/node_modules/prisma/build/index.js'),'migrate','deploy','--schema',join(dir,'server-version/backend/prisma/schema.prisma')]);
  await client.query(m.baselineFixtureSql);const before=await snapshots(client,m.preserveTables);
  command('migrate-current',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],resolve('server-version/backend'));const after=await snapshots(client,before);assert.deepEqual(after,before);receipt('migration',{status:'PASSED',base:b.base,sourceHead:git('rev-parse','HEAD'),preserved:after});
 }finally{await client.end()}}
async function restore(b){databaseGuard();const {Client}=createRequire(resolve('server-version/backend/package.json'))('pg'),u=new URL(process.env.DATABASE_URL),owner=new Client({connectionString:u.href});await owner.connect();const db='school_teacher_restore_ci_test',svc=process.env.CI_POSTGRES_SERVICE_ID;
 try{const before=await snapshots(owner,b.execution.migration.restoreTables);await owner.query('CREATE DATABASE '+identifier(db));
  command('dump-current','docker',['exec',svc,'pg_dump','-U','ptool','-d','school_teacher_browser_ci_test','--format=custom','--file=/tmp/school-teacher.dump']);
  command('restore-current','docker',['exec',svc,'pg_restore','-U','ptool','-d',db,'--exit-on-error','/tmp/school-teacher.dump']);u.pathname='/'+db;const restored=new Client({connectionString:u.href});await restored.connect();try{assert.deepEqual(await snapshots(restored,before),before)}finally{await restored.end()}
  const fixtureModule=await import(pathToFileURL(resolve('server-version/e2e/school-teacher-fixture.cjs'))),fixture=(fixtureModule.default||fixtureModule).readFixture().value;const runtimeUrl=new URL(fixture.runtimeUrl);assert.equal(runtimeUrl.hostname,u.hostname);runtimeUrl.pathname='/'+db;const {PrismaClient}=createRequire(resolve('server-version/backend/package.json'))('@prisma/client');const runtime=new PrismaClient({datasources:{db:{url:runtimeUrl.href}}});try{const {verifyRuntimePrivileges}=await import(pathToFileURL(resolve('server-version/backend/scripts/runtime-role-contract.mjs'))),{verifyReleaseSchema}=await import(pathToFileURL(resolve('server-version/backend/scripts/release-schema-contract.mjs')));assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole,true);await verifyReleaseSchema(runtime);}finally{await runtime.$disconnect()}
  receipt('restore',{status:'PASSED',preserved:before,restrictedRuntimeRole:true,releaseSchemaVerified:true});
 }finally{await owner.query('DROP DATABASE IF EXISTS '+identifier(db)+' WITH (FORCE)');await owner.end();command('remove-private-dump','docker',['exec',svc,'rm','-f','/tmp/school-teacher.dump'])}}
function cleanup(){const root=realpathSync(process.env.RUNNER_TEMP);for(const name of ['school-teacher-private','school-teacher-checks-private','school-teacher-seed.log']){const p=join(root,name);if(existsSync(p)){assert.equal(realpathSync(p),p);rmSync(p,{recursive:true})}}receipt('cleanup',{privateMaterialRemoved:true})}
async function main(){const phase=process.argv[2];if(phase==='cleanup'){cleanup();return}assert.equal(process.version,'v24.21.0');const b=binding(),plan=actualPlan();assert.deepEqual(plan,JSON.parse(process.env.PLAN));
 if(phase==='admission')admission(b,plan);
 else if(phase==='frontend')await frontend(b);
 else if(phase==='backend'){assert.equal(b.backendBuildDecision,'fresh-once');command('backend-compile',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],resolve('server-version/backend'));command('backend-manifest',process.execPath,['.github/scripts/ci-artifact.mjs','write','backend']);}
 else if(phase==='migrate')await migrate(b);
 else if(phase==='postgres'){databaseGuard();assert(b.execution.backend.batches.length>0);batches('backend',b.execution.backend.batches)}
 else if(phase==='seed'){databaseGuard();command('browser-fixture',process.execPath,['server-version/e2e/school-teacher-fixture.cjs','seed']);}
 else if(phase==='restore')await restore(b);
 else if(phase==='browser-report'){const module=await import(pathToFileURL(resolve(b.execution.browserHelper))),helper=module.default||module;assert.equal(typeof helper.verifyReport,'function');const report=JSON.parse(readFileSync(join(out,'browser.json'))),frontend=JSON.parse(readFileSync('server-version/frontend/dist/ci-build-manifest.json')),backend=JSON.parse(readFileSync('server-version/backend/dist/ci-build-manifest.json'));const result=helper.verifyReport(report,{head:plan.head,tree:plan.sourceTree,runId:process.env.GITHUB_RUN_ID,frontend,backend},file=>{assert(/^screenshots\/[a-z0-9-]+\.png$/.test(file));return readFileSync(join(out,file))});receipt('browser-acceptance',result);}
 else if(phase==='audit')await reuseOfficial('audit',b);
 else if(phase==='sast-reuse')await reuseOfficial('sast',b);
 else if(phase==='aggregate')requireSuccess(plan,JSON.parse(process.env.NEEDS_JSON));
 else throw Error('Unknown phase');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main()}catch(error){const phase=process.argv[2];assert(/^[a-z-]+$/.test(phase||''));const raw=String(error?.stack||error);writeFileSync(join(privateRoot(),'phase-'+phase+'.log'),raw,{mode:0o600});receipt('phase-'+phase+'-failure',{phase,status:'FAILED',...safeDiagnostic(raw)});console.error('School Teacher phase failed: '+phase+'; see safe diagnostic SHA '+sha256(raw));process.exitCode=1;}}
