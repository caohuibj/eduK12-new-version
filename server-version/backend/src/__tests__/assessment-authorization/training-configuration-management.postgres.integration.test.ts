import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'

const enabled=process.env.PRECISE_CONFIGURATION_ISOLATED==='1',suite=enabled?describe:describe.skip
suite('Training exact configuration management through authenticated HTTP and real PostgreSQL',()=>{
 let db:any,server:Server|undefined,base='',token:any,system:any,manager:any,otherManager:any,surveyManager:any,
  teacher:any,otherTeacher:any,selfManager:any,combination:any,selection:any,sourceScaleId:string
 let firstGrant:any,firstRequest:string,stage='setup'
 const key='academic_self_concept_biology_zh_cn',version='1.0.0'
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const requests:any[]=[]
 async function call(actor:any,path:string,body?:unknown,status=200){
  const jwt=actor?token({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,...proof}):null
  const started=performance.now()
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{
   ...(jwt?{Cookie:'ptool_session='+jwt+'; ptool_csrf=precise-test-csrf'}:{}),
   'X-CSRF-Token':'precise-test-csrf',Origin:'http://localhost:5173','Content-Type':'application/json',
  },...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any
  requests.push({stage,path,method:body===undefined?'GET':'POST',status:response.status,elapsedMs:performance.now()-started,responseBytes:Buffer.byteLength(JSON.stringify(payload))})
  expect(response.status,payload.message??path).toBe(status)
  return payload.data
 }
 beforeAll(async()=>{
  const selected=process.env.PRECISE_CONFIGURATION_TEST_DATABASE_URL
  if(!selected)throw Error('PRECISE_CONFIGURATION_TEST_DATABASE_URL is required for this selected suite')
  requireIsolatedReleaseDatabase(selected)
  if(process.env.NODE_ENV!=='test'||new URL(selected).pathname!=='/precise_authorization_test_20261029'
   ||process.env.REDIS_URL!=='redis://127.0.0.1:56389/0')throw Error('Dedicated local configuration fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()||await db.scale.count())throw Error('Fresh schema-only configuration fixture required; retain and inspect previous outcomes')
  const create=(label:string,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{
   username:'precise-test-'+label+'-'+randomUUID(),passwordHash:'!synthetic-no-login',accountDomain:'TRAINING',role,platformRole,teacherApproved:role==='TEACHER',
  }})
  system=await create('system','STUDENT','SYSTEM_ADMIN');manager=await create('manager');otherManager=await create('manager-other');surveyManager=await create('survey-manager')
  teacher=await create('teacher','TEACHER');otherTeacher=await create('teacher-other','TEACHER');selfManager=await create('teacher-manager','TEACHER')
  for(const [actor,entry] of [[manager,'TRAINING'],[otherManager,'TRAINING'],[surveyManager,'SURVEY'],[selfManager,'TRAINING']] as const)
   await db.adminEntryGrant.create({data:{id:randomUUID(),userId:actor.id,entry,grantedBy:system.id}})
  token=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const registry=await import('../../modules/scale/onboarding/instrument-registry')
  const source=registry.getScaleInstrumentSource(key,version)!,runtime=registry.getScaleInstrumentRuntimePolicy(key,version)!
  const installed=await (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{
   instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',
    territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],runtimePolicyHash:runtime.runtimePolicyHash,
    localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'},
  })
  sourceScaleId=installed.scaleId!
  const publication=await import('../../modules/scale/onboarding/publish'),input={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,
   visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]}
  const plan=await publication.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([])
  await publication.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})
  const candidate=await call(system,`/api/platform/survey-standard/candidate/${key}/${version}`)
  selection=candidate.selection
  const preview=await call(system,'/api/platform/survey-standard/preview',selection)
  combination=await call(system,'/api/platform/survey-standard/approve',{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,
   allowedProducts:['TRAINING'],reason:'Isolated configuration management fixture, actual trial required'})
  expect(combination.state,combination.blockers.join(';')).toBe('ONLINE')
  expect(await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${combination.id}`).toHaveLength(3)
 },60000)
 afterAll(async()=>{
  const output=process.env.PRECISE_CONFIGURATION_EVIDENCE??'/tmp/precise-configuration-management-http.json'
  await writeFile(output,JSON.stringify({kind:'isolated PostgreSQL and HTTP; not browser qualification',requests,source:{key,version,sourceScaleId,
   combinationId:combination?.id,combinationHash:combination?.combinationHash},productionAccessed:false},null,2)+'\n')
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('lists approved exact configuration headers only for the current separate Training entry manager',async()=>{
  stage='management-catalog'
  const result=await call(manager,'/api/questionnaire-products/standard-combinations/catalog')
  expect(result.list).toEqual([expect.objectContaining({id:combination.id,combinationHash:combination.combinationHash,assignable:true,
   versions:{CONTENT:combination.versions.CONTENT.version,PARAMETERS:combination.versions.PARAMETERS.version,REPORT:combination.versions.REPORT.version}})])
  expect(JSON.stringify(result)).not.toContain('compiledDefinition');expect(JSON.stringify(result)).not.toContain('interpretations')
  for(const actor of [system,teacher,surveyManager])await call(actor,'/api/questionnaire-products/standard-combinations/catalog',undefined,403)
  await call(null,'/api/questionnaire-products/standard-combinations/catalog',undefined,401)
 })
 it('issues the exact version to a real eligible recipient and reads that original grant back',async()=>{
  stage='grant-and-readback';firstRequest=randomUUID()
  firstGrant=await call(manager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`,{
   requestId:firstRequest,userId:teacher.id,combinationHash:combination.combinationHash,
  })
  const result=await call(manager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants?userId=${teacher.id}`)
  expect(result.list).toEqual([expect.objectContaining({id:firstGrant.id,userId:teacher.id,issuerId:manager.id,version:1,
   combinationHash:combination.combinationHash,revokedAt:null,canManage:true})])
  const choices=await (await import('../../modules/measurement-content/standard-combination-use')).listTrainingStandardCombinationChoices(teacher.id)
  expect(choices).toEqual([expect.objectContaining({combination:{releaseId:combination.id,combinationHash:combination.combinationHash},scaleId:sourceScaleId})])
  expect(await (await import('../../modules/measurement-content/standard-combination-use')).listTrainingStandardCombinationChoices(otherTeacher.id)).toEqual([])
 })
 it('rejects same-request changes, arbitrary hashes, cross-entry issuance and a system-admin use assignment',async()=>{
  stage='negative-issuance'
  const endpoint=`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`
  await call(manager,endpoint,{requestId:firstRequest,userId:otherTeacher.id,combinationHash:combination.combinationHash},403)
  await call(manager,endpoint,{requestId:randomUUID(),userId:teacher.id,combinationHash:'f'.repeat(64)},409)
  for(const actor of [system,surveyManager])await call(actor,endpoint,{requestId:randomUUID(),userId:otherTeacher.id,combinationHash:combination.combinationHash},403)
  expect(await db.materialGrant.count({where:{resourceType:'STANDARD_COMBINATION',resourceId:combination.id}})).toBe(1)
 })
 it('independently checks both self-grant roles, permitting a qualified teacher-manager and refusing a nonteacher manager',async()=>{
  stage='self-grant'
  const endpoint=`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`
  await call(manager,endpoint,{requestId:randomUUID(),userId:manager.id,combinationHash:combination.combinationHash},403)
  const granted=await call(selfManager,endpoint,{requestId:randomUUID(),userId:selfManager.id,combinationHash:combination.combinationHash})
  expect(granted.revoked).toBe(false)
 })
 it('does not let a different manager take over or revoke an active issuer grant',async()=>{
  stage='issuer-boundary'
  const list=await call(otherManager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants?userId=${teacher.id}`)
  expect(list.list[0]).toMatchObject({id:firstGrant.id,canManage:false})
  await call(otherManager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`,{
   requestId:randomUUID(),userId:teacher.id,combinationHash:combination.combinationHash,expectedUseVersion:1,
  },403)
  await call(otherManager,`/api/questionnaire-products/standard-combination-use-grants/${firstGrant.id}/revoke`,{expectedVersion:1,reason:'Cannot take over'},403)
 })
 it('rejects invalid targeted reads without exposing unrelated recipient grants',async()=>{
  stage='targeted-read'
  const endpoint=`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`
  expect((await call(manager,endpoint+'?userId='+otherTeacher.id)).list).toEqual([])
  await call(manager,endpoint+'?userId=arbitrary',undefined,400)
  await call(teacher,endpoint+'?userId='+teacher.id,undefined,403)
 })
 it('keeps withdrawn configuration readback available and revokes with the original use version',async()=>{
  stage='withdraw-and-revoke'
  const standard=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,combination.id)
  await call(system,`/api/platform/survey-standard/${combination.id}/withdraw`,{expectedVersion:standard.version,reason:'Synthetic withdrawal'})
  const catalog=await call(manager,'/api/questionnaire-products/standard-combinations/catalog')
  expect(catalog.list).toEqual([expect.objectContaining({id:combination.id,assignable:false,state:'WITHDRAWN'})])
  await call(manager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants`,{
   requestId:randomUUID(),userId:otherTeacher.id,combinationHash:combination.combinationHash,
  },409)
  const revoked=await call(manager,`/api/questionnaire-products/standard-combination-use-grants/${firstGrant.id}/revoke`,{expectedVersion:1,reason:'Explicit original issuer revoke'})
  expect(revoked).toMatchObject({id:firstGrant.id,version:2,revoked:true})
  const list=await call(manager,`/api/questionnaire-products/standard-combinations/${combination.id}/use-grants?userId=${teacher.id}`)
  expect(list.list[0]).toMatchObject({id:firstGrant.id,version:2});expect(list.list[0].revokedAt).toBeTruthy()
 })
})
