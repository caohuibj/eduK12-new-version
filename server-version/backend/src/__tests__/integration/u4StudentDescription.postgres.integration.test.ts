import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createHuiteacherTarget,createHuiteacherEvent,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {configureHuiteacherStudentEvaluation,createHuiteacherStudentEvaluationRun,publishHuiteacherStudentEvaluationRun} from '../../modules/huiteacher/studentEvaluation.service'
import {readHuiteacherStudentFeedbackReport} from '../../modules/huiteacher/studentReport.service'
import {closeAssessmentRun} from '../../modules/assessment-run/lifecycle'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {u4Candidate} from '../../modules/education-tools/content/u4/catalog'
import * as tools from '../../modules/education-tools/private-tool.service'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

// Runs only on an explicitly selected migrated, disposable real PostgreSQL DB.
// Only identities/verified roster are seeded; source freeze, configuration,
// assignment, START, native FINAL, completion, reporting and ledger use services.
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('U4 independent student topic, real FINAL and protected descriptive report',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','true')
  vi.stubEnv('REPORT_PRIVACY_TEACHER_V2_ENABLED','false');vi.stubEnv('REPORT_PRIVACY_PREFERENCES_V1_ENABLED','false')
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher/student-assessments',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource,undefined,'STUDENT_EVALUATION'))
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/huiteacher`
 })
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();vi.unstubAllEnvs();await db.$disconnect()})
 async function request(userId:string,path:string,body?:unknown){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-student-composition-csrf'
  const token=generateToken({userId,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',
   cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value:any=await response.json();return {status:response.status,value,data:value.data}
 }
 it('uses a single student Form topic and distinct submitted/valid denominators after closure',async()=>{
  const user=(role:'TEACHER'|'STUDENT')=>db.user.create({data:{username:'p3_'+randomUUID().replace(/-/g,''),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role,teacherApproved:true}})
  const [manager,teacher,outsider]=await Promise.all([user('TEACHER'),user('TEACHER'),user('STUDENT')])
  const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic P3 '+randomUUID(),productDomain:'SCHOOL',createdByUserId:manager.id}})
  const member=async(userId:string,persona:'TEACHER'|'STUDENT')=>{
   const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:membership.id,persona,grantedByUserId:manager.id}})
   return membership
  }
  const admin=await member(manager.id,'TEACHER'),targetMember=await member(teacher.id,'TEACHER')
  await db.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:manager.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:admin.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id}})
  const grade=randomUUID(),cls=randomUUID(),staff=randomUUID()
  await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES (${grade},${org.id},'GRADE','P3 grade')`
  await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES (${cls},${org.id},'CLASS','P3 class',${grade})`
  await db.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role) VALUES (${staff},${org.id},${targetMember.id},${cls},'TEACHING')`
  const students:string[]=[]
  const addStudent=async()=>{
   const student=await user('STUDENT'),membership=await member(student.id,'STUDENT')
   await db.$executeRaw`INSERT INTO organization_student_class_assignments(id,organization_id,membership_id,class_unit_id,is_primary) VALUES (${randomUUID()},${org.id},${membership.id},${cls},TRUE)`
   students.push(student.id)
  }
  for(let n=0;n<20;n++)await addStudent()
  const target=await createHuiteacherTarget({organizationId:org.id,actorUserId:manager.id,kind:'PERSON',name:'Verified evaluated teacher',subjectUserId:teacher.id})
  const event=await createHuiteacherEvent({organizationId:org.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'P3 complete student journey'})
  const context={entry:'TEACHER' as const,organizationId:org.id,principal:{userId:manager.id,accountDomain:'SCHOOL' as const}}
  const fixed=async(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }

  const form=u4Candidate('u4-sr24--sr-t01')!.definition
  form.descriptive!.exploratoryMeans=true
  const source=await fixed('FORM','Independent student topic',form)
  const composition=await fixed('COMPOSITION','Only one student topic',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'},instruction:'记录最近四周这位教师的课堂经历',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:source.id,contentHash:source.contentHash}}]})
  const campaign={organizationId:org.id,eventId:event.id,actorUserId:manager.id}
  await configureHuiteacherStudentEvaluation({...campaign,classUnitId:cls,staffAssignmentId:staff,privateComposition:{versionId:composition.id,contentHash:composition.contentHash}})
  const run=await createHuiteacherStudentEvaluationRun(campaign)
  await transitionHuiteacherEvent({...campaign,action:'OPEN',expectedVersion:event.version})
  await publishHuiteacherStudentEvaluationRun({...campaign,expectedVersion:run.version})
  for(const [n,studentId] of students.entries()){
   const task=(await request(studentId,'/student-assessments/my-assessment-tasks')).data.list[0],prefix='/student-assessments/run-executions/'+task.executionId
   if(task.consentRequired)expect((await request(studentId,prefix+'/assessment-consent/accept',{})).status).toBe(200)
   const start=await request(studentId,prefix+'/start-assessment',{});expect(start.status,JSON.stringify(start.value)).toBe(200)
   const path='/student-assessments/assessment-composite-attempts/'+start.data.runtimeBindingRef,current=await request(studentId,path),item=current.data.currentItem
   expect(item.type).toBe('FORM_SECTION');expect(current.data.totalItems).toBe(1)
   const result=await request(studentId,path+'/form-sections/'+item.formSectionId+'/submit',{submissionId:randomUUID(),attemptEpoch:current.data.attemptEpoch,
    definitionHash:item.definitionHash,contextSnapshotHash:current.data.contextSnapshotHash,
    answers:item.answers.map((q:any)=>({formItemId:q.formItemId,value:['f0','f4','na','u'][Math.floor(n/5)]}))})
   expect(result.status,JSON.stringify(result.value)).toBe(200)
   expect((await request(studentId,path)).data.status).toBe('COMPLETED')
   expect((await request(studentId,prefix+'/feedback')).data.state).toBe('COMPLETION_ONLY')
   expect((await request(teacher.id,path)).status).toBe(404)
  }
  await closeAssessmentRun({organizationId:org.id,runId:run.runId})
  const open=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:event.id}})
  await transitionHuiteacherEvent({...campaign,action:'CLOSE',expectedVersion:open.version})
  const report=await readHuiteacherStudentFeedbackReport(campaign)
  expect(report.independentRespondents).toBe(20);expect(report.units).toHaveLength(1)
  const unit=report.units![0]
  expect(unit.exploratoryMeans).toMatchObject([{status:'READY',mean:2,validN:10,missingN:10}])
  expect(unit.distributions![0]).toMatchObject({status:'READY',descriptive:{submittedN:20,validN:10}})
  expect(unit.distributions![0].descriptive!.frequencies[0].percentage).toBe(50)
  expect(unit.distributions![0].cells!.find(c=>c.key==='na')!.percentage).toBe(25)
  expect(JSON.stringify(report)).not.toMatch(/respondentUserId|sourceAttemptId|collectionFactsEncrypted/)
  await expect(readHuiteacherStudentFeedbackReport({...campaign,actorUserId:students[0]})).rejects.toThrow()
  expect(await readHuiteacherStudentFeedbackReport({...campaign,actorUserId:teacher.id})).toEqual(report)
 },120_000)
})
