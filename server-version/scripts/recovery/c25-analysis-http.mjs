/** Minimal C19 missing analysis evidence. All three new attempts and four FINALs
 * use genuine HTTP. This module is inert until the approved coordinator calls
 * runAnalysisSupplement; it has no standalone service/startup entry point. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {runtime,sha,prefix,products} from './c25-client.mjs'
import {runAnalysisChild,processOneAnalysisExport,privateJson} from './c25-analysis-export.mjs'

// Independent literal copied from the published test fixture contract, not a
// value calculated by the scorer or read from the result being tested.
export const MIXED_SCALE_CONTRACT=Object.freeze({
 schemaVersion:2,respondentType:'participant_self_report',
 source:{title:'Situational Bundle mixed fixture',citation:'situational-bundle.postgres.integration.test'},
 license:{status:'self_authored',redistribution:'allowed'},display:{randomizeItems:false},
 responseSets:[{key:'default',options:[{value:'no',label:'否',score:0},{value:'yes',label:'是',score:1}]}],
 items:[{itemCode:'mixed-scale-item-1',content:'Situational Bundle mixed fixture item',type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}],
 scoring:{scoringVersion:'2.0.0',itemRules:[{itemCode:'mixed-scale-item-1',transform:{type:'identity'}}],defaultMissingPolicy:{type:'complete_required'},
  scores:[{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:2,
   source:{type:'items',items:[{itemCode:'mixed-scale-item-1',weight:1}],aggregation:'sum'}}]},
 report:{reportVersion:'2.0.0',primaryScoreKeys:['total'],scoreOrder:['total'],interpretations:[{scoreKey:'total',headline:'总分',source:{type:'score_only'},summary:'Situational Bundle mixed fixture result',bands:[],guidance:[]}],limitations:[],disclaimer:'Situational Bundle mixed fixture only.'},
 referencePolicy:{type:'none'},
})
const stable=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value
export const identityHash=value=>sha(JSON.stringify(stable(value)))
export function assertScaleContract(scale,{scaleId,teacherId}){
 assert.equal(scale.id,scaleId);assert.equal(scale.creatorId,teacherId);assert.equal(scale.status,'PUBLISHED')
 assert.equal(scale.instrumentVersion,'2.0.0');assert.equal(scale.instrumentClass,'CUSTOM_DESCRIPTIVE')
 assert.deepEqual(scale.definition,MIXED_SCALE_CONTRACT,'Existing Scale must exactly match the independent no=0/yes=1 identity×1 sum fixture before any write')
 assert.equal(scale.definitionHash,identityHash(scale.definition),'Preexisting Scale definition hash must bind the exact independent contract')
 return {scaleId,definitionSha256:identityHash(scale.definition),rowSha256:identityHash(scale),
  independentSource:'backend/src/__tests__/questionnaire/product-fixtures.ts:2-55',expectedTotals:{MA:1,MB:0}}
}
const instrument=id=>'item_'+id.replace(/-/g,'_')
const section=id=>'section_'+id.replace(/-/g,'_')
export function screeningForm(){return {type:'FORM',formType:'single_choice',formLabel:'route',required:true,
 formOptions:[{value:'full',label:'full'},{value:'screen',label:'screen'}],
 formPolicy:{version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'},
 formDefinition:{type:'SINGLE',prompt:'route',required:true,options:[{optionKey:'full',label:'full'},{optionKey:'screen',label:'screen'}],rows:[],allowRefusal:true}}}
export function supplementFlow(product,mode){
 assert.ok(['A','B'].includes(mode));const scales=product.items.filter(item=>item.type==='SCALE')
 assert.equal(scales.length,1);assert.equal(scales[0].required,true)
 if(mode==='B'){assert.equal(product.formSections.length,0);assert.equal(product.items.length,1);return {schemaVersion:1,blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:instrument(scales[0].id)}]}}
 assert.equal(product.formSections.length,1);assert.equal(product.formSections[0].items.length,1);assert.equal(product.items.length,2)
 const form=product.formSections[0].items[0],formKey=section(product.formSections[0].id)
 assert.equal(form.formLabel,'route');assert.ok(form.formDefinition.itemKey)
 return {schemaVersion:1,blocks:[{blockKey:'route',kind:'INSTRUMENT',instrumentKey:formKey},
  {blockKey:'screen',kind:'END',termination:'SCREEN_OUT',when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:formKey,itemKey:form.formDefinition.itemKey},value:'screen'}},
  {blockKey:'scale',kind:'INSTRUMENT',instrumentKey:instrument(scales[0].id)}]}
}
export function assertContextHash(attempt){
 assert.ok(Object.hasOwn(attempt,'contextSnapshotHash'),'Returned context hash field must be present')
 assert.ok(attempt.contextSnapshotHash===null||(typeof attempt.contextSnapshotHash==='string'&&/^[a-f0-9]{64}$/.test(attempt.contextSnapshotHash)),'Context hash must be exactly null or a SHA-256')
}
export function formFinal(attempt,value){
 assert.ok(['full','screen'].includes(value));const unit=attempt.currentItem
 assert.equal(unit.type,'FORM_SECTION');assert.equal(unit.answers.length,1);assert.equal(unit.answers[0].label,'route')
 assert.ok(unit.answers[0].formItemId);assert.match(unit.definitionHash,/^[a-f0-9]{64}$/);assertContextHash(attempt)
 return {submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,
  contextSnapshotHash:attempt.contextSnapshotHash,answers:[{formItemId:unit.answers[0].formItemId,value}]}
}
export function scaleFinal(attempt,value){
 assert.ok(['yes','no'].includes(value));const unit=attempt.currentItem
 assert.equal(unit.type,'SCALE');assert.equal(unit.scale.definition.items.length,1)
 assert.equal(unit.scale.definition.items[0].itemCode,'mixed-scale-item-1')
 assert.match(unit.definitionHash,/^[a-f0-9]{64}$/);assertContextHash(attempt)
 return {submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,
  contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:value,responseTimeMs:17}]}
}
export function assertFinalRoute(route,fixture){
 const found=Object.values(fixture.cases).find(c=>route.startsWith(`${prefix}/attempts/${c.attemptId}/`))
 assert.ok(found,'FINAL route must belong to exactly this new supplement attempt')
 assert.ok(/^\/composite-assessments\/attempts\/[^/]+\/(?:form-sections\/[^/]+|items\/[^/]+\/scale)\/submit$/.test(route))
 return true
}
export function buildSelector(sources,fixture){
 assert.equal(sources.list.length,2,'New course must have exactly its two new task scopes')
 const waves=['A','B'].map((key,index)=>{
  const product=fixture.products[key],rows=sources.list.filter(row=>row.taskId===product.id);assert.equal(rows.length,1)
  const source=rows[0],item=product.items.find(row=>row.type==='SCALE')
  assert.equal(source.configDigest,null);assert.equal(source.variantKey,null);assert.equal(source.materialGroupKey,undefined)
  assert.equal(source.publication,new Date(product.publishedAt).toISOString())
  assert.ok(source.metrics.some(metric=>metric.itemId===item.id&&metric.metricKey==='total'))
  return {waveKey:index===0?'wave_a':'wave_b',taskId:product.id,publication:source.publication,configDigest:null,variantKey:null,metrics:[{itemId:item.id,metricKey:'total'}]}
 })
 assert.notEqual(waves[0].taskId,waves[1].taskId)
 return {schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves}
}
async function readFacts(h,ids){
 h.remaining();const {prisma}=await runtime()
 return prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 8000')
  return {cases:await Promise.all(ids.map(async id=>({
   parent:await tx.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}}),
   job:await tx.compositeReportJob.findFirstOrThrow({where:{attemptId:id}}),
   forms:await tx.compositeFormSectionAttempt.findMany({where:{attemptId:id},orderBy:{id:'asc'}}),
   scales:await tx.assessment.findMany({where:{compositeAttemptId:id},orderBy:{id:'asc'}}),
   cognitive:await tx.cognitiveSession.findMany({where:{compositeAttemptId:id},orderBy:{id:'asc'}}),
   sjt:await tx.situationalAttempt.findMany({where:{compositeAttemptId:id},orderBy:{id:'asc'}}),
   checkpoints:await tx.trainingAttemptCheckpoint.findMany({where:{attemptId:id}}),
   snapshots:await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:id},orderBy:{slotKey:'asc'}}),
  }))),queue:await tx.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),
   otherJobs:await tx.compositeReportJob.findMany({where:{attemptId:{notIn:ids}},orderBy:{id:'asc'}})}
 },{maxWait:1000,timeout:Math.floor(Math.min(20000,h.remaining()))})
}
export function assertAnalysisDrain({baseline,before,after,fixture}){
 assert.equal(baseline.otherJobs.length,148);assert.equal(before.cases.length,3);assert.equal(after.cases.length,3)
 assert.deepEqual(before.otherJobs,baseline.otherJobs);assert.deepEqual(after.otherJobs,baseline.otherJobs)
 assert.deepEqual(before.queue,{...baseline.queue,pending:baseline.queue.pending+3});assert.deepEqual(after.queue,baseline.queue)
 const specs={MA:{types:['FORM_SECTION','SCALE'],forms:1,scales:1,revision:2,satisfaction:'SATISFIED'},
  SA:{types:['FORM_SECTION'],forms:1,scales:0,revision:1,satisfaction:'NOT_SATISFIED'},
  MB:{types:['SCALE'],forms:0,scales:1,revision:1,satisfaction:'SATISFIED'}}
 for(const [name,spec] of Object.entries(specs)){
  const identity=fixture.cases[name],b=before.cases.find(row=>row.parent.id===identity.attemptId),a=after.cases.find(row=>row.parent.id===identity.attemptId)
  assert.ok(a&&b);assert.equal(b.parent.status,'IN_PROGRESS');assert.equal(a.parent.status,'COMPLETED');assert.ok(a.parent.completedAt)
  assert.equal(a.parent.taskSatisfaction,spec.satisfaction);assert.equal(b.job.status,'PENDING');assert.equal(a.job.status,'READY')
  assert.equal(b.job.attemptCount,0);assert.equal(a.job.attemptCount,1);assert.equal(b.job.budgetHeld,true);assert.equal(a.job.budgetHeld,false)
  assert.equal(a.job.id,b.job.id);assert.equal(b.job.requestedRevision,spec.revision);assert.equal(a.job.requestedRevision,spec.revision)
  assert.equal(a.job.claimedRevision,spec.revision)
  for(const fact of [a,b]){
   assert.equal(fact.parent.userId,identity.actorId);assert.equal(fact.parent.deliveryCourseId,fixture.courseId)
   assert.equal(fact.parent.compositeAssessmentId,identity.taskId);assert.equal(fact.parent.attemptEpoch,identity.attemptEpoch)
   assert.equal(fact.job.attemptId,identity.attemptId);assert.equal(fact.job.attemptEpoch,identity.attemptEpoch)
   assert.equal(fact.parent.asyncReportEpoch,identity.attemptEpoch);assert.equal(fact.checkpoints.length,0,'No checkpoint may be created')
   assert.equal(fact.forms.length,spec.forms);assert.equal(fact.scales.length,spec.scales);assert.equal(fact.cognitive.length,0);assert.equal(fact.sjt.length,0)
   assert.deepEqual(fact.snapshots.map(row=>row.unitType).sort(),[...spec.types].sort())
   for(const snapshot of fact.snapshots){assert.equal(snapshot.compositeAttemptId,identity.attemptId);assert.equal(snapshot.attemptEpoch,identity.attemptEpoch);assert.equal(snapshot.terminalState,'COMPLETED')}
  }
  assert.deepEqual(a.snapshots,b.snapshots,'Accepted unit snapshots must remain byte-exact through the original drain')
  for(const key of ['trainingFlowSnapshotEncrypted','trainingFlowSnapshotHash','trainingFlowPathEncrypted','trainingFlowPathHash','frozenActiveSlotSetEncrypted','frozenActiveSlotSetHash','contextSnapshotHash'])assert.equal(a.parent[key],b.parent[key],key)
 }
 assert.equal(after.cases.reduce((n,row)=>n+row.snapshots.length,0),4)
 return true
}

/** One shared drain. The original selector uses SKIP LOCKED while exactly 148
 * preexisting jobs are held by a separate transaction; no job row is forged. */
export async function processReportChild(input){
 assert.deepEqual(Object.keys(input).sort(),['attempts','oldJobIds']);assert.equal(input.attempts.length,3);assert.equal(input.oldJobIds.length,148)
 const ids=input.attempts.map(row=>row.attemptId);assert.equal(new Set(ids).size,3)
 const {prisma,PrismaClient,require,backend}=await runtime()
 const {claimCompositeReportJob}=require(path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))
 const {processCompositeReportJob}=require(path.join(backend,'dist/workers/compositeReportWorker.js'))
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('application_name','c25_analysis_original_report_preservation')
 const gate=new PrismaClient({datasources:{db:{url:url.toString()}}}),started=performance.now()
 let release,arrived,rejectReady,lockedRows
 const hold=new Promise(resolve=>release=resolve),ready=new Promise((resolve,reject)=>{arrived=resolve;rejectReady=reject})
 const transaction=gate.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 5000');await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 8000')
  lockedRows=await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE NOT (attempt_id=ANY($1::text[])) ORDER BY id FOR UPDATE',ids)
  assert.deepEqual(lockedRows.map(row=>row.id),[...input.oldJobIds].sort());arrived();await hold
 },{maxWait:3000,timeout:120000})
 transaction.catch(rejectReady)
 const processed=[]
 try{
  await ready
  const original=await prisma.compositeReportJob.findMany({where:{attemptId:{in:ids}},orderBy:{id:'asc'}})
  assert.equal(original.length,3)
  for(const row of original){const expected=input.attempts.find(value=>value.attemptId===row.attemptId);assert.ok(expected);assert.equal(row.id,expected.jobId);assert.equal(row.attemptEpoch,expected.attemptEpoch);assert.equal(row.status,'PENDING');assert.equal(row.attemptCount,0)}
  for(let index=0;index<3;index++){
   assert.ok(performance.now()-started<110000,'Shared report work budget exhausted')
   const job=await claimCompositeReportJob();assert.ok(job);assert.ok(ids.includes(job.attemptId));assert.ok(!processed.some(row=>row.claimed.id===job.id))
   assert.equal(job.id,input.attempts.find(row=>row.attemptId===job.attemptId).jobId);assert.equal(job.attemptCount,1)
   await processCompositeReportJob(job)
   const after=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})
   assert.equal(after.status,'READY');assert.equal(after.attemptCount,1)
   processed.push({claimed:job,after})
  }
 }finally{
  release()
  try{await transaction}finally{await gate.$disconnect()}
 }
 return {processed,lockedOldJobIds:lockedRows.map(row=>row.id),elapsedMs:performance.now()-started,sharedLimitMs:120000}
}
async function acceptedMeasurement(h,facts,fixture){
 const {require,backend,prisma}=await runtime(),{loadFrozenScaleRuntimeSnapshot}=require(path.join(backend,'dist/modules/assessment-runtime/runtime-snapshot.js'))
 const identities=[]
 for(const name of ['MA','MB']){
  h.remaining();const row=facts.cases.find(c=>c.parent.id===fixture.cases[name].attemptId),child=row.scales[0]
  assert.equal(child.scaleId,fixture.scaleId);assert.equal(child.status,'COMPLETED');assert.ok(child.submissionId)
  const frozen=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,prisma),compiled=frozen.compiledRuntime
  assert.deepEqual(frozen.definition,MIXED_SCALE_CONTRACT);assert.equal(frozen.legacyDefinitionHash,fixture.scaleProof.definitionSha256)
  assert.equal(compiled.compiledRuntimeHash,child.compiledRuntimeHash);assert.equal(frozen.instrumentKey,fixture.scaleCode)
  assert.equal(compiled.metricDefinitions.total.unit,'score')
  const measurement={instrumentKey:frozen.instrumentKey,scoreKey:'total',
   scoringDigest:identityHash({scorer:compiled.scorerKey,version:compiled.scorerVersion,definition:frozen.sourceDefinitionHash,runtime:compiled.compiledRuntimeHash}),
   responseSignature:identityHash({items:frozen.definition.items.map(item=>({itemCode:item.itemCode,responseSetKey:item.responseSetKey})),responseSets:frozen.definition.responseSets}),
   respondentType:row.parent.respondentType??'SELF',unit:compiled.metricDefinitions.total.unit,version:frozen.instrumentVersion}
  identities.push(measurement)
  h.write(`c25-analysis-${name.toLowerCase()}-runtime-private.json`,{childId:child.id,frozen,measurement})
 }
 assert.deepEqual(identities[0],identities[1],'Two waves must retain the same exact scientific identity')
 return identities[0]
}

export async function runAnalysisSupplement(h,sourceFixture,EFixture){
 // The coordinator must validate its immutable prerequisite before constructing
 // h. This second single-use guard precedes even lazy application imports.
 const fixtureFile=path.join(h.state,'c25-analysis-fixture-private.json')
 assert.ok(!fs.existsSync(fixtureFile),'Supplement fixture is single-use; do not replay FINAL or export')
 assert.equal(EFixture.teacherId,sourceFixture.actors.teacher.id)
 assert.equal(EFixture.inheritedStudentId,sourceFixture.actors.student.id)
 assert.notEqual(EFixture.actors.student.id,sourceFixture.actors.student.id)
 const {prisma}=await runtime(),actors={teacher:sourceFixture.actors.teacher,M:sourceFixture.actors.student,S:EFixture.actors.student,otherTeacher:sourceFixture.actors.otherTeacher}
 const scale=await prisma.scale.findUniqueOrThrow({where:{id:sourceFixture.resources.scale}})
 const scaleProof=assertScaleContract(scale,{scaleId:sourceFixture.resources.scale,teacherId:actors.teacher.id})
 // The scale's full row and independently checked definition are pinned before
 // authentication, course creation, enrollment or any business write.
 privateJson(path.join(h.state,'c25-analysis-scale-prewrite-private.json'),{scale,scaleProof})
 const baseline={queue:await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),otherJobs:await prisma.compositeReportJob.findMany({orderBy:{id:'asc'}})}
 assert.equal(baseline.otherJobs.length,148);h.write('c25-analysis-report-baseline-private.json',baseline)
 const fixture={schemaVersion:1,scope:'C25_C19_MINIMAL_ANALYSIS_SUPPLEMENT',scaleId:scale.id,scaleCode:scale.code,scaleProof,
  actors:Object.fromEntries(Object.entries(actors).map(([key,value])=>[key,value.id])),courseId:null,products:{},cases:{},issued:[]}
 privateJson(fixtureFile,fixture);const persist=()=>h.write('c25-analysis-fixture-private.json',fixture)
 const clients={}
 for(const [name,identity] of Object.entries(actors)){clients[name]=h.client();await clients[name].login(identity,identity.role)}
 const once=async(label,client,route,body)=>{
  h.remaining();assert.ok(!fixture.issued.includes(label),'No operation may be repeated after issuance');fixture.issued.push(label);persist()
  return client.request(route,'POST',body)
 }
 const course=await once('course',clients.teacher,'/courses',{title:'C25 analysis supplement '+randomUUID()})
 assert.ok(course.id&&course.courseCode);assert.equal(course.courseType,'TRAINING_COURSE');assert.equal(course.status,'PUBLISHED');assert.equal(course.isLibrary,false)
 fixture.courseId=course.id;persist()
 for(const name of ['M','S'])await once('join-'+name,clients[name],'/courses/join',{courseCode:course.courseCode})
 for(const name of ['A','B']){
  let product=await once('product-'+name,clients.teacher,products,{requestId:randomUUID(),name:'C25 analysis supplement '+name,questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false,trainingPersistencePolicy:null})
  if(name==='A')product=await once('form-A',clients.teacher,`${products}/${product.id}/items`,{revision:product.revision,item:screeningForm()})
  product=await once('scale-'+name,clients.teacher,`${products}/${product.id}/items`,{revision:product.revision,item:{type:'SCALE',scaleId:scale.id,required:true}})
  const config=supplementFlow(product,name)
  product=await once('flow-'+name,clients.teacher,`${products}/${product.id}/training-flow`,{revision:product.revision,config})
  assert.deepEqual(product.trainingFlowDraft,config);assert.equal(product.trainingFlowFrozen,null)
  const preflight=await once('preflight-'+name,clients.teacher,`${products}/${product.id}/preflight`,{revision:product.revision});assert.equal(preflight.ok,true)
  product=await once('publish-'+name,clients.teacher,`${products}/${product.id}/publish`,{revision:product.revision})
  assert.match(product.trainingFlowDigest,/^[a-f0-9]{64}$/);assert.equal(product.trainingFlowFrozen.flowDigest,product.trainingFlowDigest)
  assert.equal(product.trainingFlowFrozen.schemaVersion,1)
  const row=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:product.id}})
  assert.equal(row.trainingPersistencePolicy,null);assert.equal(row.publicEnabled,false)
  for(const field of ['trainingVariantDraft','trainingVariantFrozen','trainingVariantDigest','reportPackageKey','analysisProtocolKey'])assert.equal(row[field],null)
  fixture.products[name]=product;persist()
 }
 assert.notEqual(fixture.products.A.id,fixture.products.B.id)
 for(const [name,actor,productName,answer] of [['MA','M','A','full'],['SA','S','A','screen'],['MB','M','B',null]]){
  const client=clients[actor],product=fixture.products[productName]
  let {attempt}=await once('start-'+name,client,`${prefix}/${product.id}/attempts`,{})
  fixture.cases[name]={actorId:actors[actor].id,taskId:product.id,attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,finals:[]};persist()
  assert.equal(attempt.trainingFlow.termination,'PENDING')
  if(answer){
   const body=formFinal(attempt,answer),route=`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`
   assertFinalRoute(route,fixture);fixture.cases[name].finals.push({route,body});persist()
   await once('final-form-'+name,client,route,body)
   attempt=await client.request(`${prefix}/attempts/${attempt.id}`)
  }
  if(name!=='SA'){
   const body=scaleFinal(attempt,name==='MA'?'yes':'no'),route=`${prefix}/attempts/${attempt.id}/items/${attempt.currentItem.id}/scale/submit`
   assertFinalRoute(route,fixture);fixture.cases[name].finals.push({route,body});persist()
   await once('final-scale-'+name,client,route,body)
  }else{
   assert.equal(attempt.currentItem,null);assert.equal(attempt.trainingFlow.termination,'SCREEN_OUT')
   assert.equal(await prisma.assessment.count({where:{compositeAttemptId:attempt.id}}),0,'Screened student must never get a Scale child')
  }
 }
 assert.equal(fixture.issued.filter(name=>name.startsWith('start-')).length,3)
 assert.equal(fixture.issued.filter(name=>name.startsWith('final-')).length,4)
 const ids=['MA','SA','MB'].map(name=>fixture.cases[name].attemptId),before=await readFacts(h,ids)
 h.write('c25-analysis-before-drain-private.json',before)
 const drain=await runAnalysisChild(h,'report',{attempts:before.cases.map(row=>({attemptId:row.parent.id,attemptEpoch:row.parent.attemptEpoch,jobId:row.job.id})),oldJobIds:baseline.otherJobs.map(row=>row.id)})
 const after=await readFacts(h,ids);h.write('c25-analysis-after-drain-private.json',after)
 assertAnalysisDrain({baseline,before,after,fixture})
 for(const name of ['MA','SA','MB']){
  const actor=name==='SA'?'S':'M',attempt=await clients[actor].request(`${prefix}/attempts/${fixture.cases[name].attemptId}`)
  assert.equal(attempt.status,'COMPLETED');assert.equal(attempt.currentItem,null)
  assert.equal(attempt.trainingFlow.termination,name==='SA'?'SCREEN_OUT':'COMPLETE')
 }
 h.check('Two new publications and three attempts accepted exactly four FINALs; the three original jobs were drained once with all 148 old jobs locked and retained')
 const measurement=await acceptedMeasurement(h,after,fixture),sources=await clients.teacher.request(`/courses/${course.id}/training-analysis/sources`)
 const selector=buildSelector(sources,fixture),route=`/courses/${course.id}/training-analysis`
 const analyzed=await clients.teacher.request(route,'POST',{selector})
 h.write('c25-analysis-http-payload-private.json',{sources,selector,analyzed,measurement})
 const {assertSuppressedAnalysis}=await import('./c25-analysis-oracle.mjs')
 const suppression=assertSuppressedAnalysis(analyzed,{selector,measurement})
 await clients.otherTeacher.request(route,'POST',{selector},404)
 await clients.M.request(route,'POST',{selector},403)
 h.check('Actual HTTP small-cohort analysis suppresses every statistics/count domain while both waves retain equal nonempty scientific identities')
 const expected={measurement,actors:{M:actors.M.id,S:actors.S.id},attempts:Object.fromEntries(['MA','MB','SA'].map(name=>[name,{attemptId:fixture.cases[name].attemptId,attemptEpoch:fixture.cases[name].attemptEpoch}]))}
 const exportEvidence=await processOneAnalysisExport(h,{teacher:clients.teacher,otherTeacher:clients.otherTeacher,courseId:course.id,selector,analyzed,expected})
 // Protect all new accepted parents/snapshots and the old global report baseline
 // across analysis and export; these consumer reads must not rewrite FINALs.
 const consumersAfter=await readFacts(h,ids);h.write('c25-analysis-after-consumers-private.json',consumersAfter)
 assert.deepEqual(consumersAfter,after)
 assert.deepEqual(await prisma.scale.findUniqueOrThrow({where:{id:scale.id}}),scale)
 h.check('One actual queued long CSV download is verified cell-by-cell for 1, 0, NOT_ASSIGNED and NO_OBSERVATION; exact non-owner and student denials hold')
 const summary={schemaVersion:1,scope:fixture.scope,courseId:course.id,publications:2,attempts:3,finals:4,acceptedSnapshots:4,
  reportChild:{file:drain.file,sha256:drain.sha256},suppression,export:exportEvidence,noCheckpointCreated:true,
  originalScaleUnchanged:true,newAcceptedFactsUnchangedAcrossConsumers:true}
 h.write('c25-analysis-summary-private.json',summary);h.result.analysisSupplement=summary
 return {fixture,selector,analyzed,exportEvidence,summary}
}
