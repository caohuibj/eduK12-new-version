import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {compositionStartCommit,setupSchoolCompositionExecution,setupTeacherCompositionExecution} from './educationPrivateCompositionExecutionFixture'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import activityRunRouter from '../../modules/campus/activity.run.routes'
import campusCompositeRouter from '../../modules/campus/composite.routes'
import {changeCampusActivityStatus,readCampusActivity} from '../../modules/campus/activity.service'
import {transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {closeAssessmentRun} from '../../modules/assessment-run/lifecycle'
import {getAttemptState,startUserAttempt} from '../../modules/composite/composite.service'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {loadFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
async function headers(userId:string,school=false){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-ordinary-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',
  ...(!school?{sessionProduct:'HUITEACHER' as const}:{}),mfaVerifiedAt:Math.floor(Date.now()/1000)})
 return {cookie:`${school?SCHOOL_AUTH_COOKIE_NAME:HUITEACHER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${school?SCHOOL_CSRF_COOKIE_NAME:HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,
  [CSRF_HEADER_NAME]:csrf,'content-type':'application/json'}
}
async function request(path:string,auth:Record<string,string>,body?:unknown,school=false){
 const response=await fetch(base+(school?'/api/campus':'/api/huiteacher')+path,{headers:auth,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
 const value=await response.json()
 return {status:response.status,value,data:value.data}
}
suite('Teacher ordinary questionnaire / actual SELF participation and block feedback',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use('/api/campus',activityRunRouter,campusCompositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect()})
 it.each(['School','Teacher'])('%s admits SELF once and completes the scale whole receipt after closure and withdrawal',async product=>{
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED','true')
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED','true')
  try{
   const school=product==='School',create=school?setupSchoolCompositionExecution:setupTeacherCompositionExecution
   const f=await create(db,{scaleOnly:true}),actor=f.participantUserId
   const auth=await headers(actor,school),other=await headers(f.managerUserId,school)
   const startPath=(target:typeof f)=>school
    ? `/organizations/${target.organizationId}/activities/${target.workflow.id}/runs/${target.runId}/executions/${target.executionId}/start`
    : `/run-executions/${target.executionId}/start-assessment`
   const close=async(target:typeof f)=>{
    await closeAssessmentRun({organizationId:target.organizationId,runId:target.runId})
    if(school){
     const scope={organizationId:target.organizationId,courseId:target.workflow.id,actor:target.manager}
     const activity=await readCampusActivity(scope)
     await changeCampusActivityStatus({...scope,action:'CLOSE',expectedVersion:activity.version})
    }else{
     const event=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:target.workflow.id}})
     await transitionHuiteacherEvent({organizationId:target.organizationId,eventId:event.id,actorUserId:target.managerUserId,action:'CLOSE',expectedVersion:event.version})
    }
   }
   const start=()=>request(startPath(f),auth,{},school)
   const [first,otherStart]=await Promise.all([start(),start()])
   expect(first.status,JSON.stringify(first.value)).toBe(200)
   const id=first.data.runtimeBindingRef
   expect(otherStart.data).toMatchObject({runtimeBindingRef:id})
   expect(await compositionStartCommit(db,f.executionId,id)).toEqual([{atomic:true,state:'COMPLETED'}])
   await close(f)
   await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:actor,
    permission:'RUN_START',reason:'Synthetic withdrawal after admission',deniedByUserId:f.managerUserId}})
   expect((await start()).data).toMatchObject({runtimeBindingRef:id,replayed:true})
   const pending=await create(db,{scaleOnly:true})
   await close(pending)
   const blocked=await request(startPath(pending),await headers(pending.participantUserId,school),{},school)
   expect([403,404,409]).toContain(blocked.status)
   expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:pending.runtime.compositeId}})).toBe(0)
   const route=(school?'/composite-attempts/':'/assessment-composite-attempts/')+id+'/whole'
   const get=(suffix='')=>request(route+suffix,auth,undefined,school)
   const post=(payload:unknown)=>request(route+'/submit',auth,payload,school)
   const delivered=await get()
   expect(delivered.status,JSON.stringify(delivered.value)).toBe(200)
   const def=delivered.data,submissionId=randomUUID()
   const receipt=(epoch=def.attemptEpoch,id=submissionId)=>`/receipt?submissionId=${id}&attemptEpoch=${epoch}`
   expect((await get(receipt())).data).toMatchObject({status:'NOT_RECEIVED'})
   expect((await get(receipt(def.attemptEpoch+1))).status).toBe(409)
   expect((await request(route,other,undefined,school)).status).toBe(404)
   const payload={submissionId,attemptEpoch:def.attemptEpoch,slotSetHash:def.slotSetHash,contextSnapshotHash:def.contextSnapshotHash,
    units:def.units.map((unit:any)=>({itemId:unit.itemId,definitionHash:unit.definitionHash,
     answers:unit.scale.definition.items.map((item:any)=>({itemCode:item.itemCode,responseValue:item.options[0].value}))}))}
   expect((await request(route+'/submit',other,payload,school)).status).toBe(404)
   expect((await post({...payload,units:[]})).status).toBe(400)
   expect((await get(receipt())).data).toMatchObject({status:'NOT_RECEIVED'})
   const saved=await post(payload)
   expect(saved.status,JSON.stringify(saved.value)).toBe(200)
   expect(saved.data).toMatchObject({status:'ACCEPTED',submissionId})
   expect((await post(payload)).data).toMatchObject({status:'ACCEPTED',replayed:true})
   expect((await post({...payload,units:payload.units.map((unit:any)=>({...unit,answers:unit.answers.map((answer:any)=>({...answer,responseValue:'b'}))}))})).status).toBe(409)
   expect((await get(receipt(def.attemptEpoch,randomUUID()))).status).toBe(409)
   const pendingJob=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:id,attemptEpoch:def.attemptEpoch}}})
   const job=await db.compositeReportJob.update({where:{id:pendingJob.id,status:'PENDING'},data:{status:'PROCESSING',
    leaseToken:randomUUID(),leaseExpiresAt:new Date(Date.now()+90_000),claimedRevision:pendingJob.requestedRevision,attemptCount:{increment:1}}})
   const {processWholeQuestionnaireAnswers}=await import('../../modules/composite/whole-questionnaire.service')
   expect(await processWholeQuestionnaireAnswers(job)).toBe(true)
   const {finalizeCompositeAttemptUnifiedIfReady}=await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')
   expect(await finalizeCompositeAttemptUnifiedIfReady(id,undefined,job)).toMatchObject({status:'COMPLETED'})
   expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:id,attemptEpoch:def.attemptEpoch}})).toBe(2)
   const progress=await get('/progress')
   expect(progress.status,JSON.stringify(progress.value)).toBe(200)
   expect(progress.data).toMatchObject({wholeSubmissionReceived:true,reportStatus:{state:'PROCESSING'}})
   expect((await get(receipt())).data).toMatchObject({status:'ACCEPTED',submissionId})
   const {reconcileRelationalCompositeCompletion}=await import('../../modules/assessment-relational/runtime-completion')
   await reconcileRelationalCompositeCompletion(id)
   expect((await get('/progress')).data).toMatchObject({status:'COMPLETED',reportStatus:{state:'READY'}})
  }finally{vi.unstubAllEnvs()}
 },120_000)
 it('delivers frozen block instructions through the real Scale/Form execution after a draft edit, without extra pages',async()=>{
  const instructions=['冻结的量表衔接说明','冻结的表单衔接说明','']
  const f=await setupTeacherCompositionExecution(db,{instructions}),auth=await headers(f.participantUserId)
  const tasks=await request('/my-assessment-tasks',auth),task=tasks.data.list.find((row:any)=>row.executionId===f.executionId)
  if(task.consentRequired)expect((await request(`/run-executions/${f.executionId}/assessment-consent/accept`,auth,{})).status).toBe(200)
  const start=await request(`/run-executions/${f.executionId}/start-assessment`,auth,{})
  expect(start.status,JSON.stringify(start.value)).toBe(200)
  const id=start.data.runtimeBindingRef,path=`/assessment-composite-attempts/${id}`
  const state=await request(path,auth),current=state.data.currentItem
  expect(state.data.totalItems).toBe(3);expect(current).toMatchObject({type:'SCALE',questionnaireInstruction:instructions[0]})
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}})
  const slots=await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted!)
  expect(slots.slots.filter(slot=>slot.sourceBinding.educationInstruction===instructions[1])).toHaveLength(1)
  await updatePrivateTool(f.context,f.fixed.toolId,{expectedRevision:f.fixed.sourceRevision,title:f.fixed.title,
   definition:{...f.definition,blocks:f.definition.blocks.map(block=>({...block,instruction:'尚未固定的新草稿说明'}))}})
  expect((await request(path,auth)).data.currentItem.questionnaireInstruction).toBe(instructions[0])
  const final=await request(path+`/items/${current.id}/scale/submit`,auth,{submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,
   definitionHash:current.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash,
   answers:current.scale.definition.items.map((item:any)=>({itemCode:item.itemCode,responseValue:'a'}))})
  expect(final.status,JSON.stringify(final.value)).toBe(200)
  const next=await request(path,auth)
  expect(next.data.totalItems).toBe(3);expect(next.data.currentItem).toMatchObject({type:'FORM_SECTION',questionnaireInstruction:instructions[1]})
  expect(JSON.stringify(next.value)).not.toContain('尚未固定的新草稿说明')
 })
 it('starts one frozen parent, resumes after author withdrawal, finalizes Scale/Form once, and discloses only the permitted same-key block',async()=>{
  const f=await setupTeacherCompositionExecution(db),auth=await headers(f.participantUserId)
  const tasks=await request('/my-assessment-tasks',auth)
  expect(tasks.status).toBe(200);expect(tasks.data.list).toContainEqual(expect.objectContaining({executionId:f.executionId,title:f.fixed.title}))
  const task=tasks.data.list.find((row:any)=>row.executionId===f.executionId)
  if(task.consentRequired)expect((await request(`/run-executions/${f.executionId}/assessment-consent/accept`,auth,{})).status).toBe(200)
  const start=await request(`/run-executions/${f.executionId}/start-assessment`,auth,{})
  expect(start.value).toMatchObject({data:{state:'STARTED',runtimeBindingKind:'COMPOSITE'}})
  const id=start.data.runtimeBindingRef,parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}})
  expect(parent.trainingContentBinding).toMatchObject({educationComposition:{origin:f.runtime.origin,manifestHash:f.runtime.manifestHash}})
  expect(parent.trainingContentBindingHash).toBe(canonicalHash(parent.trainingContentBinding))
  expect(await compositionStartCommit(db,f.executionId,id)).toEqual([{atomic:true,state:'COMPLETED'}])
  await expect(startUserAttempt(f.participantUserId,parent.compositeAssessmentId)).rejects.toMatchObject({statusCode:403})
  const admin=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId,validUntil:null}})
  await db.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${f.managerUserId}
   WHERE membership_id=${admin.id} AND product='HUITEACHER' AND revoked_at IS NULL`
  expect((await request(`/run-executions/${f.executionId}/start-assessment`,auth,{})).data).toMatchObject({runtimeBindingRef:id,replayed:true})
  const early=await request(`/run-executions/${f.executionId}/feedback`,auth)
  expect(early.data).toMatchObject({state:'IN_PROGRESS',units:[]})
  for(let step=0;step<3;step++){
   const state=await request(`/assessment-composite-attempts/${id}`,auth)
   expect(state.status).toBe(200);expect(JSON.stringify(state.value)).not.toContain('PRIVATE NONE BLOCK FEEDBACK')
   const current=state.data.currentItem,submissionId=randomUUID()
   expect(current.type).toBe(['SCALE','FORM_SECTION','SCALE'][step])
   const common={submissionId,attemptEpoch:state.data.attemptEpoch,definitionHash:current.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   const path=current.type==='SCALE'?`/assessment-composite-attempts/${id}/items/${current.id}/scale/submit`:
    `/assessment-composite-attempts/${id}/form-sections/${current.formSectionId}/submit`
   const body=current.type==='SCALE'?{...common,answers:current.scale.definition.items.map((item:any)=>({itemCode:item.itemCode,responseValue:'a'}))}:
    {...common,answers:current.answers.map((item:any)=>({formItemId:item.formItemId,value:'Synthetic fixed response'}))}
   const final=await request(path,auth,body)
   expect(final.status,JSON.stringify(final.value)).toBe(200)
   expect(JSON.stringify(final.value)).not.toContain('PRIVATE NONE BLOCK FEEDBACK')
   expect((await request(path,auth,body)).status).toBe(200)
  }
  // The existing lightweight receipt protocol refreshes current-unit state;
  // that public read performs the ordinary synchronous parent reconciliation.
  const completedState=await request(`/assessment-composite-attempts/${id}`,auth)
  expect(completedState.status,JSON.stringify(completedState.value)).toBe(200)
  expect(completedState.data.status).toBe('COMPLETED')
  const complete=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}})
  expect(complete.status).toBe('COMPLETED')
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:id,attemptEpoch:parent.attemptEpoch}})).toBe(3)
  expect(await db.compositeAssessmentAttempt.count({where:{assignmentRef:parent.assignmentRef}})).toBe(1)
  expect((await db.$queryRaw<Array<{status:string}>>`SELECT status FROM assessment_run_executions WHERE id=${f.executionId}`)[0].status).toBe('COMPLETED')
  const feedback=await request(`/run-executions/${f.executionId}/feedback`,auth)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data).toMatchObject({kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'READY',units:[
   {blockId:f.definition.blocks[0].blockId,kind:'SCALE',state:'READY'},{blockId:f.definition.blocks[1].blockId,kind:'FORM',state:'COMPLETION_ONLY'},
   {blockId:f.definition.blocks[2].blockId,kind:'SCALE',state:'WITHHELD'},
  ]})
  expect(feedback.data.units[0].nativeScaleUnits[0].scores).toEqual([expect.objectContaining({key:'total',value:1})])
  expect(JSON.stringify(feedback.value)).toContain('Visible fixed reflection')
  for(const field of ['PRIVATE NONE BLOCK FEEDBACK','educationComposition','manifestHash','canonicalResultEncrypted','sourceDefinitionHash','trainingContentBinding','PRIVATE_VERSION'])
   expect(JSON.stringify(feedback.value)).not.toContain(field)
  expect(feedback.data.units[2]).not.toHaveProperty('nativeScaleUnits')
  await expect(readTeacherOrdinaryFeedback({executionId:f.executionId,actorUserId:f.managerUserId})).rejects.toMatchObject({statusCode:404})
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'REPORT_READ',reason:'Synthetic current report withdrawal',deniedByUserId:f.managerUserId}})
  expect((await request(`/run-executions/${f.executionId}/feedback`,auth)).status).toBe(404)
 },120_000)
 it('keeps the accepted whole receipt readable until Run reconciliation releases feedback',async()=>{
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED','true')
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED','true')
  try{
   const f=await setupTeacherCompositionExecution(db)
   const auth=await headers(f.participantUserId),other=await headers(f.managerUserId)
   const started=await request(`/run-executions/${f.executionId}/start-assessment`,auth,{})
   expect(started.status,JSON.stringify(started.value)).toBe(200)
   const id=started.data.runtimeBindingRef,path=`/assessment-composite-attempts/${id}/whole`
   const delivered=await request(path,auth)
   expect(delivered.status,JSON.stringify(delivered.value)).toBe(200)
   const definition=delivered.data
   const payload={submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash,
    contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map((unit:any)=>({
     itemId:unit.itemId,definitionHash:unit.definitionHash,answers:unit.scale.definition.items.map((item:any)=>({
      itemCode:item.itemCode,responseValue:item.options[0].value})),
    })),formAnswers:definition.formSections.map((section:any)=>({sectionId:section.id,definitionHash:section.definitionHash,
     answers:section.items.map((item:any)=>({formItemId:item.id,value:'Synthetic response'}))}))}
   expect((await request(path+'/submit',other,payload)).status).toBe(404)
   const receipts=await Promise.all([request(path+'/submit',auth,payload),request(path+'/submit',auth,payload)])
   for(const receipt of receipts){
    expect(receipt.status,JSON.stringify(receipt.value)).toBe(200)
    expect(receipt.data).toMatchObject({status:'ACCEPTED',submissionId:payload.submissionId})
   }
   expect(receipts.map(receipt=>receipt.data.replayed).sort()).toEqual([false,true])
   const where={attemptId_attemptEpoch:{attemptId:id,attemptEpoch:payload.attemptEpoch}}
   // Give only this fixture's job a worker lease. Other suites may share the queue.
   const pending=await db.compositeReportJob.findUniqueOrThrow({where})
   const job=await db.compositeReportJob.update({where:{id:pending.id,status:'PENDING'},data:{
    status:'PROCESSING',leaseToken:randomUUID(),leaseExpiresAt:new Date(Date.now()+90_000),
    claimedRevision:pending.requestedRevision,attemptCount:{increment:1},
   }})
   // Pause between the same two commits as the worker, without changing any lifecycle rows.
   const {processWholeQuestionnaireAnswers}=await import('../../modules/composite/whole-questionnaire.service')
   expect(await processWholeQuestionnaireAnswers(job)).toBe(true)
   const {finalizeCompositeAttemptUnifiedIfReady}=await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')
   expect(await finalizeCompositeAttemptUnifiedIfReady(id,undefined,job)).toMatchObject({status:'COMPLETED'})
   expect(await db.$queryRaw`SELECT e.status,a.status AS assignment FROM assessment_run_executions e
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${f.executionId}`).toEqual([{status:'STARTED',assignment:'COMPLETED'}])
   const progress=await request(path+'/progress',auth)
   expect(progress.status,JSON.stringify(progress.value)).toBe(200)
   expect(progress.data).toMatchObject({status:'IN_PROGRESS',wholeSubmissionReceived:true,reportStatus:{state:'PROCESSING'}})
   const lookup=path+`/receipt?submissionId=${payload.submissionId}&attemptEpoch=${payload.attemptEpoch}`
   expect((await request(lookup,auth)).data).toMatchObject({submissionId:payload.submissionId})
   expect((await request(path+'/submit',auth,payload)).data).toMatchObject({submissionId:payload.submissionId,replayed:true})
   expect((await request(path+'/submit',auth,{...payload,submissionId:randomUUID()})).status).toBe(409)
   expect((await request(path+'/progress',other)).status).toBe(404)
   expect((await request(lookup,other)).status).toBe(404)
   const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,
    userId:f.participantUserId,permission:'RUN_START',reason:'Synthetic participant withdrawal',deniedByUserId:f.managerUserId}})
   expect((await request(path+'/progress',auth)).status).toBe(404)
   expect((await request(lookup,auth)).status).toBe(404)
   expect((await request(path+'/submit',auth,payload)).status).toBe(404)
   await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedByUserId:f.managerUserId,liftedAt:new Date()}})
   const {finishCompositeReportJob}=await import('../../modules/assessment-runtime/report-outbox.service')
   expect(await finishCompositeReportJob(job,{kind:'failed',errorCode:'REPORT_GENERATION_FAILED'})).toBe(true)
   const failed=await request(path+'/progress',auth)
   expect(failed.status,JSON.stringify(failed.value)).toBe(200)
   expect(failed.data).toMatchObject({status:'IN_PROGRESS',wholeSubmissionReceived:true,reportStatus:{state:'FAILED'}})

   const {reconcileRelationalCompositeCompletion}=await import('../../modules/assessment-relational/runtime-completion')
   await reconcileRelationalCompositeCompletion(id)
   expect((await request(path+'/progress',auth)).data).toMatchObject({status:'COMPLETED',reportStatus:{state:'READY'}})
   expect((await request(`/run-executions/${f.executionId}/feedback`,auth)).data).toMatchObject({state:'READY'})
   expect(await db.compositeReportJob.count({where:{attemptId:id,wholeSubmissionId:payload.submissionId}})).toBe(1)
  }finally{vi.unstubAllEnvs()}
 },90_000)
 it('rejects new entry after author withdrawal, and current participant withdrawal or emergency stop before native FINAL writes',async()=>{
  const f=await setupTeacherCompositionExecution(db),auth=await headers(f.participantUserId)
  const start=await request(`/run-executions/${f.executionId}/start-assessment`,auth,{})
  expect(start.status,JSON.stringify(start.value)).toBe(200)
  const id=start.data.runtimeBindingRef,state=await getAttemptState(id,{userId:f.participantUserId}),current=state.currentItem
  const input={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:current.definitionHash,contextSnapshotHash:state.contextSnapshotHash,
   answers:current.scale.definition.items.map((item:any)=>({itemCode:item.itemCode,responseValue:'a'}))}
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'RUN_START',reason:'Synthetic participant withdrawal',deniedByUserId:f.managerUserId}})
  await expect(submitCompositeScaleFinal(id,current.id,input,{userId:f.participantUserId},{receiptOnly:true})).rejects.toMatchObject({code:'RUN_ACTOR_AUTHORITY_REVOKED'})
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:id}})).toBe(0)
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date(),liftedByUserId:f.managerUserId}})
  const root=await db.compositeAssessment.findUniqueOrThrow({where:{id:f.runtime.compositeId}})
  const snapshot=root.trainingContentSnapshot as unknown as {units:Array<{measurement:{releaseId:string}}>}
  await db.scaleLibraryEmergencyStop.create({data:{targetKind:'RELEASE',targetId:snapshot.units[0].measurement.releaseId,
   actorId:f.libraryAdminUserId,reason:'Synthetic entered questionnaire emergency stop'}})
  await expect(submitCompositeScaleFinal(id,current.id,input,{userId:f.participantUserId},{receiptOnly:true})).rejects.toMatchObject({name:'ScaleLibraryError',statusCode:409,message:'该量表版本已紧急停用，停止新增进入和采集；历史结果保留'})
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:id}})).toBe(0)
  // Separate event/source for a real not-yet-entered author withdrawal.
  const waiting=await setupTeacherCompositionExecution(db),waitingAuth=await headers(waiting.participantUserId)
  await db.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${waiting.managerUserId}
   WHERE organization_id=${waiting.organizationId} AND product='HUITEACHER' AND revoked_at IS NULL`
  expect((await request(`/run-executions/${waiting.executionId}/start-assessment`,waitingAuth,{})).status).toBe(403)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:waiting.runtime.compositeId}})).toBe(0)
 },120_000)
})
