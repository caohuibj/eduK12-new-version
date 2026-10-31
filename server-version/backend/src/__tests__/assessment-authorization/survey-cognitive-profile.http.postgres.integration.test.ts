import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile,readFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_COGNITIVE_PROFILE==='1'?describe:describe.skip
suite('Survey exact native profiles through real manager, researcher and anonymous participant routes',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,manager:any,owner:any,other:any,config:any,choices:any[]=[],use:any,project:any,draft:any,wave:any,opened:any,admitted:any,session:any,receipt:any,publication:any,stage='init',ready=0
 const requests:any[]=[],observations:any[]=[],ids:any={},password='Synthetic-Survey-HTTP-20261029!'
 const provenance={schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}
 async function call(actor:any,method:string,path:string,body?:unknown,status=200){
  const survey=actor?.accountDomain==='SURVEY',token=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,
   mfaVerifiedAt:Math.floor(Date.now()/1000),adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:survey?'http://localhost:5174':'http://localhost:5173',
   ...(token?{Cookie:(survey?'huisurvey_research_session=':'ptool_session=')+token+'; '+(survey?'huisurvey_research_csrf=':'ptool_csrf=')+'native-profile','X-CSRF-Token':'native-profile'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({stage,method,path,status:response.status,expectedStatus:status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 async function checkpoint(){await writeFile(process.env.PRECISE_SURVEY_COGNITIVE_PROFILE_CHECKPOINT!,JSON.stringify({configId:config?.id,use,project,draft,wave,opened,admitted,session}),{mode:0o600})}
 const proof=()=>({accessCredential:admitted.accessCredential})
 beforeAll(async()=>{
  const url=process.env.PRECISE_SURVEY_COGNITIVE_DATABASE_URL;if(!url||!process.env.PRECISE_SURVEY_COGNITIVE_PROFILE_CHECKPOINT)throw Error('Explicit database and private recovery checkpoint required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_survey_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Actual isolated runtime fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.user.count()).toBe(11);expect(await db.cognitiveTestConfig.count()).toBe(['imported','measurement','final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')?1:0);expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(['imported','measurement','final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')?2:0)
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}});manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  const [target]=await db.$queryRaw`SELECT user_id FROM survey_tool_grants WHERE snapshot#>>'{provenance,configurationName}'='HTTP 明确替换配置'`
  owner=await db.user.findUniqueOrThrow({where:{id:target.user_id}})
  const [second]=await db.$queryRaw`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id AND g.status='ACTIVE' JOIN survey_mfa_credentials m ON m.user_id=u.id AND m.enabled WHERE u.account_domain='SURVEY' AND u.id<>${owner.id} AND u.is_active AND NOT u.is_frozen LIMIT 1`
  other=await db.user.findUniqueOrThrow({where:{id:second.id}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/survey/projects',(await import('../../modules/survey/builder.routes')).surveyBuilderRouter);app.use('/api/survey/projects',(await import('../../modules/survey/waves.routes')).surveyWavesRouter)
  app.use('/api/survey/projects',(await import('../../modules/survey/projects.routes')).surveyProjectsRouter)
  app.use('/api/public/survey',(await import('../../modules/survey/public.routes')).publicSurveyRouter)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
  if(['imported','measurement','final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){
   const saved=JSON.parse(await readFile(process.env.PRECISE_SURVEY_COGNITIVE_PROFILE_CHECKPOINT!,'utf8'));config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:saved.configId}});use=saved.use;project=saved.project;draft=saved.draft;Object.assign(ids,{config:config.id,use:use.id,project:project.id,draft:draft.id})
   expect(await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:draft.id}})).toMatchObject({projectId:project.id,catalogGrantId:use.id,revision:0});expect(await db.surveyWave.count({where:{projectId:project.id}})).toBe(['final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')?1:0)
   if(['final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){
    wave=saved.wave;opened=saved.opened;admitted=saved.admitted;session=saved.session
    expect(await db.surveyCognitiveResult.count({where:{sessionId:session.sessionId}})).toBe(process.env.PRECISE_SURVEY_COGNITIVE_RESUME==='parent-final'?1:0)
    expect(await db.surveyCognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).toMatchObject({status:process.env.PRECISE_SURVEY_COGNITIVE_RESUME==='parent-final'?'COMPLETED':'IN_PROGRESS',attemptId:admitted.attemptId})
   }
  }
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_COGNITIVE_PROFILE_EVIDENCE??'/tmp/survey-cognitive-profile.json',JSON.stringify({productionAccessed:false,stage,ready,ids,requests,observations,
   scope:'Real protected HTTP/CSRF/current researcher and manager credentials; synthetic recent-MFA JWT. Existing main native reaction source and profiles; local restricted runtime DB only. Credentials and raw/report bodies omitted.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally installs the exact main source and separately approves both native profiles for Survey',async()=>{
  if(['imported','measurement','final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){const catalog=await call(manager,'GET','/platform/survey/source-catalog?kind=COGNITIVE&page=1');choices=catalog.list.filter((r:any)=>r.ref.sourceId.startsWith('cognitive-profile:'));expect(choices).toHaveLength(2);observations.push({noRepeatedInstallApprovalGrantProjectOrImport:true});ready=1;return}
  const {cognitiveSeeds}=await import('../../modules/cognitive/generated/seeds'),seed=cognitiveSeeds.find(r=>r.testType==='reaction'&&r.configVersion==='1.1.0'&&r.engineVersion==='1.0.0'&&r.scoringVersion==='1.1.0')!
  const installed=await(await import('../../modules/cognitive/onboarding/install')).installCognitiveConfigs(db,{schemaVersion:1,items:[{testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion}]},system.id)
  expect(installed.hasBlocked).toBe(false);config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:installed.rows[0].configId}});ids.config=config.id;stage='installed';await checkpoint()
  await(await import('../../modules/cognitive/release.service')).publishCognitiveConfig(config.id,system.id);stage='source-published'
  for(const profile of ['experience','research']){
   const path='/cognitive/profile-configurations/system/'+config.id+'/'+profile,preview=await call(system,'GET',path)
   await call(system,'POST',path+'/approve',{requestId:randomUUID(),expectedArtifactHash:preview.artifactHash,allowedProducts:['SURVEY'],reason:'Synthetic exact native Survey profile adapter'})
  }
  const catalog=await call(manager,'GET','/platform/survey/source-catalog?kind=COGNITIVE&page=1')
  choices=catalog.list.filter((r:any)=>r.ref.sourceId.startsWith('cognitive-profile:'));expect(choices).toHaveLength(2);expect(choices.every((r:any)=>r.available)).toBe(true)
  observations.push({existingMainSourceNormallyInstalledAndPublished:true,twoProfilesOneConfig:true,exactSurveyEntryApprovals:true,noRecipientGrantYet:true});ready=1
 },30000)
 it('issues a named exact source, checks original intent, imports readonly and freezes the published profile',async()=>{
  if(ready!==1)throw Error('Prior source stage incomplete; dependent mutation forbidden')
  if(['final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){publication=await db.surveyPublication.findUniqueOrThrow({where:{id:wave.publicationId}});Object.assign(ids,{wave:wave.id,attempt:admitted.attemptId,session:session.sessionId});observations.push({resumeOriginalAdmittedSessionAfterRolledBackFinal:true,noRepeatedPublicationOrRevoke:true});ready=2;return}
  if(!['imported','measurement','final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){
  const choice=choices.find((r:any)=>r.ref.sourceId.endsWith(':experience')),request={requestId:randomUUID(),configurationName:'研究者指定体验报告'}
  const path='/platform/survey/researchers/'+owner.id+'/tool-grants',body={currentPassword:password,source:choice.ref,exact:request}
  use=await call(manager,'POST',path,body);ids.use=use.id;stage='use-issued';await checkpoint()
  expect(use.selectedBinding.authorizationId).toBe(request.requestId)
  expect(await call(manager,'POST',path,body)).toMatchObject({id:use.id,replayed:true})
  await call(manager,'POST',path,{...body,exact:{...request,configurationName:'Changed original intent'}},409)
  const recovered=await call(manager,'GET','/platform/survey/researchers/'+owner.id+'/tool-grant-requests/'+use.id);expect(recovered.operation.request.configurationName).toBe(request.configurationName)
  const [stored]=await db.$queryRaw`SELECT snapshot FROM survey_tool_grants WHERE id=${use.id}`
  expect(stored.snapshot.compiledDefinition).not.toHaveProperty('artifact');expect(stored.snapshot.compiledDefinition).not.toHaveProperty('sessionSnapshot')
  project=await call(owner,'POST','/survey/projects',{requestId:randomUUID(),title:'Synthetic Survey exact native profile',collectionMode:'SINGLE_UNLINKED'});ids.project=project.id;stage='project';await checkpoint()
  const prefix='/survey/projects/'+project.id
  draft=await call(owner,'POST',prefix+'/catalog/'+use.id+'/import',{requestId:randomUUID(),instrumentKey:'exact_reaction',title:'使用管理员指定体验配置'});ids.draft=draft.id;stage='imported';await checkpoint()
  await call(owner,'PATCH',prefix+'/instruments/'+draft.id,{revision:draft.revision,title:draft.title,definition:{}},409)
  }
  const prefix='/survey/projects/'+project.id
  if(process.env.PRECISE_SURVEY_COGNITIVE_RESUME!=='measurement')await call(owner,'POST',prefix+'/instruments/'+draft.id+'/measurement-release',{revision:draft.revision})
  wave=await call(owner,'POST',prefix+'/waves',{requestId:randomUUID(),title:'Exact cognitive profile wave',consentText:'Synthetic automated test only, no human participant.',generalText:'Synthetic completion feedback.',instrumentIds:[draft.id],allowNewParticipants:true});ids.wave=wave.id;stage='wave';await checkpoint()
  await call(owner,'POST',prefix+'/waves/'+wave.id+'/prepare',{revision:wave.revision});wave=await call(owner,'GET',prefix+'/waves/'+wave.id)
  publication=await db.surveyPublication.findUniqueOrThrow({where:{id:wave.publicationId}});const unit=publication.compiledSnapshot.units[0]
  expect(unit.sourceProvenance.selectedBinding).toEqual(use.sourceProvenance.selectedBinding);expect(unit.compiledDefinition.artifact.identity.profile).toBe('experience');expect(unit.compiledDefinition.sessionSnapshot.config.totalTrials).toBe(8)
  opened=await call(owner,'POST',prefix+'/waves/'+wave.id+'/open',{revision:wave.revision});stage='opened';await checkpoint()
  admitted=await call(null,'POST','/public/survey/r/'+opened.publicId+'/waves/'+wave.id+'/start-unlinked',{entryToken:opened.entrySecret,consentVersion:1,consent:true});ids.attempt=admitted.attemptId;stage='admitted';await checkpoint()
  const parent='/public/survey/r/'+opened.publicId+'/attempts/'+admitted.attemptId
  session=await call(null,'POST',parent+'/cognitive/exact_reaction/start',{...proof(),priorAnswers:{},administrationProvenance:provenance});ids.session=session.sessionId;stage='child-started';await checkpoint()
  expect(session).toMatchObject({testType:'reaction',profile:'experience',config:{totalTrials:8}})
  observations.push({useId:use.id,projectId:project.id,waveId:wave.id,attemptId:admitted.attemptId,lightGrantSnapshot:true,originalT1PointerAtPublication:true,readonlyDraft:true,exactEightTrialSession:true});ready=2
 },30000)
 it('stops new admission after revoke while admitted native FINAL and the parent result remain fixed',async()=>{
  if(ready!==2)throw Error('Prior admission incomplete; dependent mutation forbidden')
  if(!['final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??'')){
  await call(manager,'POST','/platform/survey/tool-grants/'+use.id+'/revoke',{currentPassword:password});stage='revoked'
  await call(null,'POST','/public/survey/r/'+opened.publicId+'/waves/'+wave.id+'/start-unlinked',{entryToken:opened.entrySecret,consentVersion:1,consent:true},409)
  }
  const parent='/public/survey/r/'+opened.publicId+'/attempts/'+admitted.attemptId,child=parent+'/cognitive/exact_reaction/'+session.sessionId
  const resumed=await call(null,'POST',child+'/read',proof());expect(resumed.randomSeed).toBe(session.randomSeed)
  if(process.env.PRECISE_SURVEY_COGNITIVE_RESUME==='parent-final'){
   const saved=await db.surveyCognitiveResult.findUniqueOrThrow({where:{sessionId:session.sessionId}})
   receipt={resultReference:(await import('../../modules/survey/cognitive.results')).surveyCognitiveResultReference(saved)}
   expect(await db.surveyWaveFinal.count({where:{attemptId:admitted.attemptId}})).toBe(0)
  }else{
  const {createTrialEnvelope}=await import('../../modules/cognitive/v2/trial-envelope')
  const trials=Array.from({length:8},(_,i)=>createTrialEnvelope({trialIndex:i,phase:'test',payload:{foreperiodMs:800,rtMs:300+i,prematureCount:0,interrupted:false,inputMode:'keyboard'},startedAtPerfMs:i*3000,endedAtPerfMs:i*3000+1200}))
  const input={...proof(),submissionId:process.env.PRECISE_SURVEY_COGNITIVE_RESUME==='final'?process.env.PRECISE_SURVEY_COGNITIVE_ORIGINAL_SUBMISSION_ID!:'survey-profile-'+randomUUID(),attemptEpoch:1,definitionHash:session.definitionHash,contextSnapshotHash:null,trials,administrationProvenance:provenance}
  if(!['final','parent-final'].includes(process.env.PRECISE_SURVEY_COGNITIVE_RESUME??''))await call(null,'POST',child+'/final',{...input,trials:trials.slice(1)},400)
  receipt=await call(null,'POST',child+'/final',input);expect(receipt.completed).toBe(true);expect((await call(null,'POST',child+'/final',input)).replayed).toBe(true);stage='child-final'
  }
  const completed=await call(null,'POST',parent+'/final',{...proof(),submissionId:randomUUID(),answers:{exact_reaction:{}},cognitiveReferences:[receipt.resultReference]});expect(completed.status).toBe('COMPLETED');stage='complete'
  expect(await call(null,'POST',parent+'/general',proof())).toMatchObject({kind:'GENERAL_ONLY',text:'Synthetic completion feedback.'})
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:publication.id}})).toEqual(publication)
  const {loadSurveyCognitiveResults}=await import('../../modules/survey/cognitive.results')
  const results=await db.$transaction((tx:any)=>loadSurveyCognitiveResults(tx,{projectId:project.id,waveId:wave.id,attemptId:admitted.attemptId,publicationId:publication.id,references:[receipt.resultReference],includeRaw:true}))
  expect(results[0].result.profile).toBe('experience');expect(results[0].raw.trials).toHaveLength(8)
  observations.push({newStartAfterRevokeDenied:true,admittedSeedStable:true,exactNativeEightTrialFinal:true,incompleteFinalDenied:true,idempotentChildFinal:true,parentCompleted:true,historicalRawAndProfileReadable:true,generalFeedbackPolicyPreserved:true})
 },30000)
})
