import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {afterAll,describe,expect,it} from 'vitest'
const suite=process.env.PR356_RECEIPT_RECOVERY_ISOLATED==='1'?describe:describe.skip
suite('accepted STANDARD whole receipt actual report-worker recovery',()=>{
 let db:any,server:Server
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 async function finish(prior:any,expired:any,input:any,studentId:string,scaleIds:string[],itemIds:string[]){
  const id=prior.attemptId,outbox=await import('../../modules/assessment-runtime/report-outbox.service'),whole=await import('../../modules/composite/whole-questionnaire.service')
  const guard=(await import('../../modules/scale/scale-collection-guard')).assertTrainingScaleCollectionAllowed
  await expect(db.$transaction((tx:any)=>guard(tx,scaleIds,{compositeAttemptId:id,compositeItemIds:itemIds,acceptedReceipt:{submissionId:input.submissionId,payloadHash:prior.wholePayloadHash,acceptedAtMs:prior.wholeAcceptedAt.getTime(),leaseToken:expired!.leaseToken!}}))).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
  process.env.ASSESSMENT_REPORT_LEASE_MS='60000';const job=await outbox.claimCompositeReportJob();expect(job?.id).toBe(prior.id);expect(job!.leaseToken).not.toBe(expired!.leaseToken)
  await expect(whole.processWholeQuestionnaireAnswers({...job!,wholePayloadHash:'f'.repeat(64)})).rejects.toThrow('封存内容无法验证')
  await (await import('../../workers/compositeReportWorker')).processCompositeReportJob(job!)
  const ready=await db.compositeReportJob.findUniqueOrThrow({where:{id:prior.id}})
  expect(ready.status,ready.lastError??'worker terminal state').toBe('READY')
  expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}})).status).toBe('COMPLETED')
  expect(ready.wholePayloadHash).toBe(prior.wholePayloadHash);expect(ready.wholeAnswersEncrypted).toBe(prior.wholeAnswersEncrypted);expect(ready.reportEncrypted).toBeTruthy()
  const stored=await (await import('./dot356-standard-vertical-storage.fixture')).verifyDot356StoredFinal(db,id)
  expect(await db.assessmentResultFact.count({where:{assessment:{compositeAttemptId:id}}})).toBe(stored.safe.finalFactCount)
  expect(await whole.submitWholeQuestionnaire(id,input,{userId:studentId})).toMatchObject({replayed:true,payloadHash:prior.wholePayloadHash})
  expect(await db.assessmentResultFact.count({where:{assessment:{compositeAttemptId:id}}})).toBe(stored.safe.finalFactCount)
 }
 it('recovers an expired real lease and completes parent/report after withdrawal without losing the accepted envelope',async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_receipt_recovery_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Dedicated schema-only synthetic receipt DB required')
  db=(await import('../../config/database')).prisma
  if(process.env.PR356_RECEIPT_WORKER_CONTINUE==='1'||process.env.PR356_RECEIPT_VERIFY_ONLY==='1'){
   if(await db.user.count()!==4||await db.scale.count()!==1)throw new Error('Retained synthetic four-user receipt fixture required')
   const prior=await db.compositeReportJob.findFirstOrThrow({where:{wholeSubmissionId:{not:null},status:process.env.PR356_RECEIPT_VERIFY_ONLY==='1'?'READY':'PROCESSING'}})
   if(process.env.PR356_RECEIPT_VERIFY_ONLY!=='1')expect(prior.leaseExpiresAt.getTime()).toBeLessThan(Date.now())
   const {decryptUnifiedRuntimePayload}=await import('../../modules/assessment-runtime/security'),{unpackWholeRawEnvelope}=await import('../../modules/assessment-runtime/compact-raw')
   const envelope:any=unpackWholeRawEnvelope(decryptUnifiedRuntimePayload(prior.wholeAnswersEncrypted))
   const children=await db.assessment.findMany({where:{compositeAttemptId:prior.attemptId},select:{scaleId:true,compositeItemId:true}})
   const input={submissionId:prior.wholeSubmissionId,attemptEpoch:prior.attemptEpoch,slotSetHash:prior.slotSetHash,contextSnapshotHash:prior.contextHash,units:envelope.units.map((unit:any)=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:unit.answers,...(unit.itemTimings?{itemTimings:unit.itemTimings}:{})}))}
   process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED='true'
   if(process.env.PR356_RECEIPT_VERIFY_ONLY==='1'){
    // The retained worker already reached READY. Only verify the previously
    // mis-specified storage assertion and FINAL replay; never rerun that worker.
    const stored=await (await import('./dot356-standard-vertical-storage.fixture')).verifyDot356StoredFinal(db,prior.attemptId)
    expect(prior.reportEncrypted).toBeTruthy()
    const [source]=await db.$queryRaw`SELECT state FROM survey_standard_releases`;expect(source.state).toBe('WITHDRAWN')
    expect(await db.$queryRaw`SELECT target_id FROM scale_library_emergency_stops WHERE target_kind='TRAINING_SCALE'`).toHaveLength(1)
    const before=await db.assessmentResultFact.count({where:{assessment:{compositeAttemptId:prior.attemptId}}})
    expect(before).toBe(stored.safe.finalFactCount)
    expect(await (await import('../../modules/composite/whole-questionnaire.service')).submitWholeQuestionnaire(prior.attemptId,input,{userId:envelope.units[0].userId})).toMatchObject({replayed:true,payloadHash:prior.wholePayloadHash})
    expect(await db.assessmentResultFact.count({where:{assessment:{compositeAttemptId:prior.attemptId}}})).toBe(before)
    return
   }
   await finish(prior,prior,input,envelope.units[0].userId,children.map((c:any)=>c.scaleId),children.map((c:any)=>c.compositeItemId))
   return
  }
  if(await db.user.count()||await db.scale.count())throw new Error('Fresh schema-only synthetic fixture required')
  const create=(name:string,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'receipt-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC ONLY',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER'}})
  const system=await create('system','STUDENT','SYSTEM_ADMIN'),issuer=await create('issuer'),teacher=await create('teacher','TEACHER'),student=await create('student')
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:issuer.id,entry:'TRAINING',grantedBy:system.id}})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const token=(await import('../../utils/jwt')).generateToken,proof={adminSessionId:randomUUID(),adminVerifiedAt:Math.floor(Date.now()/1000)}
  const call=async(user:any,path:string,input?:unknown)=>{
   const jwt=token({userId:user.id,username:user.username,role:user.role,accountDomain:'TRAINING',tokenVersion:user.tokenVersion,...proof})
   const r=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{Cookie:'ptool_session='+jwt+'; ptool_csrf=receipt-test','X-CSRF-Token':'receipt-test',Origin:'http://localhost:5173','Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})
   const body:any=await r.json();expect(r.status,body.message??path).toBe(200);return body.data
  }
  const key='academic_self_concept_biology_zh_cn',version='1.0.0',registry=await import('../../modules/scale/onboarding/instrument-registry')
  const source=registry.getScaleInstrumentSource(key,version)!,runtime=registry.getScaleInstrumentRuntimePolicy(key,version)!
  const installed=await (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}})
  const pub=await import('../../modules/scale/onboarding/publish'),publication={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]}
  const plan=await pub.planStandardScalePublication(db,publication);expect(plan.blockers).toEqual([]);await pub.publishStandardScale(db,{...publication,expectedProofHash:plan.proofHash})
  const standard=await import('../../modules/survey/standard-triplet.service'),parts=(await import('../../modules/survey/standard-triplet.model')).sourceParts(key,version)
  const selection={toolKey:key,...Object.fromEntries(parts.map(p=>[p.axis,p.hash]))} as any,preview=await standard.previewStandardTriplet(db,system.id,selection)
  const online=await standard.approveStandardTriplet(system.id,{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,reason:'Synthetic receipt worker recovery',allowedProducts:['TRAINING']})
  expect(online.state,online.blockers.join()).toBe('ONLINE')
  const pointer={releaseId:online.id,combinationHash:online.combinationHash}
  await (await import('../../modules/measurement-content/standard-combination-use')).grantTrainingStandardCombinationUse(issuer.id,online.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash})
  const course=await db.course.create({data:{creatorId:teacher.id,title:'Synthetic receipt recovery',courseType:'TRAINING_COURSE',courseCode:randomUUID(),status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
  let q=await call(teacher,'/api/questionnaire-products',{requestId:randomUUID(),name:'Receipt worker synthetic',questionnaireType:'COURSE',courseIds:[course.id]})
  q=await call(teacher,`/api/questionnaire-products/${q.id}/items`,{revision:q.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  q=await call(teacher,`/api/questionnaire-products/${q.id}/items`,{revision:q.revision,item:{type:'SCALE',scaleId:installed.scaleId,required:true,standardCombination:pointer}})
  q=await call(teacher,`/api/questionnaire-products/${q.id}/publish`,{revision:q.revision})
  process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='true';process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED='true'
  const started=await call(student,`/api/composite-assessments/${q.id}/attempts`,{}),id=started.attempt.id,path=`/api/composite-assessments/attempts/${id}`
  let state=await call(student,path);const section=state.currentItem
  await call(student,`${path}/form-sections/${section.id}/submit`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))})
  state=await call(student,path);expect(state.currentItem.type).toBe('SCALE')
  const whole=await import('../../modules/composite/whole-questionnaire.service'),definition=await whole.getWholeQuestionnaireDefinition(id,{userId:student.id})
  const answers=source.executable!.definition.items.map(i=>({itemCode:i.itemCode,responseValue:'3'})),input={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers}))}
  const ack=await whole.submitWholeQuestionnaire(id,input,{userId:student.id});expect(ack.status).toBe('ACCEPTED')
  const prior=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:id,attemptEpoch:state.attemptEpoch}}})
  await standard.withdrawStandardTriplet(system.id,online.id,online.version,'Synthetic withdrawal after ACK')
  await db.$transaction((tx:any)=>(import('../../modules/scale-library-governance/service')).then(m=>m.stopCollection(tx,system.id,'TRAINING_SCALE',installed.scaleId!,'Synthetic stop after ACK')))
  const outbox=await import('../../modules/assessment-runtime/report-outbox.service')
  process.env.ASSESSMENT_REPORT_LEASE_MS='1';const expired=await outbox.claimCompositeReportJob();expect(expired?.id).toBe(prior.id)
  await db.$queryRaw`SELECT 1 AS tick FROM pg_sleep(0.01)`
  await finish(prior,expired,input,student.id,[installed.scaleId!],definition.units.map(u=>u.itemId))
 },180000)
})
