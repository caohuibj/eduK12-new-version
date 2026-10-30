/** Explicit opt-in, disposable local PostgreSQL. Creates legitimate fixtures via
 * existing install/publication/approval APIs; never repairs or resets old rows. */
import {randomUUID,createHash} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const enabled=process.env.PRECISE_GENERAL_JOURNEY==='1',suite=enabled?describe:describe.skip
suite('Training anonymous GENERAL exact configuration lifecycle, real HTTP and PostgreSQL',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,manager:any,teacher:any,outsider:any,source:any,scaleId:string,pointer:any,use:any
 let stage='setup'
 const events:any[]=[],summary:any={productionAccessed:false,browserQualification:false}
 const key='academic_self_concept_biology_zh_cn',version='1.0.0'
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
 async function request(actor:any,path:string,body?:unknown,status=200,recovery?:string){
  const jwt=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,...proof}):null
  const started=performance.now(),response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{
   ...(jwt?{Cookie:'ptool_session='+jwt+'; ptool_csrf=precise-general-csrf'}:{}),'X-CSRF-Token':'precise-general-csrf',
   ...(recovery?{'X-Recovery-Token':recovery}:{}),Origin:'http://localhost:5173','Content-Type':'application/json',
  },...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any
  // Public link values, credentials, answers and report content stay out of evidence.
  events.push({stage,method:body===undefined?'GET':'POST',path:path.replace(/\/public\/composite-assessments\/[^/]+\/start$/,'/public/composite-assessments/:token/start'),
   status:response.status,elapsedMs:performance.now()-started,responseBytes:Buffer.byteLength(JSON.stringify(payload))})
  expect(response.status,stage+': '+(payload.message??'HTTP failure')).toBe(status)
  return payload.data
 }
 beforeAll(async()=>{
  const selected=process.env.PRECISE_GENERAL_TEST_DATABASE_URL
  if(!selected)throw Error('Explicit PRECISE_GENERAL_TEST_DATABASE_URL is required')
  requireIsolatedReleaseDatabase(selected)
  if(process.env.NODE_ENV!=='test'||new URL(selected).pathname!=='/precise_general_test_20261029'
   ||new URL(selected).port!=='55439'||process.env.REDIS_URL!=='redis://127.0.0.1:56389/0')throw Error('Dedicated local GENERAL fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()||await db.scale.count())throw Error('Fresh schema-only fixture required; inspect retained results rather than rerun')
  const create=(name:string,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'precise-general-'+name+'-'+randomUUID(),
   passwordHash:'!synthetic-no-login',accountDomain:'TRAINING',role,platformRole,teacherApproved:role==='TEACHER'}})
  system=await create('system','STUDENT','SYSTEM_ADMIN');manager=await create('manager');teacher=await create('teacher','TEACHER');outsider=await create('outsider','TEACHER')
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'TRAINING',grantedBy:system.id}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use('/api/public/composite-assessments',(await import('../../modules/composite/composite.public.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const registry=await import('../../modules/scale/onboarding/instrument-registry')
  source=registry.getScaleInstrumentSource(key,version)!
  const runtime=registry.getScaleInstrumentRuntimePolicy(key,version)!
  scaleId=(await (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,
   deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],
    runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}})).scaleId!
  const publication=await import('../../modules/scale/onboarding/publish'),input={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]}
  const plan=await publication.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([])
  await publication.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})
  const candidate=await request(system,`/api/platform/survey-standard/candidate/${key}/${version}`)
  const preview=await request(system,'/api/platform/survey-standard/preview',candidate.selection)
  const approved=await request(system,'/api/platform/survey-standard/approve',{...candidate.selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,
   allowedProducts:['TRAINING'],reason:'Real isolated anonymous GENERAL journey'})
  expect(approved.state,approved.blockers.join(';')).toBe('ONLINE')
  pointer={releaseId:approved.id,combinationHash:approved.combinationHash}
  use=await request(manager,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash})
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_GENERAL_EVIDENCE??'/tmp/precise-general-http.json',JSON.stringify({...summary,source:{key,version,scaleId,pointer},events},null,2)+'\n')
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('binds at draft, publishes, admits anonymously, freezes FINAL, preserves admitted completion and history after ordinary revoke',async()=>{
  const expiresAt=new Date(Date.now()+3600000).toISOString()
  async function draft(name:string){
   let row=await request(teacher,'/api/questionnaire-products',{requestId:randomUUID(),name,questionnaireType:'GENERAL',publicEnabled:true,expiresAt})
   row=await request(teacher,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
   return request(teacher,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'SCALE',scaleId,required:true,standardCombination:pointer}})
  }
  stage='draft-binding'
  let row=await draft('Synthetic exact anonymous GENERAL'),waiting=await draft('Synthetic waiting exact GENERAL')
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'SCALE'}})
  const original=item.standardCombinationSource,originalHash=digest(original)
  expect(original.reference.authority.useGrantId).toBe(use.id)
  expect(original.reference.combination).toMatchObject(pointer)
  expect(await db.course.count()).toBe(0)
  stage='publish-fixed-source'
  row=await request(teacher,`/api/questionnaire-products/${row.id}/publish`,{revision:row.revision})
  const published=await db.compositeAssessmentItem.findUniqueOrThrow({where:{id:item.id}})
  expect(digest(published.standardCombinationSource)).toBe(originalHash)
  const link=await request(teacher,`/api/composite-assessments/${row.id}/public-tokens`,{expiresAt,maxUses:5})
  stage='anonymous-start-and-context'
  const started=await request(null,`/api/public/composite-assessments/${link.token}/start`,{}),attemptId=started.attempt.id
  const path=`/api/public/composite-assessments/attempts/${attemptId}`,recovery=started.recoveryToken
  expect(recovery).toBeTruthy();expect(started.attempt.userId??null).toBeNull()
  let state=await request(null,path,undefined,200,recovery)
  const section=state.currentItem;expect(section.type).toBe('FORM_SECTION')
  await request(null,`${path}/form-sections/${section.id}/submit`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,
   contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))},200,recovery)
  state=await request(null,path,undefined,200,recovery);expect(state.currentItem.type).toBe('SCALE')
  const admitted=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  const bindingHash=digest(admitted.trainingContentBinding)
  expect(admitted.trainingContentBinding.units.find((u:any)=>u.itemId===item.id).source.standardCombination.reference.combination).toMatchObject(pointer)
  stage='ordinary-revoke'
  await request(manager,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:use.version,reason:'Ordinary isolated grant revocation after admission'})
  await request(teacher,`/api/questionnaire-products/${waiting.id}/publish`,{revision:waiting.revision},403)
  await request(null,`/api/public/composite-assessments/${link.token}/start`,{},403)
  expect(digest((await db.compositeAssessmentItem.findUniqueOrThrow({where:{id:item.id}})).standardCombinationSource)).toBe(originalHash)
  stage='admitted-final-and-recovery'
  const resumed=await request(null,`/api/public/composite-assessments/${link.token}/start`,{recoveryToken:recovery})
  expect(resumed.attempt.id).toBe(attemptId);expect(resumed.recoveryToken).toBeNull()
  const input={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,contextSnapshotHash:state.contextSnapshotHash,
   answers:source.executable.definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:'3'}))}
  const finalPath=`${path}/items/${item.id}/scale/submit?response=receipt`
  await request(null,finalPath,input,200,recovery)
  await request(null,finalPath,input,200,recovery)
  state=await request(null,path,undefined,200,recovery);expect(state.status).toBe('COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  expect(digest(parent.trainingContentBinding)).toBe(bindingHash)
  const receipt=(await import('../../modules/composite/training-content-final')).decodeTrainingFinalReceipt(parent)!
  expect(receipt.interpretation.units[0].report.status).toBe('READY')
  stage='historical-report-and-principal-boundary'
  const reportPath=`/api/composite-assessments/${row.id}/attempts/${attemptId}/report`
  const report=await request(teacher,reportPath);expect(report.contentReports).toHaveLength(1)
  const again=await request(teacher,reportPath);expect(again.contentReports).toEqual(report.contentReports)
  await request(outsider,reportPath,undefined,403)
  await request(null,path,undefined,400)
  Object.assign(summary,{passed:true,attemptId,draftSourceHash:originalHash,admissionBindingHash:bindingHash,
   teacherReportStatus:report.contentReports[0].status,internalFrozenReportStatus:receipt.interpretation.units[0].report.status,
   ordinaryRevocation:{oldDraftPublish:'DENIED',publishedNewStart:'DENIED',admittedResume:'ALLOWED',admittedFinal:'ALLOWED',historicalReport:'EXISTING_DATA_ACL'}})
 },120000)
})
