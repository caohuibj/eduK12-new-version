import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupTeacherCompositionExecution} from './educationPrivateCompositionExecutionFixture'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {getAttemptState,startUserAttempt} from '../../modules/composite/composite.service'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {loadFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
async function headers(userId:string){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-ordinary-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',
  sessionProduct:'HUITEACHER',mfaVerifiedAt:Math.floor(Date.now()/1000)})
 return {cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,
  [CSRF_HEADER_NAME]:csrf,'content-type':'application/json'}
}
async function request(path:string,auth:Record<string,string>,body?:unknown){
 const response=await fetch(base+path,{headers:auth,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
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
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/huiteacher'
 })
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect()})
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
  await expect(submitCompositeScaleFinal(id,current.id,input,{userId:f.participantUserId},{receiptOnly:true})).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE'})
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:id}})).toBe(0)
  // Separate event/source for a real not-yet-entered author withdrawal.
  const waiting=await setupTeacherCompositionExecution(db),waitingAuth=await headers(waiting.participantUserId)
  await db.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${waiting.managerUserId}
   WHERE organization_id=${waiting.organizationId} AND product='HUITEACHER' AND revoked_at IS NULL`
  expect((await request(`/run-executions/${waiting.executionId}/start-assessment`,waitingAuth,{})).status).toBe(403)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:waiting.runtime.compositeId}})).toBe(0)
 },120_000)
})
