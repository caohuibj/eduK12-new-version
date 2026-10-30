import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {onboardingPlan,binding} from './onboarding-scope.mjs';
import {verifyPr374Observations} from './pr374-evidence.mjs';
import {changedEntries} from './content-scope.mjs';

const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function safePath(path){assert(typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'));return path;}
export function verifyOriginalReport(report,review){
  const cases=report.testResults.flatMap(s=>s.assertionResults.map(c=>({fullName:c.fullName,status:c.status})));
  for(const c of cases)assert(typeof c.fullName==='string'&&c.fullName&&['passed','failed','pending','skipped'].includes(c.status));
  assert.equal(new Set(cases.map(c=>c.fullName)).size,cases.length);
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
  assert.deepEqual(onboardingPlan(changedEntries(value.base,head),value.base,head),value);
  assert.equal(value.draft,false);assert.equal(value.postMerge,false);
  return value;
}
function readOriginal(proof){const bytes=readFileSync(safePath(proof.path));assert.equal(hash(bytes),proof.sha256,'Original evidence bytes drift');return JSON.parse(bytes);}

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
  const review=[393,395].includes(p.pr)?allReviews.candidates?.[String(p.pr)]:allReviews;
  assert(review,'Missing exact reviewed evidence');
  assert.equal(review.schemaVersion,1);assert.equal(review.product,p.product);assert.equal(review.reviewer,p.pr===395?'independent Codex pr395_review':'root dot');
  assert.equal(review.decision,'ADMIT_REVIEWED_LOCAL_RESULTS');assert.equal(review.ciExecuted,false);assert.equal(review.originalExecutionSigned,false);
  assert(Array.isArray(review.environment.limitations)&&review.environment.limitations.length,'Disclose original evidence limits');
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
  if(process.argv[2]==='sast-reuse')await reusePr395Sast();
  else if(process.argv[2]==='admit')admit();
  else if(process.argv[2]==='source')plan();
  else throw Error('Expected source or admit');
}
