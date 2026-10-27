import assert from 'node:assert/strict';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,rmSync,openSync,closeSync,readSync,existsSync,realpathSync,chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {request as httpsRequest} from 'node:https';
import {lookup} from 'node:dns/promises';
import {pathToFileURL} from 'node:url';
import {pr363Plan,requirePr363Jobs,safePath,binding,digest} from './pr363-scope.mjs';
import {changedEntries} from './content-scope.mjs';
import {treeDigest,verifyManifest} from './ci-artifact.mjs';
export function jsonPointer(value,pointer){
 assert(typeof pointer==='string'&&(pointer===''||pointer.startsWith('/')),'Explicit JSON pointer required');
 for(const raw of pointer.split('/').slice(1)){const key=raw.replace(/~1/g,'/').replace(/~0/g,'~');assert(value!==null&&typeof value==='object'&&Object.hasOwn(value,key),'Missing original field '+pointer);value=value[key];}return value;
}
/** An in-memory view of a fixed original verbose log, never a new test report.
 * Exact case rows and the original summary must agree; unknown formats stop. */
export function readVerboseCases(raw){
 const text=raw.replace(/\x1b\[[0-9;]*m/g,'');
 const rows=[];
 for(const line of text.split(/\r?\n/)){
  const m=/^\s*([✓✔×✕↓])\s+(.+?)(?:\s+\d+(?:\.\d+)?(?:ms|s))?\s*$/.exec(line);
  if(m&&m[2].includes(' > '))rows.push({fullName:m[2],status:['✓','✔'].includes(m[1])?'passed':m[1]==='↓'?'skipped':'failed'});
 }
 const summaries=[...text.matchAll(/^\s*Tests\s+(.+)$/gm)];assert.equal(summaries.length,1,'Exactly one original verbose invocation required');
 const summary=summaries[0][1],total=/\((\d+)\)\s*$/.exec(summary);assert(total,'Original total missing');
 const counts={passed:0,failed:0,skipped:0};
 for(const m of summary.matchAll(/(\d+)\s+(passed|failed|skipped)/g))counts[m[2]]+=Number(m[1]);
 assert.equal(rows.length,Number(total[1]));assert(rows.length>0);
 for(const status of Object.keys(counts))assert.equal(rows.filter(r=>r.status===status).length,counts[status],'Verbose case/summary drift');
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
 assert.equal(new Set(rows.map(r=>r.fullName)).size,rows.length,'Ambiguous verbose case');
 return {success:counts.failed===0,numTotalTests:rows.length,numPassedTests:counts.passed,numFailedTests:counts.failed,numPendingTests:counts.skipped,testResults:[{assertionResults:rows}]};
}
export function verifyHistoricalAdmission(entry,context){
 const {head,currentInputs,currentEnvironment,readBytes,readGit,readGitBytes}=context;
 assert(entry&&entry.schemaVersion===1);assert(/^[a-z0-9-]+$/.test(entry.id));assert(['backend','frontend','pg'].includes(entry.phase));assert(['vitest','vitest-verbose','command'].includes(entry.kind));
 assert(Array.isArray(entry.outcomes)&&entry.outcomes.length);assert(/^[a-f0-9]{40}$/.test(entry.reviewCheckpoint));
 const objects={},hashes={},transportSHA256={};
 for(const key of ['report','execution','log','inputs','review']){
  const ref=entry.proofs[key];safePath(ref.path);assert(/^[a-f0-9]{64}$/.test(ref.sha256));
  assert(readGit('ls-tree',head,'--',ref.path).startsWith('100644 blob '),'Original proof must be an immutable Git file');
  const raw=readBytes(ref.path);assert(raw.length<=64*1024*1024);assert.equal(sha(raw),ref.sha256,'Original transport bytes drift: '+key);transportSHA256[key]=ref.sha256;const compressed=['gzip-json','gzip-utf8'].includes(ref.encoding);const original=compressed?gunzipSync(raw,{maxOutputLength:64*1024*1024}):raw;if(compressed){assert(/^[a-f0-9]{64}$/.test(ref.decodedSHA256));assert.equal(sha(original),ref.decodedSHA256,'Decoded original bytes drift: '+key);}hashes[key]=sha(original);
  if(key==='review'){let reviewed;try{reviewed=readGit('ls-tree',entry.reviewCheckpoint,'--',ref.path);}catch{readGit('fetch','--no-tags','--depth=1','origin',entry.reviewCheckpoint);reviewed=readGit('ls-tree',entry.reviewCheckpoint,'--',ref.path);}assert.equal(readGit('ls-tree',head,'--',ref.path),reviewed,'Root review checkpoint drift');}
  if(key==='report'&&entry.kind==='vitest-verbose'){assert(['utf8','gzip-utf8'].includes(ref.encoding));objects[key]=readVerboseCases(original.toString('utf8'));}else if(key!=='log'){assert(['json','gzip-json'].includes(ref.encoding));objects[key]=JSON.parse(original.toString('utf8'));}else assert(['utf8','gzip-utf8'].includes(ref.encoding),'Original log encoding must be explicit');
 }
 const review=objects.review;assert.equal(review.kind,'pr363-root-case-review-v1');assert.equal(review.reviewer,'root dot');assert.equal(review.decision,'ADMIT');assert.equal(review.admissionId,entry.id);assert.deepEqual(review.outcomes,entry.outcomes);
 assert.deepEqual(review.originalSHA256,Object.fromEntries(['report','execution','log','inputs'].map(k=>[k,hashes[k]])));
 assert.equal(review.currentInputsSHA256,digest(currentInputs));
 const selectors=entry.selectors;
 const execution={argv:jsonPointer(objects.execution,selectors.argv),exitCode:jsonPointer(objects.execution,selectors.exitCode),signal:jsonPointer(objects.execution,selectors.signal),cwd:jsonPointer(objects.execution,selectors.cwd)};
 assert((Array.isArray(execution.argv)&&execution.argv.length)||typeof execution.argv==='string'&&execution.argv.length);assert(Number.isInteger(execution.exitCode));assert.equal(execution.signal,null);assert(typeof execution.cwd==='string'&&execution.cwd.length);assert.deepEqual(review.originalExecution,execution,'Original exit/command identity changed');
 const rawInputs=jsonPointer(objects.inputs,selectors.files);assert(Array.isArray(rawInputs)&&rawInputs.length);
 const fields=selectors.fileFields??{path:'path',mode:'mode',blob:'blob',sha256:'sha256'};
 const originalInputs=rawInputs.map(f=>({path:f[fields.path],mode:f[fields.mode],...(f[fields.blob]?{blob:f[fields.blob]}:{sha256:f[fields.sha256]})}));
 for(const f of originalInputs){safePath(f.path);assert(f.blob?/^[a-f0-9]{40}$/.test(f.blob):/^[a-f0-9]{64}$/.test(f.sha256));assert(['100644','100755'].includes(f.mode));}
 assert.equal(new Set(originalInputs.map(f=>f.path)).size,originalInputs.length);
 const originalRuntime={};for(const key of ['environment','dependencies','tools','generated']){const value=jsonPointer(objects.inputs,selectors[key]);assert(value&&typeof value==='object'&&Object.keys(value).length,'Missing actual original '+key);originalRuntime[key]=value;}
 assert.deepEqual(review.environmentComparison.original,originalRuntime);assert.deepEqual(review.environmentComparison.current,currentEnvironment);assert.equal(review.environmentComparison.decision,'COMPATIBLE');assert(typeof review.environmentComparison.rationale==='string'&&review.environmentComparison.rationale.trim().length>0);
 const before=new Map(originalInputs.map(f=>[f.path,f.blob?{mode:f.mode,blob:f.blob}:{mode:f.mode,sha256:f.sha256}])),after=new Map(currentInputs.map(f=>{
  const prior=before.get(f.path);if(prior?.sha256){assert(typeof readGitBytes==='function','Exact current Git blob bytes required for original SHA256 comparison');return [f.path,{mode:f.mode,sha256:sha(readGitBytes(head+':'+f.path))}];}return [f.path,{mode:f.mode,blob:f.blob}];}));
 const deltas=[...new Set([...before.keys(),...after.keys()])].sort().flatMap(path=>JSON.stringify(before.get(path))===JSON.stringify(after.get(path))?[]:[{path,before:before.get(path)??null,after:after.get(path)??null}]);
 assert(Array.isArray(review.deltas));assert.equal(review.deltas.length,deltas.length);
 for(let i=0;i<deltas.length;i++){const d=review.deltas[i];assert.deepEqual({path:d.path,before:d.before,after:d.after},deltas[i]);assert.deepEqual([...d.outcomes].sort(),[...entry.outcomes].sort());assert(typeof d.rationale==='string'&&d.rationale.trim().length>0);}
 if(['vitest','vitest-verbose'].includes(entry.kind)){
  const summary=Object.fromEntries(['success','numTotalTests','numPassedTests','numFailedTests','numPendingTests'].map(k=>[k,objects.report[k]]));assert.equal(typeof summary.success,'boolean');for(const k of ['numTotalTests','numPassedTests','numFailedTests','numPendingTests'])assert(Number.isInteger(summary[k])&&summary[k]>=0);assert.deepEqual(review.originalReporterSummary,summary);
  const invocation=objects.report.testResults.flatMap(s=>s.assertionResults.map(c=>({fullName:c.fullName,status:c.status})));
  assert.deepEqual(review.originalInvocationCases,invocation,'Original failures/filtered cases must remain exact');
  assert(Array.isArray(entry.cases)&&entry.cases.length===entry.outcomes.length);
  const names=[];for(const selected of entry.cases){const c=jsonPointer(objects.report,selected.pointer);assert.equal(c.fullName,selected.fullName);assert.equal(c.status,'passed','Cannot admit skipped/failed/unknown case');assert.equal(invocation.filter(v=>v.fullName===c.fullName).length,1,'Ambiguous original fullName');names.push(c.fullName);}
  assert.equal(new Set(names).size,names.length);assert.deepEqual([...names].sort(),[...entry.outcomes].sort());
 }else{
  assert(!JSON.stringify(execution.argv).includes('--if-present'),'Optional/no-op scripts cannot establish a command qualification');assert.equal(execution.exitCode,0,'Whole command admission requires original exit0');assert.equal(jsonPointer(objects.report,selectors.reportExitCode??selectors.exitCode),0);assert.deepEqual(jsonPointer(objects.report,selectors.reportArgv??selectors.argv),execution.argv);assert.equal(jsonPointer(objects.report,selectors.reportSignal??selectors.signal),null);assert.equal(entry.outcomes.length,1);assert.deepEqual(review.commandOutcome,{id:entry.outcomes[0],argv:execution.argv,exitCode:0,logSHA256:hashes.log});assert(typeof review.commandLogAssociationRationale==='string'&&review.commandLogAssociationRationale.trim().length>0);assert.deepEqual(review.originalInvocationCases,[],'Whole commands cannot claim Vitest cases');
 }
 return {kind:'reviewed-local-evidence',admissionId:entry.id,outcomes:entry.outcomes,originalExecution:execution,originalSHA256:hashes,proofTransportSHA256:transportSHA256,reviewCheckpoint:entry.reviewCheckpoint,ciExecuted:false,originalExecutionSigned:false,originalFailuresRetained:true,originalReportFormat:entry.kind==='vitest-verbose'?'verbose-log-not-json':entry.kind,reviewAuthentication:'root-reviewed Git record; no cryptographic human-identity authentication',currentInputsSHA256:digest(currentInputs)};
}

const out='pr363-evidence',sha=v=>createHash('sha256').update(v).digest('hex');
function fileSHA(path){const fd=openSync(path,'r'),h=createHash('sha256'),chunk=Buffer.alloc(1024*1024);try{let n;while((n=readSync(fd,chunk,0,chunk.length,null)))h.update(chunk.subarray(0,n));}finally{closeSync(fd);}return h.digest('hex');}
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');}
function run(id,exe,args,cwd=process.cwd(),metadata={},extraEnvironment={}){
 mkdirSync(out,{recursive:true});const log=resolve(out,id+'.log'),fd=openSync(log,'w');const start=new Date().toISOString();
 const {GH_TOKEN,GITHUB_TOKEN,...parentEnvironment}=process.env;const env={...parentEnvironment,...extraEnvironment};let r;try{r=spawnSync(exe,args,{cwd,env,stdio:['ignore',fd,fd]});}finally{closeSync(fd);}
 const receipt={kind:'command-receipt',outcomeId:id,argv:[exe,...args],cwd,exitCode:r.status,signal:r.signal,startedAt:start,completedAt:new Date().toISOString(),logSHA256:sha(readFileSync(log)),...metadata};save('command-'+id,receipt);
 assert.equal(r.status,0,id+' failed; original log/receipt retained');return receipt;
}
export function verifyConsumerReport(report,step,identity){
 if(step.kind==='command'){assert.equal(report.kind,'command-receipt');assert.equal(report.exitCode,0);assert.equal(report.signal,null);return {outcomeId:step.id,exitCode:0,kind:'actual-command-exit',testsClaimed:false};}
 if(step.kind==='receipt'){for(const assertion of step.assertions)assert.deepEqual(jsonPointer(report,assertion.pointer),assertion.equals,'Native receipt assertion failed');return {outcomeId:step.id,kind:'native-receipt',testsClaimed:false};}
 assert(step.expectedCases.length);let names;
 if(step.kind==='vitest'){
  assert.equal(report.success,true);assert.equal(report.numFailedTests,0);
  const cases=report.testResults.flatMap(s=>s.assertionResults);names=cases.filter(c=>c.status==='passed').map(c=>c.fullName);
  const filtered=cases.filter(c=>['pending','skipped'].includes(c.status)).map(c=>c.fullName).sort();
  assert.deepEqual(filtered,[...(step.expectedFiltered??[])].sort());assert.equal(cases.length,names.length+filtered.length);
 }else{
  assert.equal(step.kind,'browser');assert.equal(report.schemaVersion,1);assert.equal(report.status,'PASS');assert.equal(report.stage,'complete');assert.equal(report.chromePreflight?.ok,true);assert.equal(report.chromeSandbox?.ok,true);assert.equal(report.errorDigest,undefined);
  assert.equal(report.source.head,identity.head);assert.equal(report.source.tree,identity.tree);assert.equal(String(report.runId),String(identity.runId));
  for(const c of ['frontend','backend'])assert.deepEqual(report.inputs[c],identity.manifests[c]);
  names=report.cases.map(c=>{assert.equal(c.complete,true);assert.equal(c.resumedSameParent,true);assert.equal(c.reportState,c.mode==='SCHEDULED'?'WITHHELD':'READY');return c.product+':'+c.mode;});assert.deepEqual([...names].sort(),['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED']);
  assert(Array.isArray(report.managementReads));assert.deepEqual(report.managementReads.map(r=>r.product).sort(),['SCHOOL','TEACHER']);
  for(const r of report.managementReads){assert.equal(r.summaryRead,true);assert.equal(r.cprVerified,true);assert.equal(r.technicalJsonCollapsed,true);assert.equal(r.disclosure,'INDIVIDUAL_SUMMARY');assert.equal(r.openingMode,'IMMEDIATE');}
 }
 assert(names.length&&new Set(names).size===names.length);assert.deepEqual(names.sort(),[...step.expectedCases].sort(),'Missing/extra selected outcomes');
 return {passed:names.length,caseNames:names};
}
function checkPlan(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.version,'v24.21.0');
 const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);
 const p=JSON.parse(process.env.PLAN);assert.equal(p.head,head);assert.deepEqual(pr363Plan(changedEntries(p.base,head),p.base,head),p);assert.equal(p.draft,false);
 return {...p,execution:binding.execution,historicalAdmissions:binding.historicalAdmissions};
}
function manifest(component){const dir=`server-version/${component}/dist`,m=JSON.parse(readFileSync(dir+'/ci-build-manifest.json'));
 verifyManifest(m,{schemaVersion:1,sha:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID,kind:component,lockDigest:sha(readFileSync(`server-version/${component}/package-lock.json`))},treeDigest(dir));return m;}
export function assertFirstBuildAttempt(env=process.env){assert.equal(String(env.GITHUB_RUN_ATTEMPT),'1','Producer retries require root review of original partial build/upload; never automatically rebuild');}
function build(component,p){
 assert(['backend','frontend'].includes(component));assertFirstBuildAttempt();
 const context=`server-version/${component}`,build=`pr363-${component}-build`,runtime=`pr363-${component}-runtime`;
 const args=['--build-arg','NPM_REGISTRY=https://registry.npmjs.org'];if(component==='backend')args.push('--build-arg','DEBIAN_MIRROR=');
 if(component==='frontend')for(const flag of p.execution.frontend.buildArgs)args.push('--build-arg',flag);
 run(component+'-build','docker',['build',...args,'--target','build','-t',build,context]);
 // Exactly the same context/arguments share the already-built production stage.
 run(component+'-runtime','docker',['build',...args,'--target','runtime','-t',runtime,context]);
 const container=execFileSync('docker',['create',build],{encoding:'utf8'}).trim();
 try{rmSync(context+'/dist',{recursive:true,force:true});run(component+'-extract','docker',['cp',container+':/app/dist',context+'/dist']);}finally{execFileSync('docker',['rm',container]);}
 run(component+'-manifest','node',['.github/scripts/ci-artifact.mjs','write',component]);
 const images={};for(const[tag,file]of [[build,'builder.tar'],[runtime,'runtime.tar']]){
  run(component+'-'+file.replace('.tar','')+'-save','docker',['save','-o',`${out}/${component}-${file}`,tag]);
  const data=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0];images[file]={imageId:data.Id,tag,sha256:fileSHA(`${out}/${component}-${file}`)};
 }
 save(component+'-images',{head:p.head,runId:process.env.GITHUB_RUN_ID,producerAttempt:process.env.GITHUB_RUN_ATTEMPT,images,manifest:manifest(component),dependencySource:{lockPath:context+'/package-lock.json',lockBlob:git('rev-parse',p.head+':'+context+'/package-lock.json'),lockSHA256:fileSHA(context+'/package-lock.json')}});
}
export function verifyImageReceipt(r,{component,head,runId,consumerAttempt,lockBlob,lockSHA256},read){
 assert.equal(r.head,head);assert.equal(String(r.runId),String(runId));assert.equal(String(r.producerAttempt),'1');assert(Number.isInteger(Number(consumerAttempt))&&Number(consumerAttempt)>=1);
 assert.deepEqual(r.dependencySource,{lockPath:'server-version/'+component+'/package-lock.json',lockBlob,lockSHA256});assert(/^[a-f0-9]{40}$/.test(lockBlob)&&/^[a-f0-9]{64}$/.test(lockSHA256));assert.deepEqual({sha:r.manifest?.sha,runId:String(r.manifest?.runId),kind:r.manifest?.kind,lockDigest:r.manifest?.lockDigest},{sha:head,runId:String(runId),kind:component,lockDigest:lockSHA256});
 for(const[file,v]of Object.entries(r.images)){assert(['builder.tar','runtime.tar'].includes(file));assert.equal(v.tag,`pr363-${component}-${file==='builder.tar'?'build':'runtime'}`);assert.match(v.imageId,/^sha256:[a-f0-9]{64}$/);const bytes=read(`${component}-${file}`);assert.equal(typeof bytes==='string'?bytes:sha(bytes),v.sha256);}
 assert.deepEqual(Object.keys(r.images).sort(),['builder.tar','runtime.tar']);return r.images;
}
function loadImages(component,p){const r=JSON.parse(readFileSync(`${out}/${component}-images.json`));const images=verifyImageReceipt(r,{component,head:p.head,runId:process.env.GITHUB_RUN_ID,consumerAttempt:process.env.GITHUB_RUN_ATTEMPT,lockBlob:git('rev-parse',p.head+':server-version/'+component+'/package-lock.json'),lockSHA256:fileSHA('server-version/'+component+'/package-lock.json')},f=>fileSHA(`${out}/${f}`));
 for(const[file,v]of Object.entries(images)){run(component+'-load-'+file.replace('.tar',''),'docker',['load','-i',`${out}/${component}-${file}`]);assert.equal(execFileSync('docker',['image','inspect',v.tag,'--format','{{.Id}}'],{encoding:'utf8'}).trim(),v.imageId);}return r;}
const preparedDependencies=new Set(),loadedImages=new Map();
function prepareDependencies(component,p,entireApp=false){
 const key=component+(entireApp?'-app':'-deps');if(preparedDependencies.has(key))return;
 if(!loadedImages.has(component))loadedImages.set(component,loadImages(component,p));
 const container=execFileSync('docker',['create',`pr363-${component}-build`],{encoding:'utf8'}).trim();
 const target=entireApp?resolve(process.env.RUNNER_TEMP,'pr363-sibling-'+component):resolve('server-version',component,'node_modules');
 try{rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});run(key+'-extract','docker',['cp',container+(entireApp?':/app/.':':/app/node_modules/.'),target]);}finally{execFileSync('docker',['rm',container]);}
 preparedDependencies.add(key);return target;
}
export function stepCommand(step,{imageId,repository,evidence,sibling}){
 if(step.runner==='host-node')return {exe:'node',args:step.argv.slice(1),cwd:repository};
 assert.equal(step.runner,'builder-node');assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
 const args=['run','--rm','--network','host','-v',repository+':/workspace:ro','-v',evidence+':/evidence','-v',repository+'/server-version/e2e:/e2e:ro'];
 if(step.siblingBackend){assert(sibling);args.push('-v',sibling+':/backend:ro');}
 for(const key of Object.keys(step.environment??{})){assert(/^[A-Z][A-Z0-9_]*$/.test(key)&&!['PATH','HOME','CODEX_HOME','GITHUB_TOKEN','GH_TOKEN'].includes(key));assert(typeof step.environment[key]==='string');args.push('-e',key+'='+step.environment[key]);}
 args.push('-w','/app',imageId,'node',...step.argv.slice(1));return {exe:'docker',args,cwd:repository};
}
export function browserEnvironment(env,repository){
 assert(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID));assert(/^[a-f0-9]{64}$/.test(env.CI_POSTGRES_SERVICE_ID));
 for(const key of ['PR363_PG_PORT','PR363_REDIS_PORT'])assert(/^[0-9]+$/.test(env[key])&&Number(env[key])>=1024&&Number(env[key])<=65535);
 assert(env.RUNNER_TEMP&&env.HOME);assert.equal(env.SCHOOL_TEACHER_ISOLATED_DB,'1');
 const database=`postgresql://ptool:synthetic-pr363-only@127.0.0.1:${env.PR363_PG_PORT}/school_teacher_browser_ci_test?schema=public&connection_limit=10`;
 const {GH_TOKEN,GITHUB_TOKEN,...safeEnvironment}=env;return {...safeEnvironment,TZ:'UTC',NODE_ENV:'test',DATABASE_URL:database,SCHOOL_TEACHER_TEST_DATABASE_URL:database,REDIS_URL:`redis://127.0.0.1:${env.PR363_REDIS_PORT}/0`,SCHOOL_TEACHER_PRIVATE_DIR:resolve(env.RUNNER_TEMP,'pr363-private'),SCHOOL_TEACHER_FRONTEND_DIST:resolve(repository,'server-version/frontend/dist'),PR363_EVIDENCE_DIR:resolve(repository,out),PR363_BACKEND_SCHOOL_PORT:'43131',PR363_BACKEND_TEACHER_PORT:'43132',PR363_SCHOOL_ORIGIN:'https://school.eduk12.top',PR363_TEACHER_ORIGIN:'https://teacher.eduk12.top'};
}
export function browserIngressConfig(repository,privateDir){
 for(const p of [repository,privateDir])assert(/^\/[A-Za-z0-9_./-]+$/.test(p),'Unquotable ingress path');
 const hosts=[['school',43131],['teacher',43132]];
 return `user runner;\npid ${privateDir}/nginx.pid;\nerror_log ${privateDir}/nginx-error.log;\nevents {}\nhttp {\n include /etc/nginx/mime.types;\n access_log off;\n proxy_temp_path ${privateDir}/proxy-temp;\n server { listen 127.0.0.1:443 ssl default_server; ssl_certificate ${privateDir}/tls.crt; ssl_certificate_key ${privateDir}/tls.key; return 444; }\n`+hosts.map(([host,port])=>` server { listen 127.0.0.1:443 ssl; server_name ${host}.eduk12.top; ssl_certificate ${privateDir}/tls.crt; ssl_certificate_key ${privateDir}/tls.key; root ${repository}/server-version/frontend/dist; location /api/ { proxy_pass http://127.0.0.1:${port}; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Origin $http_origin; } location / { try_files $uri /index.html; } }\n`).join('')+'}\n';
}
async function browserJourney(p,step,metadata){
 assert.equal(step.runner,'host-node');assert.deepEqual(step.argv,['node','server-version/e2e/pr363-browser.cjs']);assert.deepEqual(step.dependencies,['backend']);
 const env=browserEnvironment(process.env,process.cwd()),privateDir=resolve(env.RUNNER_TEMP,'pr363-ingress'),fixtureDir=env.SCHOOL_TEACHER_PRIVATE_DIR;
 assert.equal(realpathSync(env.RUNNER_TEMP),resolve(env.RUNNER_TEMP));assert(!existsSync(fixtureDir)&&!existsSync(privateDir),'No private fixture/seed retries on a used database');writeFileSync(resolve(env.RUNNER_TEMP,'pr363-browser-consumer-started'),JSON.stringify({head:p.head,runId:env.GITHUB_RUN_ID}),{flag:'wx',mode:0o600});mkdirSync(privateDir,{mode:0o700});
 const trustName='pr363-'+env.GITHUB_RUN_ID,trustPath='/usr/local/share/ca-certificates/'+trustName+'.crt',nss=resolve(env.HOME,'.pki/nssdb'),children=[];
 let stage='bootstrap',installedCA=false,installedNSS=false,ingressStarted=false;
 const privateRun=(id,exe,args)=>{
  stage=id;const path=resolve(privateDir,id+'.log'),fd=openSync(path,'wx',0o600);let r;try{const {GH_TOKEN,GITHUB_TOKEN,...safeEnvironment}=env;r=spawnSync(exe,args,{env:safeEnvironment,stdio:['ignore',fd,fd],timeout:180000});}finally{closeSync(fd);}
  save('browser-setup-'+id,{kind:'actual-command-exit',argv:[exe,...args],exitCode:r.status,signal:r.signal,privateLogSHA256:fileSHA(path),head:p.head,runId:env.GITHUB_RUN_ID,ciExecuted:true,testsClaimed:false});assert.equal(r.status,0,'Browser setup failed at '+id+'; private log digest retained');
 };
 const ready=async(url,options={})=>{for(let i=0;i<60;i++){assert(children.every(c=>c.exitCode===null),'Product server exited before readiness');try{const good=await new Promise(resolveReady=>{const q=httpsRequest(url,{...options,timeout:1000},r=>{r.resume();resolveReady(r.statusCode===200);});q.on('error',()=>resolveReady(false));q.on('timeout',()=>q.destroy());q.end();});if(good)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('Finite trusted HTTPS readiness exhausted');};
 try{
  // Same generated client/dependencies as the verified production builder. No npm application install/build.
  privateRun('migrations','node',['server-version/backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','server-version/backend/prisma/schema.prisma']);
  privateRun('fixture-seed','node',['server-version/e2e/pr363-fixture.cjs','seed']);
  for(const product of ['SCHOOL','TEACHER']){stage='serve-'+product;const fd=openSync(resolve(privateDir,product+'.log'),'wx',0o600);const {GH_TOKEN,GITHUB_TOKEN,...safeEnvironment}=env;let child;try{child=spawn('node',['server-version/e2e/pr363-fixture.cjs','serve-backend',product],{env:safeEnvironment,stdio:['ignore',fd,fd],detached:true});}finally{closeSync(fd);}child.on('error',()=>{});children.push(child);}
  privateRun('tls-certificate','openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',privateDir+'/tls.key','-out',privateDir+'/tls.crt','-subj','/CN=PR363 ephemeral Actions CA','-addext','basicConstraints=critical,CA:TRUE','-addext','subjectAltName=DNS:school.eduk12.top,DNS:teacher.eduk12.top']);chmodSync(privateDir+'/tls.key',0o600);
  privateRun('tls-os-install','sudo',['install','-m','0644',privateDir+'/tls.crt',trustPath]);installedCA=true;privateRun('tls-os-trust','sudo',['update-ca-certificates']);
  mkdirSync(nss,{recursive:true});if(!existsSync(nss+'/cert9.db'))privateRun('tls-nss-initialize','certutil',['-N','--empty-password','-d','sql:'+nss]);
  privateRun('tls-nss-trust','certutil',['-A','-n',trustName,'-t','C,,','-d','sql:'+nss,'-i',privateDir+'/tls.crt']);installedNSS=true;
  writeFileSync(privateDir+'/nginx.conf',browserIngressConfig(process.cwd(),privateDir),{mode:0o600});privateRun('ingress-start','sudo',['nginx','-p',privateDir+'/','-c',privateDir+'/nginx.conf']);ingressStarted=true;
  stage='trusted-https-readiness';for(const host of ['school','teacher']){const addresses=await lookup(host+'.eduk12.top',{all:true});assert(addresses.length&&addresses.every(a=>a.address==='127.0.0.1'),'Never contact a public product endpoint');await ready('https://'+host+'.eduk12.top/api/'+(host==='school'?'campus':'huiteacher')+'/auth/csrf',{ca:readFileSync(privateDir+'/tls.crt')});}save('browser-readiness',{head:p.head,runId:env.GITHUB_RUN_ID,trustedHTTPS443:true,loopbackOnly:true,ready:true});
  stage='actual-browser';return run('browser-'+step.id,'node',step.argv.slice(1),process.cwd(),metadata,env);
 }catch(error){save('browser-setup-failure',{status:'FAILED',stage,errorDigest:sha(String(error)),head:p.head,runId:env.GITHUB_RUN_ID,ciExecuted:true});throw Error('PR363 actual browser failed at '+stage+'; sanitized evidence retained');}
 finally{
  const cleanup=[];const attempt=(id,exe,args)=>{const r=spawnSync(exe,args,{stdio:'ignore',timeout:15000});cleanup.push({id,exitCode:r.status,signal:r.signal});};
  if(ingressStarted)attempt('stop-ingress','sudo',['nginx','-p',privateDir+'/','-c',privateDir+'/nginx.conf','-s','quit']);
  for(const child of children){try{process.kill(-child.pid,'SIGTERM');}catch{} }
  await new Promise(r=>setTimeout(r,250));for(const child of children){try{process.kill(-child.pid,'SIGKILL');}catch{} }
  if(installedNSS)attempt('remove-nss-trust','certutil',['-D','-n',trustName,'-d','sql:'+nss]);
  if(installedCA){attempt('remove-os-ca','sudo',['rm','--',trustPath]);attempt('refresh-os-trust','sudo',['update-ca-certificates']);}
  rmSync(fixtureDir,{recursive:true,force:true});attempt('remove-private-ingress','sudo',['rm','-rf','--',privateDir]);save('browser-private-cleanup',{privateMaterialUploaded:false,serviceVolumesDisposedBy:'Actions job service lifecycle',commands:cleanup});assert(cleanup.every(r=>r.exitCode===0),'Private browser cleanup failed');
 }
}
async function consumers(phase,p){
 const selection=p.execution[phase],currentEnvironment={host:{node:process.version,platform:process.platform,arch:process.arch},configuration:selection.environment};
 assert(selection.environment&&Object.keys(selection.environment).length,'Final frozen execution environment missing');
 const outcomes=[];
 for(const admission of p.historicalAdmissions.filter(a=>a.phase===phase)){
  const receipt=verifyHistoricalAdmission(admission,{head:p.head,currentInputs:selection.inputs,currentEnvironment,readBytes:path=>readFileSync(path),readGit:git,readGitBytes:ref=>execFileSync('git',['show',ref])});save('history-'+admission.id,receipt);outcomes.push(...receipt.outcomes);
 }
 const manifests=phase==='browser'?Object.fromEntries(['frontend','backend'].map(c=>[c,manifest(c)])):null;
 for(const step of selection.steps){
  for(const component of step.dependencies)if(!(step.siblingBackend&&component==='backend'))prepareDependencies(component,p);
  let producer,sibling;if(step.runner==='builder-node'){
   if(!loadedImages.has(step.component))loadedImages.set(step.component,loadImages(step.component,p));producer=loadedImages.get(step.component);
   assert.equal(step.dependencySource.lockBlob,git('rev-parse',p.head+':'+step.dependencySource.lockPath));assert.deepEqual(producer.dependencySource,{lockPath:step.dependencySource.lockPath,lockBlob:step.dependencySource.lockBlob,lockSHA256:fileSHA(step.dependencySource.lockPath)});assert.equal(producer.manifest.lockDigest,producer.dependencySource.lockSHA256);
   if(step.siblingBackend)sibling=prepareDependencies('backend',p,true)||resolve(process.env.RUNNER_TEMP,'pr363-sibling-backend');
  }
  if(step.report)rmSync(step.report,{force:true});
  const command=stepCommand(step,{imageId:producer?.images['builder.tar'].imageId,repository:process.cwd(),evidence:resolve(out),sibling});
  const metadata={declaredArgv:step.argv,executor:step.runner,sourceInputsSHA256:digest(selection.inputs),environment:currentEnvironment,stepEnvironment:step.environment??{},stepSHA256:digest(step),dependencySource:step.runner==='builder-node'?{lock:step.dependencySource,imageId:producer.images['builder.tar'].imageId,producerRunId:producer.runId}:step.dependencies.map(c=>({component:c,imageId:loadedImages.get(c).images['builder.tar'].imageId}))};
  const receipt=step.kind==='browser'?await browserJourney(p,step,metadata):run(phase+'-'+step.id,command.exe,command.args,command.cwd,metadata,step.environment??{});
  const report=step.kind==='command'?receipt:JSON.parse(readFileSync(step.report));save(phase+'-'+step.id+'-verified',verifyConsumerReport(report,step,{head:p.head,tree:p.tree,runId:process.env.GITHUB_RUN_ID,manifests}));
  outcomes.push(...(['command','receipt'].includes(step.kind)?[step.id]:step.expectedCases));
 }
 assert.equal(new Set(outcomes).size,outcomes.length);assert.deepEqual([...outcomes].sort(),[...selection.requiredOutcomes].sort(),'Missing final fresh/admitted outcomes');save(phase+'-outcomes',{outcomes,historyExecuted:false});
}
export function assertApplicationPhase(plan,phase){assert(phase==='source'||plan.postMerge===false,'Main is source/tree observation only; no aggregate or skipped qualification');}
async function main(){const phase=process.argv[2],p=checkPlan();mkdirSync(out,{recursive:true});
 if(phase==='source'){for(const a of (p.postMerge?[]:p.historicalAdmissions)){const selection=p.execution[a.phase];save('history-source-'+a.id,verifyHistoricalAdmission(a,{head:p.head,currentInputs:selection.inputs,currentEnvironment:{host:{node:process.version,platform:process.platform,arch:process.arch},configuration:selection.environment},readBytes:path=>readFileSync(path),readGit:git,readGitBytes:ref=>execFileSync('git',['show',ref])}));}save('source',{head:p.head,tree:p.tree,sourceHead:p.sourceHead,runId:process.env.GITHUB_RUN_ID,status:'SOURCE_VERIFIED',applicationQualification:false});return;}
 assertApplicationPhase(p,phase);
 if(phase==='aggregate'){requirePr363Jobs(JSON.parse(process.env.NEEDS_JSON));return;}
 if(phase.startsWith('build-')){build(phase.slice(6),p);return;}
 if(phase==='audit'){const results=[];for(const c of ['backend','frontend']){try{const args=['run','--rm',`pr363-${c}-build`,'npm','audit','--audit-level=high'];loadImages(c,p);run(c+'-audit','docker',args);results.push({component:c,status:'passed'});}catch{results.push({component:c,status:'failed'});}}save('audit-outcomes',{results});assert(results.every(r=>r.status==='passed'),'Dependency audit failed');return;}
 if(phase.startsWith('scan-')){const c=phase.slice(5),r=loadImages(c,p);run(c+'-scan','trivy',['image','--exit-code','1','--ignore-unfixed','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--output',`${out}/${c}-scan.json`,r.images['runtime.tar'].imageId]);return;}
 assert(['backend','frontend','pg','browser'].includes(phase),'Unknown phase');
 if(phase==='browser'||phase==='pg'||phase==='backend')loadImages('backend',p);if(phase==='frontend')loadImages('frontend',p);
 await consumers(phase,p);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
