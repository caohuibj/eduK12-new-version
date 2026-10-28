import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
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
  const argv=component==='frontend'?['node','node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit']:['node','node_modules/typescript/bin/tsc','--noEmit'];
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
function admit(){
  const p=plan(),review=JSON.parse(readFileSync('.github/scripts/onboarding-evidence.json','utf8'));
  assert.equal(review.schemaVersion,1);assert.equal(review.product,p.product);assert.equal(review.reviewer,'root dot');
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
  const types=(Array.isArray(review.types)?review.types:[review.types]).map(record=>verifyTypeReceipt(readOriginal(record),record,path=>readFileSync(path),p.components[record.component??'backend']));
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
  if(p.pr===374)observations.push(verifyPr374Observations(review.pr374));
  else assert(!review.pr374);
  mkdirSync('onboarding-evidence',{recursive:true});
  writeFileSync('onboarding-evidence/admission.json',JSON.stringify({schemaVersion:1,source:p,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,admitted,types,observations,environment:review.environment,testsExecutedInCI:false,rootReviewAuthentication:'Immutable reviewed Git record, not a signed original execution'},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]==='admit')admit();
  else if(process.argv[2]==='source')plan();
  else throw Error('Expected source or admit');
}
