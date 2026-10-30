import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,appendFileSync,cpSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {onboardingPlan,binding} from './onboarding-scope.mjs';
import {verifyPr374Observations} from './pr374-evidence.mjs';
import {changedEntries} from './content-scope.mjs';

const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function safePath(path){assert(typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'));return path;}
export function verifyOriginalReport(report,review,{allowDuplicateFiltered=false}={}){
  const cases=report.testResults.flatMap(s=>s.assertionResults.map(c=>({fullName:c.fullName,status:c.status})));
  for(const c of cases)assert(typeof c.fullName==='string'&&c.fullName&&['passed','failed','pending','skipped'].includes(c.status));
  const identities=allowDuplicateFiltered?cases.filter(c=>!['pending','skipped'].includes(c.status)):cases;
  assert.equal(new Set(identities.map(c=>c.fullName)).size,identities.length);
  assert.deepEqual(cases,review.cases,'Original failed/filtered/case rows changed');
  const summary=Object.fromEntries(['success','numPassedTests','numFailedTests','numPendingTests'].map(key=>[key,report[key]]));
  assert.deepEqual(summary,review.summary);
  const passed=cases.filter(c=>c.status==='passed');assert(passed.length>0,'Empty selection is not qualification');
  assert.equal(passed.length,report.numPassedTests);
  assert.equal(cases.filter(c=>['pending','skipped'].includes(c.status)).length,report.numPendingTests);
  const failed=cases.filter(c=>c.status==='failed');
  assert.equal(failed.length,report.numFailedTests);
  assert.equal(cases.length,report.numPassedTests+report.numPendingTests+report.numFailedTests);
  if(failed.length){
    assert.equal(report.success,false);assert.equal(review.allowPartialFailure,true);
    assert(Array.isArray(review.selectedCases),'Partial failure requires explicit passed-case selection');
    assert(Array.isArray(review.failureContinuations));
    assert.deepEqual(review.failureContinuations.map(c=>c.caseName).sort(),failed.map(c=>c.fullName).sort());
    for(const continuation of review.failureContinuations)assert(typeof continuation.reportId==='string'&&continuation.reportId);
  }else{assert.equal(report.success,true);assert(!review.failureContinuations?.length);}
  const names=passed.map(c=>c.fullName);
  if(review.selectedCases!==undefined){
    assert(Array.isArray(review.selectedCases)&&review.selectedCases.length,'Explicit selection must not be empty');
    assert.equal(new Set(review.selectedCases).size,review.selectedCases.length,'Duplicate selected cases');
    for(const name of review.selectedCases)assert(names.includes(name),'Selected case did not pass in original report');
    return review.selectedCases;
  }
  return names;
}
export function verifyFailureContinuations(reports,admitted){
  for(const original of reports)for(const continuation of original.failureContinuations??[]){
    assert.notEqual(continuation.reportId,original.id);
    const replacement=admitted.find(r=>r.id===continuation.reportId);
    assert(replacement?.caseNames.includes(continuation.caseName),'Original failed case has no admitted successful continuation');
  }
}
export function verifyTypeReceipt(receipt,review,readBytes,currentTree){
  const component=review.component??'backend';assert(['backend','frontend'].includes(component));
  const argv=component==='frontend'&&receipt.argv?.[0]==='npm'?['npm','run','typecheck']:component==='frontend'?['node','node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit']:['node','node_modules/typescript/bin/tsc','--noEmit'];
  assert.equal(receipt[review.exitField],0);assert.deepEqual(receipt.argv??receipt.command,argv);
  const tree=review.componentTree??review.backendTree;
  if(tree){assert.equal(receipt.componentTree??receipt.backendTree,tree);assert.equal(currentTree,tree);}
  else {
    assert.equal(component,'backend');assert(receipt.before&&receipt.after&&Object.keys(receipt.before).length);
    assert.deepEqual(receipt.before,receipt.after);
    for(const [path,sha]of Object.entries(receipt.after))assert.equal(hash(readBytes(safePath(path))),sha,'Recorded compiler input drift');
  }
  if(receipt.logSHA256)assert.equal(hash(readBytes(safePath(review.log))),receipt.logSHA256);
  return {originalExitCode:0,originalNode:receipt.node??null,originalSigned:false,component,currentComponentTree:currentTree,
    ...(component==='backend'?{currentBackend:currentTree}:{}),coverage:tree?'exact-'+component+'-tree':'recorded-before-after-source-files'};
}

// PR381's original task recorded shell commands/exits, not the older argv
// receipt schema. Read that exact unsigned, retrospective record directly;
// never infer exit 0 from an empty log or manufacture an original argv receipt.
export function verifyPr381CommandRecords(commands,inputs,firstInputs,currentTree,readBytes){
  const root='docs/performance/form-section-reads-20261028/evidence/';
  const frontend='server-version/frontend/';
  const modulePath=frontend+'src/components/FormSectionManager.tsx';
  const testPath=frontend+'src/components/__tests__/FormSectionManager.http.test.tsx';
  assert.equal(commands.baselineSource,'c5c28f85085e53de1b7be4ed821489accaae7228');
  assert.equal(commands.productSource,'ebf90d6dd7d22cc0a907d8a258f28e95d70f5e64');
  assert.equal(commands.workingDirectory,'/workspace/eduK12-new-version/server-version/frontend');
  assert.equal(inputs.sourceCommit,commands.productSource);
  assert.equal(inputs.sourceTree,'5ab5f09ad590733d9733a33d6afb5ea2ab3c5773');
  assert.equal(inputs.nodeVersion,'v24.21.0');
  assert.equal(inputs.executionSignature,'UNSIGNED_LOCAL');
  assert.equal(currentTree,'cf228766bf881fd1a4d9e922fc8171488a27756b');
  const files=inputs.fullFrontendTrackedFileSha256;
  assert(files&&Object.keys(files).length===1841,'Complete original input inventory required');
  const backendMeta=['server-version/backend/package.json','server-version/backend/package-lock.json','server-version/backend/prisma/schema.prisma'];
  for(const [path,digest]of Object.entries(files)){
    safePath(path);assert(path.startsWith(frontend)||backendMeta.includes(path));
    assert.match(digest,/^[a-f0-9]{64}$/);
    assert.equal(hash(readBytes(path)),digest,'Original task input drift: '+path);
  }
  for(const path of [modulePath,frontend+'src/components/__tests__/FormSectionManager.test.tsx',frontend+'src/pages/teacher/GeneralQuestionnaireEdit.deferred.test.tsx'])
    assert.equal(hash(readBytes(path)),firstInputs[path],'First passing cases consumed different source');
  const original=readBytes(root+'candidate/harness-r1.tsx');
  assert.equal(hash(original),firstInputs[testPath]);
  const supplement="\n  it('derives membership when nested field DTOs omit their enclosing section IDs', async () => {\n    sections.forEach(section => section.items.forEach(item => {\n      delete item.sectionId\n      delete item.formSectionId\n    }))\n    render(<FormSectionManager basePath={basePath} />)\n    await ready()\n    expect(within(target()).getByRole('option', { name: field1 })).toBeInTheDocument()\n    expect(within(target()).queryByRole('option', { name: field2 })).toBeNull()\n    expect(within(target()).queryByRole('option', { name: '背景字段' })).toBeNull()\n    expect(requests).toHaveLength(2)\n  })\n";
  const current=readBytes(testPath).toString('utf8');
  assert.equal(current.split(supplement).length,2,'Unexpected supplementary test delta');
  const corrected="toHaveTextContent('服务暂时不可用，请稍后重试。')";
  assert.equal(current.split(corrected).length,2);
  assert.equal(current.replace(supplement,'').replace(corrected,"toHaveTextContent('合成暂时不可用')"),original.toString('utf8'),'Unreviewed earlier-case changes');
  const expected=[
    [5,'final app types','node_modules/.bin/tsc -p tsconfig.app.json --noEmit','candidate/types-app-final.log','278ac1'],
    [6,'changed-file lint','node_modules/.bin/eslint src/components/FormSectionManager.tsx src/components/__tests__/FormSectionManager.http.test.tsx','candidate/lint.log','62534f'],
    [7,'final supplementary test lint','node_modules/.bin/eslint src/components/__tests__/FormSectionManager.http.test.tsx','candidate/lint-final-test.log','a94af5'],
  ];
  assert(Array.isArray(commands.invocations)&&commands.invocations.length===9);
  const checked=expected.map(([index,name,command,log,originalTaskChunk])=>{
    const record=commands.invocations[index];
    assert.equal(record?.name,name);assert.equal(record?.command,command);assert.equal(record?.log,log);
    assert(Object.hasOwn(record,'exitCode')&&Number.isInteger(record.exitCode));
    assert.equal(record.exitCode,0,'Original command has no successful exit');
    const bytes=readBytes(root+safePath(log));
    assert.equal(bytes.length,0,'Original empty log bytes changed');
    return {name,command,originalExitCode:record.exitCode,logSHA256:hash(bytes),originalTaskChunk,
      originalTaskReferenceStatus:'Reference to observed task completion, not authenticated by Git',ciExecuted:false};
  });
  return {component:'frontend',currentComponentTree:currentTree,originalNode:inputs.nodeVersion,
    originalSigned:false,sourceAssociation:'Original task record, retrospectively indexed, unsigned; no historical whole-tree execution attestation',
    type:{...checked[0],component:'frontend',currentComponentTree:currentTree,originalSigned:false,coverage:'reviewed-original-command-and-recorded-source-inputs'},
    lint:checked.slice(1),inputCount:Object.keys(files).length};
}
export function verifyReportPlanningObservation(observation,execution){
  assert.equal(execution.exitCode,0);assert.match(execution.head,/^[a-f0-9]{40}$/);
  assert.equal(observation.scope,'Current real education assessment report service using synthetic accepted FINAL facts; no START/FINAL/browser or capacity claim');
  assert.equal(observation.rows.length,2);assert.deepEqual(observation.rows.map(r=>r.product).sort(),['SCHOOL','TEACHER']);
  for(const row of observation.rows){
    assert.equal(row.phase,'PLAN_AND_REVOCATION');assert.equal(row.metricVerified,true);assert.equal(row.revocationVerified,true);
    assert.equal(row.plannerBefore.setting,'8');assert.equal(row.plannerAfter.setting,'8');assert.equal(row.plannerBefore.pid,row.plannerAfter.pid);
    assert(Number.isInteger(row.plannerBefore.pid)&&row.plannerBefore.pid>0);
  }
  const plans=observation.rows.find(r=>r.product==='SCHOOL').queryPlan;
  assert.deepEqual(plans.map(p=>p.limit),[8,1]);
  for(const p of plans){assert.equal(p.actualRows,1);for(const key of ['planningMs','executionMs'])assert(Number.isFinite(p[key])&&p[key]>=0);}
  // Observed timings are evidence, never a flaky CI performance threshold.
  return {products:['SCHOOL','TEACHER'],metricVerified:true,revocationVerified:true,pooledSettingRestored:true,ciExecuted:false};
}
export function verifyRunStartPlanningObservation(profile,validation,execution){
 assert.equal(profile.completed,true);assert.equal(validation.completed,true);assert.equal(execution.exitCode,0);
 assert.equal(profile.queries.length,7);assert.equal(validation.immutableFinalCountUnchanged,30);
 assert.deepEqual(validation.cases.map(c=>c.name),['current authority and pooled setting restored','expired-intake remains denied and diagnostic mutation rolled back','frozen-actor remains denied and diagnostic mutation rolled back']);
 assert(validation.cases.every(c=>c.status==='PASS'));const first=validation.cases[0];assert.equal(first.before.value,'8');assert.deepEqual(first.before,first.after);assert(Number.isInteger(first.before.pid));
 for(const q of profile.queries){assert.match(q.hash,/^[a-f0-9]{64}$/);assert.deepEqual(q.plans.map(p=>p.joinCollapse),[8,1]);assert.equal(q.plans[0].actualRows,q.plans[1].actualRows);for(const p of q.plans)for(const key of ['planningMs','executionMs'])assert(Number.isFinite(p[key])&&p[key]>=0);}
 return {scope:'Actual current-authority query plans plus same-PID setting restoration and rolled-back negative branches',selectedQueries:7,pooledSettingRestored:true,immutableFinalCountUnchanged:30,ciExecuted:false};
}
export function requireOnboardingOutcomes(needs){
  for(const key of ['scope','onboarding-structure','codeql'])assert.equal(needs[key]?.result,'success',key+' not successful');
}
function plan(){
  assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');
  const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);
  const value=JSON.parse(process.env.PLAN);assert.equal(value.head,head);
  assert.match(value.base,/^[a-f0-9]{40}$/);
  try{git('cat-file','-e',value.base+'^{commit}');}catch{git('fetch','--no-tags','--depth=1','origin',value.base);}
  assert.deepEqual(onboardingPlan(changedEntries(value.base,head),value.base,head),value);
  assert.equal(value.draft,false);assert.equal(value.postMerge,false);
  return value;
}
function readOriginal(proof){const bytes=readFileSync(safePath(proof.path));assert.equal(hash(bytes),proof.sha256,'Original evidence bytes drift');return JSON.parse(bytes);}

// Task1's preserved reports are embedded in immutable review records. Some
// records retain a reporter projection rather than a second copied attachment.
// Normalize field names only; never promote failed/filtered cases to passed.
export function task1Report(value){
 if(Array.isArray(value?.testResults))return value;
 assert(value&&Array.isArray(value.assertions));
 return {success:value.success,numPassedTests:value.passed,numFailedTests:value.failed,numPendingTests:value.filtered,
  testResults:value.assertions.map(s=>({assertionResults:s.cases.map(c=>({fullName:c.name??c.title,status:c.status}))}))};
}
export function task1Pointer(value,path){
 assert(Array.isArray(path)&&path.length);
 for(const key of path){assert((typeof key==='string'||Number.isInteger(key))&&Object.hasOwn(value,key),'Original evidence pointer missing');value=value[key];}
 return value;
}
export function verifyTask1Evidence(review,readBytes=path=>readFileSync(path)){
 assert.equal(review.schemaVersion,1);assert.equal(review.reviewer,'root dot');assert.equal(review.decision,'ADMIT_REVIEWED_LOCAL_RESULTS');
 assert.equal(review.ciExecuted,false);assert.equal(review.originalExecutionSigned,false);assert(review.environment.limitations.length);
 const originals=new Map();
 const original=proof=>{safePath(proof.path);assert.match(proof.sha256,/^[a-f0-9]{64}$/);if(!originals.has(proof.path)){
  const bytes=readBytes(proof.path);assert.equal(hash(bytes),proof.sha256,'Retained Task1 evidence drift');originals.set(proof.path,{sha256:proof.sha256,value:JSON.parse(bytes)});
 }assert.equal(originals.get(proof.path).sha256,proof.sha256);return originals.get(proof.path).value;};
 const admitted=review.reports.map(record=>{
  const raw=original(record),status=task1Pointer(raw,record.statusPointer);assert.equal(status.exitCode,record.allowPartialFailure?1:0);assert(Array.isArray(status.command)&&status.command.length);assert(status.startedAt&&status.finishedAt);
  const caseNames=verifyOriginalReport(task1Report(task1Pointer(raw,record.reportPointer)),record,{allowDuplicateFiltered:record.format==='retained-ui-report-with-duplicate-filtered-titles'});
  assert(record.sourceAssociationBasis&&record.coverage);return {id:record.id,caseNames,coverage:record.coverage,originalCommand:status.command,sourceAssociationBasis:record.sourceAssociationBasis,originalRecordSHA256:record.sha256,ciExecuted:false};
 });
 assert(admitted.length);assert.equal(new Set(admitted.map(r=>r.id)).size,admitted.length);
 verifyFailureContinuations(review.reports,admitted);
 const names=admitted.flatMap(r=>r.caseNames);assert.equal(new Set(names).size,names.length,'Duplicate Task1 case qualification');
 const proof=review.educationNativeReadback,db=task1Pointer(original(proof),proof.pointer);
 assert.equal(db.productionAccessed,false);assert.equal(db.readOnlyTransaction,true);assert.equal(db.database,'precise_education_cognitive_runtime_test_20261030');
 assert.deepEqual(db.counts,{users:13,nativeConfigs:1,nativeSessions:4,rawSubmissions:4,decodedTrialsInFourChains:136});
 assert.deepEqual(db.chains.map(c=>[c.product,c.profile,c.decodedTrialCount]).sort(),[['SCHOOL','experience',8],['SCHOOL','research',60],['TEACHER','experience',8],['TEACHER','research',60]].sort());
 for(const c of db.chains){assert.equal(c.parentStatus,'COMPLETED');assert.equal(c.sessionStatus,'COMPLETED');assert.equal(c.waitingParentAttempts,0);assert.equal(c.runtimeGeneration,'UNIFIED_V1');assert.equal(c.trialCount,c.decodedTrialCount);assert.equal(c.payloadSchemaVersion,1);assert.equal(c.encodingVersion,'CANONICAL_JSON_SHA256_V1');assert.equal(c.t2PointerMatches,true);}
 const types=review.types.map(record=>{const status=task1Pointer(original(record),record.statusPointer);assert.equal(status.exitCode,0);assert(status.startedAt&&status.finishedAt&&Array.isArray(status.command));assert(record.coverage&&record.sourceAssociationBasis);return {id:record.id,component:record.component,coverage:record.coverage,originalCommand:status.command,sourceAssociationBasis:record.sourceAssociationBasis,originalRecordSHA256:record.sha256,ciExecuted:false,finalWholeTreeClaim:false};});
 assert.equal(types.length,5);assert.deepEqual(review.openAcceptanceItems,[]);
 const rp=review.registeredReports,registered=task1Pointer(original(rp),rp.pointer);
 const setup=registered.normalSetup,registration=registered.registration,consumer=registered.frozenConsumer,entry=registered.entryBoundary.entrySourceBoundary;
 assert.equal(setup.toolCount,3);assert.equal(setup.nonemptyReportSnapshots,6);assert.equal(setup.normalSeedIdempotent,true);assert.equal(setup.defaultDefinitionsUnchanged,true);assert.equal(setup.allDraftHidden,true);
 assert.equal(new Set(setup.snapshots.map(s=>s.reportHash)).size,6);
 for(const key of ['registrationComplete','bothNonempty','sameMeasurementRelease','basicDraftStableAfterFunPublicationAndGrant','otherReportUseDenied','defaultReportUnchanged'])assert.equal(registration[key],true,key);
 assert.notEqual(registration.basic.id,registration.fun.id);assert.notEqual(registration.basic.hash,registration.fun.hash);
 for(const key of ['twoRealFinals','participantReportsDifferent','otherReportTextAbsent','reportRereadStable'])assert.equal(consumer[key],true,key);
 assert.deepEqual(consumer.identicalCanonicalMetrics,[{key:'total',value:21,unit:'score',quality:'calculated'}]);assert.equal(consumer.admissionHashes.length,2);assert.equal(new Set(consumer.reportHashes).size,2);
 assert.deepEqual(entry.products,['TRAINING','SURVEY','SCHOOL','TEACHER']);assert.equal(entry.exactNonemptyReportsPerProduct,2);assert.equal(entry.sourcePolicies,8);
 return {admitted,types,observations:[{kind:'RETAINED_EDUCATION_NATIVE_READBACK',sessionCount:4,trialCount:136,ciExecuted:false},{kind:'REGISTERED_SAME_CP_NONEMPTY_REPORTS',tools:3,reports:6,actualFinals:2,entryBoundary:'SOURCE_IDENTITY_POLICY_ONLY',ciExecuted:false}],openAcceptanceItems:review.openAcceptanceItems};
}
export function task1SastConfig(p,b=binding.candidates?.[String(p.pr)]){
 assert(['task1','choice-page'].includes(p.pr));assert.equal(p.product,b.product);
 const paths=[...Object.keys(b.source),'.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-checks.mjs',p.pr==='task1'?'.github/scripts/task1-onboarding-controls.test.mjs':'.github/scripts/onboarding-controls.test.mjs'].filter(path=>/\.(?:[cm]?js|jsx|tsx?)$/.test(path));
 assert(paths.length);return {paths:[...new Set(paths)].sort()};
}
export function verifyTask1ControlEvidence(raw){
 assert.equal(raw.schemaVersion,1);assert.equal(raw.ciExecuted,false);assert.equal(raw.originalExecutionSigned,false);
 const admitted=raw.reports.map(record=>{
  assert(Array.isArray(record.status.command)&&record.status.startedAt&&record.status.finishedAt);assert(record.sourceAssociationBasis);
  assert.equal(hash(Buffer.from(record.log)),record.logSHA256);
  const passed=[...record.log.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1]).filter(name=>!name.includes(' # SKIP'));
  const failed=[...record.log.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1]);
  assert.equal(Number(record.log.match(/^# pass (\d+)$/m)?.[1]),passed.length);assert.equal(Number(record.log.match(/^# fail (\d+)$/m)?.[1]),failed.length);
  assert(record.selectedCases.length);assert.equal(new Set(record.selectedCases).size,record.selectedCases.length);for(const name of record.selectedCases)assert(passed.includes(name));
  if(failed.length){assert.equal(record.status.exitCode,1);assert.equal(record.allowPartialFailure,true);assert.deepEqual(record.failureContinuations.map(c=>c.caseName).sort(),failed.sort());}
  else{assert.equal(record.status.exitCode,0);assert(!record.failureContinuations?.length);}
  return {id:record.id,caseNames:record.selectedCases,originalExitCode:record.status.exitCode,ciExecuted:false};
 });
 assert(admitted.length,'Missing retained control checks');assert.equal(new Set(admitted.flatMap(r=>r.caseNames)).size,admitted.flatMap(r=>r.caseNames).length);verifyFailureContinuations(raw.reports,admitted);
 assert.deepEqual(raw.auxiliaryChecks.map(c=>c.name).sort(),['ACTIONLINT','NODE_SYNTAX']);
 for(const item of raw.auxiliaryChecks){assert.equal(item.status.exitCode,0);assert(item.status.command.length&&item.status.startedAt&&item.status.finishedAt);assert.equal(hash(Buffer.from(item.log)),item.logSHA256);}
 return admitted;
}
/** Small selector follow-up: accept only its hash-bound original checks. No
 * application producer, database fixture, build or broad task1 replay in CI. */
export function verifyChoicePageEvidence(review,p,readBytes=path=>readFileSync(path)){
 const raw=JSON.parse(readBytes(safePath(review.original.path)));assert.equal(hash(readBytes(review.original.path)),review.original.sha256);
 assert.equal(raw.ciExecuted,false);assert.equal(raw.originalExecutionSigned,false);
 const inputs=Object.keys(binding.candidates['choice-page'].source).filter(path=>path.startsWith('server-version/')).sort();assert.deepEqual(Object.keys(raw.inputs).sort(),inputs);
 for(const path of inputs)assert.equal(hash(readBytes(path)),raw.inputs[path],'Selector check input drift');
 const admitted=review.reports.map(record=>{
  const original=task1Pointer(raw,record.pointer);assert.equal(original.status.exitCode,0);assert(original.status.startedAt&&original.status.finishedAt&&original.status.command.length);assert(record.sourceAssociationBasis);
  return {id:record.id,caseNames:verifyOriginalReport(original.report,record),originalCommand:original.status.command,sourceAssociationBasis:record.sourceAssociationBasis,ciExecuted:false};
 });
 assert.equal(admitted.flatMap(r=>r.caseNames).length,13);assert.equal(new Set(admitted.flatMap(r=>r.caseNames)).size,13);
 const types=review.types.map(record=>{const original=task1Pointer(raw,record.pointer);assert.equal(original.status.exitCode,0);assert(original.status.command.length&&original.status.startedAt&&original.status.finishedAt);assert(record.coverage);return {component:record.component,coverage:record.coverage,originalCommand:original.status.command,ciExecuted:false,wholeComponentClaim:false};});
 assert.deepEqual(types.map(t=>t.component).sort(),['backend','frontend']);
 const http=task1Pointer(raw,review.http.pointer);assert.equal(http.status.exitCode,0);assert.equal(http.readback.passed,true);assert.equal(http.readback.restrictedRole,'precise_task1_runtime');assert.equal(http.readback.database,'precise_dual_report_test_20261030_v2');assert.deepEqual(http.readback.requests.map(r=>r.status),[200,200,400,200,200,400,401]);
 assert.equal(p.product,review.product);return {admitted,types,observations:[{scope:http.readback.scope,requests:http.readback.requests,ciExecuted:false}],openAcceptanceItems:[]};
}
function qualifyTask1Builds(p,backendOnly=false){
 assert.equal(p.pr,'task1');assert.equal(process.version,'v24.21.0');mkdirSync('onboarding-evidence',{recursive:true});
 const run=(component,name,args,extraEnv={})=>{
  const result=spawnSync(process.execPath,args,{cwd:'server-version/'+component,encoding:'utf8',env:{...process.env,...extraEnv}}),log=(result.stdout??'')+(result.stderr??'')+(result.error?String(result.error):'');
  writeFileSync('onboarding-evidence/'+name+'.log',log);
  const receipt={component,componentTree:p.components[component],source:p.sourceHead,mergePreview:p.head,argv:['node',...args],node:process.version,exitCode:result.status,signal:result.signal,logSHA256:hash(Buffer.from(log)),ciExecuted:true,testsExecuted:false,...(component==='frontend'?{flags:{VITE_COGNITIVE_MODULE_ENABLED:'true'}}:{})};
  writeFileSync('onboarding-evidence/'+name+'.json',JSON.stringify(receipt,null,2)+'\n');assert.equal(result.status,0,name+' failed; original log retained');return receipt;
 };
 // Direct compiler commands deliberately avoid npm build's unrelated suites.
 const backend=run('backend','task1-backend-compile',['node_modules/typescript/bin/tsc']);
 execFileSync('tar',['-czf','onboarding-evidence/backend-dist.tgz','-C','server-version/backend','dist']);
 const archive=readFileSync('onboarding-evidence/backend-dist.tgz');backend.artifact={path:'backend-dist.tgz',bytes:archive.length,sha256:hash(archive)};
 writeFileSync('onboarding-evidence/task1-backend-artifact.json',JSON.stringify(backend,null,2)+'\n');
 if(backendOnly){
  const original=JSON.parse(readFileSync('onboarding-evidence/task1-builds.json','utf8'));assert.equal(original.frontend.componentTree,p.components.frontend);
  writeFileSync('onboarding-evidence/task1-builds.json',JSON.stringify({backend,frontend:original.frontend,buildExecutedThisRun:{backend:true,frontend:false},productionDeploymentQualified:false},null,2)+'\n');return;
 }
 const frontend=run('frontend','task1-frontend-build',['node_modules/vite/bin/vite.js','build','--outDir','../../onboarding-evidence/frontend-dist'],{VITE_COGNITIVE_MODULE_ENABLED:'true'});
 const files=[],walk=(path,relative='')=>{for(const name of readdirSync(path)){const absolute=path+'/'+name,key=relative+name;if(statSync(absolute).isDirectory())walk(absolute,key+'/');else{const bytes=readFileSync(absolute);files.push({path:key,bytes:bytes.length,sha256:hash(bytes)});}}};
 walk('onboarding-evidence/frontend-dist');assert(files.some(f=>f.path==='index.html'));frontend.files=files.sort((a,b)=>a.path.localeCompare(b.path));
 writeFileSync('onboarding-evidence/task1-builds.json',JSON.stringify({backend,frontend,productionDeploymentQualified:false},null,2)+'\n');
}

// The first formal run completed both exact component builds before its
// independent shallow SAST selector failed. Keep original receipts/bytes.
const task1BuildOrigin={run:41008927360,job:123910360471,artifact:12956348062,source:'c1bd47c4e4030b3ddfba17aa07f8ee6d3241d9cf',merge:'e2a4d48986a4d8172520e1b77f89712e5a66d78d',size:29332601,sha256:'a27b508bc0801fc78e5ffabc94bc8c462fb89bb1c9bb77704614636b6237947d',components:{backend:'44013860f1c6ead94f1c4b63491f0f122b01abaa',frontend:'44ac407e011dd17be8636b439b440a4d152b3304'}};
export function verifyTask1BuildMetadata(run,job,artifact,components,now=Date.now()){
 const o=task1BuildOrigin;assert.deepEqual(components,o.components);
 assert.equal(run.id,o.run);assert.equal(run.head_sha,o.source);assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert.equal(run.head_branch,'task1-scale-exact-authorization-20261029');
 assert.equal(job.id,o.job);assert.equal(job.run_id,o.run);assert.equal(job.run_attempt,1);assert.equal(job.head_sha,o.source);assert.equal(job.name,'reviewed onboarding evidence admission');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 for(const name of ['admit reviewed results and qualify only missing compiler inputs','compile each missing Task1 component once and retain those exact artifacts','Run actions/upload-artifact@v4'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
 assert.equal(artifact.id,o.artifact);assert.equal(artifact.name,'onboarding-admission-'+o.merge);assert.equal(artifact.workflow_run.id,o.run);assert.equal(artifact.workflow_run.head_sha,o.source);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,o.size);assert.equal(artifact.digest,'sha256:'+o.sha256);
 const age=now-Date.parse(artifact.created_at);assert(Number.isFinite(age)&&age>=0&&age<86400000);return o;
}
export function verifyTask1BuildFiles(receipt,readBytes){
 const o=task1BuildOrigin;
 for(const component of ['backend','frontend']){
  const r=receipt[component];assert.equal(r.component,component);assert.equal(r.componentTree,o.components[component]);assert.equal(r.source,o.source);assert.equal(r.mergePreview,o.merge);assert.equal(r.node,'v24.21.0');assert.equal(r.exitCode,0);assert.equal(r.ciExecuted,true);assert.equal(r.testsExecuted,false);
  assert.equal(hash(readBytes('task1-'+component+'-'+(component==='backend'?'compile':'build')+'.log')),r.logSHA256);
 }
 assert.deepEqual(receipt.backend.argv,['node','node_modules/typescript/bin/tsc']);assert.deepEqual(receipt.frontend.argv,['node','node_modules/vite/bin/vite.js','build','--outDir','../../onboarding-evidence/frontend-dist']);assert.deepEqual(receipt.frontend.flags,{VITE_COGNITIVE_MODULE_ENABLED:'true'});
 const archive=readBytes('backend-dist.tgz');assert.equal(archive.length,receipt.backend.artifact.bytes);assert.equal(hash(archive),receipt.backend.artifact.sha256);
 const files=receipt.frontend.files;assert(Array.isArray(files)&&files.length);assert(files.some(f=>f.path==='index.html'));assert.equal(new Set(files.map(f=>f.path)).size,files.length);
 for(const f of files){safePath(f.path);const bytes=readBytes('frontend-dist/'+f.path);assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.sha256);}
 return {components:o.components,source:o.source,merge:o.merge,compiledThisRun:false,frontendFiles:files.length,backendSHA256:receipt.backend.artifact.sha256};
}
async function reuseTask1Builds(p){
 assert.equal(p.pr,'task1');assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');const o=task1BuildOrigin;
 const api=async path=>{const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return r.json();};
 const [run,job,artifact]=await Promise.all([api('/actions/runs/'+o.run),api('/actions/jobs/'+o.job),api('/actions/artifacts/'+o.artifact)]);verifyTask1BuildMetadata(run,job,artifact,o.components);
 assert.equal(p.components.frontend,o.components.frontend,'Changed frontend requires its own compilation plan');
 git('fetch','--no-tags','--depth=1','origin',o.source);for(const c of ['backend','frontend'])assert.equal(git('rev-parse',o.source+':server-version/'+c),o.components[c]);
 const backendReused=p.components.backend===o.components.backend;
 const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+o.artifact+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(60000)});assert.equal(response.status,302);
 const url=new URL(response.headers.get('location'));assert.equal(url.protocol,'https:');assert(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|s3\.amazonaws\.com)$/.test(url.hostname));
 const download=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,o.size);assert.equal(hash(bytes),o.sha256);
 mkdirSync('onboarding-evidence',{recursive:true});writeFileSync('task1-original-build-artifact.zip',bytes);
 execFileSync('python3',['-c',`import zipfile,pathlib,stat
z=zipfile.ZipFile('task1-original-build-artifact.zip'); rows=z.infolist()
assert len(rows)<5000 and sum(r.file_size for r in rows)<512*1024*1024
assert len({r.filename for r in rows})==len(rows)
for r in rows:
 p=pathlib.PurePosixPath(r.filename); assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in r.filename
 assert stat.S_IFMT(r.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR)
z.extractall('task1-original-builds')`]);
 const receipt=JSON.parse(readFileSync('task1-original-builds/task1-builds.json'));const verified=verifyTask1BuildFiles(receipt,path=>readFileSync('task1-original-builds/'+safePath(path)));
 // Keep binaries in the one original official artifact. New qualification
 // retains original receipts plus the authenticated immutable artifact pointer.
 for(const name of ['task1-frontend-build.json','task1-frontend-build.log',...(backendReused?['task1-backend-artifact.json','task1-backend-compile.json','task1-backend-compile.log']:[])])cpSync('task1-original-builds/'+name,'onboarding-evidence/'+name,{recursive:true});
 writeFileSync('onboarding-evidence/task1-builds.json',JSON.stringify({...(backendReused?{backend:receipt.backend}:{}),frontend:receipt.frontend,productionDeploymentQualified:false},null,2)+'\n');
 writeFileSync('onboarding-evidence/build-reuse.json',JSON.stringify({origin:o,originalParentConclusion:run.conclusion,originalJobConclusion:job.conclusion,currentSource:p,verified,reusedComponents:backendReused?['backend','frontend']:['frontend'],backendRecompileRequired:!backendReused,buildExecutedThisRun:false},null,2)+'\n');appendFileSync(process.env.GITHUB_OUTPUT,'reused='+backendReused+'\nbackend-reused='+backendReused+'\nfrontend-reused=true\n');
}

// PR393 reuses reviewed tests, but its combined main backend has no exact-tree
// compiler result. Execute only that missing check here, never npm run build
// (which invokes unrelated onboarding/scoring suites). Failure logs survive.
function qualifyPr393BackendTypes(p,review){
  assert.deepEqual(review.types,[],'Do not relabel historical types as this combined tree');
  assert.equal(review.missingCheck,'CURRENT_COMBINED_BACKEND_TYPES');
  mkdirSync('onboarding-evidence',{recursive:true});
  const argv=['node_modules/typescript/bin/tsc','--noEmit'];
  const execution=spawnSync(process.execPath,argv,{cwd:'server-version/backend',encoding:'utf8'});
  const log=(execution.stdout??'')+(execution.stderr??'')+(execution.error?String(execution.error):'');
  writeFileSync('onboarding-evidence/backend-types.log',log);
  const receipt={component:'backend',currentComponentTree:p.components.backend,source:p.sourceHead,
    mergePreview:p.head,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
    argv:['node',...argv],node:process.version,exitCode:execution.status,signal:execution.signal,
    logSHA256:hash(Buffer.from(log)),ciExecuted:true};
  writeFileSync('onboarding-evidence/backend-types.json',JSON.stringify(receipt,null,2)+'\n');
  assert.equal(execution.status,0,'Current combined backend types failed; see backend-types.log');
  return [receipt];
}

// Read the original saved exit file alongside DOT's explicitly retrospective index.
// The empty compiler log is never treated as evidence of exit status.
export function verifyPr395LocalTypes(receipt,exitBytes,logBytes,currentTree){
 assert.equal(receipt.command,'./node_modules/.bin/tsc -p tsconfig.app.json --noEmit');
 assert.equal(receipt.exitCode,0);assert.equal(exitBytes.toString('utf8'),'0\n');
 assert.equal(receipt.componentTree,currentTree);assert.match(receipt.sourceAssociationBasis,/Retrospectively/);
 assert.match(receipt.sourceAssociationBasis,/Not an original signed execution receipt/);
 assert.equal(hash(logBytes),receipt.logSHA256);
 return {component:'frontend',currentComponentTree:currentTree,originalExitCode:0,originalSigned:false,ciExecuted:false,indexKind:'RETROSPECTIVE_DOT_OBSERVATION',sourceAssociationBasis:receipt.sourceAssociationBasis};
}
function admitPr395LocalTypes(p,review){
 assert.deepEqual(review.types,[]);const proof=review.pr395LocalTypes;
 return [verifyPr395LocalTypes(readOriginal(proof),readFileSync(safePath(proof.exit)),readFileSync(safePath(proof.log)),p.components.frontend)];
}
// Fixed successful full SAST from PR395's failed first browser run. Keep its
// identity/findings, and qualify only the genuinely changed recovery controls.
const pr395Sast={run:40997195433,job:123873065091,artifact:12951772954,source:'23ee17b2b52bb3a4d2ca69f41a6122ef2b9940f5',merge:'e6f4a27a5823fd3121960bcb2c9e0b9b990f4cc6',tree:'cd8d923e7696dd01c28a0de8a17bad3230572a60',size:72939,sha256:'f9f65b7273c0d089a1801b302d99373ac2a0d0f916016267d3679174f7f23e58'};
export function verifyPr395SastMetadata(run,job,artifact,now=Date.now()){
 const o=pr395Sast;assert.equal(run.id,o.run);assert.equal(run.head_sha,o.source);assert.equal(run.path,'.github/workflows/ci.yml');assert.equal(run.event,'pull_request');assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert.equal(run.head_branch,'fix/education-draft-review-20261030');
 assert.equal(job.id,o.job);assert.equal(job.run_id,o.run);assert.equal(job.run_attempt,1);assert.equal(job.head_sha,o.source);assert.equal(job.name,'codeql (javascript/typescript SAST)');assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 for(const name of ['initialize CodeQL','analyze with CodeQL','retain original onboarding SAST findings'])assert(job.steps.some(s=>s.name===name&&s.status==='completed'&&s.conclusion==='success'));
 assert.equal(artifact.id,o.artifact);assert.equal(artifact.name,'onboarding-sast-'+o.merge);assert.equal(artifact.workflow_run.id,o.run);assert.equal(artifact.workflow_run.head_sha,o.source);assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,o.size);assert.equal(artifact.digest,'sha256:'+o.sha256);
 const age=now-Date.parse(artifact.created_at);assert(Number.isFinite(age)&&age>=0&&age<86400000,'Original SAST evidence expired');return {...o,originalParentConclusion:run.conclusion,originalJobConclusion:job.conclusion};
}
async function reusePr395Sast(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');const p=JSON.parse(process.env.PLAN);assert.equal(p.pr,395);assert.equal(p.head,git('rev-parse','HEAD'));
 const o=pr395Sast;git('fetch','--no-tags','--depth=1','origin',o.source);assert.equal(git('rev-parse',o.source+'^{tree}'),o.tree);
 const controls=['.github/scripts/onboarding-checks.mjs','.github/scripts/onboarding-controls.test.mjs','.github/scripts/pr395-browser.mjs'];
 const delta=git('diff','--name-only',o.source,'HEAD').split('\n').filter(Boolean);
 assert(delta.every(path=>controls.includes(path)||['.github/scripts/onboarding-bindings.json','.github/workflows/ci.yml'].includes(path)||path.startsWith('docs/performance/education-post-p6-20261030/')),'Previously scanned application/source drift');
 for(const component of ['backend','frontend'])assert.equal(git('rev-parse',o.source+':server-version/'+component),git('rev-parse','HEAD:server-version/'+component));
 const originalWorkflow=git('show',o.source+':.github/workflows/ci.yml'),currentWorkflow=readFileSync('.github/workflows/ci.yml','utf8');
 const init=s=>s.split('      - name: initialize CodeQL\n')[1].split('      - name: analyze with CodeQL\n')[0];
 const stable=s=>init(s).split('\n').filter(line=>!line.startsWith('          config:')&&!line.startsWith('            ${{')).join('\n');assert.equal(stable(originalWorkflow),stable(currentWorkflow),'CodeQL action/language/options changed');
 const api=async path=>{const r=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version'+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return r.json();};
 const [run,job,artifact]=await Promise.all([api('/actions/runs/'+o.run),api('/actions/jobs/'+o.job),api('/actions/artifacts/'+o.artifact)]);const identity=verifyPr395SastMetadata(run,job,artifact);
 const merge=await api('/git/commits/'+o.merge);assert.equal(merge.tree.sha,o.tree);assert.deepEqual(merge.parents.map(p=>p.sha),[p.base,o.source]);
 const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/artifacts/'+o.artifact+'/zip',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN},redirect:'manual',signal:AbortSignal.timeout(60000)});assert.equal(response.status,302);
 const url=new URL(response.headers.get('location'));assert.equal(url.protocol,'https:');assert(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|s3\.amazonaws\.com)$/.test(url.hostname));
 const download=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,o.size);assert.equal(hash(bytes),o.sha256);
 mkdirSync('pr395-original-sast',{recursive:true});writeFileSync('pr395-original-sast/original.zip',bytes);
 const sarif=JSON.parse(execFileSync('python3',['-c',"import zipfile; print(zipfile.ZipFile('pr395-original-sast/original.zip').read('javascript.sarif').decode())"],{encoding:'utf8',maxBuffer:8*1024*1024}));
 assert(sarif.runs.length);assert(sarif.runs.every(run=>run.invocations.some(i=>i.executionSuccessful===true)));writeFileSync('pr395-original-sast/javascript.sarif',JSON.stringify(sarif));
 writeFileSync('pr395-original-sast/reuse.json',JSON.stringify({identity,currentHead:p.head,currentRun:process.env.GITHUB_RUN_ID,scanExecuted:false,currentControlScanRequired:true,delta,findings:sarif.runs.flatMap(r=>r.results??[]),disposition:'Original one static-test URL-substring advisory retained for independent review; no finding suppressed or re-labelled.'},null,2)+'\n');
}
function admit(){
  const p=plan(),allReviews=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json','utf8'));
  const review=[393,395,'task1','choice-page'].includes(p.pr)?allReviews.candidates?.[String(p.pr)]:allReviews;
  assert(review,'Missing exact reviewed evidence');
  assert.equal(review.schemaVersion,1);assert.equal(review.product,p.product);assert.equal(review.reviewer,p.pr==='choice-page'?'delegated Codex scoped self-review':p.pr===395?'independent Codex pr395_review':'root dot');
  assert.equal(review.decision,'ADMIT_REVIEWED_LOCAL_RESULTS');assert.equal(review.ciExecuted,false);assert.equal(review.originalExecutionSigned,false);
  assert(Array.isArray(review.environment.limitations)&&review.environment.limitations.length,'Disclose original evidence limits');
  if(p.pr==='choice-page'){
    const accepted=verifyChoicePageEvidence(review,p);mkdirSync('onboarding-evidence',{recursive:true});
    writeFileSync('onboarding-evidence/admission.json',JSON.stringify({schemaVersion:1,source:p,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,...accepted,environment:review.environment,testsExecutedInCI:false,reviewAuthentication:'Delegated scoped self-review of unsigned original receipts; DOT background review is independent',deploymentQualified:false},null,2)+'\n');return;
  }
  if(p.pr==='task1'){
    const accepted=verifyTask1Evidence(review),controls=verifyTask1ControlEvidence(JSON.parse(readFileSync('docs/precise-authorization-20261029/ci-control-raw.json')));mkdirSync('onboarding-evidence',{recursive:true});
    writeFileSync('onboarding-evidence/admission.json',JSON.stringify({schemaVersion:1,source:p,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,...accepted,controls,environment:review.environment,testsExecutedInCI:false,rootReviewAuthentication:'Immutable reviewed Git record, not a signed original execution',taskCompletionClaim:false},null,2)+'\n');return;
  }
  const admitted=[];
  for(const original of review.reports){
    assert(typeof original.id==='string'&&original.id);
    assert.match(original.originalSourceAssociation,/^[a-f0-9]{40}$/);
    try{git('cat-file','-e',original.originalSourceAssociation);}catch{git('fetch','--no-tags','--depth=1','origin',original.originalSourceAssociation);}
    const roots=original.sourceRoots??['server-version/backend'];
    assert(Array.isArray(roots)&&roots.length&&new Set(roots).size===roots.length);
    for(const root of roots)assert(['server-version/backend','server-version/frontend'].includes(root));
    const delta=git('diff','--name-only',original.originalSourceAssociation,p.product,'--',...roots).split('\n').filter(Boolean);
    assert.deepEqual(delta,original.reviewedUnrelatedSourceDelta,'Reviewed test input delta changed');
    assert(original.deltaRationale&&original.sourceAssociationBasis);
    const caseNames=verifyOriginalReport(readOriginal(original),original);
    admitted.push({id:original.id,caseNames,originalSourceAssociation:original.originalSourceAssociation,sourceAssociationBasis:original.sourceAssociationBasis,originalReportSHA256:original.sha256,originalReportSuccess:original.summary.success,originalFailedCount:original.summary.numFailedTests,ciExecuted:false});
  }
  assert(admitted.length&&new Set(admitted.flatMap(r=>r.caseNames)).size===admitted.flatMap(r=>r.caseNames).length);
  assert.equal(new Set(admitted.map(r=>r.id)).size,admitted.length);
  verifyFailureContinuations(review.reports,admitted);
  let originalTaskChecks=null;
  if(p.pr===381){
    const record=review.pr381LocalChecks;assert(record?.sourceAssociationBasis&&record.limitations?.length);
    assert.deepEqual(review.types,[],'PR381 does not fabricate an argv-style original receipt');
    originalTaskChecks=verifyPr381CommandRecords(readOriginal(record.commands),readOriginal(record.inputs),readOriginal(record.firstInputs),p.components.frontend,path=>readFileSync(path));
  }else assert(!review.pr381LocalChecks);
  const types=p.pr===395?admitPr395LocalTypes(p,review):p.pr===393?qualifyPr393BackendTypes(p,review):originalTaskChecks?[originalTaskChecks.type]:(Array.isArray(review.types)?review.types:[review.types]).map(record=>verifyTypeReceipt(readOriginal(record),record,path=>readFileSync(path),p.components[record.component??'backend']));
  assert(types.length);
  if([372,374].includes(p.pr))assert.deepEqual(types.map(t=>t.component).sort(),['backend','frontend']);
  const observations=[];
  if(p.pr===369){
    assert.equal(review.reportPlanningObservations?.length,1);
    const record=review.reportPlanningObservations[0];
    assert.equal(record.reviewedProduct,p.product);assert(record.sourceAssociationBasis&&record.limitations?.length);
    observations.push({...verifyReportPlanningObservation(readOriginal(record),readOriginal(record.execution)),
      originalObservationSHA256:record.sha256,originalExecutionSHA256:record.execution.sha256,
      sourceAssociationBasis:record.sourceAssociationBasis,limitations:record.limitations});
  }else assert(!review.reportPlanningObservations);
  if(p.pr===377){
    const record=review.runStartPlanning;assert(record?.sourceAssociationBasis);const profile=readOriginal(record.profile),compressed=readFileSync(safePath(record.fullProfile.path));assert.equal(hash(compressed),record.fullProfile.sha256);const full=gunzipSync(compressed);assert.equal(hash(full),profile.fullOriginalSHA256);const original=JSON.parse(full);assert.equal(original.completed,true);assert.deepEqual(profile.queries,original.queries.map(({sql,plans,...q})=>({...q,plans:plans.map(({plan,...p})=>p)})));observations.push(verifyRunStartPlanningObservation(profile,readOriginal(record.validation),readOriginal(record.execution)));
  }else assert(!review.runStartPlanning);
  if(p.pr===374)observations.push(verifyPr374Observations(review.pr374));
  else assert(!review.pr374);
  mkdirSync('onboarding-evidence',{recursive:true});
  writeFileSync('onboarding-evidence/admission.json',JSON.stringify({schemaVersion:1,source:p,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,admitted,types,observations,...(originalTaskChecks?{originalTaskChecks}:{}),environment:review.environment,testsExecutedInCI:false,rootReviewAuthentication:'Immutable reviewed Git record, not a signed original execution'},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]==='task1-build')qualifyTask1Builds(plan());
  else if(process.argv[2]==='task1-build-backend')qualifyTask1Builds(plan(),true);
  else if(process.argv[2]==='task1-build-reuse')await reuseTask1Builds(plan());
  else if(process.argv[2]==='task1-sast-config'){
    const p=plan(),config=task1SastConfig(p);appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify(config)+'\n');
  }
  else if(process.argv[2]==='sast-reuse')await reusePr395Sast();
  else if(process.argv[2]==='admit')admit();
  else if(process.argv[2]==='source')plan();
  else throw Error('Expected source or admit');
}
