import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createHuiteacherTarget,createHuiteacherEvent,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {inviteHuiteacherObserver,acceptHuiteacherObserver,revokeHuiteacherObserver,createHuiteacherObservation} from '../../modules/huiteacher/observer.service'
import {bindFieldComposition} from '../../modules/huiteacher/fieldComposition.service'
import {releaseHuiteacherFieldFeedback,readOwnHuiteacherFieldFeedback} from '../../modules/huiteacher/fieldFeedback.service'
import fieldRouter from '../../modules/huiteacher/fieldComposition.routes'
import fieldFormRouter from '../../modules/huiteacher/fieldForm.routes'
import observerRouter from '../../modules/huiteacher/observer.routes'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
// R executes this on the migrated disposable real PG. No production access,
// fake relational assignment or test-only execution protocol is introduced.
suite('Teacher explicit expert Scale/Form field questionnaire (real PostgreSQL)',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);vi.stubEnv('DATA_ENCRYPTION_KEY',process.env.DATA_ENCRYPTION_KEY??'55'.repeat(32))
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher/field-assessments',fieldRouter);app.use('/api/huiteacher',fieldFormRouter,observerRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/huiteacher`
 })
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();await db.$disconnect()})
 async function request(userId:string,path:string,body?:unknown,mfa=true){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-expert-csrf'
  const token=generateToken({userId,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,...(mfa?{mfaVerifiedAt:Math.floor(Date.now()/1000)}:{})})
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value:any=await response.json();return {status:response.status,value,data:value.data}
 }
 it('uses a real invited expert and actual teacher target, rejects stale authority, links canonical completion atomically and releases only explicit opinion text',async()=>{
  const makeUser=()=>db.user.create({data:{username:'p4_'+randomUUID().replace(/-/g,''),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const [manager,teacher,expert,outsider]=await Promise.all([makeUser(),makeUser(),makeUser(),makeUser()])
  const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic P4 '+randomUUID(),productDomain:'SCHOOL',createdByUserId:manager.id}})
  const member=async(userId:string)=>{
   const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:membership.id,persona:'TEACHER',grantedByUserId:manager.id}});return membership
  }
  const admin=await member(manager.id);await member(teacher.id)
  await db.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:manager.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:admin.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id}})
  const target=await createHuiteacherTarget({organizationId:org.id,actorUserId:manager.id,kind:'PERSON',name:'Verified observed teacher',subjectUserId:teacher.id})
  const event=await createHuiteacherEvent({organizationId:org.id,actorUserId:manager.id,targetId:target.id,kind:'CLASSROOM',title:'Explicit expert observation'})
  const context={entry:'TEACHER' as const,organizationId:org.id,principal:{userId:manager.id,accountDomain:'SCHOOL' as const}}
  const fixed=async(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const native=compileResearchScale('Expert support',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'teacher_self_report',aggregation:'mean',responseOptions:[{optionKey:'zero',label:'未观察到',score:0},{optionKey:'one',label:'观察到',score:1}],dimensions:[{dimensionKey:'support',label:'支持',direction:'descriptive'}],items:[{itemKey:'q',prompt:'教师提供课堂支持',required:true,reverse:false,dimensionKeys:['support']}]})
  // New authored native source declaration, before freeze; never relabel a V1
  // publication or extend the shared Survey SELF draft contract.
  native.respondentType='expert_report';native.report.audienceContract={schemaVersion:1,respondent:'OBSERVER_REPORT',audience:'teacher',locale:'zh-CN'}
  const [scale,form]=[await fixed('SCALE','Expert support',native),await fixed('FORM','Professional observations',{schemaVersion:2,pages:[{pageKey:'p',title:'观察证据',questions:[{itemKey:'comment',type:'LONG_TEXT',prompt:'正式专家证据',required:true,options:[],rows:[],maxLength:120}]}]})]
  const composition=await fixed('COMPOSITION','Expert ordinary questionnaire',{schemaVersion:2,adapterVersion:'2.0.0',administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'PERSON'},instruction:'观察本次已核验教师',blocks:[scale,form].map(version=>({blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:version.kind,versionId:version.id,contentHash:version.contentHash}}))})
  const campaign={organizationId:org.id,eventId:event.id,actorUserId:manager.id},binding={...campaign,privateComposition:{versionId:composition.id,contentHash:composition.contentHash}}
  await expect(bindFieldComposition({...binding,privateComposition:{...binding.privateComposition,contentHash:'f'.repeat(64)}})).rejects.toThrow()
  await expect(bindFieldComposition({...binding,actorUserId:expert.id})).rejects.toThrow()
  await bindFieldComposition(binding)
  await expect(db.huiteacherFieldEventForm.update({where:{organizationId_eventId:{organizationId:org.id,eventId:event.id}},data:{assessmentRef:{forged:true}}})).rejects.toThrow()
  const grant=await inviteHuiteacherObserver({...campaign,observerUserId:expert.id,role:'EXPERT',expiresAt:new Date(Date.now()+3600_000)})
  const startPath='/field-assessments/invitations/'+grant.id+'/start'
  expect((await request(expert.id,startPath,{})).status).toBe(403)
  await acceptHuiteacherObserver({userId:expert.id,invitationId:grant.id})
  await transitionHuiteacherEvent({...campaign,action:'OPEN',expectedVersion:event.version})
  expect(await db.organizationMembership.findFirst({where:{organizationId:org.id,userId:expert.id}})).toBeNull()
  expect((await request(teacher.id,startPath,{})).status).toBe(403);expect((await request(outsider.id,startPath,{})).status).toBe(403)
  expect((await request(expert.id,startPath,{subjectUserId:outsider.id})).status).toBe(400)
  const started=await request(expert.id,startPath,{});expect(started.status,JSON.stringify(started.value)).toBe(200)
  const oldParent=started.data.attemptId,oldPath='/field-assessments/assessment-composite-attempts/'+oldParent
  expect((await request(expert.id,startPath,{})).data).toMatchObject({attemptId:oldParent,replayed:true})
  expect(await db.compositeAssessmentAttempt.findUnique({where:{id:oldParent},select:{userId:true,subjectUserId:true,respondentUserId:true,respondentType:true,assignmentRef:true,episodeId:true,consentId:true}})).toEqual({userId:expert.id,subjectUserId:teacher.id,respondentUserId:expert.id,respondentType:'OBSERVER',assignmentRef:null,episodeId:null,consentId:null})
  await expect(db.compositeAssessmentAttempt.update({where:{id:oldParent},data:{subjectUserId:outsider.id}})).rejects.toThrow()
  const denial=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:org.id,userId:expert.id,permission:'HUITEACHER_ACCESS',reason:'Synthetic current product stop',deniedByUserId:manager.id}})
  expect((await request(expert.id,oldPath)).status).toBe(403)
  await db.organizationAccessDeny.update({where:{id:denial.id},data:{liftedAt:new Date(),liftedByUserId:manager.id}})
  expect((await request(expert.id,oldPath)).status).toBe(200)
  await revokeHuiteacherObserver({...campaign,observerUserId:expert.id});expect((await request(expert.id,oldPath)).status).toBe(403)
  await inviteHuiteacherObserver({...campaign,observerUserId:expert.id,role:'EXPERT',expiresAt:new Date(Date.now()+3600_000)})
  await acceptHuiteacherObserver({userId:expert.id,invitationId:grant.id})
  const next=await request(expert.id,startPath,{});expect(next.status,JSON.stringify(next.value)).toBe(200)
  const parent=next.data.attemptId,path='/field-assessments/assessment-composite-attempts/'+parent
  expect(parent).not.toBe(oldParent);expect((await request(expert.id,oldPath)).status).toBe(409)
  expect((await request(teacher.id,path)).status).toBe(403)
  const note=await createHuiteacherObservation({organizationId:org.id,eventId:event.id,actorUserId:expert.id,kind:'FORMAL_FEEDBACK',content:'Explicitly released professional opinion'})
  const privateNote=await createHuiteacherObservation({organizationId:org.id,eventId:event.id,actorUserId:expert.id,kind:'PRIVATE_REFLECTION',content:'PRIVATE expert reflection'})
  const submitPath='/field-notes/'+note.id+'/submit',evidencePath='/organizations/'+org.id+'/evaluation-events/'+event.id+'/field-notes/'+note.id+'/form-evidence'
  expect((await request(expert.id,submitPath,{expectedRevision:1,assessmentAttemptId:parent})).status).toBe(409)
  expect(await db.huiteacherFieldFormEvidence.count({where:{recordId:note.id}})).toBe(0)
  for(let block=0;block<2;block++){
   const current=await request(expert.id,path+'?view=current-unit');expect(current.status,JSON.stringify(current.value)).toBe(200)
   const unit=current.data.currentItem,scaleUnit=unit.type==='SCALE',payload={submissionId:randomUUID(),attemptEpoch:current.data.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:current.data.contextSnapshotHash,
    answers:scaleUnit?unit.scale.definition.items.map((question:any)=>({itemCode:question.itemCode,responseValue:'zero'})):unit.answers.map((question:any)=>({formItemId:question.formItemId,value:'EXPERT professional evidence'}))}
   const endpoint=path+(scaleUnit?'/items/'+unit.id+'/scale/submit?response=full':'/form-sections/'+unit.formSectionId+'/submit')
   const result=await request(expert.id,endpoint,payload);expect(result.status,JSON.stringify(result.value)).toBe(200)
   expect((await request(expert.id,endpoint,payload)).status).toBe(200)
   expect(JSON.stringify(result.data)).not.toMatch(/rawScore|interpretation|percentile/)
  }
  expect((await request(expert.id,path)).data.status).toBe('COMPLETED')
  expect((await request(expert.id,submitPath,{expectedRevision:1,assessmentAttemptId:parent,answers:{forged:'client recompute'}})).status).toBe(400)
  const committed=await request(expert.id,submitPath,{expectedRevision:1,assessmentAttemptId:parent});expect(committed.status,JSON.stringify(committed.value)).toBe(200)
  expect((await request(expert.id,submitPath,{expectedRevision:1,assessmentAttemptId:parent})).data).toMatchObject({replayed:true,status:'SUBMITTED'})
  const stored=await db.huiteacherFieldFormEvidence.findUniqueOrThrow({where:{recordId:note.id}})
  expect(stored).toMatchObject({attemptId:parent,attemptEpoch:1,formId:null,definitionDigest:null});expect(stored.finalHash).toMatch(/^[a-f0-9]{64}$/)
  expect(stored.answersCipher).not.toContain('EXPERT professional evidence')
  expect((await request(teacher.id,evidencePath)).status).toBe(403);expect((await request(manager.id,evidencePath,undefined,false)).status).toBe(403)
  const evidence=await request(manager.id,evidencePath);expect(evidence.status,JSON.stringify(evidence.value)).toBe(200)
  expect(evidence.data.units).toEqual(expect.arrayContaining([expect.objectContaining({kind:'FORM',items:expect.arrayContaining([expect.objectContaining({value:'EXPERT professional evidence'})])}),expect.objectContaining({kind:'SCALE',metrics:expect.arrayContaining([expect.objectContaining({value:0})])})]))
  expect(JSON.stringify(evidence.data)).not.toContain(expert.id);expect(JSON.stringify(evidence.data)).not.toContain('PRIVATE expert reflection')
  expect(await db.organizationGovernanceAudit.count({where:{organizationId:org.id,action:'HUITEACHER_FIELD_CANONICAL_EVIDENCE_READ'}})).toBeGreaterThan(0)
  expect((await readOwnHuiteacherFieldFeedback(teacher.id)).list).toHaveLength(0)
  await revokeHuiteacherObserver({...campaign,observerUserId:expert.id});expect((await request(expert.id,path)).status).toBe(403)
  expect((await request(manager.id,evidencePath)).status).toBe(200) // immutable historical accepted generation
  const open=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:event.id}})
  await transitionHuiteacherEvent({...campaign,action:'CLOSE',expectedVersion:open.version})
  await releaseHuiteacherFieldFeedback({...campaign,sourceKind:'FORMAL_FEEDBACK',sourceId:note.id})
  const feedback=await readOwnHuiteacherFieldFeedback(teacher.id)
  expect(JSON.stringify(feedback)).toContain('Explicitly released professional opinion')
  expect(JSON.stringify(feedback)).not.toMatch(/EXPERT professional evidence|PRIVATE expert reflection|metrics|answersCipher|respondentUserId/)
  expect((await request(manager.id,evidencePath.replace(note.id,privateNote.id))).status).toBe(404)
 },90000)
})
