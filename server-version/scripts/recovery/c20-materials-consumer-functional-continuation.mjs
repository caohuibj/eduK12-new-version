/** Functional-only continuation of the immutable failed state05 cost producer.
 * No admission, FINAL, outbox processing, budget rerun, or efficiency qualification.
 * Run only through the locked isolated launcher, using its clone of state05.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {harness,prisma,require,backend,sha,children,census} from './c20-materials-client.mjs'
const {trainingAnalysisSelectorSchema}=require(path.join(backend,'dist/modules/training-analysis/manifest.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {fingerprint}=require(path.resolve(backend,'../scripts/recovery/runtime-fingerprint.cjs'))
const pins={
  "c20-consumer-cost-result.json": "1b3418fe18b511285d12f47926d1d4af896f9d10ddb2b1c66984f96795cb3136",
  "c20-consumer-cost-fixture-private.json": "6a6d9156dbe41a5f1d2a056a2cdf19030b2683a5d6459e20ca52adb412ff4490",
  "c20-fixture-private.json": "15048b4dc11abc65d8d6be90918454dfeddac58eff3829c6aa376c7e20781b03",
  "c20-consumer-cost-http-private.jsonl": "7c1798568e6ad2a240678ae6bdd608fa540be743e328bb422b5ec85a0e5904c5",
  "c20-functional-prior-frozen-inputs-private.json": "eb2f89e2889b595e48e51bcc2d674a8e7240ee90096d8b08300d520ac6e89e33",
  "c20-functional-prior-runtime-result-private.json": "f70ad54240610032c3decd2b52354e56116ac82e0cbdf9f2d275df23943da81b"
}
const h=harness('consumer-functional');let error,before,finalIds,cost
function verifyPins(){for(const [file,expected]of Object.entries(pins))assert.equal(sha(fs.readFileSync(path.join(h.state,file))),expected,'Original evidence changed: '+file)}
async function acceptedFingerprint(){
 const parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:finalIds}},orderBy:{id:'asc'}})
 const accepted=[];const scaleIds=[]
 for(const id of [...finalIds].sort()){const rows=await children(id);for(const list of Object.values(rows))list.sort((a,b)=>a.id.localeCompare(b.id));scaleIds.push(...rows.scales.map(row=>row.id));accepted.push({id,rows})}
 const facts=await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:scaleIds}},orderBy:[{assessmentId:'asc'},{attemptEpoch:'asc'}]})
 const claims=await prisma.trainingMaterialAllocationClaim.findMany({where:{compositeId:{in:cost.products.map(p=>p.id)}},orderBy:{id:'asc'}})
 const bindings=await prisma.trainingMaterialSubjectBinding.findMany({where:{experimentId:{in:[...new Set(claims.map(c=>c.experimentId))]}},orderBy:{id:'asc'}})
 return {acceptedSha256:sha(JSON.stringify({parents,accepted,facts,claims,bindings})),census:await census()}
}
try{
 assert.ok(!fs.existsSync(path.join(h.state,'c20-consumer-functional-result.json')),'Existing functional continuation must not be replayed')
 verifyPins()
 const prior=h.read('c20-consumer-cost-result.json'),frozen=h.read('c20-functional-prior-frozen-inputs-private.json')
 assert.equal(prior.passed,false);assert.equal(prior.error.message,'full-composite-export-projection: SQL grew from 40 to 61; investigate N+1, do not relax silently')
 assert.equal(prior.measurements.length,9);assert.equal(prior.finals,undefined);assert.equal(prior.groupSeparation,undefined)
 assert.deepEqual(fingerprint(backend),frozen.runtimeFingerprint,'Must use original unchanged production runtime')
 h.result.priorProducer={runtimeSha256:pins['c20-functional-prior-runtime-result-private.json'],resultSha256:pins['c20-consumer-cost-result.json'],continuation:'FUNCTIONAL_TAIL_ONLY_AFTER_FAILED_COST_BUDGET; ORIGINAL_COST_REMAINS_FAILED'}
 h.result.inputPins=pins;h.result.performanceQualification=false;h.result.capacityQualification=false;h.result.originalConsumerCostPassed=false
 cost=h.read('c20-consumer-cost-fixture-private.json');const fixture=h.read('c20-fixture-private.json')
 assert.equal(cost.people.length,51);assert.equal(cost.products.length,2)
 assert.equal(new Set(cost.people.map(p=>p.user.id)).size,51)
 finalIds=cost.people.flatMap(p=>p.attempts.map(a=>a.attemptId));assert.equal(finalIds.length,102);assert.equal(new Set(finalIds).size,102)
 assert.ok(cost.people.every(p=>p.attempts.length===2&&p.attempts.every(a=>a.finalAccepted)))
 before=await acceptedFingerprint()
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{id:{in:finalIds},status:'COMPLETED'}}),102)
 const teacher=h.client();await teacher.login(fixture.users.teacher,'TEACHER')
 const actor={userId:fixture.users.teacher.id,role:'TEACHER'}
 assert.equal(cost.people.filter(person=>person.materialGroupKey==='cost_a').length,50);assert.equal(cost.people.filter(person=>person.materialGroupKey==='cost_b').length,1)
 assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:{in:finalIds}}}),204)
 const jobs=await prisma.compositeReportJob.findMany({where:{attemptId:{in:finalIds}}});assert.equal(jobs.length,102);assert.ok(jobs.every(job=>job.status==='READY'&&job.attemptCount===1))
 h.result.finals={participants:51,materialGroupCounts:{cost_a:50,cost_b:1},publications:2,completedParents:102,acceptedSnapshots:204,originalOutboxes:102,claimAttemptsEach:1}
 // Independent hand-calculated B=0 must never pool with A=1. Both selectors
 // use actual discovery group identities, not a client-side row filter.
 const sourceList=await teacher.request(`/courses/${fixture.courseId}/training-analysis/sources`)
 h.result.groupSeparation=[]
 for(const [group,expectedN,expectedValue]of [['cost_a',50,1],['cost_b',1,0]]){
  const selector={schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves:cost.products.map((product,index)=>{const source=sourceList.list.find(item=>item.taskId===product.id&&item.materialGroupKey===group);assert.ok(source);const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric);const {taskName,...wave}=source;return {...wave,waveKey:'group_wave_'+index,metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}})}
  trainingAnalysisSelectorSchema.parse(selector)
  const http=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
  const direct=await analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector,sourceCutoff:http.manifest.sourceCutoff,includeTables:true})
  assert.equal(direct.manifest.manifestHash,http.manifest.manifestHash);assert.equal(direct.tables.long.rows.length,expectedN*2)
  const allowedIds=new Set(cost.people.filter(person=>person.materialGroupKey===group).flatMap(person=>person.attempts.map(item=>item.attemptId)))
  assert.ok(direct.tables.long.rows.every(row=>row.materialGroupKey===group&&row.value===expectedValue&&row.reason===null&&allowedIds.has(row.attemptId)))
  assert.ok(direct.manifest.sources.every(source=>source.materialGroupKey===group&&allowedIds.has(source.attemptId)))
  h.result.groupSeparation.push({group,participantsPerWave:expectedN,observationCount:direct.tables.long.rows.length,independentExpectedScale:expectedValue,manifestHash:direct.manifest.manifestHash})
 }
 h.check('Bounded 51-person quota population yields exact A50/B1 across both publications; actual group-specific analysis keeps hand-calculated A=1 and B=0 separate')
 // A single-wave single-group request is not part of the supported API.
 // Hold a second-publication A anchor fixed and use FULL_CASE for both runs.
 // The extra target B stratum is intentionally mutually exclusive with target A:
 // this verifies selection, not a meaningful paired treatment estimate.
 h.result.sameTaskGroupSelection=[]
 for(const targetGroups of [['cost_a'],['cost_a','cost_b']]){
  const requested=[...targetGroups.map(group=>({product:cost.products[0],group})),{product:cost.products[1],group:'cost_a'}]
  const selector={schemaVersion:1,courseId:fixture.courseId,mode:'FULL_CASE',waves:requested.map(({product,group},index)=>{const source=sourceList.list.find(item=>item.taskId===product.id&&item.materialGroupKey===group);assert.ok(source);const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric);const {taskName,...wave}=source;return {...wave,waveKey:'scope_wave_'+index,metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}})}
  trainingAnalysisSelectorSchema.parse(selector)
  const http=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
  const metadata={selectedMaterialGroup:null,targetMaterialGroups:targetGroups,targetGroupParticipantCounts:Object.fromEntries(targetGroups.map(group=>[group,group==='cost_a'?50:1])),fixedAnchorParticipants:50,targetParticipants:targetGroups.length===1?50:51,sourcePopulationParticipants:51,comparisonScope:'SAME_TARGET_TASK_PLUS_FIXED_SECOND_PUBLICATION_A_ANCHOR; FULL_CASE_BOTH; NOT_TREATMENT_INFERENCE'}
  const result=await analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector,sourceCutoff:http.manifest.sourceCutoff,includeTables:true})
  assert.equal(result.manifest.manifestHash,http.manifest.manifestHash)
  assert.equal(result.manifest.sources.length,targetGroups.length===1?100:101)
  const allowedSources=new Set(cost.people.flatMap(person=>person.attempts.filter(attempt=>attempt.productId===cost.products[0].id?targetGroups.includes(person.materialGroupKey):attempt.productId===cost.products[1].id&&person.materialGroupKey==='cost_a').map(attempt=>attempt.attemptId)))
  assert.deepEqual(new Set(result.manifest.sources.map(source=>source.attemptId)),allowedSources)
  for(const source of result.manifest.sources)assert.ok(source.taskId===cost.products[0].id?targetGroups.includes(source.materialGroupKey):source.taskId===cost.products[1].id&&source.materialGroupKey==='cost_a')
  for(const row of result.tables.long.rows)if(row.value!==null){assert.equal(row.value,row.materialGroupKey==='cost_a'?1:0);assert.equal(row.reason,null)}
  if(targetGroups.length===2)assert.equal(http.analysis.state,'suppressed')
  h.result.sameTaskGroupSelection.push({...metadata,observedSourceRows:result.manifest.sources.length,longRowsIncludingNoObservation:result.tables.long.rows.length,analysisState:http.analysis.state,manifestHash:result.manifest.manifestHash})
 }
 h.check('Same target task one-vs-two material groups correctly selected with fixed A anchor; functional checks only, no query-cost qualification')

 assert.deepEqual(await acceptedFingerprint(),before,'Functional reads changed accepted facts, reports, allocation or quota state')
 verifyPins();h.result.acceptedStatePreserved=true
 h.result.scope='FUNCTIONAL_TAIL_ONLY; FINAL_CARDINALITIES_GROUP_SEPARATION_FIXED_ANCHOR_SELECTION; ORIGINAL_COST_FAILURE_PRESERVED'
 h.result.passed=true
}catch(e){error=e;throw e}finally{
 try{if(before){assert.deepEqual(await acceptedFingerprint(),before,'Accepted state changed during functional continuation');verifyPins()}}catch(e){error=e;h.result.passed=false;throw e}finally{await h.finish(error)}
}
