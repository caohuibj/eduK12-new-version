/** Inert C26 binding for the accepted, unchanged C25 A/B Scale observations.
 * No discovery, analysis warm-up, old checkpoint read, rescoring or writes.
 * The coordinator supplies its already accepted full logical-row baseline. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {freezeIndependentReadScope} from './c25-c26-workload.mjs'

export const C26_ANALYSIS_FIXTURE_PATH='/workspace/scratch/5a77e8bdc1ae/eduk12_c25_continuation_02/c25-fixture-private.json'
export const C26_ANALYSIS_FIXTURE_SHA256='e1015179f1c4494c3448000b9c62fb0d18ab82a382c43a43ebb29d0bc7fc4e28'
const bytesHash=value=>createHash('sha256').update(value).digest('hex')
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
export const analysisBindingHash=value=>bytesHash(canonical(value))
const hash=analysisBindingHash,iso=value=>value==null?null:new Date(value).toISOString()
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value)}return value}
const one=(rows,match,label)=>{const found=rows.filter(match);assert.equal(found.length,1,label);return found[0]}
const exactKeys=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort())
const sha=value=>assert.match(value,/^[a-f0-9]{64}$/)
export const C26_ANALYSIS_IDS=frozen({teacher:'8d05824f-bca2-47e8-8afe-99b60795e1ad',student:'9cc4a8d2-7256-49da-a245-27d33f1f37be',course:'92aa416a-adc8-49e8-a0a0-3903ca23140b',scale:'c805fbe8-c3e5-4781-b633-5c409fd96080',
 tasks:['11ae0819-89fc-408e-b261-3425b645f826','6b5acd72-9ee6-4135-a4ed-cb124aca0ee8'],parents:['ce82fb7b-ab63-48cd-8103-78b2998d085e','09eed649-f3d3-48a7-a1d5-ad2718d2dd96','f2595e6b-de5f-46f1-8cbb-16c67c6718e0','12de5158-fac7-40f9-9ca2-5cd011f86659'],
 items:['69edd8eb-64dc-411f-af94-d7486776d169','e547d9f7-c1fd-4b17-bfb3-68a25ffd7d4c'],publications:['2026-10-19T09:27:57.483Z','2026-10-19T10:27:31.260Z']})
const DEFINITION='034d09f4a7782eed4493b16f3565601141d65da71bb8555647ec9f28fe8356dc',RUNTIME='973905bf7917e78b63ae8b7c23988e021cb7250f2f5cec8a4793f2c9ebb1356e'
const RESULT='9cbf8cfded799c5fa16874b02fceab43c441a31a1f3da34d8549c330a064f4dd',CORE='8bbd7c58fde8800094125613bdc861d7352d88e779c1f1deaf84b91665e0e716'
const LIMITATIONS=['DESCRIPTIVE_RESEARCH_ONLY','NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION','UNIQUE_OR_REJECT','NO_CROSS_STRATUM_POOLING']

function readPinnedFixture(){
 assert.equal(fs.realpathSync(C26_ANALYSIS_FIXTURE_PATH),C26_ANALYSIS_FIXTURE_PATH)
 const fd=fs.openSync(C26_ANALYSIS_FIXTURE_PATH,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
 try{const stat=fs.fstatSync(fd);assert.ok(stat.isFile());assert.equal(stat.mode&0o777,0o600);assert.equal(stat.nlink,1)
  const bytes=fs.readFileSync(fd);assert.equal(bytesHash(bytes),C26_ANALYSIS_FIXTURE_SHA256);return {fixture:JSON.parse(bytes),sha256:bytesHash(bytes)}
 }finally{fs.closeSync(fd)}
}

export function bindAnalysisScopeFixture(protectedRows,fixture){
 const rows=structuredClone(protectedRows.rows??protectedRows),f=fixture,I=C26_ANALYSIS_IDS
 const table=name=>{assert.ok(Array.isArray(rows[name]),`Missing accepted table ${name}`);return rows[name]}
 assert.equal(f.actors.teacher.id,I.teacher);assert.equal(f.actors.student.id,I.student);assert.equal(f.courseId,I.course);assert.equal(f.resources.scale,I.scale)
 const principal=one(table('users'),r=>r.id===I.teacher,'teacher'),course=one(table('courses'),r=>r.id===I.course,'course')
 for(const [key,value]of Object.entries({role:'TEACHER',is_active:true,is_frozen:false,teacher_approved:true,account_domain:'TRAINING',must_change_password:false,expires_at:null}))assert.equal(principal[key],value,key)
 assert.equal(principal.username,f.actors.teacher.username);assert.equal(course.creator_id,I.teacher);assert.equal(course.course_type,'TRAINING_COURSE');assert.equal(course.is_library,false)
 const tasks=table('composite_assessments').filter(r=>I.tasks.includes(r.id)),parents=table('composite_assessment_attempts').filter(r=>I.tasks.includes(r.composite_assessment_id))
 assert.equal(tasks.length,2);assert.deepEqual(parents.map(r=>r.id).sort(),[...I.parents].sort())
 const waves=I.tasks.map((taskId,index)=>{const task=one(tasks,r=>r.id===taskId,'task'),product=f.products[index===0?'A':'scheduled'];assert.equal(product.id,taskId)
  assert.equal(task.created_by,I.teacher);assert.equal(task.product_kind,'QUESTIONNAIRE');assert.equal(iso(task.published_at),I.publications[index]);assert.equal(product.publishedAt,I.publications[index])
  assert.equal(task.training_variant_digest,null);assert.equal(task.training_flow_digest,null)
  return {waveKey:index===0?'wave_a':'wave_b',taskId,publication:I.publications[index],configDigest:null,variantKey:null,metrics:[{metricKey:'total',itemId:I.items[index]}]}})
 const scoped={users:[principal],courses:[course],composite_assessments:tasks,composite_assessment_attempts:parents}
 for(const [name,match]of Object.entries({assessments:r=>I.parents.includes(r.composite_attempt_id),assessment_unit_snapshots:r=>I.parents.includes(r.composite_attempt_id),
  composite_assessment_items:r=>I.tasks.includes(r.composite_assessment_id),composite_form_sections:r=>I.tasks.includes(r.composite_assessment_id),scales:r=>r.id===I.scale,
  questionnaire_course_deliveries:r=>I.tasks.includes(r.composite_id),composite_assessment_access_tokens:r=>I.tasks.includes(r.composite_assessment_id),
  training_analysis_quality:r=>r.course_id===I.course,training_analysis_quality_audit:r=>r.course_id===I.course,anonymous_study_attempts:r=>I.parents.includes(r.attempt_id),
  relational_assessment_assignments:r=>r.created_by_user_id===I.teacher,assessment_run_executions:r=>I.parents.includes(r.runtime_binding_ref)}))scoped[name]=table(name).filter(match)
 const childIds=new Set(scoped.assessments.map(r=>r.id));scoped.assessment_result_facts=table('assessment_result_facts').filter(r=>childIds.has(r.assessment_id))
 const tokenIds=new Set(scoped.composite_assessment_access_tokens.map(r=>r.id));scoped.anonymous_study_waves=table('anonymous_study_waves').filter(r=>tokenIds.has(r.access_token_id))
 for(const name of ['training_analysis_quality','training_analysis_quality_audit','anonymous_study_attempts','anonymous_study_waves','relational_assessment_assignments','assessment_run_executions'])assert.equal(scoped[name].length,0,`${name} changed scope`)
 assert.equal(scoped.assessments.length,4);assert.equal(scoped.assessment_unit_snapshots.length,9);assert.equal(scoped.assessment_result_facts.length,3)
 const selected=['A','B','C','D'].map((name,index)=>{const c=f.cases[name],parent=one(parents,r=>r.id===I.parents[index],name);assert.equal(c.attemptId,parent.id)
  assert.equal(parent.composite_assessment_id,I.tasks[index===0?0:1]);assert.equal(parent.delivery_course_id,I.course);assert.equal(parent.attempt_epoch,1);assert.equal(parent.assignment_ref,null)
  assert.equal(parent.user_id,index<2?I.student:null);assert.equal(parent.status,index<3?'COMPLETED':'IN_PROGRESS');assert.equal(parent.delivery_mode,'FINAL_ONLY');assert.equal(parent.runtime_generation,'UNIFIED_V1')
  assert.equal(parent.context_snapshot_hash,null);assert.equal(parent.training_variant_allocation_hash,null);assert.equal(parent.training_flow_snapshot_hash,null)
  if(index>1)return null
  assert.equal(parent.task_satisfaction,index===0?null:'SATISFIED')
  const child=one(scoped.assessments,r=>r.composite_attempt_id===parent.id,name+' Scale'),snapshot=one(scoped.assessment_unit_snapshots,r=>r.composite_attempt_id===parent.id&&r.unit_type==='SCALE',name+' snapshot')
  assert.equal(child.id,c.children.scaleId);assert.equal(child.composite_item_id,I.items[index]);assert.equal(child.scale_id,I.scale);assert.equal(child.status,'COMPLETED');assert.equal(child.attempt_epoch,1);assert.equal(child.compiled_runtime_hash,RUNTIME)
  assert.equal(snapshot.slot_key,'scale:'+I.items[index]);assert.equal(snapshot.source_attempt_id,child.id);assert.equal(snapshot.source_submission_id,child.submission_id);assert.equal(snapshot.attempt_epoch,1)
  assert.equal(snapshot.source_type,'ASSESSMENT');assert.equal(snapshot.terminal_state,'COMPLETED');assert.equal(snapshot.payload_kind,'UNIT_RESULT');assert.equal(snapshot.source_definition_hash,DEFINITION);assert.equal(snapshot.compiled_runtime_hash,RUNTIME)
  const fact=one(scoped.assessment_result_facts,r=>r.assessment_id===child.id,name+' fact');assert.equal(fact.attempt_epoch,1);assert.equal(fact.submission_id,child.submission_id);assert.equal(fact.payload_hash,child.submission_payload_hash);assert.equal(fact.source_result_hash,RESULT);assert.equal(fact.canonical_result_hash,CORE)
  return {parent,child,snapshot,fact,wave:waves[index]}}).filter(Boolean)
 const selector={schemaVersion:1,courseId:I.course,mode:'PAIRWISE',waves}
 const tableHashes=Object.fromEntries(Object.entries(scoped).map(([name,list])=>[name,{count:list.length,sha256:hash([...list].sort((a,b)=>canonical(a).localeCompare(canonical(b))))}]))
 return frozen({selector,selected,sourceIdentity:{scope:'ACCEPTED_JOINT_RESTORE_C25_AB',fixturePath:C26_ANALYSIS_FIXTURE_PATH,fixtureSha256:C26_ANALYSIS_FIXTURE_SHA256,
  baselineRowsSha256:hash(rows),baselineRowCount:Object.values(rows).reduce((sum,list)=>sum+list.length,0),tableHashes,teacherId:I.teacher,courseId:I.course,definitionHash:hash(selector),sourceCount:2,observationCount:2,identityUnavailable:2}})
}

export function prepareAnalysisExpected(binding,decoded){
 assert.equal(decoded.length,2);let measurement
 const sources=binding.selected.map(({parent:p,child:c,snapshot:s,fact,wave},index)=>{const {envelope:e,runtime:r}=decoded[index],core=e.core
  assert.equal(e.resultHash,CORE);assert.equal(hash(core),CORE);assert.equal(e.bundleBridge.sourceResultHash,RESULT);assert.equal(core.unitType,'SCALE');assert.equal(core.sourceDefinitionHash,DEFINITION);assert.equal(core.compiledRuntimeHash,RUNTIME)
  assert.deepEqual(e.persistenceProvenance,{sourceType:'ASSESSMENT',sourceAttemptId:c.id,sourceSubmissionId:c.submission_id});assert.equal(e.completedAt,iso(s.completed_at));assert.equal(core.contextHash,null)
  assert.deepEqual(core.quality,{status:'interpretable',flags:[]});assert.equal(core.metrics.length,1);assert.equal(core.metrics[0].key,'total');assert.equal(core.metrics[0].value,1);assert.equal(core.metrics[0].quality,'calculated')
  assert.equal(r.sourceDefinitionHash,DEFINITION);assert.equal(r.compiledRuntime.compiledRuntimeHash,RUNTIME);assert.equal(r.instrumentKey,core.instrumentKey);assert.equal(r.instrumentVersion,core.instrumentVersion);sha(r.snapshotHash)
  const identity={instrumentKey:core.instrumentKey,scoreKey:'total',scoringDigest:hash({scorer:core.scorerKey,version:core.scorerVersion,definition:DEFINITION,runtime:RUNTIME}),
   responseSignature:hash({items:r.definition.items.map(item=>({itemCode:item.itemCode,responseSetKey:item.responseSetKey})),responseSets:r.definition.responseSets}),respondentType:p.respondent_type??'SELF',unit:core.metrics[0].unit??null,version:core.instrumentVersion}
  assert.equal(identity.unit,'score');assert.equal(identity.version,'2.0.0');if(measurement)assert.deepEqual(identity,measurement);else measurement=identity
  const parentIdentity={id:p.id,taskId:p.composite_assessment_id,epoch:p.attempt_epoch,courseId:p.delivery_course_id,userId:p.user_id,subjectUserId:p.subject_user_id??null,respondentUserId:p.respondent_user_id??null,respondentType:p.respondent_type??null,
   assignmentRef:p.assignment_ref,status:p.status,deliveryMode:p.delivery_mode,runtimeGeneration:p.runtime_generation,taskSatisfaction:p.task_satisfaction,completedAt:iso(p.completed_at),aggregateInputHash:p.aggregate_input_hash??null,contextHash:p.context_snapshot_hash,slotsHash:p.frozen_active_slot_set_hash,allocationHash:p.training_variant_allocation_hash}
  const sourceHashes={participant:hash({participantKey:'user:'+p.user_id,participantKind:'USER'}),parent:hash(parentIdentity),publication:hash({taskId:wave.taskId,publication:wave.publication,configDigest:null,variantKey:null}),
   ['scale:'+c.composite_item_id]:hash({id:c.id,epoch:c.attempt_epoch,submissionId:c.submission_id,payloadHash:c.submission_payload_hash,runtime:r.snapshotHash,result:fact.source_result_hash}),[c.composite_item_id]:e.resultHash}
  const sourceHash=hash({sourceHashes,observations:[{metricKey:'total',itemId:c.composite_item_id,measurement:identity,value:1,reason:null}]});sourceHashes.sourceHash=sourceHash
  return {waveKey:wave.waveKey,taskId:wave.taskId,attemptId:p.id,attemptEpoch:1,sourceHash,sourceHashes,status:'COMPLETED',taskSatisfaction:p.task_satisfaction}})
 const quality=sources.map(s=>({attemptId:s.attemptId,attemptEpoch:1,sourceHash:s.sourceHash,status:s.status,taskSatisfaction:s.taskSatisfaction,verdict:'INCLUDE',reason:null,revision:0})).sort((a,b)=>a.attemptId.localeCompare(b.attemptId))
 return frozen({selector:binding.selector,measurement,sources,quality,definitionHash:hash(binding.selector),sourceHash:hash(sources),qualityHash:hash(quality)})
}

export function createAnalysisResponseOracle(expected){
 const e=structuredClone(expected),selector=e.selector;let stable=null,count=0
 const descriptives=selector.waves.map(w=>({waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,itemId:w.metrics[0].itemId,metricKey:'total',measurement:e.measurement,state:'suppressed'}))
 const analysis={schemaVersion:1,kind:'TRAINING_NUMERIC_LONGITUDINAL',courseId:selector.courseId,mode:'PAIRWISE',minimumN:5,state:'suppressed',descriptives,
  metrics:[{metricKey:'total',state:'suppressed',countKind:'PAIRED_VALID',flow:[{fromWaveKey:'wave_a',toWaveKey:'wave_b',basis:'OBSERVED_SAMPLE',state:'suppressed'}]}],limitations:LIMITATIONS}
 return payload=>{assert.ok(count<6,'Only six planned analysis responses');exactKeys(payload,['manifest','analysis','quality']);const m=payload.manifest
  exactKeys(m,['schemaVersion','manifestHash','definitionHash','sourceHash','qualityHash','authorityHash','sourceCutoff','sourceCount','observationCount'])
  assert.equal(m.schemaVersion,1);assert.equal(m.sourceCount,2);assert.equal(m.observationCount,2);assert.equal(iso(m.sourceCutoff),m.sourceCutoff)
  for(const key of ['manifestHash','definitionHash','sourceHash','qualityHash','authorityHash'])sha(m[key])
  for(const key of ['definitionHash','sourceHash','qualityHash'])assert.equal(m[key],e[key],key)
  const bound={definitionHash:m.definitionHash,sourceHash:m.sourceHash,qualityHash:m.qualityHash,authorityHash:m.authorityHash};if(stable)assert.deepEqual(bound,stable);else stable=bound
  assert.deepEqual(payload.quality,{list:e.quality,total:2,page:1,pageSize:25});assert.deepEqual(payload.analysis,analysis,'Exact suppressed projection: no counts/statistics leakage or identity drift')
  count++;return {sourceCount:2,observationCount:2,qualityTotal:2,state:'suppressed',sample:count,manifestHash:m.manifestHash}}
}

export async function loadC26IndependentAnalysis(h,api,protectedRows,{readAcceptedFixture=readPinnedFixture}={}){
 const accepted=readAcceptedFixture();assert.equal(accepted.sha256,C26_ANALYSIS_FIXTURE_SHA256)
 const fixture=h.read('c25-existing-fixture-private.json');assert.equal(hash(fixture),hash(accepted.fixture),'Copied fixture differs from pinned accepted bytes')
 const binding=bindAnalysisScopeFixture(protectedRows,fixture)
 const canonicalLoader=api.loadStoredCanonicalUnitResult??api.require(path.join(api.backend,'dist/modules/assessment-runtime/compact-assessment-storage.js')).loadStoredCanonicalUnitResult
 const runtimeLoader=api.loadFrozenScaleRuntimeSnapshot??api.require(path.join(api.backend,'dist/modules/assessment-runtime/runtime-snapshot.js')).loadFrozenScaleRuntimeSnapshot
 const decoded=[];for(const {snapshot,child}of binding.selected)decoded.push({envelope:await canonicalLoader(snapshot.canonical_result_encrypted,api.prisma),runtime:await runtimeLoader(child.runtime_snapshot_encrypted,api.prisma)})
 const expected=prepareAnalysisExpected(binding,decoded),teacher=h.client(),login=await teacher.login(fixture.actors.teacher,'TEACHER')
 assert.equal(login.user.id,C26_ANALYSIS_IDS.teacher);assert.equal(login.user.role,'TEACHER')
 return freezeIndependentReadScope({teacher,route:`/courses/${fixture.courseId}/training-analysis`,selector:binding.selector,
  sourceIdentity:{...binding.sourceIdentity,measurement:expected.measurement,sourceHash:expected.sourceHash,qualityHash:expected.qualityHash},assertResponse:createAnalysisResponseOracle(expected)})
}
