import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_COGNITIVE_COMPOSITE==='1'?describe:describe.skip
suite('Exact cognitive profile through the real revisioned Training questionnaire adapter',()=>{
 let db:any,server:Server|undefined,base='',sign:any,teacher:any,manager:any,other:any,student:any,second:any,course:any,config:any,research:any,assignment:any,beforeTasks:any,ready=false,stage='init'
 const requests:any[]=[],observations:any[]=[],ids:any={}
 async function call(actor:any,method:string,path:string,body?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=profile-composite','X-CSRF-Token':'profile-composite'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const raw=await res.text();requests.push({method,path,status:res.status,expectedStatus:status});const value=JSON.parse(raw);expect(res.status,value.message??path).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Actual runtime fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.contentCapabilityGrant.count()).toBe(2);expect(await db.cognitiveAssignment.count()).toBe(3);expect(await db.cognitiveSession.count()).toBe(1)
  teacher=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-teacher-'}}});other=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-outsider-'}}})
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-manager-'}}})
  student=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-exact-'}}});second=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-next-'}}})
  course=await db.course.findFirstOrThrow({where:{creatorId:teacher.id}});config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',status:'PUBLISHED'}})
  assignment=await db.cognitiveAssignment.findFirstOrThrow({where:{configId:config.id,profile:'research',status:'DRAFT'}})
  research=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'COGNITIVE_PROFILE_APPROVED',metadata:{path:['artifactFormatVersion'],equals:2}},orderBy:{createdAt:'desc'}})
  expect(research.metadata.configuration.profile).toBe('research')
  beforeTasks=await db.compositeAssessment.findMany({orderBy:{id:'asc'}})
  sign=(await import('../../utils/jwt')).generateToken;const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_COGNITIVE_COMPOSITE_EVIDENCE??'/tmp/training-cognitive-profile-composite.json',JSON.stringify({productionAccessed:false,stage,ids,requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('preserves profile through revisioned publish, parent START, deferred child and immutable source reader',async()=>{
  await call(teacher,'POST','/cognitive/assignments/'+assignment.id+'/publish');stage='native-published'
  let row=await call(teacher,'POST','/questionnaire-products',{requestId:randomUUID(),name:'Synthetic exact cognitive profile questionnaire',questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false});ids.questionnaire=row.id;stage='questionnaire-created'
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'COGNITIVE',cognitiveAssignmentId:assignment.id}});stage='item-added'
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/publish',{revision:row.revision});stage='questionnaire-published'
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'COGNITIVE'},include:{cognitiveAssignment:true}})
  const pin=item.cognitiveAssignment.courseSnapshot.selectedCognitiveProfile
  expect(pin.artifactHash).toBe(research.metadata.artifactHash)
  const snapshot=(await db.compositeAssessment.findUniqueOrThrow({where:{id:row.id}})).trainingContentSnapshot
  expect(snapshot.units[0].source.cognitiveProfile).toEqual(pin)
  const attempt=(await call(student,'POST','/composite-assessments/'+row.id+'/attempts',{})).attempt;ids.attempt=attempt.id;stage='parent-started'
  const state=await call(student,'GET','/composite-assessments/attempts/'+attempt.id);expect(state.currentItem.type).toBe('COGNITIVE');stage='child-loaded'
  const sessions=await db.cognitiveSession.findMany({where:{compositeAttemptId:attempt.id}});expect(sessions).toHaveLength(1)
  const {loadCognitiveSessionConfig}=await import('../../modules/cognitive/session.service')
  const stored=await loadCognitiveSessionConfig(sessions[0].configSnapshotEncrypted)
  expect(stored.config.totalTrials).toBe(60)
  const binding=(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).trainingContentBinding
  expect(binding.units[0].source.cognitiveProfile).toEqual(pin)
  const {getContentRelease}=await import('../../modules/measurement-content/repository'),{trainingMeasurementSourceScopeMatchesForConsumer}=await import('../../modules/composite/training-content-binding')
  expect(await db.$transaction(async(tx:any)=>trainingMeasurementSourceScopeMatchesForConsumer(tx,await getContentRelease(tx,binding.units[0].measurement.releaseId,true),binding.units[0].source))).toBe(true)
  // A second real participant gets a separate attempt seed, never the shared T1 seed.
  const next=(await call(second,'POST','/composite-assessments/'+row.id+'/attempts',{})).attempt;ids.secondAttempt=next.id
  await call(second,'GET','/composite-assessments/attempts/'+next.id)
  expect((await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:next.id}})).randomSeed).not.toBe(sessions[0].randomSeed)
  expect(await db.compositeAssessment.findMany({where:{id:{in:beforeTasks.map((x:any)=>x.id)}},orderBy:{id:'asc'}})).toEqual(beforeTasks)
  observations.push({realRevisionedQuestionnaire:true,originalT1PointerRetainedAtT2AndT3:true,exactResearch60Trials:true,independentParticipantSeeds:true,immutableSourceReaderAcceptsOriginalArtifact:true});ready=true
 },30000)
 it('checks both self-grant qualifications and recovers explicit revoke original intent',async()=>{
  if(!ready)throw Error('Prior adapter stage incomplete; independent mutation deferred')
  const profilePath='/cognitive/profile-configurations/training/'+config.id+'/research/use-grants'
  const input={requestId:randomUUID(),userId:other.id,artifactHash:research.metadata.artifactHash,configurationName:'Synthetic legitimate self use',
   validFrom:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};ids.selfGrant=input.requestId
  const issued=await call(other,'POST',profilePath,input);expect(issued.changed).toBe(true)
  const event=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:input.requestId}});expect(event.metadata.selfGrant).toBe(true)
  const revoke={requestId:randomUUID(),expectedVersion:1,reason:'Synthetic explicit own use withdrawal'};ids.revokeRequest=revoke.requestId
  const path='/cognitive/profile-configurations/training/'+config.id+'/use-grants/'+issued.id+'/revoke'
  await call(manager,'POST',path,revoke,403)
  expect(await call(other,'POST',path,revoke)).toMatchObject({revoked:true,version:2})
  const recovered=await call(other,'GET','/cognitive/profile-configurations/training/'+config.id+'/use-requests/'+revoke.requestId)
  expect(recovered).toMatchObject({kind:'REVOKE',request:revoke,grantId:issued.id})
  expect(await call(other,'POST',path,revoke)).toMatchObject({replayed:true,changed:false})
  await call(other,'POST',path,{...revoke,reason:'Changed original intent'},409)
  observations.push({selfGrantIssuerAndRecipientQualified:true,crossIssuerRevokeDenied:true,revokeIntentRecoveredAndNotReapplied:true})
 },30000)
})
