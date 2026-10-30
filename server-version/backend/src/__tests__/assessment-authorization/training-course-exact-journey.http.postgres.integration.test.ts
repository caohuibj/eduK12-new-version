import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_COURSE_JOURNEY==='1'?describe:describe.skip
suite('Training COURSE exact configuration through actual enrolled participant HTTP',()=>{
 let db:any,server:Server|undefined,base='',sign:any,teacher:any,manager:any,student:any,second:any,course:any,use:any,choice:any,row:any,savedItem:any,attempt:any,path='',state:any,source:any,baselineTasks:any,baselineUsers:any,baselineSources:any,baselineGrants:any,ready=false
 const requests:any[]=[],observations:any[]=[]
 const continueFinal=process.env.PRECISE_TRAINING_COURSE_CONTINUE_FINAL==='1'
 async function call(who:any,method:string,route:string,body?:unknown,status=200){
  const token=sign({userId:who.id,username:who.username,role:who.role,accountDomain:'TRAINING',tokenVersion:who.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:'ptool_session='+token+'; ptool_csrf=course-exact','X-CSRF-Token':'course-exact'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})
  requests.push({method,route,status:response.status});const text=await response.text()
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Non-JSON '+method+' '+route+' status '+response.status)
  const value=JSON.parse(text);expect(response.status,value.message??route).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit new Training COURSE clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_training_course_journey_test_20261029')throw Error('Named local COURSE clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==(continueFinal?6:4)||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==(continueFinal?13:12)||await db.course.count()!==1)throw Error('Read retained outcome before retry; no reset')
  course=await db.course.findFirstOrThrow();expect(course).toMatchObject({status:'PUBLISHED',courseType:'TRAINING_COURSE',isRecruiting:true})
  teacher=await db.user.findUniqueOrThrow({where:{id:course.creatorId}})
  const releases=await db.$queryRaw`SELECT id,snapshot FROM survey_standard_releases WHERE state='ONLINE'`
  const full=releases.find((r:any)=>r.snapshot.parts.REPORT.payload!==null)
  if(continueFinal){
   row=await db.compositeAssessment.findFirstOrThrow({where:{name:'Synthetic exact COURSE participant journey'}})
   savedItem=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'SCALE'}})
   choice={selectedBinding:savedItem.standardCombinationSource.reference.selectedBinding}
   student=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-exact-'}}});second=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-next-'}}})
   attempt=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{compositeAssessmentId:row.id,userId:student.id}})
   expect(attempt.status).toBe('IN_PROGRESS');expect(attempt.trainingTimingSnapshot).toBeNull()
   expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:row.id}})).toBe(1)
   path='/composite-assessments/attempts/'+attempt.id;ready=true
  }else{
   const choices=await(await import('../../modules/measurement-content/standard-combination-use')).listTrainingStandardCombinationChoices(teacher.id)
   choice=choices.find((c:any)=>c.combination.releaseId===full.id)
  }
  expect(choice.selectedBinding.authorizationRevision).toBe(7)
  use=await db.materialGrant.findUniqueOrThrow({where:{id:choice.selectedBinding.authorizationId}})
  expect(use).toMatchObject({version:continueFinal?8:7,teacherId:teacher.id});expect(Boolean(use.revokedAt)).toBe(continueFinal)
  manager=await db.user.findUniqueOrThrow({where:{id:use.grantedBy}})
  source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(full.snapshot.toolKey,full.snapshot.instrumentVersion)
  if(!source?.executable)throw Error('Installed executable original required')
  baselineTasks=await db.compositeAssessment.findMany({where:continueFinal?{id:{not:row.id}}:{},orderBy:{id:'asc'},include:{items:true}})
  baselineUsers=await db.user.findMany({where:continueFinal?{id:{notIn:[student.id,second.id]}}:{},orderBy:{id:'asc'}})
  baselineSources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`;baselineGrants=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/courses',(await import('../../routes/courses')).default)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  if(continueFinal){state=await call(student,'GET',path);expect(state.currentItem.type).toBe('SCALE');observations.push({resumeOriginalAttempt:true,originalUntimedPolicy:true,noRepeatedCreateJoinStartRevokeOrFormSubmit:true})}
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_COURSE_EVIDENCE??'/tmp/training-course-exact-journey.json',JSON.stringify({productionAccessed:false,
   scope:'Existing protected author/course enrollment and authenticated participant HTTP. Synthetic users/JWT proof only; actual native SCALE FINAL/report, not browser or human timing.',requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('freezes the administrator-selected configuration and requires normal course enrollment before START',async()=>{
  student=await db.user.create({data:{username:'synthetic-course-exact-'+randomUUID(),passwordHash:'Synthetic fixture only; never real login',role:'STUDENT',accountDomain:'TRAINING',isActive:true,isFrozen:false,mustChangePassword:false}})
  second=await db.user.create({data:{username:'synthetic-course-next-'+randomUUID(),passwordHash:'Synthetic fixture only; never real login',role:'STUDENT',accountDomain:'TRAINING',isActive:true,isFrozen:false,mustChangePassword:false}})
  row=await call(teacher,'POST','/questionnaire-products',{requestId:randomUUID(),name:'Synthetic exact COURSE participant journey',questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false})
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'Synthetic grade',contextKey:'gradeLevel',formOptions:[{value:'7',label:'Synthetic grade seven'}]}})
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'SCALE',scaleId:choice.scaleId,standardCombination:{...choice.combination,selectedBinding:choice.selectedBinding}}})
  savedItem=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'SCALE'}})
  expect(savedItem.standardCombinationSource.reference.selectedBinding).toEqual(choice.selectedBinding)
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/publish',{revision:row.revision})
  await call(student,'POST','/composite-assessments/'+row.id+'/attempts',{},403)
  await call(student,'POST','/courses/join',{courseCode:course.courseCode});await call(second,'POST','/courses/join',{courseCode:course.courseCode})
  expect(await db.courseStudent.count({where:{courseId:course.id,studentId:{in:[student.id,second.id]},status:'ACTIVE'}})).toBe(2)
  attempt=(await call(student,'POST','/composite-assessments/'+row.id+'/attempts',{})).attempt;path='/composite-assessments/attempts/'+attempt.id
  state=await call(student,'GET',path);expect(state.currentItem.type).toBe('FORM_SECTION')
  attempt=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
  const unit=attempt.trainingContentBinding.units.find((u:any)=>u.itemId===savedItem.id)
  expect(unit.source.standardCombination.reference.selectedBinding).toEqual(choice.selectedBinding);expect(unit.report).toBeTruthy()
  ready=true;observations.push({taskId:row.id,attemptId:attempt.id,sourceUseRevision:7,selectedBinding:choice.selectedBinding,nonMemberStartDenied:true,actualEnrollmentRows:2,coursePublishedAndFrozen:true})
 },30000)
 it('denies a new enrolled participant after revoke but completes the old frozen attempt and rereads its exact report',async()=>{
  if(!ready)throw Error('Course admission incomplete; dependent writes forbidden')
  if(!continueFinal){
   await call(manager,'POST','/questionnaire-products/standard-combination-use-grants/'+use.id+'/revoke',{expectedVersion:7,reason:'Synthetic ordinary use revoke after COURSE admission'})
   await call(second,'POST','/composite-assessments/'+row.id+'/attempts',{},403)
   await call(student,'POST',path+'/form-sections/'+state.currentItem.id+'/submit',{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,
    contextSnapshotHash:state.contextSnapshotHash,answers:state.currentItem.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))})
   state=await call(student,'GET',path);expect(state.currentItem.type).toBe('SCALE')
  }
  const definition=source.executable.definition
  const answers=definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:definition.responseSets.find((s:any)=>s.key===i.responseSetKey).options[0].value}))
  const submission={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers,
   ...(attempt.trainingTimingSnapshot?{itemTimings:Object.fromEntries(definition.items.map((i:any)=>[i.itemCode,
    {schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))}:{})}
  const receipt=await call(student,'POST',path+'/items/'+savedItem.id+'/scale/submit?response=receipt',submission)
  expect(receipt).toBeTruthy();await call(student,'POST',path+'/items/'+savedItem.id+'/scale/submit?response=receipt',submission)
  expect((await call(student,'GET',path)).status).toBe('COMPLETED')
  const final=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}});expect(final.trainingContentBinding).toEqual(attempt.trainingContentBinding)
  const report=await call(teacher,'GET','/composite-assessments/'+row.id+'/attempts/'+attempt.id+'/report');expect(report.contentReports).toHaveLength(1)
  expect(await call(teacher,'GET','/composite-assessments/'+row.id+'/attempts/'+attempt.id+'/report')).toEqual(report)
  await call(second,'GET',path+'/report',undefined,403)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:row.id}})).toBe(1)
  expect(await db.compositeAssessment.findMany({where:{id:{not:row.id}},orderBy:{id:'asc'},include:{items:true}})).toEqual(baselineTasks)
  expect(await db.user.findMany({where:{id:{in:baselineUsers.map((u:any)=>u.id)}},orderBy:{id:'asc'}})).toEqual(baselineUsers)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(baselineSources)
  const after=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  for(const old of baselineGrants){const current=after.find((g:any)=>g.id===old.id)
   if(old.id===use.id)expect(current).toMatchObject({version:8,revokedAt:expect.any(Date)});else expect(current).toEqual(old)}
  observations.push({newEnrolledStartDenied:true,oldAdmittedCompletesAfterRevoke:true,oneAttemptOnly:true,originalT3BindingRetained:true,
   fullFrozenTeacherReportReread:true,otherStudentReportDenied:true,oldTwelveTasksAndOriginalUsersUnchanged:true,answeredItems:answers.length})
 },30000)
})
