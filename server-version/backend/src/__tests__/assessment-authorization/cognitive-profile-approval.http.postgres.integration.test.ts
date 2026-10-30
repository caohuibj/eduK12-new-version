import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_COGNITIVE_PROFILE_APPROVAL==='1'?describe:describe.skip
suite('Exact cognitive profile system approval through protected HTTP and actual runtime PostgreSQL',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,manager:any,teacher:any,config:any,before:any,experience:any,research:any,request:any,ready=false,setupStage='identity'
 const requests:any[]=[],observations:any[]=[]
 async function call(who:any,method:string,path:string,body?:unknown,status=200,age=0){
  const token=who?sign({userId:who.id,username:who.username,role:who.role,accountDomain:'TRAINING',tokenVersion:who.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000)-age,adminSessionId:randomUUID()}):null
  const response=await fetch(base+'/api/cognitive/profile-configurations'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   ...(token?{Cookie:'ptool_session='+token+'; ptool_csrf=profile-approval','X-CSRF-Token':'profile-approval'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  requests.push({method,path,status:response.status,expectedStatus:status});const text=await response.text()
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Non-JSON '+method+' '+path+' '+response.status)
  const value=JSON.parse(text);expect(response.status,value.message??path).toBe(status);expect(response.headers.get('cache-control')??'').toContain('no-store');return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit retained migrated profile fixture required')
  requireIsolatedReleaseDatabase(url);const parsed=new URL(url)
  if(process.env.NODE_ENV!=='test'||parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact actual runtime fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.$queryRaw`SELECT current_user,session_user`).toEqual([{current_user:'precise_task1_runtime',session_user:'precise_task1_runtime'}])
  const [{count}]=await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations`;expect(count).toBe(257)
  if(await db.user.count()!==6||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==13
   ||await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})!==0)throw Error('Read retained approval outcome before retry; no reset')
  setupStage='actors';config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',configVersion:'1.1.0',status:'PUBLISHED'}})
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  const grant=await db.adminEntryGrant.findFirstOrThrow({where:{entry:'TRAINING',revokedAt:null}})
  manager=await db.user.findUniqueOrThrow({where:{id:grant.userId}})
  teacher=await db.user.findFirstOrThrow({where:{role:'TEACHER',platformRole:'STANDARD',teacherApproved:true}})
  setupStage='baseline-reads';before={users:await db.user.findMany({orderBy:{id:'asc'}}),grants:await db.materialGrant.findMany({orderBy:{id:'asc'}}),
   tasks:await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}}),attempts:await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}}),
   templates:await db.$queryRaw`SELECT * FROM assessment_public_templates ORDER BY template_hash`,
   policies:await db.$queryRaw`SELECT * FROM survey_tool_policies ORDER BY product,resource_key,fingerprint`}
  setupStage='actual-router-import'
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port;setupStage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_COGNITIVE_APPROVAL_EVIDENCE??'/tmp/cognitive-profile-approval-http.json',JSON.stringify({productionAccessed:false,
   scope:'System approval of two existing main profiles for exact four entry scopes; synthetic JWT recent-MFA proof, not real browser MFA or recipient use.',
   configId:config?.id,setupStage,requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('resolves exact profile/M provenance only for the separate system approver, without granting a user',async()=>{
  const path='/system/'+config.id+'/experience'
  experience=await call(system,'GET',path);research=await call(system,'GET','/system/'+config.id+'/research')
  expect(experience).toMatchObject({configId:config.id,profile:'experience',previewOnly:true,configuration:{testType:'reaction',configId:config.id,profile:'experience'}})
  expect(experience.artifactHash).not.toBe(research.artifactHash)
  expect(experience.configuration.measurement).toEqual(research.configuration.measurement)
  for(const actor of [manager,teacher])await call(actor,'GET',path,undefined,403)
  // Authentication failures precede the router no-store middleware; inspect separately.
  const response=await fetch(base+'/api/cognitive/profile-configurations'+path);expect(response.status).toBe(401)
  requests.push({method:'GET',path,status:response.status,expectedStatus:401})
  request={requestId:randomUUID(),expectedArtifactHash:experience.artifactHash,allowedProducts:['TRAINING','SURVEY','SCHOOL','TEACHER'],reason:'Synthetic precise profile entry approval'}
  await call(system,'POST',path+'/approve',{...request,expectedArtifactHash:'f'.repeat(64)},409)
  await call(system,'POST',path+'/approve',request,403,600)
  for(const actor of [manager,teacher])await call(actor,'POST',path+'/approve',request,403)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(0)
  ready=true;observations.push({twoNonemptyFrozenProfileReports:true,sameNativeConfigAndM:true,systemDistinctFromEntryIssuer:true,staleMfaAndWrongArtifactDenied:true})
 },30000)
 it('approves each server-resolved profile for all four entries and compares complete idempotent intent',async()=>{
  if(!ready)throw Error('Source preflight incomplete; approval forbidden')
  const path='/system/'+config.id+'/experience/approve'
  expect(await call(system,'POST',path,request)).toMatchObject({artifactHash:experience.artifactHash,changed:true,replayed:false})
  expect(await call(system,'POST',path,request)).toMatchObject({artifactHash:experience.artifactHash,changed:false,replayed:true})
  const researchRequest={...request,requestId:randomUUID(),expectedArtifactHash:research.artifactHash}
  await call(system,'POST','/system/'+config.id+'/research/approve',researchRequest)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(2)
  expect(await db.$queryRaw`SELECT product FROM survey_tool_policies WHERE resource_key LIKE ${'cognitive-profile:'+config.id+':%'} AND decision='APPROVED'`).toHaveLength(8)
  await call(system,'POST',path,{...request,reason:'Different original intent'},409)
  await call(system,'POST',path,{...request,allowedProducts:['TRAINING']},409)
  await call(system,'POST','/system/'+config.id+'/research/approve',request,409)
  const service=await import('../../modules/assessment-authorization/cognitive-profile-approval')
  await expect(service.approveCognitiveProfile(system.id,config.id,'experience',{...request,requestId:randomUUID()},undefined as never)).rejects.toMatchObject({statusCode:403})
  observations.push({exactEntryPolicies:8,profileApprovalAudits:2,retryCreatesNoAuditOrReapproval:true,changedReasonProductsAndProfileRejected:true,missingServiceProofDenied:true})
 },30000)
 it('does not reactivate removed entry scopes on an old request replay, and preserves all existing user/task/template data',async()=>{
  if(!ready)throw Error('Source preflight incomplete')
  const path='/system/'+config.id+'/experience/approve'
  await call(system,'POST',path,{...request,requestId:randomUUID(),allowedProducts:['TRAINING'],reason:'Synthetic explicit scope restriction'})
  const current=await db.$queryRaw`SELECT product,decision,version FROM survey_tool_policies WHERE resource_key=${'cognitive-profile:'+config.id+':experience'} ORDER BY product`
  expect(current).toEqual([{product:'SCHOOL',decision:'RETURNED',version:2},{product:'SURVEY',decision:'RETURNED',version:2},
   {product:'TEACHER',decision:'RETURNED',version:2},{product:'TRAINING',decision:'APPROVED',version:2}])
  expect(await call(system,'POST',path,request)).toMatchObject({replayed:true,changed:false,allowedProducts:expect.arrayContaining(['TRAINING','SURVEY','SCHOOL','TEACHER'])})
  expect(await db.$queryRaw`SELECT product,decision,version FROM survey_tool_policies WHERE resource_key=${'cognitive-profile:'+config.id+':experience'} ORDER BY product`).toEqual(current)
  const api=await import('../../modules/assessment-authorization/cognitive-profile-artifact'),source=await import('../../modules/assessment-authorization/cognitive-profile-source')
  const artifact=await api.loadCognitiveProfileArtifact(experience.artifactHash,experience.configuration)
  await db.$transaction((tx:any)=>source.assertPublishedCognitiveArtifactSource(tx,artifact))
  expect(await db.user.findMany({orderBy:{id:'asc'}})).toEqual(before.users)
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(before.grants)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}})).toEqual(before.tasks)
  expect(await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}})).toEqual(before.attempts)
  expect(await db.$queryRaw`SELECT * FROM assessment_public_templates ORDER BY template_hash`).toEqual(before.templates)
  expect(await db.$queryRaw`SELECT * FROM survey_tool_policies WHERE resource_key NOT LIKE 'cognitive-profile:%' ORDER BY product,resource_key,fingerprint`).toEqual(before.policies)
  observations.push({oldRequestCannotReactivateRemovedScope:true,oneConfigTwoProfilesNoNewTestType:true,existingSixUsersFourGrantsThirteenTasksAndTemplatesUnchanged:true,
   noUseGrantAssignmentOrAttemptCreated:true})
 },30000)
})
