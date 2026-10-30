import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_REPLACEMENT==='1'?describe:describe.skip
suite('Training replacement locks original and target revisions independently',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,teacher:any,other:any,service:any,products:any,actor:any,full:any,empty:any,old:any,target:any,body:any,issued:any
 const resumeSetup=process.env.PRECISE_TRAINING_REPLACEMENT_RESUME_SETUP==='1',headerStage=process.env.PRECISE_TRAINING_REPLACEMENT_HEADER_STAGE==='1'
 let published:any,waiting:any,course:any,attempt:any,link:any,recovery='',path='',oldT1:any,sourceRows:any,scaleBefore:any,initialTasks:any
 const observations:any[]=[],requests:any[]=[]
 async function call(who:any,route:string,input?:unknown,status=200,token?:string){
  const jwt=who?sign({userId:who.id,username:who.username,role:who.role,accountDomain:'TRAINING',tokenVersion:who.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const response=await fetch(base+route,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173','X-CSRF-Token':'training-replacement',
   ...(jwt?{Cookie:'ptool_session='+jwt+'; ptool_csrf=training-replacement','X-CSRF-Token':'training-replacement'}:{}),...(token?{'X-Recovery-Token':token}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const value=await response.json() as any,safeRoute=route.replace(/\/public\/composite-assessments\/[^/]+\/start$/,'/public/composite-assessments/:token/start');requests.push({route:safeRoute,status:response.status});expect(response.status,value.message??safeRoute).toBe(status);return value.data
 }
 async function draft(type:'GENERAL'|'COURSE',choice:any,name:string){
  let row=await call(teacher,'/api/questionnaire-products',{requestId:randomUUID(),name,questionnaireType:type,publicEnabled:type==='GENERAL',
   ...(type==='GENERAL'?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{courseIds:[(await db.course.findFirstOrThrow()).id]})})
  row=await call(teacher,'/api/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  return call(teacher,'/api/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'SCALE',scaleId:choice.scaleId,required:true,standardCombination:{...choice.combination,selectedBinding:choice.selectedBinding}}})
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new Training replacement clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_training_replacement_test_20261029')throw Error('Named local Training clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==4||await db.materialGrant.count()!==4||await db.materialGrant.count({where:{revokedAt:{not:null}}})!==((resumeSetup||headerStage)?1:0)||await db.compositeAssessment.count()!==(headerStage?12:resumeSetup?11:8)||await db.course.count()!==1)throw Error('Read retained outcomes before retry; no reset')
  const entry=await db.adminEntryGrant.findFirstOrThrow({where:{entry:'TRAINING',revokedAt:null}});manager=await db.user.findUniqueOrThrow({where:{id:entry.userId}})
  sourceRows=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`
  full=sourceRows.find((r:any)=>r.snapshot.parts.REPORT.payload!==null);empty=sourceRows.find((r:any)=>r.snapshot.parts.REPORT.payload===null)
  old=await db.materialGrant.findFirstOrThrow({where:{resourceId:full.id,version:headerStage?7:5,revokedAt:null}});teacher=await db.user.findUniqueOrThrow({where:{id:old.teacherId}})
  other=await db.user.findFirstOrThrow({where:{role:'TEACHER',id:{not:teacher.id}}});target=await db.materialGrant.findFirstOrThrow({where:{resourceId:empty.id,teacherId:teacher.id}})
  expect(target.version).toBe(headerStage?6:resumeSetup?4:3)
  oldT1=await db.assessmentManagementEvent.findMany({where:{action:'STANDARD_COMBINATION_USE_GRANTED',resourceId:full.id,metadata:{path:['useVersion'],equals:5}}})
  scaleBefore=await db.scale.findMany({orderBy:{id:'asc'}});initialTasks=await db.compositeAssessment.findMany({where:{NOT:[{name:{startsWith:'Training replacement '}},{name:{startsWith:'Training explicit replacement '}}]},orderBy:{id:'asc'}});expect(initialTasks).toHaveLength(8)
  service=await import('../../modules/measurement-content/standard-combination-use');products=await import('../../modules/questionnaire-product/service');actor={userId:teacher.id,role:'TEACHER'}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use('/api/public/composite-assessments',(await import('../../modules/composite/composite.public.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_REPLACEMENT_EVIDENCE??'/tmp/training-standard-replacement.json',JSON.stringify({productionAccessed:false,
   scope:'Actual Training manager/author/public HTTP, exact source preparation, independent old/target revisions, admitted recovery and new report binding. No scoring/FINAL/report rerun.',observations,requests},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('explicitly revokes the already active target and prepares actual GENERAL, COURSE and admitted old bindings',async()=>{
  if(!resumeSetup)await call(manager,'/api/questionnaire-products/standard-combination-use-grants/'+target.id+'/revoke',{expectedVersion:3,reason:'Explicitly close the existing target revision before replacement'})
  const choice=(await service.listTrainingStandardCombinationChoices(teacher.id)).find((r:any)=>r.combination.releaseId===full.id)
  let row:any
  if(resumeSetup){
   const known=await db.compositeAssessment.findMany({where:{name:{startsWith:'Training replacement '}},include:{items:true}});expect(known).toHaveLength(3)
   row=known.find((value:any)=>value.name==='Training replacement GENERAL baseline');waiting=known.find((value:any)=>value.name==='Training replacement waiting original');course=known.find((value:any)=>value.name==='Training replacement COURSE baseline')
   expect(row?.status).toBe('PUBLISHED');expect(waiting?.status).toBe('DRAFT');expect(course?.status).toBe('PUBLISHED');expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:row.id}})).toBe(0)
   published=row;observations.push({resumedReadbackOnly:true,existingTasksReused:3,targetRevokedVersion:4,noReplacementEventsBeforeResume:await db.assessmentManagementEvent.count({where:{action:'STANDARD_COMBINATION_USE_REPLACED'}})})
  }else{
   row=await draft('GENERAL',choice,'Training replacement GENERAL baseline');waiting=await draft('GENERAL',choice,'Training replacement waiting original')
   row=await call(teacher,'/api/questionnaire-products/'+row.id+'/publish',{revision:row.revision});published=await db.compositeAssessment.findUniqueOrThrow({where:{id:row.id},include:{items:true}})
   let courseRow=await draft('COURSE',choice,'Training replacement COURSE baseline');await call(teacher,'/api/questionnaire-products/'+courseRow.id+'/publish',{revision:courseRow.revision});course=await db.compositeAssessment.findUniqueOrThrow({where:{id:courseRow.id},include:{items:true}})
  }
  link=await call(teacher,'/api/composite-assessments/'+row.id+'/public-tokens',{expiresAt:new Date(published.expiresAt).toISOString(),maxUses:5})
  const started=await call(null,'/api/public/composite-assessments/'+link.token+'/start',{});recovery=started.recoveryToken;path='/api/public/composite-assessments/attempts/'+started.attempt.id
  const state=await call(null,path,undefined,200,recovery),section=state.currentItem;expect(section.type).toBe('FORM_SECTION')
  await call(null,path+'/form-sections/'+section.id+'/submit',{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:state.contextSnapshotHash,
   answers:section.answers.map((answer:any)=>({formItemId:answer.formItemId??answer.id,value:'7'}))},200,recovery)
  expect((await call(null,path,undefined,200,recovery)).currentItem.type).toBe('SCALE')
  attempt=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}})
  expect(attempt.trainingContentBinding.units.find((unit:any)=>unit.source.standardCombination).report).toBeTruthy()
  published=await db.compositeAssessment.findUniqueOrThrow({where:{id:row.id},include:{items:true}})
  body={requestId:randomUUID(),userId:teacher.id,combinationHash:empty.combination_hash,configurationName:'管理员明确替换无反馈',expectedUseId:target.id,expectedUseVersion:4,
   replaces:{grantId:old.id,expectedVersion:5,reason:'Replace the exact full report with the approved absent report'}}
  observations.push({oldId:old.id,oldVersion:5,targetId:target.id,targetRevokedVersion:4,generalId:published.id,courseId:course.id,waitingId:waiting.id,oldAttemptId:attempt.id})
 },60000)
 it('rejects another recipient, wrong old revision, injected pointer and a substituted target id without changing either use',async()=>{
  if(!body)throw Error('Prior fixture incomplete; dependent mutation forbidden')
  const before=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  const route='/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants'
  await call(manager,route,{...body,userId:other.id,expectedUseId:undefined,expectedUseVersion:undefined},409)
  await call(manager,route,{...body,replaces:{...body.replaces,expectedVersion:3}},409)
  await call(manager,route,{...body,replaces:{...body.replaces,selectedBinding:{injected:true}}},400)
  await call(manager,route,{...body,expectedUseId:randomUUID()},409)
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(before)
  expect(await db.assessmentManagementEvent.findUnique({where:{id:body.requestId}})).toBeNull()
 })
 it('atomically issues target revision5 and revokes original revision5 while old admitted recovery remains fixed and new START is denied',async()=>{
  if(!body)throw Error('Prior fixture incomplete; replacement forbidden')
  const route='/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants'
  issued=await call(manager,route,body)
  expect(issued).toMatchObject({id:target.id,version:5,currentVersion:5,supersedes:{selectedBinding:{authorizationId:old.id,authorizationRevision:5},reason:body.replaces.reason}})
  expect(await db.materialGrant.findUniqueOrThrow({where:{id:old.id}})).toMatchObject({version:6,revokedAt:expect.any(Date)})
  expect(await call(manager,route,body)).toMatchObject({id:target.id,version:5,replayed:true})
  const original=await call(manager,'/api/questionnaire-products/standard-combinations/'+empty.id+'/use-requests/'+body.requestId)
  expect(original.operation.request).toMatchObject(body);expect(original.operation.grant.supersedes).toEqual(issued.supersedes)
  await call(teacher,'/api/questionnaire-products/'+waiting.id+'/publish',{revision:waiting.revision},403)
  await call(null,'/api/public/composite-assessments/'+link.token+'/start',{},403)
  expect((await call(null,'/api/public/composite-assessments/'+link.token+'/start',{recoveryToken:recovery})).attempt.id).toBe(attempt.id)
  expect((await call(null,path,undefined,200,recovery)).currentItem.type).toBe('SCALE')
  expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).trainingContentBinding).toEqual(attempt.trainingContentBinding)
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:published.id},include:{items:true}})).toEqual(published)
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:course.id},include:{items:true}})).toEqual(course)
  expect(await db.assessmentManagementEvent.findMany({where:{action:'STANDARD_COMBINATION_USE_GRANTED',resourceId:full.id,metadata:{path:['useVersion'],equals:5}}})).toEqual(oldT1)
  const choice=(await service.listTrainingStandardCombinationChoices(teacher.id)).find((r:any)=>r.combination.releaseId===empty.id)
  let next=await draft('GENERAL',choice,'Training explicit replacement NONE report');await call(teacher,'/api/questionnaire-products/'+next.id+'/publish',{revision:next.revision})
  const nextStored=await db.compositeAssessment.findUniqueOrThrow({where:{id:next.id}})
  const token=await call(teacher,'/api/composite-assessments/'+next.id+'/public-tokens',{expiresAt:nextStored.expiresAt.toISOString(),maxUses:2})
  const start=await call(null,'/api/public/composite-assessments/'+token.token+'/start',{}),newAttempt=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:start.attempt.id}})
  const unit=newAttempt.trainingContentBinding.units.find((row:any)=>row.source.standardCombination)
  expect(unit.source.standardCombination.reference).toMatchObject({configurationName:body.configurationName,authority:{useGrantId:target.id,useGrantVersion:5},combination:{releaseId:empty.id}})
  expect(unit.report??null).toBeNull();expect(await db.scale.findMany({orderBy:{id:'asc'}})).toEqual(scaleBefore)
  observations.push({oldOrdinaryRevokedVersion:6,newTargetVersion:5,supersedes:issued.supersedes,oldDraftPublishAndNewStartDenied:true,admittedScaleRecovered:true,originalT1AndPublishedBindingsUnchanged:true,newAttemptId:newAttempt.id,newReportExplicitlyAbsent:true,nativeDefaultReportUnchanged:true})
 },60000)
 it('accepts one concurrent replacement back to the original target and preserves the first original receipt after further revisions',async()=>{
  if(!issued)throw Error('Prior replacement incomplete; concurrent mutation forbidden')
  const route='/api/questionnaire-products/standard-combinations/'+full.id+'/use-grants'
  const input=(reason:string)=>({requestId:randomUUID(),userId:teacher.id,combinationHash:full.combination_hash,configurationName:'明确回到完整报告',expectedUseId:old.id,expectedUseVersion:6,
   replaces:{grantId:target.id,expectedVersion:5,reason}})
  const one=input('Concurrent A'),two=input('Concurrent B')
  const results=await Promise.allSettled([service.grantTrainingStandardCombinationUse(manager.id,full.id,one),service.grantTrainingStandardCombinationUse(manager.id,full.id,two)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const failures=results.filter(r=>r.status==='rejected') as PromiseRejectedResult[];expect(failures).toHaveLength(1);expect(failures[0].reason).toMatchObject({statusCode:409})
  expect(await db.materialGrant.findUniqueOrThrow({where:{id:old.id}})).toMatchObject({version:7,revokedAt:null});expect(await db.materialGrant.findUniqueOrThrow({where:{id:target.id}})).toMatchObject({version:6,revokedAt:expect.any(Date)})
  const original=await call(manager,'/api/questionnaire-products/standard-combinations/'+empty.id+'/use-requests/'+body.requestId)
  expect(original.operation.grant).toMatchObject({version:5,currentVersion:6,revoked:true,supersedes:issued.supersedes});expect(original.operation.request).toMatchObject(body)
  expect(await call(manager,'/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants',body)).toMatchObject({version:5,currentVersion:6,revoked:true,replayed:true,supersedes:issued.supersedes})
  expect(await db.materialGrant.count()).toBe(4);expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(sourceRows)
  const oldIds=initialTasks.map((row:any)=>row.id);expect(await db.compositeAssessment.findMany({where:{id:{in:oldIds}},orderBy:{id:'asc'}})).toEqual(initialTasks)
  observations.push({concurrentAccepted:1,concurrentConflict:1,totalGrantRows:4,oldPhysicalUseRevision:7,targetPhysicalUseRevision:6,initialTemplateTasksAndSourceRowsUnchanged:true,historicalOriginalRequestStillReportsItsOwnRevision:true})
 },30000)

 it('reads only original identity headers and enforces actual issuer and dual-qualified self-use without adding roles during issuance',async()=>{
  if(!headerStage)throw Error('Explicit retained post-replacement header stage required; run this new case separately')
  expect(await db.adminEntryGrant.count({where:{entry:'TRAINING',revokedAt:null}})).toBe(1)
  const sql:string[]=[];db.$on('query',(event:{query:string})=>sql.push(event.query))
  const fullHeader=await call(manager,'/api/questionnaire-products/standard-combinations/'+full.id+'/use-grants?userId='+teacher.id)
  const noneHeader=await call(manager,'/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants?userId='+teacher.id)
  expect(fullHeader.list[0]).toMatchObject({id:old.id,version:7,selectedBinding:{authorizationId:old.id,authorizationRevision:7}})
  expect(noneHeader.list[0]).toMatchObject({id:target.id,version:6,revokedAt:expect.any(String),selectedBinding:{authorizationId:target.id,authorizationRevision:5}})
  expect(Object.keys(fullHeader.list[0].selectedBinding).sort()).toEqual(['authorizationId','authorizationRevision','bindingHash','configurationHash'])
  expect(fullHeader.list[0].evidence).toBeUndefined();expect(fullHeader.list[0].authorityEntryGrantId).toBeUndefined();expect(fullHeader.list[0].definition).toBeUndefined()
  expect(sql.filter(query=>query.includes('FROM material_grants g JOIN users'))).toHaveLength(2)
  expect(sql.some(query=>query.includes('measurement_content_releases'))).toBe(false)
  const headerQueryCount=sql.length
  const route='/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants'
  const input={requestId:randomUUID(),userId:teacher.id,combinationHash:empty.combination_hash,configurationName:'拒绝接管另一发行者',expectedUseId:target.id,expectedUseVersion:6,
   replaces:{grantId:old.id,expectedVersion:7,reason:'Qualified manager still cannot replace another issuer'}}
  // This teacher is a valid recipient but not an issuer yet. A refusal must not
  // manufacture an entry role inside the grant API.
  await call(other,route,input,403);expect(await db.adminEntryGrant.count({where:{userId:other.id}})).toBe(0)
  // Explicit fixture setup through the existing independent system-admin API.
  // This is outside issuance, not a grant-time role repair.
  const system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  await (await import('../../modules/admin-permissions/service')).changeEntryGrant({actorUserId:system.id,targetUserId:other.id,entry:'TRAINING',active:true,expectedVersion:0,
   reason:'Explicit isolated positive/negative dual-role fixture, separate from use issuance',actorSession:{tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}})
  other=await db.user.findUniqueOrThrow({where:{id:other.id}})
  const before=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  await call(other,route,input,409);expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(before)
  // A current entry administrator without the Teacher recipient qualification
  // also cannot grant use to themselves; no user role is filled in.
  await call(manager,route,{requestId:randomUUID(),userId:manager.id,combinationHash:empty.combination_hash,configurationName:'无教师资格自授'},403)
  expect((await db.user.findUniqueOrThrow({where:{id:manager.id}})).role).toBe('STUDENT')
  // An already active target cannot be overwritten by replacement.
  await call(manager,route,{requestId:randomUUID(),userId:teacher.id,combinationHash:empty.combination_hash,configurationName:'并行已生效无反馈',expectedUseId:target.id,expectedUseVersion:6})
  await call(manager,route,{...input,requestId:randomUUID(),expectedUseVersion:7},409)
  await call(manager,'/api/questionnaire-products/standard-combinations/'+full.id+'/use-grants',{...input,requestId:randomUUID(),combinationHash:full.combination_hash,expectedUseId:old.id,expectedUseVersion:7},409)
  const own=await db.materialGrant.findFirstOrThrow({where:{teacherId:other.id,resourceId:empty.id}});expect(own.grantedBy).toBe(manager.id);expect(own.version).toBe(1)
  await call(manager,'/api/questionnaire-products/standard-combination-use-grants/'+own.id+'/revoke',{expectedVersion:1,reason:'Original issuer explicitly closes old target for a new qualified self-use fixture'})
  const userBefore=await db.user.findUniqueOrThrow({where:{id:other.id}}),entryBefore=await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:other.id,entry:'TRAINING'}}})
  const selfRequest=randomUUID(),self=await call(other,route,{requestId:selfRequest,userId:other.id,combinationHash:empty.combination_hash,configurationName:'合法双资格自用无反馈',expectedUseId:own.id,expectedUseVersion:2})
  expect(self).toMatchObject({id:own.id,version:3,revoked:false});expect((await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:selfRequest}})).metadata.selfGrant).toBe(true)
  expect(await db.user.findUniqueOrThrow({where:{id:other.id}})).toEqual(userBefore);expect(await db.adminEntryGrant.findUniqueOrThrow({where:{id:entryBefore.id}})).toEqual(entryBefore)
  const read=await call(manager,'/api/questionnaire-products/standard-combinations/'+empty.id+'/use-grants?userId='+other.id)
  expect(read.list[0]).toMatchObject({issuerId:other.id,canManage:false,selectedBinding:{authorizationId:own.id,authorizationRevision:3}})
  const reportTask=await db.compositeAssessment.findFirstOrThrow({where:{name:'Training replacement GENERAL baseline'}}),reportAttempt=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{compositeAssessmentId:reportTask.id}})
  const jwt=sign({userId:other.id,username:other.username,role:other.role,accountDomain:'TRAINING',tokenVersion:other.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api/composite-assessments/'+reportTask.id+'/attempts/'+reportAttempt.id+'/report',{headers:{Cookie:'ptool_session='+jwt,Origin:'http://localhost:5173','X-EduK12-Account-View':'BUSINESS'}})
  expect(response.status).toBe(403);requests.push({route:'/api/composite-assessments/:task/attempts/:attempt/report (BUSINESS)',status:response.status})
  expect(await db.materialGrant.count()).toBe(4);expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(sourceRows)
  observations.push({originalIdentityHeaderOnly:true,headerSqlCount:headerQueryCount,twoRecipientHeaderQueries:2,noContentBodyQueries:true,unqualifiedIssuerDeniedWithoutRoleWrite:true,qualifiedOtherIssuerStillDenied:true,
   unqualifiedRecipientSelfDenied:true,activeTargetAndSameCombinationReplacementDenied:true,explicitFixtureQualificationSeparateFromIssuance:true,qualifiedSelfUse:true,selfGrantId:self.id,selfGrantRevision:3,userAndEntryUnchangedDuringSelfIssue:true,otherBusinessReportDenied:true,totalGrantRows:4})
 },60000)
})
