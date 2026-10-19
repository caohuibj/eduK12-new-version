/** Bounded resource-only chains: one serial + two concurrent Form/Scale V2
 * publications, then one existing four-tool publication (120 synthetic trials).
 * Maximum ten new FINALs. This is neither functional requalification nor load,
 * browser/human timing simulation. Durable private progress never replays a FINAL.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,PrismaClient,require,backend,products,prefix,sha,candidateProof,cognitiveFinal,readCognitiveQuota,pause} from './c20-materials-client.mjs'
import {form,formRows,formBody,unitKey,draftFour,mainConfig} from './c20-materials-fixture.mjs'
import {minimalConfig,sameIds} from './c20-efficiency-probes-precheck.mjs'
import {createEfficiencyObserver} from './c20-efficiency-observer.mjs'
const h=harness('efficiency-chains'),journalName='c20-efficiency-chains-progress-private.json'
assert.equal(h.status.efficiencyPhase,'before','New chains run once in the before resource phase only')
const exists=fs.existsSync(path.join(h.state,journalName));assert.ok(!exists||process.argv.includes('--resume'),'Existing chain journal requires explicit --resume')
const journal=exists?h.read(journalName):{schemaVersion:1,phase:'before',scope:'NEW_RESOURCE_FIXTURES_ONLY; ORIGINAL_51_NEVER_RESUBMITTED',operations:{},cases:[],newCourseId:randomUUID(),startedAt:new Date().toISOString(),maximumNewFinals:10}
assert.equal(journal.schemaVersion,1);assert.equal(journal.maximumNewFinals,10)
const save=()=>h.write(journalName,journal)
let observer,error,oldHash,oldIds
const {claimCompositeReportJob}=require(path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))
const {processCompositeReportJob}=require(path.join(backend,'dist/workers/compositeReportWorker.js'))
const {assertSjtCourseGrants}=require(path.join(backend,'dist/modules/situational/authoring/grants.js'))
const {isCognitiveNewAdmissionEnabled}=require(path.join(backend,'dist/modules/cognitive/product-eligibility.js'))
const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
async function operation(key,fn){
 const prior=journal.operations[key]
 if(prior?.status==='RECEIVED')return prior.value
 assert.ok(!prior,`Uncertain operation ${key}; inspect original HTTP journal and exact target before continuation`)
 journal.operations[key]={status:'ISSUED',at:new Date().toISOString()};save()
 const value=await fn();journal.operations[key]={...journal.operations[key],status:'RECEIVED',value,receivedAt:new Date().toISOString()};save();return value
}
async function oldAcceptedHash(){
 const parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:oldIds}},orderBy:{id:'asc'}}),snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:{in:oldIds}},orderBy:{id:'asc'}}),jobs=await prisma.compositeReportJob.findMany({where:{attemptId:{in:oldIds}},orderBy:{id:'asc'}})
 assert.equal(parents.length,102);assert.equal(snapshots.length,204);assert.equal(jobs.length,102)
 const scales=await prisma.assessment.findMany({where:{compositeAttemptId:{in:oldIds}},orderBy:{id:'asc'}}),facts=await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:scales.map(row=>row.id)}},orderBy:[{assessmentId:'asc'},{attemptEpoch:'asc'}]}),answers=await prisma.compositeFormAnswer.findMany({where:{attemptId:{in:oldIds}},orderBy:{id:'asc'}})
 return sha(JSON.stringify({parents,snapshots,jobs,scales,facts,answers}))
}
async function actorFor(item,fixture){
 if(!item.user){item.user={id:randomUUID(),username:'c20-efficiency-'+item.name+'-'+randomUUID(),role:'STUDENT',password:fixture.password};save()}
 const user=item.user,old=await prisma.user.findUnique({where:{id:user.id}})
 if(old){assert.equal(old.username,user.username);assert.equal(old.role,'STUDENT');assert.equal(old.accountDomain,'TRAINING')}
 else{const source=await prisma.user.findUniqueOrThrow({where:{id:fixture.users.student.id}});await prisma.user.create({data:{id:user.id,username:user.username,passwordHash:source.passwordHash,role:'STUDENT',accountDomain:'TRAINING',mustChangePassword:false}})}
 const membership=await prisma.courseStudent.findFirst({where:{courseId:item.courseId,studentId:user.id}})
 if(membership)assert.equal(membership.status,'ACTIVE');else await prisma.courseStudent.create({data:{courseId:item.courseId,studentId:user.id,status:'ACTIVE'}})
 const client=h.client();await client.login(user,'STUDENT');return client
}
async function teacherClient(fixture){const client=h.client();await client.login(fixture.users.teacher,'TEACHER');return client}
async function prepareMinimal(item,teacher,fixture){
 item.createRequestId??=randomUUID();save()
 let product=await operation(item.name+'.create',()=>teacher.request(products,'POST',{requestId:item.createRequestId,name:'C20 resource-only '+item.name,questionnaireType:'COURSE',courseIds:[item.courseId],publicEnabled:false}))
 product=await operation(item.name+'.form',()=>teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:form('efficiency_form')}))
 product=await operation(item.name+'.scale',()=>teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:{type:'SCALE',scaleId:fixture.scaleId,required:true}}))
 const config=minimalConfig(product,unitKey,formRows);trainingFlowSchema.parse({revision:product.revision,config,maxAttempts:1})
 product=await operation(item.name+'.flow',()=>teacher.request(`${products}/${product.id}/training-flow`,'POST',{revision:product.revision,config,maxAttempts:1}))
 assert.deepEqual(product.trainingFlowDraft,config)
 const preflight=await operation(item.name+'.preflight',()=>teacher.request(`${products}/${product.id}/preflight`,'POST',{revision:product.revision}));assert.equal(preflight.ok,true,JSON.stringify(preflight))
 item.product=journal.operations[item.name+'.publish']?.value??product;save()
}
async function decideFourToolSource(fixture){
 if(journal.fourToolSource)return
 const [clock]=await prisma.$queryRawUnsafe('SELECT CURRENT_TIMESTAMP AS now')
 const product=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:fixture.product.id}}),grant=await prisma.sjtReleaseGrant.findUniqueOrThrow({where:{id:fixture.grant.id}})
 const now=new Date(clock.now),minimumUntil=new Date(now.getTime()+180000)
 const existingUsable=product.status==='PUBLISHED'&&(!product.expiresAt||product.expiresAt>minimumUntil)&&grant.status==='ACTIVE'&&grant.validFrom<=now&&grant.expiresAt>minimumUntil
 journal.fourToolSource={mode:existingUsable?'EXISTING_PUBLICATION':'NEW_RESOURCE_ONLY_PUBLICATION',checkedDatabaseTime:now.toISOString(),minimumAdmissionRunwaySeconds:180,sourceProductId:product.id,sourceGrantId:grant.id,sourceProductExpiresAt:product.expiresAt?.toISOString()??null,sourceGrantExpiresAt:grant.expiresAt.toISOString(),sourceGrantStatus:grant.status,sourceFrozenFlowHash:sha(JSON.stringify(product.trainingFlowFrozen)),originalPublicationAndGrantHash:sha(JSON.stringify({product,grant})),courseId:existingUsable?fixture.courseId:journal.newCourseId}
 if(!existingUsable)journal.fourToolSource.newGrantBody={instrumentKey:fixture.sjt.release.instrumentKey,instrumentVersion:fixture.sjt.release.instrumentVersion,definitionHash:fixture.sjt.release.definitionHash,contentDigest:fixture.sjt.release.contentDigest,granteeTeacherId:fixture.users.teacher.id,courseId:journal.newCourseId,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(now.getTime()-60000).toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString(),note:'C20 bounded resource-only four-tool probe; fresh course scope; original grant and quotas unchanged'}
 save()
}
async function prepareFourFallback(item,fixture){
 const admin=h.client();await admin.login(fixture.users.admin,'ADMIN')
 const grant=await operation('fourtool.new_grant',()=>admin.request(`/situational/authoring/releases/${fixture.sjt.release.id}/grants`,'POST',journal.fourToolSource.newGrantBody));assert.notEqual(grant.id,fixture.grant.id);assert.equal(grant.courseId,item.courseId)
 journal.fourToolSource.newGrantId=grant.id;save()
 let index=0
 const author={request:(...args)=>operation('fourtool.authoring.'+(++index),()=>item.teacher.request(...args))}
 const resourceFixture={...fixture,courseId:item.courseId}
 let product=await draftFour(author,resourceFixture,'C20 new resource-only four-tool expiry fallback')
 // Questionnaire products explicitly admit teacher-owned Cognitive sources;
 // quota still points at the same original assignment, never a fresh allowance.
 assert.equal(product.productKind,'QUESTIONNAIRE')
 const config=mainConfig(product);trainingFlowSchema.parse({revision:product.revision,config,maxAttempts:100})
 product=await operation('fourtool.flow',()=>item.teacher.request(`${products}/${product.id}/training-flow`,'POST',{revision:product.revision,config,maxAttempts:100}));assert.deepEqual(product.trainingFlowDraft,config)
 const preflight=await operation('fourtool.preflight',()=>item.teacher.request(`${products}/${product.id}/preflight`,'POST',{revision:product.revision}));assert.equal(preflight.ok,true,JSON.stringify(preflight))
 item.product=journal.operations['fourtool.publish']?.value??product
 journal.fourToolSource.equivalentContent={scaleId:fixture.scaleId,cognitiveAssignmentId:fixture.assignmentId,sjtReleaseId:fixture.sjt.release.id,sjtDefinitionHash:fixture.sjt.release.definitionHash,formLabels:formRows(product).map(row=>row.formLabel),flowConfigHash:sha(JSON.stringify(config)),nativeQuotaSourcePreserved:true,newCourseAndPublication:true};save()
}
async function quotaCheck(item,fixture){
 const product=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:item.product.id}}),course=await prisma.course.findUniqueOrThrow({where:{id:item.courseId}})
 assert.equal(course.courseType,'TRAINING_COURSE');assert.equal(course.creatorId,fixture.users.teacher.id);assert.equal(course.isLibrary,false)
 assert.equal(product.createdBy,fixture.users.teacher.id);assert.equal(product.status,'PUBLISHED');assert.ok(product.maxAttempts>=1);if(product.expiresAt)assert.ok(product.expiresAt>new Date(),'Publication has expired; do not extend it silently')
 const used=await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:product.id,userId:item.user.id}});assert.ok(used<product.maxAttempts,'Existing per-actor attempt cap must have real remaining capacity')
 const frozen=product.trainingFlowFrozen;assert.equal(frozen.schemaVersion,2)
 const buckets=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id,configDigest:product.trainingFlowDigest}}),limits=frozen.quotaPolicy?.groupLimits
 assert.ok(limits);let remaining=0
 for(const [group,cap]of Object.entries(limits)){const bucket=buckets.filter(row=>row.groupKey===group);assert.ok(bucket.length<=1);if(bucket[0])assert.equal(bucket[0].maxAssigned,cap);remaining+=cap-(bucket[0]?.assignedCount??0)}
 assert.ok(remaining>=1,'Material quota exhausted; do not change cap')
 const admission={at:new Date().toISOString(),productMaxAttempts:product.maxAttempts,actorUsedAttempts:used,materialRemaining:remaining,materialBuckets: buckets.map(row=>({groupKey:row.groupKey,maxAssigned:row.maxAssigned,assignedCount:row.assignedCount}))}
 if(item.name==='fourtool'){
  if(journal.fourToolSource.mode==='EXISTING_PUBLICATION')assert.equal(product.id,'e1dd022f-b3aa-4616-aa74-94c86f1d9989');else assert.notEqual(product.id,fixture.product.id);assert.equal(product.maxAttempts,100);assert.deepEqual(limits,{a:100,b:100});assert.equal(isCognitiveNewAdmissionEnabled(),true)
  const quota=await readCognitiveQuota(prisma,item.user.id,fixture.assignmentId);assert.ok(quota.remainingAttempts>=1&&!quota.admissionPaused);admission.nativeCognitiveQuota=quota
  const release=await prisma.sjtAuthorRelease.findUniqueOrThrow({where:{id:fixture.sjt.release.id}})
  const grants=await assertSjtCourseGrants(prisma,[release],{teacherId:fixture.users.teacher.id,courseId:item.courseId,purpose:'TRAINING_COURSE'},'DISTRIBUTE')
  assert.ok(grants.get(release.id));admission.exactSjtGrantVerified=true
 }
 item.admission=admission;save()
}
async function apiSqlCount(){const response=await fetch(h.status.apiUrl+'/metrics',{signal:AbortSignal.timeout(8000)});assert.equal(response.status,200);const body=await response.text(),match=body.match(/^ptool_prisma_sql_events_total (\d+)$/m);assert.ok(match,'API SQL observability must remain enabled');return Number(match[1])}
async function measuredGroup(label,group,fn,actualCaller='api'){
 const beforeSql=await apiSqlCount(),before=h.result.requests.length,result=await observer.measure(label,()=>Promise.all(group.map(fn)),{actualCaller,concurrency:group.length,chains:group.map(item=>item.name),scope:'RESOURCE_ONLY',aggregateSqlRule:'OUTER_WINDOW_ONLY; NEVER_SUM_OVERLAPPING_HTTP_SQL'})
 const afterSql=await apiSqlCount();assert.ok(afterSql>=beforeSql)
 const requests=h.result.requests.slice(before);h.result.requestWindows??=[];h.result.requestWindows.push({label,requestCount:requests.length,responseBytes:requests.reduce((sum,row)=>sum+row.bytes,0),individualLatenciesMs:requests.map(row=>row.elapsedMs),individualStatuses:requests.map(row=>row.status),apiSqlEventsSummed:false,outerApiSqlEvents:afterSql-beforeSql,outerApiSqlScope:'SINGLE_PROCESS_WIDE_OUTER_COUNTER_WINDOW_INCLUDING_OBSERVER_SETTLE; NOT_PER_REQUEST_ATTRIBUTION',instrumentationMetricReads:2+2*requests.length})
 return result
}
async function originalOutboxDrain(group){
 const allowed=group.map(item=>item.attempt.id),parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:allowed}}}),epochById=new Map(parents.map(row=>[row.id,row.attemptEpoch]))
 sameIds(parents.map(row=>row.id),allowed)
 const jobs=await prisma.compositeReportJob.findMany({where:{attemptId:{in:allowed}}});assert.equal(jobs.length,allowed.length)
 for(const job of jobs){assert.equal(job.attemptEpoch,epochById.get(job.attemptId));assert.ok(['PENDING','READY'].includes(job.status),'Do not reset or reclaim uncertain outboxes')}
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('application_name','c20_efficiency_original_outboxes')
 const gate=new PrismaClient({datasources:{db:{url:url.toString()}}});let release,arrived,rejectReady
 const hold=new Promise(resolve=>release=resolve),ready=new Promise((resolve,reject)=>{arrived=resolve;rejectReady=reject})
 const transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE NOT (attempt_id=ANY($1::text[])) FOR UPDATE',allowed);arrived();await hold},{maxWait:10000,timeout:120000});transaction.catch(rejectReady)
 const processed=[]
 try{await ready;for(const target of jobs){if(target.status==='READY')continue;const job=await claimCompositeReportJob();assert.ok(job&&allowed.includes(job.attemptId));assert.equal(job.attemptEpoch,epochById.get(job.attemptId));await processCompositeReportJob(job);const final=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(final.status,'READY');assert.equal(final.attemptCount,1);processed.push({jobId:job.id,attemptId:job.attemptId,attemptEpoch:job.attemptEpoch})}
 for(const item of group){const epoch=epochById.get(item.attempt.id),job=await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:item.attempt.id,attemptEpoch:epoch}}});assert.equal(job.status,'READY');item.outbox={id:job.id,attemptEpoch:epoch,attemptCount:job.attemptCount,status:job.status}}save();return processed
 }finally{release();await transaction;await gate.$disconnect()}
}
async function prepareFinal(item,type,fixture){
 const key=item.name+'.final.'+type,prior=journal.operations[key]
 if(prior){
  const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:item.attempt.id,attemptEpoch:prior.body.attemptEpoch,sourceSubmissionId:prior.body.submissionId}})
  if(snapshots.length===1){assert.equal(snapshots[0].unitType,type);prior.status='ACCEPTED';prior.snapshotId=snapshots[0].id;save();return null}
  assert.equal(snapshots.length,0);assert.equal(prior.status,'PREPARED','Uncertain FINAL has no confirmed snapshot; never auto-resubmit')
  return prior
 }
 const attempt=item.attempt,unit=attempt.currentItem;assert.equal(unit.type,type)
 let route,body
 if(type==='FORM_SECTION'){route=`${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`;body=formBody(attempt)}
 else if(type==='SCALE'){route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/scale/submit`;body={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:17}]}}
 else if(type==='COGNITIVE'){assert.equal(unit.cognitiveSession.config.totalTrials,120);route=`/cognitive/sessions/${unit.cognitiveSession.sessionId}/submit`;body=cognitiveFinal(unit.cognitiveSession)}
 else{route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`;const runtime=await item.client.request(route);assert.equal(runtime.instrument.online.responseProtocol,'sjt-online-response-v1');body={submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses};route+='/submit'}
 journal.operations[key]={status:'PREPARED',route,body,type,attemptId:attempt.id};save();return journal.operations[key]
}
async function runGroup(label,group,fixture,shouldPublish){
 if(shouldPublish){
  const pending=group.filter(item=>journal.operations[item.name+'.publish']?.status!=='RECEIVED')
  if(pending.length)await measuredGroup(label+'.publish',pending,async item=>{item.product=await operation(item.name+'.publish',()=>item.teacher.request(`${products}/${item.product.id}/publish`,'POST',{revision:item.product.revision}));save()})
  for(const item of group){item.product=journal.operations[item.name+'.publish'].value;assert.equal(item.product.trainingFlowFrozen.schemaVersion,2)}
 }
 const pendingStarts=group.filter(item=>!item.attempt)
 for(const item of pendingStarts)await quotaCheck(item,fixture)
 if(pendingStarts.length)await measuredGroup(label+'.new_admission',pendingStarts,async item=>{const result=await operation(item.name+'.start',()=>item.client.request(`${prefix}/${item.product.id}/attempts`,'POST',{}));item.attempt=result.attempt;save()})
 for(const item of group){const proof=await candidateProof(item.attempt.id);if(item.initialStable)assert.deepEqual(proof.stable,item.initialStable);else item.initialStable=proof.stable;save()}
 await measuredGroup(label+'.state_initial',group,async item=>{item.attempt=await item.client.request(`${prefix}/attempts/${item.attempt.id}`);save()})
 const types=label==='fourtool'?['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']:['FORM_SECTION','SCALE']
 for(const type of types){
  const prepared=[]
  for(const item of group){const op=await prepareFinal(item,type,fixture);if(op)prepared.push({item,op})}
  if(prepared.length)await measuredGroup(label+'.FINAL_'+type,prepared.map(row=>row.item),async item=>{const op=prepared.find(row=>row.item===item).op;op.status='ISSUED';op.issuedAt=new Date().toISOString();save();const response=await item.client.request(op.route,'POST',op.body);assert.notEqual(response.replayed,true,'Resource FINAL must be a new acceptance');op.status='RECEIVED';op.response=response;op.receivedAt=new Date().toISOString();save()})
  for(const item of group){const op=journal.operations[item.name+'.final.'+type];const snapshot=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:item.attempt.id,attemptEpoch:op.body.attemptEpoch,sourceSubmissionId:op.body.submissionId}});assert.equal(snapshot.length,1);assert.equal(snapshot[0].unitType,type);op.status='ACCEPTED';op.snapshotId=snapshot[0].id;save()}
  // This real onReload GET may advance the parent after the last Form FINAL.
  await measuredGroup(label+'.state_after_'+type,group,async item=>{item.attempt=await item.client.request(`${prefix}/attempts/${item.attempt.id}`);save()})
 }
 for(const item of group){assert.equal(item.attempt.allUnitsSubmitted,true);const proof=await candidateProof(item.attempt.id);assert.deepEqual(proof.stable,item.initialStable);assert.equal(proof.proof.path.termination,'COMPLETE')}
 await observer.measure(label+'.original_outbox_drain',()=>originalOutboxDrain(group),{actualCaller:'report_worker_in_producer',concurrency:1,chains:group.map(item=>item.name),workerConcurrency:1,admissionConcurrency:group.length,isolationOverhead:'INCLUDES_TEST_ONLY_NON_TARGET_OUTBOX_ROW_LOCK_GATE_SETUP_AND_RELEASE; RAW_TOTAL_NOT_PURE_WORKER_COST'})
 const reports=await measuredGroup(label+'.READY_report_GET',group,item=>item.teacher.request(`${prefix}/${item.product.id}/attempts/${item.attempt.id}/report`))
 for(let index=0;index<group.length;index++){const item=group[index],proof=await candidateProof(item.attempt.id);assert.deepEqual(proof.stable,item.initialStable);assert.equal(proof.row.status,'COMPLETED');assert.equal(reports[index].trainingFlow.pathHash,proof.row.trainingFlowPathHash);item.complete=true;save()}
}
try{
 assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1')
 assert.equal(sha(fs.readFileSync(path.join(h.state,'c20-fixture-private.json'))),'15048b4dc11abc65d8d6be90918454dfeddac58eff3829c6aa376c7e20781b03')
 const fixture=h.read('c20-fixture-private.json'),cost=h.read('c20-consumer-cost-fixture-private.json');oldIds=cost.people.flatMap(person=>person.attempts.map(item=>item.attemptId));oldHash=await oldAcceptedHash()
 if(journal.originalAcceptedStateSha256)assert.equal(oldHash,journal.originalAcceptedStateSha256);else journal.originalAcceptedStateSha256=oldHash
 const originalCourse=await prisma.course.findUniqueOrThrow({where:{id:fixture.courseId}});assert.equal(originalCourse.courseType,'TRAINING_COURSE');assert.equal(originalCourse.creatorId,fixture.users.teacher.id)
 let course=await prisma.course.findUnique({where:{id:journal.newCourseId}})
 if(!course)course=await prisma.course.create({data:{id:journal.newCourseId,creatorId:fixture.users.teacher.id,title:'C20 isolated resource-only minimal chains',courseCode:'C20-EFF-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 assert.equal(course.courseType,'TRAINING_COURSE');assert.equal(course.creatorId,fixture.users.teacher.id)
 await decideFourToolSource(fixture)
 if(!journal.cases.length){journal.cases=['serial','parallel_a','parallel_b','fourtool'].map(name=>({name,courseId:name==='fourtool'?journal.fourToolSource.courseId:course.id}));save()}
 assert.deepEqual(journal.cases.map(item=>item.name),['serial','parallel_a','parallel_b','fourtool'])
 // Runtime-only clients stay off the serialized progress journal.
 const live=[...journal.cases]
 for(let index=0;index<live.length;index++){
  const state=journal.cases[index]
  // Persist each assignment to the backing journal object, excluding clients.
  live[index]=new Proxy(state,{set(target,key,value){if(key==='client'||key==='teacher'){Object.defineProperty(target,key,{value,writable:true,enumerable:false,configurable:true});return true}target[key]=value;return true}})
  live[index].client=await actorFor(live[index],fixture);live[index].teacher=await teacherClient(fixture)
  if(state.name==='fourtool'){if(journal.fourToolSource.mode==='NEW_RESOURCE_ONLY_PUBLICATION')await prepareFourFallback(live[index],fixture);else{state.product=await live[index].teacher.request(`${products}/${fixture.product.id}`);assert.equal(state.product.id,'e1dd022f-b3aa-4616-aa74-94c86f1d9989')}}
  else await prepareMinimal(live[index],live[index].teacher,fixture)
 }
 observer=await createEfficiencyObserver({state:h.state,status:h.status,result:h.result})
 if(!live[0].complete)await runGroup('serial',[live[0]],fixture,true)
 if(!live[1].complete||!live[2].complete)await runGroup('parallel',live.slice(1,3),fixture,true)
 if(!live[3].complete)await runGroup('fourtool',[live[3]],fixture,journal.fourToolSource.mode==='NEW_RESOURCE_ONLY_PUBLICATION')
 const newIds=live.map(item=>item.attempt.id),newFacts=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:{in:newIds}}});assert.equal(newFacts.length,10);assert.equal(new Set(newFacts.map(row=>row.sourceSubmissionId)).size,10)
 assert.ok(live.every(item=>item.complete));assert.equal(await oldAcceptedHash(),oldHash)
 const originalProduct=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:fixture.product.id}}),originalGrant=await prisma.sjtReleaseGrant.findUniqueOrThrow({where:{id:fixture.grant.id}});assert.equal(sha(JSON.stringify({product:originalProduct,grant:originalGrant})),journal.fourToolSource.originalPublicationAndGrantHash,'Original publication/grant changed')
 h.result.fourToolSourceMode=journal.fourToolSource.mode;h.result.fourToolSourceDifference=journal.fourToolSource.mode==='EXISTING_PUBLICATION'?'Original publication and course':'Fresh resource-only course/publication/grant; same native Scale, Cognitive quota source and exact SJT release; not original publication latency comparison';h.result.originalAcceptedStatePreserved=true;h.result.originalAcceptedStateSha256=oldHash;h.result.resourceOnly=true;h.result.capacityQualification=false;h.result.syntheticCognitiveTrials=120;h.result.newAcceptedFinals=10;h.result.newParents=4;h.result.originalOutboxesProcessed=live.map(item=>item.outbox)
 await observer.measure('post_drain_memory_0_30s',()=>pause(30000),{actualCaller:'idle',concurrency:1,scheduledDelaySeconds:30,relativeTo:'AFTER_FINAL_DRAIN_AND_READY_REPORT_READS'})
 await observer.measure('post_drain_memory_30_60s',()=>pause(30000),{actualCaller:'idle',concurrency:1,scheduledDelaySeconds:30,relativeTo:'AFTER_FIRST_IDLE_WINDOW_AND_OBSERVER_SETTLE'})
 journal.passed=true;save();h.result.passed=true
}catch(e){error=e;throw e}finally{
 try{if(oldIds&&oldHash)assert.equal(await oldAcceptedHash(),oldHash);if(observer)await observer.close()}catch(e){error=e;h.result.passed=false;throw e}finally{if(error){journal.error={name:error.name,message:error.message};journal.passed=false;save()}await h.finish(error)}
}
