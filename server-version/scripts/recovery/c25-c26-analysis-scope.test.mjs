/** Pure synthetic logical rows only. No private fixture reads or service imports. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {C26_ANALYSIS_IDS as I,C26_ANALYSIS_FIXTURE_SHA256,analysisBindingHash as hash,bindAnalysisScopeFixture,createAnalysisResponseOracle,loadC26IndependentAnalysis} from './c25-c26-analysis-scope.mjs'
const clone=structuredClone,H='a'.repeat(64),J='b'.repeat(64)
const D='034d09f4a7782eed4493b16f3565601141d65da71bb8555647ec9f28fe8356dc',R='973905bf7917e78b63ae8b7c23988e021cb7250f2f5cec8a4793f2c9ebb1356e'
const S='9cbf8cfded799c5fa16874b02fceab43c441a31a1f3da34d8549c330a064f4dd',C='8bbd7c58fde8800094125613bdc861d7352d88e779c1f1deaf84b91665e0e716'
function fixture(){
 const rows=Object.fromEntries(['users','courses','composite_assessments','composite_assessment_attempts','assessments','assessment_unit_snapshots','assessment_result_facts','composite_assessment_items','composite_form_sections','scales','questionnaire_course_deliveries','composite_assessment_access_tokens','training_analysis_quality','training_analysis_quality_audit','anonymous_study_attempts','anonymous_study_waves','relational_assessment_assignments','assessment_run_executions'].map(t=>[t,[]]))
 const f={actors:{teacher:{id:I.teacher,username:'synthetic-teacher'},student:{id:I.student}},courseId:I.course,resources:{scale:I.scale},products:{},cases:{}}
 rows.users.push({id:I.teacher,username:'synthetic-teacher',role:'TEACHER',is_active:true,is_frozen:false,teacher_approved:true,account_domain:'TRAINING',must_change_password:false,expires_at:null})
 rows.courses.push({id:I.course,creator_id:I.teacher,course_type:'TRAINING_COURSE',is_library:false})
 I.tasks.forEach((id,i)=>{rows.composite_assessments.push({id,created_by:I.teacher,product_kind:'QUESTIONNAIRE',published_at:I.publications[i],training_variant_digest:null,training_flow_digest:null});f.products[i===0?'A':'scheduled']={id,publishedAt:I.publications[i]}})
 I.parents.forEach((id,i)=>{const child='synthetic-child-'+i,item=I.items[i===0?0:1],task=I.tasks[i===0?0:1],submission='synthetic-submission-'+i
  rows.composite_assessment_attempts.push({id,composite_assessment_id:task,delivery_course_id:I.course,attempt_epoch:1,assignment_ref:null,user_id:i<2?I.student:null,status:i<3?'COMPLETED':'IN_PROGRESS',delivery_mode:'FINAL_ONLY',runtime_generation:'UNIFIED_V1',context_snapshot_hash:null,training_variant_allocation_hash:null,training_flow_snapshot_hash:null,task_satisfaction:i===0||i===3?null:'SATISFIED'})
  rows.assessments.push({id:child,composite_attempt_id:id,composite_item_id:item,scale_id:I.scale,status:i<3?'COMPLETED':'IN_PROGRESS',attempt_epoch:1,compiled_runtime_hash:R,submission_id:submission,submission_payload_hash:H})
  f.cases['ABCD'[i]]={attemptId:id,children:{scaleId:child}}
  if(i<3){rows.assessment_unit_snapshots.push({composite_attempt_id:id,unit_type:'SCALE',slot_key:'scale:'+item,source_attempt_id:child,source_submission_id:submission,attempt_epoch:1,source_type:'ASSESSMENT',terminal_state:'COMPLETED',payload_kind:'UNIT_RESULT',source_definition_hash:D,compiled_runtime_hash:R});rows.assessment_result_facts.push({assessment_id:child,attempt_epoch:1,submission_id:submission,payload_hash:H,source_result_hash:S,canonical_result_hash:C})}
  if(i===1||i===2)for(const unit_type of ['FORM_SECTION','COGNITIVE','SITUATIONAL'])rows.assessment_unit_snapshots.push({composite_attempt_id:id,unit_type})
 });return {rows,f}
}
function oracleFixture(){
 const x=fixture(),binding=bindAnalysisScopeFixture(x.rows,x.f),selector=binding.selector
 const measurement={instrumentKey:'synthetic',scoreKey:'total',scoringDigest:H,responseSignature:J,respondentType:'SELF',unit:'score',version:'2.0.0'}
 const quality=[1,0].map(i=>({attemptId:I.parents[i],attemptEpoch:1,sourceHash:i?J:H,status:'COMPLETED',taskSatisfaction:i?'SATISFIED':null,verdict:'INCLUDE',reason:null,revision:0}))
 const expected={selector,measurement,quality,definitionHash:hash(selector),sourceHash:H,qualityHash:hash(quality)}
 const payload={manifest:{schemaVersion:1,manifestHash:J,definitionHash:expected.definitionHash,sourceHash:H,qualityHash:expected.qualityHash,authorityHash:H,sourceCutoff:'2026-10-19T12:00:00.000Z',sourceCount:2,observationCount:2},quality:{list:quality,total:2,page:1,pageSize:25},
  analysis:{schemaVersion:1,kind:'TRAINING_NUMERIC_LONGITUDINAL',courseId:I.course,mode:'PAIRWISE',minimumN:5,state:'suppressed',descriptives:selector.waves.map(w=>({waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,itemId:w.metrics[0].itemId,metricKey:'total',measurement,state:'suppressed'})),
   metrics:[{metricKey:'total',state:'suppressed',countKind:'PAIRED_VALID',flow:[{fromWaveKey:'wave_a',toWaveKey:'wave_b',basis:'OBSERVED_SAMPLE',state:'suppressed'}]}],limitations:['DESCRIPTIVE_RESEARCH_ONLY','NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION','UNIQUE_OR_REJECT','NO_CROSS_STRATUM_POOLING']}}
 return {expected:clone(expected),payload}
}
test('accepted A/B includes two sources and excludes both unlinked anonymous parents',()=>{
 const x=fixture(),b=bindAnalysisScopeFixture({rows:x.rows},x.f)
 assert.deepEqual(b.selected.map(s=>s.parent.id),I.parents.slice(0,2));assert.deepEqual(b.selector.waves.map(w=>w.waveKey),['wave_a','wave_b'])
 assert.equal(b.sourceIdentity.sourceCount,2);assert.equal(b.sourceIdentity.observationCount,2);assert.equal(b.sourceIdentity.identityUnavailable,2);assert.equal(b.sourceIdentity.fixtureSha256,C26_ANALYSIS_FIXTURE_SHA256)
 assert.equal(b.selected[0].parent.task_satisfaction,null);assert.ok(Object.isFrozen(b.selector.waves));assert.ok(Object.isFrozen(b.sourceIdentity.tableHashes))
 x.rows.assessments[2].extra='changed old anonymous child';const changed=bindAnalysisScopeFixture(x.rows,x.f)
 assert.notEqual(changed.sourceIdentity.baselineRowsSha256,b.sourceIdentity.baselineRowsSha256);assert.notEqual(changed.sourceIdentity.tableHashes.assessments.sha256,b.sourceIdentity.tableHashes.assessments.sha256)
})
test('binding rejects altered authority, participants, accepted fact identity and anonymous linkage',()=>{
 const changes=[x=>x.rows.users[0].teacher_approved=false,x=>x.rows.courses[0].creator_id='outsider',x=>x.rows.composite_assessments[0].published_at=I.publications[1],x=>x.rows.composite_assessment_attempts[1].user_id='outsider',x=>x.rows.composite_assessment_attempts[3].user_id=I.student,x=>x.rows.composite_assessment_attempts.push(clone(x.rows.composite_assessment_attempts[0])),x=>x.rows.assessments[1].attempt_epoch=2,x=>x.rows.assessment_unit_snapshots[0].source_submission_id='changed',x=>x.rows.assessment_result_facts[0].source_result_hash=J,x=>x.rows.training_analysis_quality.push({course_id:I.course}),x=>x.rows.anonymous_study_attempts.push({attempt_id:I.parents[2]})]
 for(const change of changes){const x=fixture();change(x);assert.throws(()=>bindAnalysisScopeFixture(x.rows,x.f))}
})
test('six responses preserve independent scientific/count/quality binding while cutoff and manifest digest vary',()=>{
 const {expected,payload}=oracleFixture(),check=createAnalysisResponseOracle(expected)
 for(let n=0;n<6;n++){const response=clone(payload);response.manifest.sourceCutoff=`2026-10-19T12:00:0${n}.000Z`;response.manifest.manifestHash=hash({n});assert.equal(check(response).sample,n+1)}
 assert.throws(()=>check(payload),/six planned/)
})
test('oracle rejects C19 three-source leakage, quality drift, identity drift and every suppressed statistic surface',()=>{
 const changes=[p=>p.manifest.sourceCount=3,p=>p.manifest.observationCount=3,p=>p.quality.total=3,p=>p.quality.list[0].verdict='EXCLUDE',p=>p.quality.list[1].taskSatisfaction='SATISFIED',p=>p.quality.list[0].revision=1,p=>p.analysis.matchedEligibleN=1,p=>p.analysis.descriptives[0].validN=1,p=>p.analysis.descriptives[0].statistics={mean:1},p=>p.analysis.descriptives[0].measurement.unit='changed',p=>p.analysis.metrics[0].validCaseN=1,p=>p.analysis.metrics[0].comparisons=[],p=>p.analysis.metrics[0].flow[0].retainedN=1,p=>p.analysis.metrics[0].state='not_comparable']
 for(const change of changes){const {expected,payload}=oracleFixture();change(payload);assert.throws(()=>createAnalysisResponseOracle(expected)(payload))}
 for(const key of ['definitionHash','sourceHash','qualityHash','authorityHash']){const {expected,payload}=oracleFixture(),check=createAnalysisResponseOracle(expected);check(payload);payload.manifest[key]=J;assert.throws(()=>check(payload))}
})
test('bootstrap verifies injectable pinned fixture before opening clients or reading scientific sources',async()=>{
 let touched=0;const h={read(){touched++;throw Error('must not read')},client(){touched++;throw Error('must not connect')}}
 await assert.rejects(loadC26IndependentAnalysis(h,{}, {},{readAcceptedFixture:()=>({fixture:{},sha256:H})}));assert.equal(touched,0)
 const x=fixture();h.read=()=>x.f
 await assert.rejects(loadC26IndependentAnalysis(h,{},x.rows,{readAcceptedFixture:()=>({fixture:{changed:true},sha256:C26_ANALYSIS_FIXTURE_SHA256})}));assert.equal(touched,0)
})
