import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_COGNITIVE_RESEARCH==='1'?describe:describe.skip
suite('Survey exact research profile through existing real routes',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,owner:any,stage='init'
 const requests:any[]=[],observations:any[]=[],password='Synthetic-Survey-HTTP-20261029!'
 async function call(actor:any,method:string,path:string,body?:unknown,status=200){
  const survey=actor?.accountDomain==='SURVEY',token=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,
   mfaVerifiedAt:Math.floor(Date.now()/1000),adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:survey?'http://localhost:5174':'http://localhost:5173',
   ...(token?{Cookie:(survey?'huisurvey_research_session=':'ptool_session=')+token+'; '+(survey?'huisurvey_research_csrf=':'ptool_csrf=')+'native-profile','X-CSRF-Token':'native-profile'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({stage,method,path,status:response.status,expectedStatus:status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_SURVEY_COGNITIVE_DATABASE_URL!;requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_survey_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact local restricted runtime required')
  db=(await import('../../config/database')).prisma
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  const [target]=await db.$queryRaw`SELECT g.user_id FROM survey_tool_grants g WHERE g.snapshot#>>'{provenance,cognitiveProfile,configuration,profile}'='experience' AND g.status='REVOKED'`
  owner=await db.user.findUniqueOrThrow({where:{id:target.user_id}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/survey/projects',(await import('../../modules/survey/builder.routes')).surveyBuilderRouter);app.use('/api/survey/projects',(await import('../../modules/survey/waves.routes')).surveyWavesRouter)
  app.use('/api/survey/projects',(await import('../../modules/survey/projects.routes')).surveyProjectsRouter)
  app.use('/api/public/survey',(await import('../../modules/survey/public.routes')).publicSurveyRouter)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_COGNITIVE_RESEARCH_EVIDENCE??'/tmp/survey-cognitive-research.json',JSON.stringify({productionAccessed:false,stage,requests,observations,scope:'Actual protected local HTTP plus restricted runtime PostgreSQL; synthetic MFA JWT. Research profile on the same existing native main config, no new testType or self-author permission.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('previews read-only, grants the exact research artifact, freezes sixty trials and completes with unchanged general feedback policy',async()=>{
  const list=await call(manager,'GET','/platform/survey/source-catalog?kind=COGNITIVE&page=1'),choice=list.list.find((r:any)=>r.ref.sourceId.endsWith(':research'))
  expect(choice?.available).toBe(true)
  const before=await db.$queryRaw`SELECT count(*)::int AS count FROM survey_tool_grants`,preview=await call(manager,'GET','/platform/survey/cognitive-profile-preview?sourceId='+encodeURIComponent(choice.ref.sourceId)+'&sourceVersion='+choice.ref.sourceVersion)
  expect(preview).toMatchObject({artifactHash:choice.ref.sourceVersion,profile:'research'});expect(await db.$queryRaw`SELECT count(*)::int AS count FROM survey_tool_grants`).toEqual(before)
  const use=await call(manager,'POST','/platform/survey/researchers/'+owner.id+'/tool-grants',{currentPassword:password,source:choice.ref,exact:{requestId:randomUUID(),configurationName:'科研反应配置 · 60 次'}});stage='research-use'
  const project=await call(owner,'POST','/survey/projects',{requestId:randomUUID(),title:'Synthetic exact Survey research profile',collectionMode:'SINGLE_UNLINKED'}),prefix='/survey/projects/'+project.id
  const draft=await call(owner,'POST',prefix+'/catalog/'+use.id+'/import',{requestId:randomUUID(),instrumentKey:'research_reaction',title:'固定科研配置'})
  await call(owner,'PATCH',prefix+'/instruments/'+draft.id,{revision:0,title:draft.title,definition:{schemaVersion:2,templateKey:'native-profile-v1',artifactHash:'f'.repeat(64)}},409)
  await call(owner,'POST',prefix+'/instruments/'+draft.id+'/measurement-release',{revision:0})
  let wave=await call(owner,'POST',prefix+'/waves',{requestId:randomUUID(),title:'Research sixty trial profile',consentText:'Synthetic automated test, no human participant.',generalText:'Research completion only.',instrumentIds:[draft.id],allowNewParticipants:true})
  await call(owner,'POST',prefix+'/waves/'+wave.id+'/prepare',{revision:wave.revision});wave=await call(owner,'GET',prefix+'/waves/'+wave.id)
  const pub=await db.surveyPublication.findUniqueOrThrow({where:{id:wave.publicationId}}),unit=pub.compiledSnapshot.units[0]
  expect(unit.compiledDefinition).toMatchObject({maxTrials:60,artifact:{identity:{profile:'research'}}});expect(unit.sourceProvenance.selectedBinding).toEqual(use.sourceProvenance.selectedBinding)
  const opened=await call(owner,'POST',prefix+'/waves/'+wave.id+'/open',{revision:wave.revision})
  const admitted=await call(null,'POST','/public/survey/r/'+opened.publicId+'/waves/'+wave.id+'/start-unlinked',{entryToken:opened.entrySecret,consentVersion:1,consent:true}),proof={accessCredential:admitted.accessCredential}
  const parent='/public/survey/r/'+opened.publicId+'/attempts/'+admitted.attemptId,provenance={schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}
  const session=await call(null,'POST',parent+'/cognitive/research_reaction/start',{...proof,priorAnswers:{},administrationProvenance:provenance}),child=parent+'/cognitive/research_reaction/'+session.sessionId
  expect(session).toMatchObject({profile:'research',config:{totalTrials:60}});stage='research-start'
  const {createTrialEnvelope}=await import('../../modules/cognitive/v2/trial-envelope'),trials=Array.from({length:60},(_,i)=>createTrialEnvelope({trialIndex:i,phase:'test',payload:{foreperiodMs:800,rtMs:300+i,prematureCount:0,interrupted:false,inputMode:'keyboard'},startedAtPerfMs:i*3000,endedAtPerfMs:i*3000+1200}))
  const result=await call(null,'POST',child+'/final',{...proof,submissionId:'research-profile-'+randomUUID(),attemptEpoch:1,definitionHash:session.definitionHash,contextSnapshotHash:null,trials,administrationProvenance:provenance})
  expect((await call(null,'POST',parent+'/final',{...proof,submissionId:randomUUID(),answers:{research_reaction:{}},cognitiveReferences:[result.resultReference]})).status).toBe('COMPLETED')
  expect(await call(null,'POST',parent+'/general',proof)).toMatchObject({kind:'GENERAL_ONLY',text:'Research completion only.'})
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:pub.id}})).toEqual(pub)
  stage='complete';observations.push({useId:use.id,projectId:project.id,publicationId:pub.id,sessionId:session.sessionId,profile:'research',maxTrials:60,previewDidNotWrite:true,readonlyDraft:true,originalT1PointerAtPublication:true,nativeSixtyTrialFinal:true,parentCompleted:true,generalFeedbackPolicyPreserved:true})
 },30000)
})
