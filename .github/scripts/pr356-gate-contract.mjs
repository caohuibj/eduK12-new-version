/** Pure PR356 needs contract. No Git/API/filesystem/application execution and no
 * qualification claim: the stable gate must still recompute and verify official
 * admission, original phase artifacts and historical bytes through the core. */
import assert from 'node:assert/strict';
import {BRANCH,REPOSITORY,REQUIRED_PHASE_IDS,REQUIRED_EVIDENCE_IDS,positiveId,canonicalSHA256,compactPlan} from './pr356-plan.mjs';

const CHECKS=Object.freeze(['scope','pr356-admission']);
const sha40=(value,label)=>assert(typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)&&value!=='0'.repeat(40),label+' must be a complete Git identity');
const sha256=(value,label)=>assert(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64),label+' must be a complete SHA256');
function section(check,read){try{return read()}catch(error){const wrapped=new Error(error.message,{cause:error});wrapped.pr356Check=check;throw wrapped;}}
function uniqueStrings(value,label){
 assert(Array.isArray(value)&&value.length,label+' must be nonempty');
 assert(value.every(v=>typeof v==='string'&&v.length&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v)),label+' contains an invalid case/ID');
 assert.equal(new Set(value).size,value.length,'Duplicate '+label);return value;
}
function exactSet(actual,wanted,label){uniqueStrings(actual,label);assert.deepEqual([...actual].sort(),[...wanted].sort(),label+' coverage mismatch');}
function attempt(value,consumer,label){const id=positiveId(value,label);assert(BigInt(id)<=BigInt(consumer),label+' is newer than this consumer');return id;}
function artifactDigest(value){
 assert.equal(typeof value,'string','Missing official artifact digest');
 assert(/^(?:sha256:)?[a-f0-9]{64}$/.test(value),'Malformed official artifact digest');
 return value.startsWith('sha256:')?value:'sha256:'+value;
}

/** Draft never reduces PR356 to a scope-only gate. */
export function requiredPr356Checks(){return [...CHECKS];}

/** Validate exactly the real compactPlan/output shape and return only the
 * normalized fixed precheck pin for subsequent official core verification.
 * Compact historical groups have case IDs/state, not per-case source manifests;
 * this function cannot admit their original evidence or recompute full digests. */
export function validatePr356GateNeeds(needs,draft,env=process.env){
 const source=section('scope',()=>{
  assert(needs&&typeof needs==='object'&&!Array.isArray(needs),'Needs object required');
  assert.equal(needs.scope?.result,'success','Source scope did not succeed');
  assert.equal(draft,false,'Draft or unknown PR state cannot receive stable admission');
  const outputs=needs.scope.outputs;assert(outputs&&typeof outputs==='object'&&!Array.isArray(outputs),'Source outputs missing');
  assert.equal(outputs.application_route,'pr356','Wrong source route');assert.equal(outputs.scenario,'pr356','Wrong source scenario');
  assert.equal(outputs.pr356_phase,'admit','Only the admit phase can reach the stable PR gate');assert.equal(outputs.post_merge,'false','Postmerge is not merge admission');
  const serialized=outputs.pr356_plan;assert(typeof serialized==='string'&&serialized.length&&Buffer.byteLength(serialized)<256*1024,'Missing or oversized compact plan');
  const plan=JSON.parse(serialized);assert(plan&&typeof plan==='object'&&!Array.isArray(plan),'Compact plan object required');
  assert.equal(JSON.stringify(plan),serialized,'Source compact JSON is ambiguous or not its original serialized form');
  assert.deepEqual(plan,compactPlan(plan),'Compact plan shape/flags changed');canonicalSHA256(plan);
  assert.equal(plan.schemaVersion,1);assert.equal(plan.route,'pr356');assert.equal(plan.phase,'admit');assert.equal(plan.repository,REPOSITORY);assert.equal(plan.pr,356);assert.equal(plan.branch,BRANCH);
  for(const key of ['base','head','checkout','tree','product'])sha40(plan[key],key);
  assert.notEqual(plan.base,plan.head,'Candidate has no distinct source head');assert.equal(plan.checkout,plan.head,'Admission must check out source H');
  assert(plan.components&&typeof plan.components==='object'&&!Array.isArray(plan.components),'Component trees missing');
  exactSet(Object.keys(plan.components),['backend','frontend'],'component trees');for(const [name,tree]of Object.entries(plan.components))sha40(tree,name+' tree');
  for(const key of ['inventorySHA256','bindingSHA256','acceptanceSHA256','candidateInputsSHA256'])sha256(plan[key],key);
  assert.equal(outputs.pr356_candidate_inputs_sha256,plan.candidateInputsSHA256,'Source candidate digest output drift');
  exactSet(plan.requiredPhaseIds,REQUIRED_PHASE_IDS,'required phases');exactSet(Object.keys(plan.phases),REQUIRED_PHASE_IDS,'phase table');
  const cases=[];
  for(const id of REQUIRED_PHASE_IDS){const phase=plan.phases[id];assert.equal(phase.jobName,'pr356-'+id,'Phase job identity drift');sha256(phase.inputsSHA256,id+' inputs SHA256');cases.push(...uniqueStrings(phase.caseIds,id+' cases'));}
  uniqueStrings(cases,'all phase cases');
  assert(Array.isArray(plan.historicalEvidence),'Historical group table missing');exactSet(plan.historicalEvidence.map(group=>group.id),REQUIRED_EVIDENCE_IDS,'historical groups');
  const historical=[];
  for(const group of plan.historicalEvidence){assert.equal(group.state,'approved','Historical group is pending/unapproved');historical.push(...uniqueStrings(group.caseIds,group.id+' historical cases'));}
  uniqueStrings(historical,'all historical cases');uniqueStrings([...cases,...historical],'phase/historical case identities');
  assert.equal(env.GITHUB_ACTIONS,'true','Official Actions context required');assert.equal(env.GITHUB_REPOSITORY,REPOSITORY);assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch','Admission is an explicit dispatch');
  sha40(env.GITHUB_SHA,'current source');assert.equal(env.GITHUB_SHA,plan.head,'Current source H drift');
  const runId=positiveId(env.GITHUB_RUN_ID,'current run'),consumerAttempt=positiveId(env.GITHUB_RUN_ATTEMPT,'consumer attempt');
  const context=plan.context;assert(context&&typeof context==='object'&&!Array.isArray(context),'Source context missing');
  assert.equal(context.event,'workflow_dispatch');assert.equal(context.actualDraft,false,'Source PR remains Draft/unknown');
  assert.equal(positiveId(context.runId,'source run'),runId,'Source run differs');attempt(context.attempt,consumerAttempt,'source attempt');
  assert.equal(context.mainSha,plan.base,'Source main/base drift');sha40(context.mergeCommitSha,'official merge preview');
  if(env.GITHUB_REF!==undefined)assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH,'Dispatch branch drift');
  if(env.GITHUB_REF_NAME!==undefined)assert.equal(env.GITHUB_REF_NAME,BRANCH,'Dispatch branch name drift');
  return {plan,runId,consumerAttempt};
 });
 const admissionPin=section('pr356-admission',()=>{
  const job=needs['pr356-admission'];assert.equal(job?.result,'success','Official admission precheck did not succeed');
  const outputs=job.outputs;assert(outputs&&typeof outputs==='object'&&!Array.isArray(outputs),'Admission outputs missing');
  const artifactId=positiveId(outputs.artifact_id,'admission artifact ID'),runId=positiveId(outputs.producer_run,'admission run');
  assert.equal(runId,source.runId,'Admission belongs to another run');
  const producerAttempt=attempt(outputs.producer_attempt,source.consumerAttempt,'admission producer attempt');
  assert.equal(outputs.producer_head,source.plan.head,'Admission producer source H drift');
  assert.equal(outputs.artifact_name,'pr356-merge-admission-precheck-'+runId+'-'+producerAttempt,'Admission original artifact name drift');
  const digest=artifactDigest(outputs.artifact_digest);
  for(const [key,wanted]of Object.entries({head:source.plan.head,base:source.plan.base,tree:source.plan.tree,candidate_inputs_sha256:source.plan.candidateInputsSHA256}))assert.equal(outputs[key],wanted,'Admission/source '+key+' drift');
  return {runId,attempt:producerAttempt,artifactId,artifactName:outputs.artifact_name,artifactDigest:digest,zipSHA256:digest.slice(7),sourceHead:source.plan.head};
 });
 return {plan:source.plan,admissionPin};
}

export function failedPr356Checks(needs,draft,env=process.env){
 const failed=new Set(CHECKS.filter(name=>needs?.[name]?.result!=='success'));
 try{validatePr356GateNeeds(needs,draft,env)}catch(error){failed.add(CHECKS.includes(error.pr356Check)?error.pr356Check:'scope');}
 return CHECKS.filter(name=>failed.has(name));
}
