import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {binding,branch,trainingEntryPlan} from './training-entry-scope.mjs';
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
 const reused=binding.completedFrontend;assert(reused,'Only the frozen official frontend reuse is allowed');
 verifyBrowserInput(JSON.parse(raw),files,{source:reused.checkout,sourceHead:reused.sourceHead,tree:binding.components.frontend,run:String(reused.run),attempt:reused.attempt});
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
// Local execution commits are provenance, not necessarily published Git objects.
// Only the frozen current product has an explicit, byte-identical remote mapping.
export function evidenceSourceObject(source,resolve=git){
 const mapping=binding.evidenceSourceObjects?.[source]||(source===binding.localProduct?{remote:binding.product,tree:binding.productTree}:null);
 if(!mapping)return source;
 assert.match(mapping.remote,/^[a-f0-9]{40}$/);assert.match(mapping.tree,/^[a-f0-9]{40}$/);
 assert.notEqual(mapping.remote,source,'Published snapshot identity required');
 assert.equal(resolve('rev-parse',mapping.remote+'^{tree}'),mapping.tree,'Published evidence product tree mismatch');
 return mapping.remote;
}
export function verifyFixedFrontend(e){
 const expected=binding.fixedFrontendContracts;
 assert.equal(e.kind,'reviewed-fixed-pr351-frontend-420-plus-1');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);
 assert.equal(e.inputClosureGroup,'final-frontend-types');assert.equal(expected.inputClosureGroup,e.inputClosureGroup);
 assert.equal(e.reports.length,2);assert.equal(expected.files.length,34);assert.equal(expected.expectedPassed,421);
 const reports=e.reports.map(r=>{const bytes=gunzipSync(Buffer.from(r.gzipBase64,'base64'),{maxOutputLength:1024*1024});assert.equal(bytes.length,r.bytes);assert.equal(sha(bytes),r.sha256);assert(!bytes.toString().includes('/workspace/'));return JSON.parse(bytes)});
 const [first,retry]=reports;assert.equal(e.reports[0].exitCode,1);assert.equal(first.success,false);assert.equal(first.numPassedTests,420);assert.equal(first.numFailedTests,1);
 assert.deepEqual(first.testResults.map(f=>f.name).sort(),[...expected.files].sort());
 const all=new Map(),passed=new Set(),failed=[];
 for(const file of first.testResults)for(const c of file.assertionResults){const key=file.name+'\0'+c.fullName;assert(!all.has(key));all.set(key,c);assert(['passed','failed'].includes(c.status));if(c.status==='passed')passed.add(key);else failed.push(key);}
 const retryKey=expected.retryFile+'\0'+expected.retryName;
 assert.equal(all.size,421);assert.deepEqual(failed,[retryKey]);assert.equal(passed.size,420);
 assert.equal(e.reports[1].exitCode,0);assert.equal(retry.success,true);assert.equal(retry.numPassedTests,1);assert.equal(retry.numFailedTests,0);assert.equal(retry.testResults.length,1);
 assert.equal(retry.testResults[0].name,expected.retryFile);
 const retryCases=retry.testResults[0].assertionResults;assert.equal(retryCases.length,17);
 for(const c of retryCases){const key=expected.retryFile+'\0'+c.fullName;assert(all.has(key));if(c.status==='passed'){assert.equal(key,retryKey);assert(!passed.has(key));passed.add(key)}else assert(['pending','skipped'].includes(c.status));}
 assert.equal(passed.size,421);const excluded=[];for(const [file,count]of Object.entries(expected.excludedAffectedFiles)){const cases=[...passed].filter(key=>key.startsWith(file+'\0'));assert.equal(cases.length,count);excluded.push(...cases)}assert.equal(excluded.length,expected.excludedPriorCount);for(const key of excluded)passed.delete(key);assert.equal(passed.size,expected.retainedPassed);return {cases:passed.size,originalPassed:420,retryPassed:1,excludedAffected:excluded.length,ciExecuted:false,originalExecutionSigned:false};
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
   const originalInputs=x.originalInputs||x.inputs;
   const sourceObject=x.sourceObjectMode==='reachable-original'?evidenceSourceObject(x.source,resolve):null;
   for(const f of acceptedFiles)assert(f in originalInputs,'Missing original admitted file identity');
   if(acceptedFiles.length!==x.files.length)assert.equal(x.sourceAppliesTo,'admitted-closure-only','Do not assign reconstructed original snapshots to discarded files');
   for(const[f,b]of Object.entries(x.inputs)){
    assert.match(f,/^(server-version\/|\.github\/)/);assert(!f.split('/').includes('..'));assert.match(b,/^[a-f0-9]{40}$/);
    assert.equal(resolve('rev-parse','HEAD:'+f),b,'Current imported input drift: '+f);
    const old=originalInputs[f]??null;if(old!==null)assert.match(old,/^[a-f0-9]{40}$/,'Invalid original import input');
    if(x.sourceObjectMode==='reachable-original'&&old!==null)assert.equal(resolve('rev-parse',sourceObject+':'+f),old,'Original imported input mismatch: '+f);
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
 if(binding.fixedFrontendContracts){const group=e.groups.find(g=>g.id==='final-frontend-types');assert(group);const d=binding.fixedFrontendContracts,x=group.executions[0];assert.equal(x.inputs[d.retryFile],d.finalTestBlob);assert.equal((x.originalInputs||x.inputs)[d.retryFile],d.priorTestBlob);assert.equal(e.fixedFrontendContracts.sourceAfter,binding.localProduct);verifyFixedFrontend(e.fixedFrontendContracts);assert.deepEqual(binding.checks.frontendTestFiles,['src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx'],'Only the explicitly invalidated export file may rerun');}
 const fresh=new Set();
 for(const[component,key]of [['frontend','frontendTestFiles'],['backend','backendTestFiles'],['frontend','laterFrontendTestFiles'],['backend','laterBackendTestFiles']]){
  for(const f of binding.checks[key]||[]){const full=`server-version/${component}/${f}`;assert(!fresh.has(full),'Duplicate fresh check selection');assert(!admitted.has(full),'A qualified unchanged whole-file check must not rerun');fresh.add(full);}
 }
 assert(e.limits.some(s=>s.includes('unsigned')));assert(e.limits.some(s=>s.includes('node_modules')));
 return {kind:e.kind,ciExecuted:false,originalExecutionSigned:false,groups:e.groups.map(g=>g.id),acceptedWholeFiles:admitted.size,acceptedWholeFileAssertions:admittedAssertions,acceptedFixedPgCases:binding.fixedPgCases?.length||0,acceptedFixedFrontendCases:binding.fixedFrontendContracts?binding.fixedFrontendContracts.retainedPassed:0,limits:e.limits};
}
export function verifyFreshReport(r,files){
 assert.equal(r.success,true);for(const k of ['numFailedTests','numPendingTests','numTodoTests'])assert.equal(r[k],0);
 assert.deepEqual(r.testResults.map(s=>s.name.split('/src/').at(-1)).sort(),files.map(f=>f.slice(4)).sort());
 const cases=r.testResults.flatMap(s=>s.assertionResults);assert(cases.length>0);assert(cases.every(c=>c.status==='passed'));
 return {files:files.length,cases:cases.length};
}
function evidence(){return JSON.parse(readFileSync('.github/evidence/training-entry/reviewed.json'));}
export function failedVitestSummary(report){
 return {success:report.success,numFailedTests:report.numFailedTests,numFailedTestSuites:report.numFailedTestSuites,
  failures:(report.testResults||[]).flatMap(file=>(file.assertionResults||[]).filter(c=>c.status==='failed').map(c=>({file:file.name,name:c.fullName||c.title,messages:c.failureMessages||[]}))),
  suiteFailures:(report.testResults||[]).filter(file=>file.status==='failed'&&!(file.assertionResults||[]).some(c=>c.status==='failed')).map(file=>({file:file.name,message:file.message||''}))};
}
function tests(component,later=false){
 assert.equal(binding.executionPolicy,'missing-only-current-mixed-candidate');
 const files=binding.checks[later?'later'+component[0].toUpperCase()+component.slice(1)+'TestFiles':component+'TestFiles'];assert(files.every(f=>/^src\/[\w/.-]+\.test\.tsx?$/.test(f)));
 if(files.length===0){save(component+(later?'-later':'')+'-selection',{files:[],reason:'No missing files in this fixed group; not an executed test'});return;}
 mkdirSync(output,{recursive:true});const id=component+(later?'-later-fresh':'-fresh');const target=`${output}/${id}.json`;
 try{runRecorded(id,component,process.execPath,['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=2','--reporter=json',`--outputFile=../../${target}`]);}
 catch(error){
  // Keep the real JSON and failing invocation; diagnostic stderr is not a verdict.
  if(existsSync(target)){const summary=failedVitestSummary(JSON.parse(readFileSync(target)));save(id+'-failures',summary);console.error(JSON.stringify(summary).slice(0,16000));}
  throw error;
 }
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
// Reuse the existing authenticated artifact + 24h freshness mechanism for the
// successful frontend subprocess only. The original backend/admission failed.
export function verifyDependencyAuditEvidence(command,stdout,currentManifest,component,now=Date.now()){
 assert(['frontend','backend'].includes(component));
 const expected=component==='frontend'?binding.officialFrontendAudit:binding.officialBackendAudit;assert(expected);
 // These exact source/test/CSS changes do not alter npm audit inputs. Restore
 // their prior manifest entries before the original strict whole-manifest check.
 for(const [file,d]of Object.entries(binding.auditSourceDeltas||binding.officialRecovery?.productDeltas||{})){
  if(!file.startsWith(`server-version/${component}/`))continue;
  const after=`100644 blob ${d.after}\t${file}`,before=`100644 blob ${d.before}\t${file}`;
  assert(currentManifest.split('\n').includes(after));currentManifest=currentManifest.split('\n').map(l=>l===after?before:l).join('\n');
 }
 assert.equal(command.id,component+'-audit');assert.equal(command.cwd,'server-version/'+component);
 assert.deepEqual(command.command,['npm','audit','--package-lock-only','--omit=dev','--audit-level=high','--json']);
 assert.equal(command.source,expected.checkout);assert.equal(command.componentTree,expected.componentTree);
 assert.equal(command.status,'success');assert.equal(command.exitCode,0);assert.equal(command.ciExecuted,true);
 assert.equal(command.tools.node,'v24.21.0');assert.equal(command.signal,null);assert.equal(command.error,null);
 assert.equal(command.gitInputManifestSHA256,sha(command.gitInputManifest));
 if(currentManifest!==command.gitInputManifest){
  assert.equal(component,'frontend','Backend dependency inputs changed');
  const d=binding.fixedFrontendContracts;assert(d,'No reviewed audit-input delta');
  assert.equal(d.retryFile,'server-version/frontend/src/modules/composite/__tests__/CompositeAssessmentPage.test.tsx');
  const originalLine=`100644 blob ${d.priorTestBlob}\t${d.retryFile}`,currentLine=`100644 blob ${d.finalTestBlob}\t${d.retryFile}`;
  assert(command.gitInputManifest.split('\n').includes(originalLine));assert(currentManifest.split('\n').includes(currentLine));
  assert.equal(currentManifest.split('\n').map(l=>l===currentLine?originalLine:l).join('\n'),command.gitInputManifest,'Non-test dependency audit input changed');
 }
 assert.equal(command.stdoutSHA256,sha(stdout));assert.equal(command.stderrSHA256,sha(''));
 assert.equal(command.completedAt,expected.completedAt);
 const report=JSON.parse(stdout);assert.equal(report.auditReportVersion,2);assert(!report.error);
 assert.equal(report.metadata?.vulnerabilities?.high,0);assert.equal(report.metadata?.vulnerabilities?.critical,0);
 const age=now-Date.parse(command.completedAt);assert(Number.isFinite(age)&&age>=0);
 return {fresh:age<86400000,ageMilliseconds:age,completedAt:command.completedAt,source:command.source,sourceHead:expected.sourceHead};
}
export function verifyFrontendAuditEvidence(command,stdout,currentManifest,now=Date.now()){return verifyDependencyAuditEvidence(command,stdout,currentManifest,'frontend',now);}
async function dependencyAuditProof(component){
 const r=component==='frontend'?binding.officialFrontendAudit:binding.officialBackendAudit;assert(r,'Exact successful dependency audit binding missing');
 assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 const api=async path=>{const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(response.status,200,'Official dependency audit evidence unavailable');return response;};
 const [run,job,artifact]=await Promise.all([api(`actions/runs/${r.run}`).then(x=>x.json()),api(`actions/jobs/${r.job}`).then(x=>x.json()),api(`actions/artifacts/${r.artifact}`).then(x=>x.json())]);
 assert.equal(run.head_sha,r.sourceHead);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.id,r.job);assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.sourceHead);assert.equal(job.status,'completed');
 assert.equal(job.name,'training-entry / admission');assert(job.steps.some(s=>s.name==='run current frontend and backend HIGH CRITICAL dependency audits'&&s.conclusion===(r.auditStepConclusion||'failure')));
 assert.equal(run.head_branch,branch);assert.equal(artifact.id,r.artifact);
 assert.equal(job.conclusion,r.admissionConclusion||'failure','Original admission conclusion must remain unchanged');
 assert.equal(artifact.workflow_run.id,r.run);assert.equal(artifact.workflow_run.head_sha,r.sourceHead);
 assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,r.bytes);assert.equal(artifact.digest,'sha256:'+r.sha256);assert.equal(artifact.name,r.name);
 const zip=Buffer.from(await(await api(`actions/artifacts/${r.artifact}/zip`)).arrayBuffer());assert.equal(zip.length,r.bytes);assert.equal(sha(zip),r.sha256);
 const files=JSON.parse(execFileSync('python3',['-c',"import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert all(i.file_size<2000000 and not i.filename.startswith('/') and '..' not in i.filename.split('/') for i in z.infolist()); assert sum(i.file_size for i in z.infolist())<8000000; print(json.dumps({i.filename:z.read(i).decode() for i in z.infolist() if not i.is_dir()}))"],{input:zip,encoding:'utf8',maxBuffer:10*1024*1024}));
 const read=name=>{const found=Object.entries(files).filter(([p])=>p.split('/').at(-1)===name);assert.equal(found.length,1);return found[0][1];};
 const proof=verifyDependencyAuditEvidence(JSON.parse(read(component+'-audit-command.json')),read(component+'-audit.stdout.log'),git('ls-tree','-r','HEAD','--','server-version/'+component),component);
 save(component+'-audit-original-proof',{...proof,run:r.run,job:r.job,artifact:r.artifact,artifactSHA256:r.sha256,originalAdmissionConclusion:r.admissionConclusion||'failure',onlyExactAuditSubprocessAccepted:true});
 return proof;
}
async function audits(){
 // Reuse only exact successful official component subprocesses within 24 hours.
 const proofs={},results=[];
 for(const component of ['frontend','backend']){
  proofs[component]=await dependencyAuditProof(component);if(proofs[component].fresh)continue;
  const record=runRecorded(component+'-audit',component,'npm',['audit','--package-lock-only','--omit=dev','--audit-level=high','--json']);
  const raw=readFileSync(`${output}/${component}-audit.stdout.log`),report=JSON.parse(raw);
  assert.equal(report.auditReportVersion,2);assert(!report.error);
  assert.equal(report.metadata?.vulnerabilities?.high,0);assert.equal(report.metadata?.vulnerabilities?.critical,0);
  results.push({component,exitCode:record.exitCode,sha256:sha(raw),vulnerabilities:report.metadata.vulnerabilities});
 }
 save('audit',{mode:'verified-component-subprocesses-with-24h-expiry',proofs,results});
}
// Fixed fourth-run recovery only: retain successful subchecks of failed jobs,
// never their overall conclusion. No uploaded local reports or inferred passes.
export function reviewedRecoveryManifest(original,current,component,deltas=binding.officialRecovery.productDeltas){
 let expected=current;
 for(const [file,d]of Object.entries(deltas)){
  if(!file.startsWith(`server-version/${component}/`))continue;
  const before=`100644 blob ${d.before}\t${file}`,after=`100644 blob ${d.after}\t${file}`;
  assert(expected.split('\n').includes(after),'Recovery delta current blob differs');
  expected=expected.split('\n').map(line=>line===after?before:line).join('\n');
 }
 assert.equal(expected,original,'Unreviewed recovery input drift');
}
export function verifyRecoveredBackend(report,command,current){
 const r=binding.officialRecovery;
 assert.equal(sha(JSON.stringify(report)),r.backendParsedSHA256);
 assert.equal(command.source,r.checkout);assert.equal(command.status,'failed');assert.equal(command.exitCode,1);assert.equal(command.tools.node,'v24.21.0');
 assert.equal(command.gitInputManifestSHA256,sha(command.gitInputManifest));
 reviewedRecoveryManifest(command.gitInputManifest,current,'backend');
 assert.equal(report.success,false);assert.equal(report.numPassedTests,465);assert.equal(report.numFailedTests,6);assert.equal(report.numPendingTests,0);
 assert.deepEqual(report.testResults.map(f=>f.name.split('/server-version/backend/').at(-1)).sort(),[...r.backendFiles].sort());
 const seen=new Set(),failed=[];let passed=0;
 for(const f of report.testResults)for(const [index,c]of f.assertionResults.entries()){const key=f.name+'\0'+index+'\0'+c.fullName;assert(!seen.has(key));seen.add(key);if(c.status==='passed')passed++;else{assert.equal(c.status,'failed');assert(f.name.endsWith('/'+r.retryFile));failed.push(c.fullName)}}
 assert.equal(seen.size,471);assert.equal(passed,465);assert.deepEqual(failed.sort(),[...r.failedBackendNames].sort());
 return {passed:465,failed:6,originalJobConclusion:'failure',wholeInvocationPassed:false};
}
async function officialRecoveryFiles(component,completedFrontend=false){
 const r=completedFrontend?binding.completedFrontend:component==='backend'?{...binding.officialRecovery,...binding.officialRecovery.backendOrigin}:binding.officialRecovery,a=r.artifacts[component];assert(a);assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 const api=async path=>{const x=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});assert.equal(x.status,200);return x};
 const [run,job,artifact]=await Promise.all([api(`actions/runs/${r.run}`).then(x=>x.json()),api(`actions/jobs/${a.job}`).then(x=>x.json()),api(`actions/artifacts/${a.id}`).then(x=>x.json())]);
 assert.equal(run.head_sha,r.sourceHead);assert.equal(run.head_branch,branch);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.sourceHead);assert.equal(job.name,a.jobName);assert.equal(job.status,'completed');assert.equal(job.conclusion,a.conclusion);
 if(component==='browser'){const producer=await(await api(`actions/jobs/${r.frontendJob}`)).json();assert.equal(producer.run_id,r.run);assert.equal(producer.head_sha,r.sourceHead);assert.equal(producer.name,'training-entry / frontend');assert.equal(producer.status,'completed');assert.equal(producer.conclusion,'success');assert(producer.steps.some(step=>step.name==='retain exact successful lint and unaffected browser scenarios'&&step.conclusion==='success'));}
 assert.equal(artifact.id,a.id);assert.equal(artifact.name,a.name);assert.equal(artifact.workflow_run.id,r.run);assert.equal(artifact.workflow_run.head_sha,r.sourceHead);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,a.bytes);assert.equal(artifact.digest,'sha256:'+a.sha256);
 const zip=Buffer.from(await(await api(`actions/artifacts/${a.id}/zip`)).arrayBuffer());assert.equal(zip.length,a.bytes);assert.equal(sha(zip),a.sha256);
 const wanted=completedFrontend?Object.keys(component==='frontend'?r.fileHashes:r.browserFileHashes):component==='backend'?Object.keys(binding.completedBackend.fileHashes):['browser.json','component-source-manifest.json','frontend-build-command.json','lint-retained.json',...Object.keys(r.completedReview.fileHashes)];
 const result=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,json,base64
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); wanted=json.loads(sys.argv[1]); out={}
for name in wanted:
 found=[i for i in z.infolist() if i.filename.split('/')[-1]==name]
 assert len(found)==1
 i=found[0]; assert not i.filename.startswith('/') and '..' not in i.filename.split('/') and i.file_size<32000000
 out[name]=base64.b64encode(z.read(i)).decode()
print(json.dumps(out))`,JSON.stringify(wanted)],{input:zip,encoding:'utf8',maxBuffer:48*1024*1024}));
 const files=Object.fromEntries(Object.entries(result).map(([k,v])=>[k,Buffer.from(v,'base64')]));
 save(component+'-recovery-official',{run:r.run,job:a.job,artifact:a.id,artifactSHA256:a.sha256,originalConclusion:a.conclusion});
 return {files,job,zip};
}
export function verifyCompletedBackend(files,currentManifest,actualDist){
 const r=binding.completedBackend;
 for(const[name,h]of Object.entries(r.fileHashes))assert.equal(sha(files[name]),h,'Official backend file changed: '+name);
 const parse=name=>JSON.parse(files[name]);const command=parse('backend-compile-command.json'),manifest=parse('backend-build-manifest.json');
 assert.equal(command.source,r.checkout);assert.equal(command.status,'success');assert.equal(command.exitCode,0);assert.equal(command.tools.node,'v24.21.0');assert.equal(command.gitInputManifest,currentManifest);assert.equal(command.gitInputManifestSHA256,sha(currentManifest));assert.equal(command.componentTree,binding.components.backend);assert.equal(command.componentTree,r.componentTree);
 assert.deepEqual(command.command.slice(1),['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
 assert.equal(manifest.componentTree,r.componentTree);assert.equal(manifest.source,r.checkout);assert.equal(manifest.sourceHead,r.sourceHead);assert.equal(manifest.run,String(r.run));assert.deepEqual(actualDist,manifest.files,'Emitted backend artifact bytes differ');
 for(const name of ['backend-eight-command.json','postgres-missing-command.json']){const c=parse(name);assert.equal(c.status,'success');assert.equal(c.exitCode,0);assert.equal(c.source,r.checkout);assert.equal(c.componentTree,r.componentTree);assert.equal(c.gitInputManifest,currentManifest);assert.equal(c.tools.node,'v24.21.0');}
 const eight=parse('backend-eight-checked.json'),pg=parse('postgres-missing-checked.json');assert.equal(eight.selected.length,8);assert.equal(eight.retainedOfficial,465);assert.equal(eight.totalQualified,473);assert.equal(pg.passed.length,7);assert.equal(pg.wholeFileQualification,false);
 const old=parse('backend-465-retained.json');assert.equal(old.passed,465);assert.equal(old.failed,6);assert.equal(old.originalJobConclusion,'failure');assert.equal(old.wholeInvocationPassed,false);
 const migration=parse('migration-reused.json');assert.equal(migration.qualificationReexecuted,false);assert.equal(migration.testDatabaseSeeded,true);
 return {source:r.sourceHead,run:r.run,componentTree:r.componentTree,backendContracts:473,missingPgCases:7,compiledFiles:Object.keys(actualDist).length,officialJobConclusion:'success',reexecuted:false};
}
async function recoverBackend(){
 const r=binding.completedBackend,{files,job,zip}=await officialRecoveryFiles('backend');assert.equal(job.conclusion,'success');
 for(const name of ['recover qualified migration and 465 successful contracts, seed remaining PG cases','emit the missing backend compilation once','only fixed missing-record affected backend contracts','only the seven missing participation cases, never the twelve admitted reset FINAL cases'])assert(job.steps.some(step=>step.name===name&&step.conclusion==='success'));
 assert.equal(git('rev-parse','HEAD:.github/scripts/training-entry-migration.mjs'),r.migrationScriptBlob);assert.equal(git('ls-tree','-r','HEAD','--','server-version/backend/prisma'),r.prismaInputs);
 const dist=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,json,hashlib
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); out={}; prefix='server-version/backend/dist/'
for i in z.infolist():
 if i.filename.startswith(prefix) and not i.is_dir():
  assert '..' not in i.filename.split('/') and i.file_size<16000000
  data=z.read(i);out[i.filename[len(prefix):]]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
assert out
print(json.dumps(out))`],{input:zip,encoding:'utf8',maxBuffer:4*1024*1024}));
 save('backend-complete-retained',verifyCompletedBackend(files,git('ls-tree','-r','HEAD','--','server-version/backend'),dist));
}
function retryBackend(){
 const r=binding.officialRecovery;assert.equal(r.revalidation8Approved,true);assert.equal(r.approvalMessage,'Sentinel_355ab6c09da88191aaf61e8b9d1648f2');
 const target=`${output}/backend-eight.json`;runRecorded('backend-eight','backend',process.execPath,['node_modules/vitest/vitest.mjs','run',r.retryFile,'-t',r.retryPattern,'--maxWorkers=1','--reporter=json',`--outputFile=../../${target}`]);
 const report=JSON.parse(readFileSync(target));assert.equal(report.success,true);assert.equal(report.numPassedTests,8);assert.equal(report.numFailedTests,0);
 const selected=report.testResults.flatMap(f=>f.assertionResults).filter(c=>c.status==='passed').map(c=>c.fullName);assert.equal(new Set(selected).size,8);for(const name of r.failedBackendNames)assert(selected.includes(name));
 assert(selected.every(name=>r.failedBackendNames.includes(name)||name.includes('preserves missing, null, NaN')||name.includes('preserves multiple issue paths')));save('backend-eight-checked',{selected,retainedOfficial:465,totalQualified:473});
}
export function verifyCompletedFrontend(files,currentManifest,actualDist){
 const r=binding.completedFrontend;
 for(const [name,h]of Object.entries(r.fileHashes))assert.equal(sha(files[name]),h,'Official frontend evidence changed: '+name);
 const parse=name=>JSON.parse(files[name]);
 for(const name of ['frontend-build-command.json','frontend-fresh-command.json','export-reload-lint-command.json']){const c=parse(name);assert.equal(c.source,r.checkout);assert.equal(c.componentTree,binding.components.frontend);assert.equal(c.status,'success');assert.equal(c.exitCode,0);assert.equal(c.tools.node,'v24.21.0');assert.equal(c.gitInputManifest,currentManifest);assert.equal(c.gitInputManifestSHA256,sha(currentManifest));}
 assert.deepEqual(parse('frontend-build-command.json').command.slice(1),['node_modules/vite/bin/vite.js','build','--manifest']);
 verifyBrowserInput(parse('frontend-build-manifest.json'),actualDist,{source:r.checkout,sourceHead:r.sourceHead,tree:binding.components.frontend,run:String(r.run),attempt:r.attempt});
 const report=parse('frontend-fresh.json');assert.equal(report.success,true);assert.equal(report.numPassedTests,3);assert.equal(report.numFailedTests,0);assert.equal(report.testResults.length,1);assert(report.testResults[0].name.endsWith('/src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx'));assert.equal(report.testResults[0].assertionResults.length,3);assert(report.testResults[0].assertionResults.every(c=>c.status==='passed'));
 const review=parse('review-contracts-retained.json');assert.equal(review.run,40094830671);assert.equal(review.passed,8);assert.equal(review.originalJobConclusion,'success');assert.equal(review.reexecuted,false);
 return {source:r.sourceHead,run:r.run,frontendCases:3,retainedReview:8,compiledFiles:Object.keys(actualDist).length,reexecuted:false};
}
async function recoverFrontend(){
 const r=binding.completedFrontend,{files,job,zip}=await officialRecoveryFiles('frontend',true);
 for(const name of ['only fixed missing-record affected frontend contracts','retain exact successful lint and unaffected browser scenarios','lint only the changed export recovery source and regression','compile once for previously unexecuted actual-dist browser acceptance'])assert(job.steps.some(s=>s.name===name&&s.conclusion==='success'));
 const actualDist=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,json,hashlib,os,stat
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); out={}; prefix='server-version/frontend/dist/'
for i in z.infolist():
 if i.filename.startswith(prefix) and not i.is_dir():
  assert '..' not in i.filename.split('/') and not i.filename.startswith('/') and not stat.S_ISLNK(i.external_attr>>16) and i.file_size<16000000
  data=z.read(i); key=i.filename[len(prefix):]; assert key not in out;out[key]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
  os.makedirs(os.path.dirname(i.filename),exist_ok=True);open(i.filename,'wb').write(data)
assert out
print(json.dumps(out))`],{input:zip,encoding:'utf8',maxBuffer:4*1024*1024}));
 save('frontend-complete-retained',verifyCompletedFrontend(files,git('ls-tree','-r','HEAD','--','server-version/frontend'),actualDist));
 for(const [name,bytes]of Object.entries(files)){mkdirSync(output,{recursive:true});writeFileSync(output+'/'+name,bytes);}
 const previous=await officialRecoveryFiles('browser',true);for(const [name,h]of Object.entries(r.browserFileHashes))assert.equal(sha(previous.files[name]),h);
 const report=JSON.parse(previous.files['browser.json']);assert.equal(report.sourceSha,r.checkout);assert.equal(report.frontendGitTree,r.componentTree);assert.equal(report.status,'FAIL');assert.equal(report.harnessSha256,r.browserHarnessSHA256);
 const scenarios=report.scenarios.filter(s=>r.browserRetainedNames.includes(s.name));assert.equal(scenarios.length,26);assert.equal(new Set(scenarios.map(s=>s.name)).size,26);assert(scenarios.every(s=>s.status==='PASS'&&!s.name.startsWith('anonymous-')&&s.errors.length===0&&s.unexpected.length===0));
 save('browser-retained',{source:r.sourceHead,artifact:r.artifacts.browser.id,originalJobConclusion:'failure',currentFrontendTree:binding.components.frontend,scenarios});
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`manifest=${sha(files['frontend-build-manifest.json'])}\n`);
}
export function verifyCompletedReview(files,currentManifest){
 const r=binding.officialRecovery;
 for(const [name,h]of Object.entries(r.completedReview.fileHashes))assert.equal(sha(files[name]),h,'Official review evidence differs: '+name);
 const command=JSON.parse(files['frontend-fresh-command.json']),report=JSON.parse(files['frontend-fresh.json']),lint=JSON.parse(files['batch-grade-lint-command.json']);
 for(const c of [command,lint]){assert.equal(c.source,r.checkout);assert.equal(c.status,'success');assert.equal(c.exitCode,0);assert.equal(c.tools.node,'v24.21.0');assert.equal(c.gitInputManifestSHA256,sha(c.gitInputManifest));reviewedRecoveryManifest(c.gitInputManifest,currentManifest,'frontend');}
 assert(command.command.includes(r.completedReview.file));assert.equal(report.success,true);assert.equal(report.numPassedTests,8);assert.equal(report.numFailedTests,0);assert.equal(report.testResults.length,1);assert(report.testResults[0].name.endsWith('/'+r.completedReview.file));assert.equal(report.testResults[0].assertionResults.length,8);assert(report.testResults[0].assertionResults.every(c=>c.status==='passed'));
 assert.deepEqual(lint.command.slice(1),['node_modules/eslint/bin/eslint.js','src/pages/AssignmentList.tsx','src/pages/__tests__/AssignmentList.review-pagination.test.tsx']);
 return {source:r.sourceHead,run:r.run,passed:8,originalJobConclusion:'success',reexecuted:false};
}
async function recoverBrowserAndLint(){
 const r=binding.officialRecovery,{files}=await officialRecoveryFiles('browser');
 assert.equal(sha(files['browser.json']),r.browserReportSHA256);assert.equal(sha(files['component-source-manifest.json']),r.browserSourceManifestSHA256);assert.equal(sha(files['frontend-build-command.json']),r.lintCommandSHA256);
 const report=JSON.parse(files['browser.json']),lint=JSON.parse(files['frontend-build-command.json']);assert.equal(report.sourceSha,r.checkout);assert.equal(report.status,'FAIL');assert.equal(report.harnessSha256,r.browserHarnessSHA256);
 reviewedRecoveryManifest(lint.gitInputManifest,git('ls-tree','-r','HEAD','--','server-version/frontend'),'frontend');assert.equal(lint.gitInputManifestSHA256,sha(lint.gitInputManifest));assert.equal(lint.source,r.checkout);assert.equal(lint.status,'success');assert.equal(lint.exitCode,0);assert.equal(lint.id,'frontend-build');
 assert.equal(lint.tools.node,'v24.21.0');assert.deepEqual(lint.command.slice(1),['node_modules/vite/bin/vite.js','build','--manifest']);
 assert.equal(sha(files['lint-retained.json']),r.lintRetainedSHA256);const retained=JSON.parse(files['lint-retained.json']);assert.equal(retained.originalSuccessfulSubprocess,true);assert.deepEqual(retained.files,binding.checks.earlyLintFiles);
 const scenarios=report.scenarios.filter(s=>r.browserRetainedNames.includes(s.name));assert.equal(scenarios.length,25);assert.equal(new Set(scenarios.map(s=>s.name)).size,25);assert(scenarios.every(s=>s.status==='PASS'&&s.errors.length===0&&s.unexpected.length===0));assert(scenarios.every(s=>s.name!=='assessment-deferred-export-retry'));
 save('review-contracts-retained',verifyCompletedReview(files,git('ls-tree','-r','HEAD','--','server-version/frontend')));
 save('browser-retained',{source:r.sourceHead,artifact:r.artifacts.browser.id,originalJobConclusion:'failure',currentFrontendTree:binding.components.frontend,scenarios});
 save('lint-retained',{source:r.sourceHead,artifact:r.artifacts.browser.id,originalSuccessfulSubprocess:true,files:binding.checks.earlyLintFiles.filter(file=>!['src/pages/questionnaire/deferredAssessmentExport.tsx','src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx'].includes(file)),excludedChangedFiles:['src/pages/questionnaire/deferredAssessmentExport.tsx','src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx'],freshReplacement:'export-reload-lint'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.version,'v24.21.0');const action=process.argv[2];
 if(action==='admission'){
  const {changedEntries}=await import('./content-scope.mjs');const head=git('rev-parse','HEAD');
  assert.deepEqual(trainingEntryPlan(changedEntries(binding.base,head),binding.base,head),JSON.parse(process.env.PLAN));
  const accepted=verifyEvidence();assert.equal(binding.executionPolicy,'missing-only-current-mixed-candidate');requireMissingRecordApproval(binding.checks);save('admission',accepted);
 }else if(action==='backend')retryBackend();
 else if(action==='recover-backend')await recoverBackend();
 else if(action==='recover-frontend')await recoverFrontend();
 else if(action==='recover-browser')await recoverBrowserAndLint();
 else if(action==='frontend'){assert.equal(binding.checks.frontendRetry3Approved,true);assert.equal(binding.checks.frontendRetry3Approval,'Sentinel_18b67969843c8191897da31d857ca6ac');tests(action);const report=JSON.parse(readFileSync(`${output}/frontend-fresh.json`));assert.equal(report.numPassedTests,3);}
 else if(action==='export-reload-lint')runRecorded('export-reload-lint','frontend',process.execPath,['node_modules/eslint/bin/eslint.js','src/pages/questionnaire/deferredAssessmentExport.tsx','src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx']);
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
