import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {binding} from './pr356-scope.mjs';

// This is the original collection's identity, not an execution signature or
// a claim that every historical command ran on the collection commit.
export const originalObservationAnchor=Object.freeze({
 product:'48516ef5900cf9f711ea3cc852ac148cd221d7f8',
 components:Object.freeze({backend:'c7ddfa4134b511706c8514c25deacee0856db331',frontend:'160d8bd143b6c27a87dade8b787e206be7b60b35'}),
 reportCount:25,
 reportSetSHA256:'b7551f71c08e7773225ffb8966c56178c170da539cce496e8097ede37db9a40c',
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const reportIdentity=r=>Object.fromEntries(['path','sha256','passed','failed','pending','success'].map(k=>[k,r[k]]));
function verifyReport(r){
 assert.equal(typeof r.path,'string');assert.match(r.sha256,/^[a-f0-9]{64}$/);
 const raw=Buffer.from(r.rawBase64,'base64');assert.equal(sha(raw),r.sha256,'Original reporter bytes changed: '+r.path);
 const x=JSON.parse(raw);assert(Array.isArray(x.testResults));
 assert.equal(x.numPassedTests,r.passed);assert.equal(x.numFailedTests,r.failed);assert.equal(x.numPendingTests,r.pending);assert.equal(x.success,r.success);
 return {originalPath:r.path,sha256:r.sha256,passed:r.passed,failed:r.failed,pending:r.pending,success:r.success};
}
export function verifyDevelopmentObservations(e,current=binding){
 assert.equal(e.kind,'retained-development-observation');assert.equal(e.ciExecuted,false);assert.equal(e.originalExecutionSigned,false);assert.equal(e.qualificationClaim,false);
 assert.equal(e.product,originalObservationAnchor.product,'Do not reassign the original observation collection to a new candidate');
 assert.deepEqual(e.components,originalObservationAnchor.components,'Do not relabel historical application identities');
 assert.equal(e.reports.length,originalObservationAnchor.reportCount,'All original reporters must remain retained');
 assert.equal(sha(JSON.stringify(e.reports.map(reportIdentity))),originalObservationAnchor.reportSetSHA256,'Original reporter set was removed, reordered or reassigned');
 const reports=e.reports.map(verifyReport),followup=e.followupReports??[],attachments=e.followupAttachments??[];
 if(followup.length||attachments.length){
  assert.equal(e.followupSourceAssociation?.kind,'working-tree-observation');
  assert.equal(e.followupSourceAssociation?.contemporaneousSourceManifest,false,'No retrospective source manifest may be presented as contemporaneous');
  assert.equal(e.followupSourceAssociation?.originalExecutionSigned,false);
  assert.equal(e.followupSourceAssociation?.qualificationClaim,false);
 }
 const followupReports=followup.map(verifyReport),followupAttachments=attachments.map(a=>{
  assert.equal(typeof a.path,'string');assert.match(a.sha256,/^[a-f0-9]{64}$/);
  const bytes=Buffer.from(a.rawBase64,'base64');assert.equal(sha(bytes),a.sha256,'Original attachment bytes changed: '+a.path);
  return {originalPath:a.path,sha256:a.sha256,bytes:bytes.length};
 }),paths=[...reports,...followupReports,...followupAttachments].map(r=>r.originalPath);
 assert.equal(new Set(paths).size,paths.length,'An invocation must not be duplicated under the same original path');
 return {...e,reports,followupReports,followupAttachments,currentCandidate:{product:current.product,components:current.components},historicalAnchor:originalObservationAnchor,ciExecuted:false,originalExecutionSigned:false,qualificationClaim:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const summary=verifyDevelopmentObservations(JSON.parse(readFileSync(new URL('./pr356-local-evidence.json',import.meta.url))));
 const out=process.env.PR356_EVIDENCE_DIR||'pr356-evidence';mkdirSync(out,{recursive:true});
 writeFileSync(out+'/retained-development-observations.json',JSON.stringify(summary,null,2));
 console.log(JSON.stringify({originalReporters:summary.reports.length,failedOriginalInvocationsRetained:summary.reports.filter(r=>r.failed>0).length,followupReporters:summary.followupReports.length,followupAttachments:summary.followupAttachments.length,ciExecuted:false,qualificationClaim:false}));
}
