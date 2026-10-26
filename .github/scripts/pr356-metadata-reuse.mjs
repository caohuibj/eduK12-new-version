import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {BRANCH,REPOSITORY,assertPhaseInputs,candidateInputsDigest,evidenceInputs,canonicalSHA256,positiveId,selectedPhaseIds,sha256} from './pr356-plan.mjs';
import {aggregateSpec} from './pr356-admission.mjs';
import {expectedFromOfficialOrigin,verifyArtifact} from './pr356-artifacts.mjs';

// Additive read-only evidence adapter. It is deliberately not wired into the
// existing admission CLI. It grants no qualification, review or release claim.
// The caller must separately obtain the current plan from official source scope.
const authenticatedRoots=new WeakSet();
const hex64=/^[a-f0-9]{64}$/;
const hash=v=>assert.match(v??'',hex64,'Required SHA256 missing');
function same(a,b,label){assert.deepEqual(a,b,label);}
function coverage(a,b,label){assert(Array.isArray(a),label+' missing');assert.equal(new Set(a).size,a.length,'Duplicate '+label);same([...a].sort(),[...b].sort(),label+' differs');}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function assertPlan(p){
 selectedPhaseIds(p);for(const k of ['head','base','tree'])assert.match(p[k]??'',/^[a-f0-9]{40}$/);assert.equal(p.candidateInputsSHA256,candidateInputsDigest(p),'Current candidate recipe changed');assert.equal(p.inventorySHA256,canonicalSHA256(p.inventory),'Current source inventory changed');
 for(const phase of Object.values(p.phases)){assert.equal(phase.state,'ready','Pending phase cannot be reused');assertPhaseInputs(phase.inputs);assert.equal(phase.inputsSHA256,canonicalSHA256(phase.inputs));assert(Number.isSafeInteger(phase.maxAgeSeconds)&&phase.maxAgeSeconds>0);}
 assert.equal(p.sarifPolicy?.state,'fixed','Pending SARIF policy cannot be reused');assert.equal(p.sarifPolicy.sha256,canonicalSHA256(p.sarifPolicy.document));assert(p.historicalEvidence.every(g=>g.state==='approved'&&g.cases?.length),'Historical evidence remains unadmitted');
}
function explicitPin(pin){
 for(const k of ['runId','attempt','jobId','artifactId'])positiveId(pin?.[k],k);hash(pin.zipSHA256);assert(Number.isSafeInteger(pin.zipBytes)&&pin.zipBytes>0);assert.equal(pin.artifactName,'pr356-qualification-result-'+positiveId(pin.runId)+'-'+positiveId(pin.attempt),'Exact official Q artifact name required');return pin;
}
async function readMetadata(pin,token,fetcher){
 assert(typeof token==='string'&&token.length,'Existing official read token missing');for(const k of ['runId','attempt','jobId','artifactId'])positiveId(pin[k],k);
 const read=async path=>{const response=await fetcher('https://api.github.com/repos/'+REPOSITORY+'/'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error'});assert.equal(response.status,200,'Fixed official metadata unavailable; no retry/fallback: '+path);return response.json();};
 const [run,job,artifact]=await Promise.all([read('actions/runs/'+positiveId(pin.runId)+'/attempts/'+positiveId(pin.attempt)),read('actions/jobs/'+positiveId(pin.jobId)),read('actions/artifacts/'+positiveId(pin.artifactId))]);return {run,job,artifact};
}
function timestampInterval(value){
 assert.equal(typeof value,'string');const m=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d{1,3}))?Z$/.exec(value);assert(m,'Unsupported official timestamp precision');
 const lower=Date.parse(value),width=m[1]?10**(3-m[1].length):1000;assert(Number.isFinite(lower));return {lower,upper:lower+width-1};
}
function official(pin,metadata,{head,jobName,maxAgeSeconds,consumerAttempt}){
 for(const k of ['runId','attempt','jobId','artifactId'])positiveId(pin[k],k);hash(pin.zipSHA256);assert(Number.isSafeInteger(pin.zipBytes)&&pin.zipBytes>0);const {run,job,artifact}=metadata;
 assert.equal(run.repository?.full_name,REPOSITORY);assert.equal(run.head_repository?.full_name,REPOSITORY);assert.equal(positiveId(run.id),positiveId(pin.runId));assert.equal(positiveId(run.run_attempt),positiveId(pin.attempt));assert.equal(run.head_sha,head);assert.equal(run.head_branch,BRANCH);assert.equal(run.event,'workflow_dispatch');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(positiveId(job.id),positiveId(pin.jobId));assert.equal(positiveId(job.run_id),positiveId(pin.runId));assert.equal(positiveId(job.run_attempt),positiveId(pin.attempt));assert.equal(job.head_sha,head);assert.equal(job.name,jobName);assert.equal(job.status,'completed');assert.equal(job.conclusion,'success','Original job must succeed; no old-attempt fallback');
 const now=Date.now(),start=Date.parse(job.started_at),end=Date.parse(job.completed_at);assert(Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&end<=now&&now-end<=maxAgeSeconds*1000,'Official phase evidence expired/incomplete');if(consumerAttempt!==undefined)assert(BigInt(positiveId(pin.attempt))<=BigInt(positiveId(consumerAttempt)),'Future producer attempt');
 assert.equal(positiveId(artifact.id),positiveId(pin.artifactId));assert.equal(artifact.name,pin.artifactName);assert.equal(artifact.expired,false);assert(Date.parse(artifact.expires_at)>now,'Official artifact expired/missing expiry');assert.equal(artifact.size_in_bytes,pin.zipBytes);assert.equal(artifact.digest,'sha256:'+pin.zipSHA256);assert.equal(positiveId(artifact.workflow_run?.id),positiveId(pin.runId));assert.equal(artifact.workflow_run?.head_sha,head);
 const created=timestampInterval(artifact.created_at),started=timestampInterval(job.started_at),completed=timestampInterval(job.completed_at);assert(created.upper>=started.lower&&created.lower<=completed.upper,'Artifact is outside original producer job');
 return {runId:positiveId(pin.runId),attempt:positiveId(pin.attempt),jobId:positiveId(pin.jobId),artifactId:positiveId(pin.artifactId),artifactName:pin.artifactName,zipSHA256:pin.zipSHA256,zipBytes:pin.zipBytes,sourceHead:head,jobName,originalJobConclusion:'success',completedAt:job.completed_at};
}
const dependencies=Object.freeze({'schema-restore':['schema-upgrade'],vertical4:['schema-restore'],'exact-worker1':['schema-restore'],'ordinary-harness4':['schema-restore'],'exact-lazy-current-child':['schema-restore'],'status-browser':['frontend-image'],'product-browser':['backend-image','frontend-image','schema-restore'],'backend-scan':['backend-image'],'frontend-scan':['frontend-image']});
function history(plan,h){
 assert.equal(h?.schemaVersion,1);assert.equal(h.kind,'pr356-reviewed-local-admission');for(const k of ['head','tree','candidateInputsSHA256','acceptanceSHA256'])assert.equal(h[k],plan[k]);for(const k of ['ciExecuted','originalExecutionSigned','releaseAuthorized'])assert.equal(h[k],false);assert.equal(h.externalDotApprovalRequired,true);assert.equal(h.reviewAuthentication,'not-established');
 const cases=plan.historicalEvidence.flatMap(g=>g.cases.map(c=>({...c,inputs:evidenceInputs(g,c),groupId:g.id,reviewDigest:g.reviewDigest})));coverage(h.cases?.map(c=>c.id),cases.map(c=>c.id),'authenticated historical cases');
 for(const row of h.cases){const c=cases.find(c=>c.id===row.id);for(const k of ['groupId','scope','rawSHA256','reviewDigest','ciExecuted','originalExecutionSigned','contemporaneousSourceManifest'])same(row[k],c[k],'Historical admission source differs');assert.equal(row.inputsSHA256,canonicalSHA256(c.inputs));assert.equal(row.invocation?.wholeInvocationAccepted,c.scope==='whole-invocation');if(c.scope!=='passed-case')assert.equal(row.invocation?.exitCode,0);}
 assert.equal(h.proofSHA256,canonicalSHA256(h.cases));
}
function sourceReceipt(plan,r){
 assert.equal(r?.schemaVersion,1);assert.equal(r.kind,'pr356-qualification');for(const k of ['head','tree','base','candidateInputsSHA256','inventorySHA256','acceptanceSHA256'])assert.equal(r[k],plan[k],'Official Q source/recipe differs: '+k);assert.equal(r.qualificationOnly,true);assert.equal(r.releaseAuthorized,false);assert.equal(r.reviewAuthentication,'not-established');assert.equal(r.externalDotApprovalRequired,true);
 coverage(r.requiredPhaseIds,selectedPhaseIds(plan),'selected phase table');coverage(r.phases?.map(p=>p.phaseId),selectedPhaseIds(plan),'completed phase table');same(r.phaseInputs,Object.fromEntries(Object.entries(plan.phases).map(([id,p])=>[id,p.inputs])),'Complete source/config/tool/dependency recipes differ');const {receiptSHA256,...body}=r;hash(receiptSHA256);assert.equal(receiptSHA256,canonicalSHA256(body),'Official Q receipt digest differs');history(plan,r.historicalEvidence);
 coverage(r.roleArtifacts?.map(a=>a.role),['frontend-dist'],'extra artifact roles');const byId=new Map(r.phases.map(p=>[p.phaseId,p]));
 for(const row of r.phases){const phase=plan.phases[row.phaseId];assert.equal(row.status,'success');assert.equal(row.inputsSHA256,phase.inputsSHA256);hash(row.proofSHA256);same(row.caseIds,phase.caseIds,'Exact selected cases differ');same(row.checks,phase.caseIds.map(id=>({id,status:'passed'})),'Missing/failed/skipped selected checks');assert(Array.isArray(row.command?.argv)&&row.command.argv.length);assert.equal(row.command.exitCode,0);assert.equal(typeof row.command.cwd,'string');hash(row.command.logSHA256);const start=Date.parse(row.command.startedAt),end=Date.parse(row.command.completedAt);assert(Number.isFinite(start)&&Number.isFinite(end)&&start<=end,'Missing actual command receipt');
  const wanted=dependencies[row.phaseId]??[];coverage(phase.inputs.dependencies.upstreamPhaseIds??[],wanted,'Declared dependencies');coverage(row.upstream?.map(u=>u.phaseId),wanted,'Actual upstream table');
  for(const u of row.upstream){const producer=byId.get(u.phaseId),role=u.phaseId==='frontend-image'&&['status-browser','product-browser'].includes(row.phaseId)?'frontend-dist':u.phaseId,evidence=role===u.phaseId?producer:r.roleArtifacts.find(a=>a.role===role);assert(evidence);assert.equal(u.role,role);assert.equal(typeof u.artifactId,'string');assert.equal(typeof u.runId,'string');assert(Number.isSafeInteger(u.producerAttempt));assert.equal(u.artifactId,positiveId(evidence.official.artifactId));assert.equal(u.runId,positiveId(producer.official.runId));assert.equal(positiveId(u.producerAttempt),positiveId(producer.official.attempt));assert.equal(u.proofSHA256,producer.proofSHA256);assert.equal(u.inputsSHA256,producer.inputsSHA256);assert.equal(u.artifactDigest,'sha256:'+evidence.official.zipSHA256);}
 }
 for(const role of r.roleArtifacts){assert.equal(role.phaseId,'frontend-image');const producer=byId.get(role.phaseId);assert.equal(role.inputsSHA256,producer.inputsSHA256);assert.equal(role.proofSHA256,producer.proofSHA256);for(const k of ['runId','attempt','jobId','sourceHead'])assert.equal(role.official[k],producer.official[k],'Extra role original producer differs');}
 coverage(r.sarif?.map(a=>a.phaseId),['codeql-javascript-typescript','codeql-python'],'Complete original analyses');for(const a of r.sarif){assert.equal(a.status,'analysis-complete');assert.equal(a.disposition,'pending');assert.equal(a.analysisSuccessful,true);assert.equal(a.sourceHead,plan.head);assert.equal(a.sourceTree,plan.tree);assert.equal(a.language,a.phaseId.slice(7));assert.equal(a.policySHA256,plan.sarifPolicy.sha256);for(const k of ['sarifSHA256','analysisSHA256','queryPackSHA256','resultSetSHA256'])hash(a[k]);assert(Array.isArray(a.findings));assert.equal(a.resultSetSHA256,canonicalSHA256(a.findings.map(f=>({findingId:f.findingId,resultSHA256:f.resultSHA256}))));}
}
/** Authenticate actual official Q ZIP bytes. JSON or an alleged success flag
 * cannot construct the internal root brand consumed by metadata-only reuse. */
export async function authenticateQualificationRoot({plan,pin,directory,mode='download',token,fetcher=fetch}){
 assertPlan(plan);explicitPin(pin);assert(['download','verify-local'].includes(mode));const spec=aggregateSpec(plan,'qualification-result'),expected=expectedFromOfficialOrigin('qualification-result',spec,{kind:'pr356-explicit-official-origin',runId:pin.runId,sourceHead:plan.head,producerAttempt:pin.attempt,jobId:pin.jobId,artifactId:pin.artifactId,artifactName:pin.artifactName,artifactDigest:'sha256:'+pin.zipSHA256});
 const validation=await verifyArtifact({expected,directory:resolve(directory),mode,token,fetcher});assert.equal(validation.role,'qualification-result');assert.equal(validation.zipBytes,pin.zipBytes);const metadata=await readMetadata(pin,token,fetcher),origin=official(pin,metadata,{head:plan.head,jobName:spec.jobName,maxAgeSeconds:spec.maxAgeSeconds});const raw=readFileSync(join(validation.directory,'qualification.json'));assert(raw.length<=32*1024*1024,'Oversized Q receipt');assert.equal(validation.payloadFiles['qualification.json']?.sha256,sha256(raw));const receipt=JSON.parse(raw.toString('utf8'));sourceReceipt(plan,receipt);
 const root=freeze({schemaVersion:1,kind:'pr356-authenticated-qualification-root',head:plan.head,tree:plan.tree,base:plan.base,candidateInputsSHA256:plan.candidateInputsSHA256,receipt,receiptSHA256:receipt.receiptSHA256,payloadSHA256:sha256(raw),official:origin,artifactProofSHA256:validation.proofSHA256,validation,qualificationClaim:false,releaseAuthorized:false});authenticatedRoots.add(root);return root;
}
/** Recheck only fixed official metadata. This never calls a producer, image
 * archive verifier, database/browser consumer, or original phase ZIP endpoint. */
export async function verifyQualificationMetadata({plan,root,token,fetcher=fetch}){
 assertPlan(plan);assert(authenticatedRoots.has(root),'An authenticated official Q ZIP root is required');assert.equal(root.candidateInputsSHA256,plan.candidateInputsSHA256);sourceReceipt(plan,root.receipt);
 const qualificationSpec=aggregateSpec(plan,'qualification-result'),qualificationMetadata=await readMetadata(root.official,token,fetcher),qualificationOrigin=official(root.official,qualificationMetadata,{head:plan.head,jobName:qualificationSpec.jobName,maxAgeSeconds:qualificationSpec.maxAgeSeconds});same(qualificationOrigin,root.official,'Pinned qualification metadata drift');
 const phases=root.receipt.phases,roles=root.receipt.roleArtifacts;
 const checked=await Promise.all([...phases.map(row=>({row,role:row.phaseId})),...roles.map(row=>({row,role:row.role}))].map(async({row,role})=>{
  const pin=row.official,phase=plan.phases[row.phaseId];assert.equal(positiveId(pin.runId),root.official.runId,'Another run needs a separately reviewed origin; no fallback');assert.equal(pin.sourceHead,plan.head);assert.equal(pin.artifactName,'pr356-'+role+'-'+positiveId(pin.runId)+'-'+positiveId(pin.attempt));const metadata=await readMetadata(pin,token,fetcher),result=official(pin,metadata,{head:plan.head,jobName:phase.jobName,maxAgeSeconds:phase.maxAgeSeconds,consumerAttempt:root.official.attempt});same(result,pin,'Pinned phase metadata drift');
  if(row.phaseId.startsWith('codeql-'))for(const kind of ['init','analyze']){const expected=phase.inputs.tools.codeql[kind],observed=row.codeqlActionSteps?.[kind];assert.equal(observed?.id,expected.id);assert.equal(observed?.name,expected.name);assert.equal(observed?.outcome,'success');const steps=(metadata.job.steps??[]).filter(s=>s.name===expected.name);assert.equal(steps.length,1);assert.equal(steps[0].status,'completed');assert.equal(steps[0].conclusion,'success');}
  return {phaseId:row.phaseId,role,proofSHA256:row.proofSHA256,inputsSHA256:row.inputsSHA256,official:result};
 }));
 return freeze({schemaVersion:1,kind:'pr356-qualification-metadata-observation',head:plan.head,tree:plan.tree,base:plan.base,candidateInputsSHA256:plan.candidateInputsSHA256,qualification:root.official,qualificationPayloadSHA256:root.payloadSHA256,qualificationReceiptSHA256:root.receiptSHA256,phaseMetadata:checked,originalPhaseArchivesDownloaded:false,applicationChecksExecuted:false,qualificationClaim:false,releaseAuthorized:false,externalDotApprovalRequired:true,reviewAuthentication:'not-established'});
}
