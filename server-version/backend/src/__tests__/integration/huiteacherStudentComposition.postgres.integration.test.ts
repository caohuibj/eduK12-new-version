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
import {assertTeacherComparableDisclosure} from '../../modules/huiteacher/disclosureOverlap.service'
import {lockTeacherDisclosure} from '../../modules/huiteacher/privacyReleaseV2.service'
import {studentFormComparableKey} from '../../modules/huiteacher/studentCompositionResource'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import type {FormDraft} from '../../modules/assessment-core/form/definition'

// Execution belongs to R on a migrated, disposable real PostgreSQL database.
// Only identities/verified roster are seeded; source freeze, configuration,
// assignment, START, native FINAL, completion, reporting and ledger use services.
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const form:FormDraft={schemaVersion:2,pages:[{pageKey:'classroom',title:'课堂观察',questions:[
 {itemKey:'clarity',type:'SINGLE',prompt:'课堂目标清晰',required:true,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[]},
 {itemKey:'comment',type:'LONG_TEXT',prompt:'私有开放意见',required:false,options:[],rows:[],maxLength:120},
]}]}
suite('Teacher student ordinary Scale/Form questionnaire (isolated PostgreSQL)',()=>{
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
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();await db.$disconnect()})
 async function request(userId:string,path:string,body?:unknown){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-student-composition-csrf'
  const token=generateToken({userId,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',
   cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value:any=await response.json();return {status:response.status,value,data:value.data}
 }
 it('fixes the exact teacher/class/source, enforces publication floor, collects canonical zero+Form finals and protects feedback',async()=>{
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
  for(let n=0;n<9;n++)await addStudent()
  const target=await createHuiteacherTarget({organizationId:org.id,actorUserId:manager.id,kind:'PERSON',name:'Verified evaluated teacher',subjectUserId:teacher.id})
  const event=await createHuiteacherEvent({organizationId:org.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'P3 complete student journey'})
  const context={entry:'TEACHER' as const,organizationId:org.id,principal:{userId:manager.id,accountDomain:'SCHOOL' as const}}
  const fixed=async(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const scale=compileResearchScale('Fixed observed classroom support',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'teacher_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'zero',label:'未观察到',score:0},{optionKey:'one',label:'观察到',score:1}],dimensions:[{dimensionKey:'support',label:'支持观察',direction:'descriptive'}],
   items:[{itemKey:'q',prompt:'教师提供明确课堂支持',required:true,reverse:false,dimensionKeys:['support']}]})
  // Explicit native observer declaration on this new synthetic version, before freeze.
  scale.respondentType='observer_report'
  scale.report.audienceContract={schemaVersion:1,respondent:'OBSERVER_REPORT',audience:'teacher',locale:'zh-CN'}
  const [scaleVersion,formVersion]=[await fixed('SCALE','Observed support',scale),await fixed('FORM','Unscored classroom Form',form)]
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'},instruction:'Observe the assigned teacher',
   blocks:[scaleVersion,formVersion].map(source=>({blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))}
  const composition=await fixed('COMPOSITION','Fixed student questionnaire',definition)
  const campaign={organizationId:org.id,eventId:event.id,actorUserId:manager.id},selection={...campaign,classUnitId:cls,staffAssignmentId:staff,privateComposition:{versionId:composition.id,contentHash:composition.contentHash}}
  await expect(configureHuiteacherStudentEvaluation({...selection,privateComposition:{...selection.privateComposition,contentHash:'f'.repeat(64)}})).rejects.toThrow()
  await expect(configureHuiteacherStudentEvaluation({...selection,actorUserId:students[0]})).rejects.toThrow()
  await expect(configureHuiteacherStudentEvaluation({...selection,classUnitId:grade})).rejects.toThrow()
  await configureHuiteacherStudentEvaluation(selection)
  await expect(db.huiteacherStudentEvaluationConfig.updateMany({where:{organizationId:org.id,eventId:event.id},data:{classUnitId:grade}})).rejects.toThrow()
  const run=await createHuiteacherStudentEvaluationRun(campaign)
  await transitionHuiteacherEvent({...campaign,action:'OPEN',expectedVersion:event.version})
  await expect(publishHuiteacherStudentEvaluationRun({...campaign,expectedVersion:run.version})).rejects.toMatchObject({code:'STUDENT_FEEDBACK_MINIMUM_POPULATION'})
  await addStudent()
  await publishHuiteacherStudentEvaluationRun({...campaign,expectedVersion:run.version})
  const executions=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE organization_id=${org.id} AND run_id=${run.runId}`
  expect(executions).toHaveLength(10)
  const own=(await request(students[0],'/student-assessments/my-assessment-tasks')).data.list
  expect(own).toHaveLength(1);expect(own[0]).toMatchObject({teacherName:'Verified evaluated teacher',mode:'COMPOSITION'})
  expect((await request(teacher.id,'/student-assessments/my-assessment-tasks')).status).toBe(404)
  expect((await request(outsider.id,'/student-assessments/my-assessment-tasks')).data.list).toEqual([])
  for(const studentId of students){
   const inbox=await request(studentId,'/student-assessments/my-assessment-tasks'),task=inbox.data.list[0]
   const prefix='/student-assessments/run-executions/'+task.executionId
   if(task.consentRequired)expect((await request(studentId,prefix+'/assessment-consent/accept',{})).status).toBe(200)
   const start=await request(studentId,prefix+'/start-assessment',{});expect(start.status,JSON.stringify(start.value)).toBe(200)
   const parent=start.data.runtimeBindingRef,path='/student-assessments/assessment-composite-attempts/'+parent
   expect((await request(studentId,prefix+'/start-assessment',{})).data).toMatchObject({runtimeBindingRef:parent,replayed:true})
   expect(await db.compositeAssessmentAttempt.findUnique({where:{id:parent},select:{userId:true,subjectUserId:true,respondentUserId:true}})).toEqual({userId:studentId,subjectUserId:teacher.id,respondentUserId:studentId})
   expect((await request(teacher.id,path)).status).toBe(404)
   expect((await request(teacher.id,'/assessment-composite-attempts/'+parent)).status).toBe(404)
   for(let block=0;block<2;block++){
    const current=await request(studentId,path+'?view=current-unit');expect(current.status,JSON.stringify(current.value)).toBe(200)
    const item=current.data.currentItem,payload={submissionId:randomUUID(),attemptEpoch:current.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:current.data.contextSnapshotHash,
     answers:block===0?item.scale.definition.items.map((question:any)=>({itemCode:question.itemCode,responseValue:'zero'})):item.answers.map((question:any,index:number)=>({formItemId:question.formItemId,value:index===0?'yes':'PRIVATE student text'}))}
    const endpoint=path+(block===0?'/items/'+item.id+'/scale/submit?response=receipt':'/form-sections/'+item.formSectionId+'/submit')
    const result=await request(studentId,endpoint,payload);expect(result.status,JSON.stringify(result.value)).toBe(200)
    expect((await request(studentId,endpoint,payload)).status).toBe(200)
    expect(JSON.stringify(result.data)).not.toMatch(/rawScore|zScore|percentile|interpretation/)
   }
   expect((await request(studentId,path)).data.status).toBe('COMPLETED')
   const feedback=await request(studentId,prefix+'/feedback');expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
   expect(feedback.data.state).toBe('COMPLETION_ONLY');expect(JSON.stringify(feedback.data)).not.toMatch(/PRIVATE student text|scores|metrics|rawScore|manifestHash/)
   expect((await request(teacher.id,prefix+'/feedback')).status).toBe(404)
  }
  await expect(readHuiteacherStudentFeedbackReport(campaign)).rejects.toThrow()
  await closeAssessmentRun({organizationId:org.id,runId:run.runId})
  const open=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:event.id}})
  await transitionHuiteacherEvent({...campaign,action:'CLOSE',expectedVersion:open.version})
  const report=await readHuiteacherStudentFeedbackReport(campaign)
  expect(report).toMatchObject({source:'VERIFIED_HUITEACHER_STUDENT_COMPOSITION_FINAL',independentRespondents:10,minimumRespondents:10,
   units:[{kind:'SCALE',metrics:[{key:'support',status:'READY',mean:0,validN:10,missingN:0}]},{kind:'FORM',distributions:[{status:'READY'},{status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'}]}]})
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE student text|respondentUserId|student-username|sourceAttemptId/)
  expect(await readHuiteacherStudentFeedbackReport({...campaign,actorUserId:teacher.id})).toEqual(report)
  await expect(readHuiteacherStudentFeedbackReport({...campaign,actorUserId:students[0]})).rejects.toThrow()
  // A legacy Form report cannot evade this composition's real historical
  // FINAL population merely by removing its questionnaire wrapper.
  await db.$transaction(async tx=>{
   await lockTeacherDisclosure(tx,org.id)
   await expect(assertTeacherComparableDisclosure(tx,{organizationId:org.id,runId:randomUUID(),teacherUserId:teacher.id,
    scenario:'TEACHER_STUDENT_EVALUATION',enhanced:true,definitionDigest:studentFormComparableKey(form).slice(5),respondents:students.slice(0,9)})).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
  })
 },90000)
})
