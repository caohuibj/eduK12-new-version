import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,trainingEntryPlan} from './training-entry-scope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const output='training-entry-evidence';
const save=(name,value)=>{mkdirSync(output,{recursive:true});writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n');};
// Every new execution is recorded before starting, and gets exact source/tool/exit records.
// No credential-bearing environment values are serialized.
function runRecorded(id,component,command,args){
 const cwd='server-version/'+component;
 const source=git('rev-parse','HEAD'),inputs=git('ls-tree','-r','HEAD','--',cwd);
 const tools={node:process.version};
 for(const name of ['typescript','vitest','vite','eslint','prisma']){
  const file=`${cwd}/node_modules/${name}/package.json`;
  if(existsSync(file)){const raw=readFileSync(file);tools[name]={version:JSON.parse(raw).version,packageSHA256:sha(raw)};}
 }
 const record={id,cwd,command:[command,...args],source,componentTree:git('rev-parse',`HEAD:${cwd}`),
  gitInputManifest:inputs,gitInputManifestSHA256:sha(inputs),tools,
  parameters:{NODE_OPTIONS:process.env.NODE_OPTIONS||null,TZ:process.env.TZ||null,NODE_ENV:process.env.NODE_ENV||null},
  startedAt:new Date().toISOString(),status:'started',ciExecuted:true};
 save(id+'-command',record);
 const result=spawnSync(command,args,{cwd,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'');mkdirSync(output,{recursive:true});writeFileSync(`${output}/${id}.stdout.log`,result.stdout||'');writeFileSync(`${output}/${id}.stderr.log`,result.stderr||'');writeFileSync(`${output}/${id}.log`,log);process.stdout.write(log);
 Object.assign(record,{completedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message||null,logSHA256:sha(log),stdoutSHA256:sha(result.stdout||''),stderrSHA256:sha(result.stderr||''),combinedLogOrdering:'stdout-then-stderr-not-interleaved',status:result.status===0&&!result.error?'success':'failed'});save(id+'-command',record);
 assert.equal(record.status,'success',id+' failed; retained original execution record');
 return record;
}
function retainBuildManifest(component){
 const root=`server-version/${component}/dist`,files={};
 const visit=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
  const file=dir+'/'+entry.name;assert(!lstatSync(file).isSymbolicLink(),'Unexpected build symlink');
  if(entry.isDirectory())visit(file);else if(entry.isFile()){const bytes=readFileSync(file);files[file.slice(root.length+1)]={sha256:sha(bytes),bytes:bytes.length};}else throw Error('Unexpected build entry');
 }};visit(root);assert(Object.keys(files).length>0,'Missing emitted build');
 save(component+'-build-manifest',{source:git('rev-parse','HEAD'),sourceHead:process.env.CI_SOURCE_HEAD,componentTree:binding.components[component],run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,files});
 if(component==='frontend'&&process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`manifest=${sha(readFileSync(`${output}/frontend-build-manifest.json`))}\n`);
}
export function verifyBrowserInput(manifest,actual,expected){
 assert.equal(manifest.source,expected.source,'Build checkout differs');
 assert.equal(manifest.sourceHead,expected.sourceHead,'Build PR source differs');
 assert.equal(manifest.componentTree,expected.tree,'Build frontend tree differs');
 assert.equal(manifest.run,expected.run,'Cross-run build refused');
 assert(/^[1-9][0-9]*$/.test(manifest.attempt||''));
 assert(Number(manifest.attempt)<=Number(expected.attempt),'Future producer attempt refused');
 assert(manifest.files['index.html']&&manifest.files['.vite/manifest.json'],'Actual Vite build manifest required');
 assert.deepEqual(actual,manifest.files,'Downloaded dist file set or SHA256 differs');
}
function browserInput(){
 assert.equal(git('rev-parse','HEAD:server-version/frontend'),binding.components.frontend,'Consumer frontend source tree differs');
 const raw=readFileSync(`${output}/frontend-build-manifest.json`);
 assert.match(process.env.TRAINING_BUILD_MANIFEST_SHA256||'',/^[a-f0-9]{64}$/);
 assert.equal(sha(raw),process.env.TRAINING_BUILD_MANIFEST_SHA256,'Producer manifest digest differs');
 const files={},root='server-version/frontend/dist';
 const visit=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=dir+'/'+entry.name;assert(!lstatSync(path).isSymbolicLink(),'Build symlink refused');
  if(entry.isDirectory())visit(path);else {assert(entry.isFile());const bytes=readFileSync(path);files[path.slice(root.length+1)]={sha256:sha(bytes),bytes:bytes.length};}
 }};visit(root);
 verifyBrowserInput(JSON.parse(raw),files,{source:git('rev-parse','HEAD'),sourceHead:process.env.CI_SOURCE_HEAD,tree:binding.components.frontend,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
 save('browser-input-verified',{artifact:process.env.TRAINING_BUILD_ARTIFACT_ID,manifestSHA256:sha(raw),run:process.env.GITHUB_RUN_ID,consumerAttempt:process.env.GITHUB_RUN_ATTEMPT,files:Object.keys(files).length});
}
export function requireMissingRecordApproval(checks){assert.equal(checks.missingRecordRevalidationApproved,true,'Bounded missing-record revalidation approval pending');}
export function requireApproval(e,kind){
 assert.equal(e.authorization?.[kind],true,`Explicit candidate permission missing: ${kind}`);
 assert.match((kind==='laterCompactGroupsRepeat'?e.authorization?.laterCompactGroupsSourceMessage:e.authorization?.sourceMessage)||'',/^Sentinel_[a-f0-9]+$/,'Original user approval reference required');
}
// Bounded retrospective acceptance for exactly twelve already executed synthetic PG cases.
// This is not whole-file evidence, a runtime signature, or permission to skip other cases.
export function verifyFixedPg(e,object=git){
 assert.equal(e.kind,'reviewed-fixed-training-anonymous-pg-12');
 assert.equal(e.reviewStatus,'INDEPENDENTLY_REVIEWED_FIXED_12_CASE_MAPPING');
 assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.currentLocalProduct,binding.localProduct);assert.equal(e.currentProductTree,binding.productTree);
 assert.equal(sha(JSON.stringify(e.sourceInputs)),e.sourceInputsSHA256);
 const current=Object.fromEntries(object('ls-tree','-r','HEAD','--','server-version/backend').split('\n').filter(Boolean).map(line=>{const [meta,path]=line.split('\t');return[path,meta.split(' ')[2]]}));
 for(const [file,blob]of Object.entries(e.sourceInputs))assert.equal(current[file],blob,'PG source input drift: '+file);
 assert.deepEqual(e.cases.map(c=>[c.file,c.caseName]).sort(),binding.fixedPgCases.map(c=>[c.file,c.caseName]).sort());
 assert.equal(e.cases.length,12);assert.equal(new Set(e.cases.map(c=>c.file+'\0'+c.caseName)).size,12);
 const runs=new Map();
 for(const r of e.originalExecutions){
  assert(!runs.has(r.id));assert([0,1].includes(r.originalInvocationExit));
  const log=gunzipSync(Buffer.from(r.logGzipBase64,'base64'),{maxOutputLength:1024*1024});
  assert.equal(log.length,r.logBytes);assert.equal(sha(log),r.logSHA256);
  const plain=log.toString().replace(/\u001b\[[0-9;]*m/g,'');
  assert(new RegExp('\\b'+r.passedCount+' passed\\b').test(plain),'Original passing count missing');
  assert.equal(r.failedCaseNames.length,r.failedCount);assert.equal(r.originalInvocationExit,r.failedCount?1:0);
  for(const name of r.failedCaseNames)assert(plain.includes(name),'Original failure lost');
  assert.equal(r.argv[0],'node');assert.equal(r.argv[1],'node_modules/vitest/vitest.mjs');assert.equal(r.argv[2],'run');
  assert.equal(r.cwd,'server-version/backend');assert.match(r.runnerSHA256,/^[a-f0-9]{64}$/);
  runs.set(r.id,r);
 }
 const mapped=new Map();
 for(const c of e.cases){
  const r=runs.get(c.originalRunId);assert(r,'Missing original run');
  assert(r.selectedCaseNames.includes(c.caseName));assert(!r.failedCaseNames.includes(c.caseName));
  assert.equal(c.sourceBlob,current[c.file]);assert(r.argv.includes(c.file.slice('server-version/backend/'.length)));
  mapped.set(r.id,(mapped.get(r.id)||0)+1);
 }
 for(const [id,count]of mapped)assert.equal(count,runs.get(id).passedCount,'Do not manufacture unreported passes');
 return {cases:12,kind:e.kind,ciExecuted:false,wholeFileQualification:false};
}
export function verifyEvidence(read=readFileSync,resolve=git){
 const raw=read('.github/evidence/training-entry/reviewed.json');
 assert.equal(sha(raw),binding.evidenceSHA256,'Evidence bytes are not independently frozen');
 const e=JSON.parse(raw);
 assert.equal(e.kind,'reviewed-local-evidence');assert.equal(e.product,binding.product);
 assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.reviewStatus,'INDEPENDENTLY_REVIEWED','Historical execution mappings not reviewed');
 assert.deepEqual(e.blockers,[],'Unresolved execution evidence cannot qualify');
 if(binding.executionPolicy==='missing-only-current-mixed-candidate'){
  assert.equal(e.controlValidation?.exitCode,0);assert.equal(e.controlValidation?.command,'node --test .github/scripts/training-entry.test.mjs');
  assert(Number.isSafeInteger(e.controlValidation?.passed)&&e.controlValidation.passed>=38);assert.match(e.controlValidation?.logSHA256||'',/^[a-f0-9]{64}$/);
 }
 const controls=binding.controls.filter(f=>!f.endsWith('training-entry-bindings.json')&&!f.startsWith('.github/evidence/'));
 assert.deepEqual(Object.keys(e.controlSHA256).sort(),controls.sort());
 for(const[f,h]of Object.entries(e.controlSHA256))assert.equal(sha(read(f)),h,'Reviewed control drift: '+f);
 assert(Array.isArray(e.historicalReports)&&e.historicalReports.length>0,'Original failed and successful records must be retained');
 const archive=new Map();
 for(const r of e.historicalReports){
  assert(!archive.has(r.id));const bytes=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:8*1024*1024});
  assert.equal(sha(bytes),r.sha256);assert.equal(bytes.length,r.bytes);archive.set(r.id,r.sha256);
 }
 assert.deepEqual(e.groups.map(g=>g.id).sort(),[...binding.requiredGroups].sort());
 const admitted=new Set();let admittedAssertions=0;
 for(const g of e.groups){
  assert.equal(g.reviewStatus,'INDEPENDENTLY_REVIEWED','Incomplete group: '+g.id);
  assert.match(g.reviewNote||'',/\S.{20,}/,'Specific input/command review required');
  assert(Array.isArray(g.executions)&&g.executions.length>0);const groupFiles=new Set();
  for(const x of g.executions){
   assert.match(x.source||'',/^[a-f0-9]{40}$/);
   assert(['server-version/frontend','server-version/backend'].includes(x.cwd));
   assert.equal(x.originalExecutionSigned,false);assert.equal(x.ciExecuted,false);
   assert(['original-record-or-parent-observed-command','reviewed-historical-scope-reconstruction'].includes(x.commandSource));
   assert.match(x.commandEvidence||'',/\S.{10,}/);
   if(x.commandSource==='original-record-or-parent-observed-command')assert.match(x.command||'',/\S.{10,}/);
   else {assert.equal(x.command,null,'Reconstructed scope is not a literal original CLI');assert.equal(x.reviewedInvocation?.filter,null);assert.deepEqual(x.reviewedInvocation?.files,x.files);}

   const log=gunzipSync(Buffer.from(x.logGzipBase64,'base64'),{maxOutputLength:8*1024*1024});
   assert.equal(sha(log),x.logSHA256);assert.equal(log.length,x.logBytes);assert.equal(archive.get(x.reportId),x.logSHA256,'Admitted execution must retain its original report');
   assert(Object.keys(x.inputs||{}).length>0,'Reviewed imported/setup/tool input closure required');
   assert(Array.isArray(x.files)&&x.files.length>0);assert.equal(new Set(x.files).size,x.files.length);
   const acceptedFiles=x.admittedFiles||x.files;assert(acceptedFiles.length>0);
   for(const f of acceptedFiles){assert(x.files.includes(f));assert(f in x.inputs,'Missing admitted file input '+f);}
   const originalInputs=x.originalInputs||x.inputs;for(const f of acceptedFiles)assert(f in originalInputs,'Missing original admitted file identity');
   if(acceptedFiles.length!==x.files.length)assert.equal(x.sourceAppliesTo,'admitted-closure-only','Do not assign reconstructed original snapshots to discarded files');
   for(const[f,b]of Object.entries(x.inputs)){
    assert.match(f,/^(server-version\/|\.github\/)/);assert(!f.split('/').includes('..'));assert.match(b,/^[a-f0-9]{40}$/);
    assert.equal(resolve('rev-parse','HEAD:'+f),b,'Current imported input drift: '+f);
    const old=originalInputs[f]??null;if(old!==null)assert.match(old,/^[a-f0-9]{40}$/,'Invalid original import input');
    if(x.sourceObjectMode==='reachable-original'&&old!==null)assert.equal(resolve('rev-parse',x.source+':'+f),old,'Original imported input mismatch: '+f);
    if(old!==b){const d=x.inputDeltaReview?.[f];assert.deepEqual(d,binding.reviewedDeltas?.[g.id]?.[f],'No frozen candidate-specific delta authorization');assert(Array.isArray(d?.changedSymbols)&&d.changedSymbols.length>0);assert(Array.isArray(d?.unchangedExecutedPaths)&&d.unchangedExecutedPaths.length>0);assert.equal(d?.before,old);assert.equal(d?.after,b);assert.equal(d?.executedPathUnchanged,true);assert.match(d?.reason||'',/\S.{30,}/);assert.match(d?.reviewEvidence||'',/\S.{10,}/);}

   }
   assert(['reachable-original','preserved-reviewed-local-manifest'].includes(x.sourceObjectMode),'Historical source-object availability must be explicit');
   if(x.sourceObjectMode==='preserved-reviewed-local-manifest'){
    assert.equal(x.originalManifestSource,x.source);assert.equal(x.originalManifestSHA256,sha(JSON.stringify(originalInputs)));
    assert.equal(x.historicalSourceReconstructed,true);assert.match(x.originalManifestReview||'',/\S.{20,}/);
   }
   for(const f of ['package.json','package-lock.json'])assert(`${x.cwd}/${f}` in x.inputs,'Locked environment declaration missing');
   if(x.kind==='types'||x.kind==='lint'){
    assert.equal(x.observedExitCode,0);assert.equal(x.retrospectiveReceipt,true);
    assert.match(x.exitEvidence||'',/\S.{10,}/,'Empty log is not exit evidence');
   }else if(x.kind==='whole-file-tests'){
    assert.equal(x.observedExitCode,0,'A failed or unknown invocation is not whole-file evidence');
    assert.equal(x.failed,0);assert.equal(x.filtered,0);assert.equal(x.todo,0);
    assert(Number.isSafeInteger(x.passedAssertions)&&x.passedAssertions>0);
    assert(!Object.hasOwn(x,'cases'),'Do not manufacture original case identities from compact output');
    if(x.command!==null)assert(!/(?:^|\s)(?:-t(?:\s|=|$)|--(?:testNamePattern|grep|exclude)(?:\s|=|$))/.test(x.command),'Filtered original command cannot prove full files');
    const plain=log.toString().replace(/\u001b\[[0-9;]*m/g,'');
    assert(new RegExp(`Tests\\s+${x.passedAssertions} passed \\(${x.passedAssertions}\\)`).test(plain),'Original full invocation assertion count missing');
    assert(new RegExp(`Test Files\\s+${x.files.length} passed \\(${x.files.length}\\)`).test(plain),'Original selected-file success count missing');
    for(const f of acceptedFiles){
     assert((binding.reviewedGroupFiles?.[g.id]||[]).includes(f),'File outside independently reviewed group');
     assert(!admitted.has(f),'Overlapping whole-file results cannot be summed');admitted.add(f);groupFiles.add(f);
    }
    assert(Number.isSafeInteger(x.admittedAssertions)&&x.admittedAssertions>0&&x.admittedAssertions<=x.passedAssertions);
    if(acceptedFiles.length===x.files.length)assert.equal(x.admittedAssertions,x.passedAssertions);else assert.match(x.subsetReview||'',/\S.{30,}/);
    admittedAssertions+=x.admittedAssertions;
   }else throw Error('Unsupported evidence kind; no implicit success');
  }
  if((binding.reviewedGroupFiles?.[g.id]||[]).length)assert.deepEqual([...groupFiles].sort(),[...(binding.reviewedGroupFiles?.[g.id]||[])].sort(),'Missing admitted files in group '+g.id);
 }
 if(binding.fixedPgCases?.length)verifyFixedPg(e.fixedPg);
 const fresh=new Set();
 for(const[component,key]of [['frontend','frontendTestFiles'],['backend','backendTestFiles'],['frontend','laterFrontendTestFiles'],['backend','laterBackendTestFiles']]){
  for(const f of binding.checks[key]||[]){const full=`server-version/${component}/${f}`;assert(!fresh.has(full),'Duplicate fresh check selection');assert(!admitted.has(full),'A qualified unchanged whole-file check must not rerun');fresh.add(full);}
 }
 assert(e.limits.some(s=>s.includes('unsigned')));assert(e.limits.some(s=>s.includes('node_modules')));
 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,groups:e.groups.map(g=>g.id),acceptedWholeFiles:admitted.size,acceptedWholeFileAssertions:admittedAssertions,acceptedFixedPgCases:binding.fixedPgCases?.length||0,limits:e.limits};
}
export function verifyFreshReport(r,files){
 assert.equal(r.success,true);for(const k of ['numFailedTests','numPendingTests','numTodoTests'])assert.equal(r[k],0);
 assert.deepEqual(r.testResults.map(s=>s.name.split('/src/').at(-1)).sort(),files.map(f=>f.slice(4)).sort());
 const cases=r.testResults.flatMap(s=>s.assertionResults);assert(cases.length>0);assert(cases.every(c=>c.status==='passed'));
 return {files:files.length,cases:cases.length};
}
function evidence(){return JSON.parse(readFileSync('.github/evidence/training-entry/reviewed.json'));}
function tests(component,later=false){
 assert.equal(binding.executionPolicy,'missing-only-current-mixed-candidate');
 const files=binding.checks[later?'later'+component[0].toUpperCase()+component.slice(1)+'TestFiles':component+'TestFiles'];assert(files.every(f=>/^src\/[\w/.-]+\.test\.tsx?$/.test(f)));
 if(files.length===0){save(component+(later?'-later':'')+'-selection',{files:[],reason:'No missing files in this fixed group; not an executed test'});return;}
 mkdirSync(output,{recursive:true});const id=component+(later?'-later-fresh':'-fresh');const target=`${output}/${id}.json`;
 runRecorded(id,component,process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=json',`--outputFile=../../${target}`]);
 save(id+'-checked',verifyFreshReport(JSON.parse(readFileSync(target)),files));
}
function postgresSelections(){
 const entries=binding.checks.postgresSelections;assert.equal(entries.length,1);
 const x=entries[0];assert.equal(x.file,'src/__tests__/integration/trainingParticipation.postgres.integration.test.ts');assert.equal(x.expectedPassed,7);
 const fixed=binding.fixedPgCases.filter(c=>c.file.endsWith('/trainingParticipation.postgres.integration.test.ts'));
 const selection=new RegExp(x.pattern);for(const c of fixed)assert(!selection.test(c.caseName),'Already passed PG case selected again');
 mkdirSync(output,{recursive:true});const target=`${output}/postgres-missing.json`;
 runRecorded('postgres-missing','backend',process.execPath,['node_modules/vitest/vitest.mjs','run',x.file,'-t',x.pattern,'--maxWorkers=1','--no-file-parallelism','--reporter=json',`--outputFile=../../${target}`]);
 const r=JSON.parse(readFileSync(target));assert.equal(r.success,true);assert.equal(r.numFailedTests,0);
 const cases=r.testResults.flatMap(t=>t.assertionResults),passed=cases.filter(c=>c.status==='passed');
 assert.equal(passed.length,x.expectedPassed);assert(passed.every(c=>selection.test(c.fullName)));
 assert(cases.filter(c=>c.status!=='passed').every(c=>!selection.test(c.fullName)&&['pending','skipped','todo'].includes(c.status)));
 save('postgres-missing-checked',{passed:passed.map(c=>c.fullName),notExecuted:cases.length-passed.length,wholeFileQualification:false});
}
async function audits(){
 // Current mixed product has new inputs: never inherit a different product's audit.
 const results=[];
 for(const component of ['frontend','backend']){
  const record=runRecorded(component+'-audit',component,'npm',['audit','--package-lock-only','--omit=dev','--audit-level=high','--json']);
  const raw=readFileSync(`${output}/${component}-audit.stdout.log`),report=JSON.parse(raw);
  assert.equal(report.auditReportVersion,2);assert(!report.error);
  assert.equal(report.metadata?.vulnerabilities?.high,0);assert.equal(report.metadata?.vulnerabilities?.critical,0);
  results.push({component,exitCode:record.exitCode,sha256:sha(raw),vulnerabilities:report.metadata.vulnerabilities});
 }
 save('audit',{mode:'fresh-current-mixed-product',results});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');
  assert.deepEqual(trainingEntryPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
  const accepted=verifyEvidence();assert.equal(binding.executionPolicy,'missing-only-current-mixed-candidate');requireMissingRecordApproval(binding.checks);save('admission',accepted);
 }else if(action==='frontend'||action==='backend')tests(action);
 else if(action==='frontend-later'||action==='backend-later')tests(action.split('-')[0],true);
 else if(action==='lint'){
  assert.equal(binding.executionPolicy,'missing-only-current-mixed-candidate');
  runRecorded('early-lint','frontend',process.execPath,['node_modules/eslint/bin/eslint.js',...binding.checks.earlyLintFiles]);
 }else if(action==='build-permission'){assert.equal(binding.checks.frontendBuild,'missing-current-component');}
 else if(action==='frontend-types'){runRecorded('frontend-types','frontend',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.app.json']);}
 else if(action==='backend-compile'){runRecorded('backend-compile','backend',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json']);retainBuildManifest('backend');}
 else if(action==='browser-input'){browserInput();}
 else if(action==='frontend-build'){assert.equal(binding.checks.frontendBuild,'missing-current-component');runRecorded('frontend-build','frontend',process.execPath,['node_modules/vite/bin/vite.js','build','--manifest']);retainBuildManifest('frontend');}
 else if(action==='postgres')postgresSelections();
 else if(action==='audit')await audits();
 else throw Error('Unknown Training entry check');
}
