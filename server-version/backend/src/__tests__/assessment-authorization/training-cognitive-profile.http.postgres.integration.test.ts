import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_COGNITIVE_PROFILE==='1'?describe:describe.skip
suite('Training exact cognitive profile actual authorization and native lifecycle',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,teacher:any,other:any,system:any,student:any,nextStudent:any,config:any,course:any,before:any
 let experience:any,research:any,first:any,replacement:any,draft:any,published:any,session:any,ready=0,stage='init'
 const requests:any[]=[],observations:any[]=[],ids:any={}
 async function call(actor:any,method:string,path:string,body?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const res=await fetch(base+'/api/cognitive'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=training-profile','X-CSRF-Token':'training-profile'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const raw=await res.text();requests.push({method,path,status:res.status,expectedStatus:status})
  const value=JSON.parse(raw);expect(res.status,value.message??path).toBe(status);return value.data
 }
 const grantPath=(profile:string)=>'/profile-configurations/training/'+config.id+'/'+profile+'/use-grants'
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit migrated retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Actual isolated runtime fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.contentCapabilityGrant.count()).toBe(process.env.PRECISE_TRAINING_COGNITIVE_RESUME?1:0);expect(await db.cognitiveAssignment.count()).toBe(process.env.PRECISE_TRAINING_COGNITIVE_RESUME==='started'?2:process.env.PRECISE_TRAINING_COGNITIVE_RESUME==='published'?1:0)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(5)
  stage='actors';system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-manager-'}}})
  teacher=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-teacher-'}}})
  other=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-outsider-'}}})
  student=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-exact-'}}})
  nextStudent=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-course-next-'}}})
  course=await db.course.findFirstOrThrow({where:{creatorId:teacher.id}})
  config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',configVersion:'1.1.0',status:'PUBLISHED'}})
  before={grants:await db.materialGrant.findMany({orderBy:{id:'asc'}}),tasks:await db.compositeAssessment.findMany({orderBy:{id:'asc'}}),users:await db.user.findMany({orderBy:{id:'asc'}})}
  stage='router';sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_COGNITIVE_EVIDENCE??'/tmp/training-cognitive-profile.json',JSON.stringify({productionAccessed:false,stage,ready,ids,requests,observations,
   scope:'Local protected HTTP with synthetic recent MFA JWT; actual runtime DB. No production or real-user authorization.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('shows approved execution profiles and issues one precise grant with original intent recovery',async()=>{
  const catalog=await call(manager,'GET','/profile-configurations/training/catalog');expect(catalog.list).toHaveLength(2)
  experience=catalog.list.find((r:any)=>r.profile==='experience');research=catalog.list.find((r:any)=>r.profile==='research')
  expect(experience.available).toBe(true);expect(research.available).toBe(true)
  await call(system,'GET','/profile-configurations/training/catalog',undefined,403)
  if(process.env.PRECISE_TRAINING_COGNITIVE_RESUME){
   const event=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'TRAINING_COGNITIVE_PROFILE_USE_GRANTED'}})
   ids.first=event.id;first={id:event.id,selectedBinding:(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(event.metadata.selectedBinding)}
   const own=await call(teacher,'GET','/configs');expect(own.list.find((r:any)=>r.id===config.id)).toMatchObject({authorizationMode:'PRECISE',available:true,fixedProfile:'experience'})
   observations.push({resumeFromOriginalGrant:event.id,noRepeatedIssue:true});ready=1;return
  }
  const input={requestId:randomUUID(),userId:teacher.id,artifactHash:experience.artifactHash,configurationName:'反应速度 · 体验报告',
   validFrom:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};ids.first=input.requestId
  await call(system,'POST',grantPath('experience'),input,403)
  await call(manager,'POST',grantPath('experience'),{...input,userId:manager.id},403)
  first=await call(manager,'POST',grantPath('experience'),input);expect(first).toMatchObject({changed:true,replayed:false,version:1})
  expect(await call(manager,'POST',grantPath('experience'),input)).toMatchObject({replayed:true,changed:false})
  await call(manager,'POST',grantPath('experience'),{...input,configurationName:'Different intent'},409)
  const recovered=await call(manager,'GET','/profile-configurations/training/'+config.id+'/use-requests/'+input.requestId)
  expect(recovered.request).toEqual(input);expect(recovered.selectedBinding).toEqual(first.selectedBinding)
  const own=await call(teacher,'GET','/configs');expect(own.list.find((r:any)=>r.id===config.id)).toMatchObject({authorizationMode:'PRECISE',available:true,fixedProfile:'experience',configurationName:input.configurationName})
  observations.push({twoProfilesOneNativeConfig:true,systemCannotIssueUse:true,recipientQualificationEnforced:true,fullIntentRetryRecovery:true});ready=1
 },30000)
 it('pins the admin profile at draft and publishes an exact private measurement',async()=>{
  if(ready!==1)throw Error('Previous stage incomplete; dependent mutation refused')
  if(['published','started'].includes(process.env.PRECISE_TRAINING_COGNITIVE_RESUME??'')){
   draft=await db.cognitiveAssignment.findFirstOrThrow({where:{configId:config.id,status:'PUBLISHED'}});ids.draft=draft.id
   const {decryptCognitivePayload}=await import('../../modules/cognitive/cognitive.security')
   expect((decryptCognitivePayload(draft.resolvedConfigSnapshotEncrypted) as any).totalTrials).toBe(8)
   observations.push({readExistingPublishedExactAssignment:draft.id,noRepeatedCreateOrPublish:true});ready=2;return
  }
  const input={courseId:course.id,configId:config.id,title:'Exact experience draft'}
  await call(teacher,'POST','/assignments',{...input,profile:'research'},403)
  await call(teacher,'POST','/assignments',{...input,selectedBinding:{...first.selectedBinding,configurationHash:'f'.repeat(64)}},403)
  draft=await call(teacher,'POST','/assignments',input);ids.draft=draft.id
  expect(draft).toMatchObject({profile:'experience',profileLocked:true,selectedBinding:first.selectedBinding})
  await call(teacher,'PATCH','/assignments/'+draft.id,{profile:'research'},403)
  const row=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:draft.id}})
  expect(row.courseSnapshot.selectedCognitiveProfile.selectedBinding).toEqual(first.selectedBinding)
  published=await call(teacher,'POST','/assignments/'+draft.id+'/publish');expect(published.status).toBe('PUBLISHED')
  const saved=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:draft.id}}),release=await db.measurementContentRelease.findUniqueOrThrow({where:{id:saved.measurementReleaseId}})
  expect(release.scope).toMatchObject({kind:'PRIVATE',product:'TRAINING',ownerId:teacher.id,resourceId:draft.id})
  expect(release.provenance.profileArtifactHash).toBe(experience.artifactHash)
  const artifact=(await import('../../modules/assessment-authorization/cognitive-profile-artifact'))
  const frozen=await artifact.loadCognitiveProfileArtifact(experience.artifactHash,experience.configuration)
  const {decryptCognitivePayload}=await import('../../modules/cognitive/cognitive.security')
  expect(decryptCognitivePayload(saved.resolvedConfigSnapshotEncrypted)).toEqual(frozen.resolvedConfig)
  expect((frozen.resolvedConfig as any).totalTrials).toBe(8)
  observations.push({draftProfileNotChosenByUser:true,wrongPointerAndProfileDenied:true,privateAssignmentMeasurementFromExactArtifact:true});ready=2
 },30000)
 it('retains admitted seed after revoke while denying new START and stale draft publish',async()=>{
  if(ready!==2)throw Error('Previous stage incomplete; dependent mutation refused')
  const resuming=process.env.PRECISE_TRAINING_COGNITIVE_RESUME==='started'
  const stale=resuming?await db.cognitiveAssignment.findFirstOrThrow({where:{configId:config.id,status:'DRAFT'}}):await call(teacher,'POST','/assignments',{courseId:course.id,configId:config.id,title:'Pinned stale draft'});ids.staleDraft=stale.id
  session=resuming?{sessionId:(await db.cognitiveSession.findFirstOrThrow({where:{assignmentId:draft.id,userId:student.id}})).id}:await call(student,'POST','/sessions',{assignmentId:draft.id});ids.session=session.sessionId
  const stored=await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})
  const input={requestId:randomUUID(),userId:teacher.id,artifactHash:research.artifactHash,configurationName:'反应速度 · 科研报告',
   validFrom:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),
   replaces:{grantId:first.id,expectedVersion:1,reason:'Synthetic explicit profile revision'}};ids.replacement=input.requestId
  replacement=await call(manager,'POST',grantPath('research'),input)
  expect(replacement.selectedBinding.configurationHash).not.toBe(first.selectedBinding.configurationHash)
  await call(teacher,'POST','/assignments/'+stale.id+'/publish',undefined,403)
  await call(nextStudent,'POST','/sessions',{assignmentId:draft.id},403)
  const resumed=await call(student,'POST','/sessions',{assignmentId:draft.id});expect(resumed.sessionId).toBe(session.sessionId)
  expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).randomSeed).toBe(stored.randomSeed)
  const researchDraft=await call(teacher,'POST','/assignments',{courseId:course.id,configId:config.id,title:'New research draft'});ids.researchDraft=researchDraft.id
  expect(researchDraft.profile).toBe('research')
  const old=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:stale.id}});expect(old.profile).toBe('experience');expect(old.status).toBe('DRAFT')
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(before.grants)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'}})).toEqual(before.tasks)
  expect(await db.user.findMany({orderBy:{id:'asc'}})).toEqual(before.users)
  observations.push({replacementDoesNotUpgradeExistingDraft:true,oldPublishedNewStartDenied:true,admittedResumeSeedUnchanged:true,legacyMaterialGrantsAndTasksUnchanged:true});ready=3
 },30000)
})
