import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile,readFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_EXACT_JOURNEY==='1'?describe:describe.skip
suite('Survey existing exact use through protected author and anonymous participant HTTP',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,owner:any,other:any,use:any,project:any,draft:any,wave:any,opened:any,admitted:any,task:any,publication:any,grants:any,sources:any,oldPublications:any,ready=false
 const requests:any[]=[],observations:any[]=[]
 const resumeImport=process.env.PRECISE_SURVEY_JOURNEY_RESUME_IMPORT==='1'
 const continueFinal=process.env.PRECISE_SURVEY_JOURNEY_CONTINUE_FINAL==='1'
 const password='Synthetic-Survey-HTTP-20261029!',generalText='This synthetic Survey study provides general completion feedback only.'
 async function call(who:any,method:string,path:string,body?:unknown,status=200){
  const survey=who?.accountDomain==='SURVEY',token=who?sign({userId:who.id,username:who.username,role:who.role,accountDomain:who.accountDomain,tokenVersion:who.tokenVersion,
   mfaVerifiedAt:Math.floor(Date.now()/1000),adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:survey?'http://localhost:5174':'http://localhost:5173',
   ...(who?{Cookie:(survey?'huisurvey_research_session=':'ptool_session=')+token+'; '+(survey?'huisurvey_research_csrf=':'ptool_csrf=')+'exact-journey','X-CSRF-Token':'exact-journey'}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})
  requests.push({method,path,status:response.status});const text=await response.text()
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Unexpected non-JSON response for '+method+' '+path+' status '+response.status)
  const value=JSON.parse(text) as any;expect(response.status,value.message??path).toBe(status)
  return value.data
 }
 const proof=()=>({accessCredential:admitted.accessCredential})
 async function preservePrivateRecovery(){
  await writeFile('/workspace/materials-load-20261029/survey-exact-journey-private.json',JSON.stringify({projectId:project?.id,draftId:draft?.id,waveId:wave?.id,opened,admitted}),{mode:0o600})
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit new Survey journey clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_survey_journey_test_20261029')throw Error('Named local Survey journey clone required')
  db=(await import('../../config/database')).prisma
  const [count]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||count.n!==9||await db.surveyPublication.count()!==(continueFinal?6:5)||await db.surveyProject.count({where:{title:'Synthetic exact HTTP participant journey'}})!==((resumeImport||continueFinal)?1:0))throw Error('Inspect retained outcomes before retry; no reset')
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  ;[use]=await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE status=${continueFinal?'REVOKED':'ACTIVE'} AND snapshot#>>'{provenance,configurationName}'='HTTP 明确替换配置'`
  if(!use?.snapshot.provenance.selectedBinding)throw Error('Retained actual exact grant required')
  owner=await db.user.findUniqueOrThrow({where:{id:use.user_id}})
  const [second]=await db.$queryRaw`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id AND g.status='ACTIVE' JOIN survey_mfa_credentials m ON m.user_id=u.id AND m.enabled WHERE u.account_domain='SURVEY' AND u.id<>${owner.id} AND u.is_active AND NOT u.is_frozen LIMIT 1`
  if(!second)throw Error('Retained second qualified researcher required');other=await db.user.findUniqueOrThrow({where:{id:second.id}})
  grants=await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`;sources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`
  if(continueFinal){
   const saved=JSON.parse(await readFile('/workspace/materials-load-20261029/survey-exact-journey-private.json','utf8'))
   opened=saved.opened;admitted=saved.admitted
   project=await db.surveyProject.findUniqueOrThrow({where:{id:saved.projectId}});expect(project.ownerUserId).toBe(owner.id)
   draft=await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:saved.draftId}});expect(draft).toMatchObject({projectId:project.id,catalogGrantId:use.id})
   wave=await db.surveyWave.findUniqueOrThrow({where:{id:saved.waveId}});expect(wave).toMatchObject({projectId:project.id,publicationId:opened.publicationId})
   expect(await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:admitted.attemptId}})).toMatchObject({projectId:project.id,waveId:wave.id,status:'STARTED'})
   expect(await db.surveyWaveFinal.count({where:{projectId:project.id}})).toBe(0)
   publication=await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId}})
   expect(publication.compiledSnapshot.units[0].sourceProvenance.selectedBinding).toEqual(use.snapshot.provenance.selectedBinding)
   task=await(await import('../../modules/survey/task.public')).getOwnResearchTask({publicId:opened.publicId,attemptId:admitted.attemptId,...proof()})
   ready=true;observations.push({resumeOriginalAdmittedAttempt:true,grantAlreadyRevoked:true,originalPostRevokeNewStartObserved409InPriorReporter:true,noNewAdmissionOrRepeatedRevocation:true})
  }
  oldPublications=await db.surveyPublication.findMany({where:continueFinal?{id:{not:publication.id}}:{},orderBy:{id:'asc'}});sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/survey/projects',(await import('../../modules/survey/builder.routes')).surveyBuilderRouter)
  app.use('/api/survey/projects',(await import('../../modules/survey/waves.routes')).surveyWavesRouter)
  app.use('/api/survey/projects',(await import('../../modules/survey/projects.routes')).surveyProjectsRouter)
  app.use('/api/public/survey',(await import('../../modules/survey/public.routes')).publicSurveyRouter)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_JOURNEY_EVIDENCE??'/tmp/survey-exact-journey-http.json',JSON.stringify({productionAccessed:false,
   scope:'Real protected Cookie/CSRF/current database researcher and manager qualification; synthetic JWT recent-MFA proof, no real MFA ceremony or browser. Real anonymous SCALE FINAL/general feedback.',requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('imports the administered exact use, blocks consumer edits and freezes the original identity before actual anonymous START',async()=>{
  if(resumeImport){
   project=await db.surveyProject.findFirstOrThrow({where:{title:'Synthetic exact HTTP participant journey',ownerUserId:owner.id}})
   draft=await db.surveyInstrumentDraft.findFirstOrThrow({where:{projectId:project.id,catalogGrantId:use.id,instrumentKey:'exact_scale'}})
   expect(project).toMatchObject({status:'DRAFT',revision:0});expect(draft.revision).toBe(0)
   expect(await db.surveyInstrumentDraft.count({where:{projectId:project.id}})).toBe(1);expect(await db.surveyWave.count({where:{projectId:project.id}})).toBe(0)
   observations.push({readExistingSuccessfulImport:true,originalProjectAndImportNotRecreated:true})
  }else{
   project=await call(owner,'POST','/survey/projects',{requestId:randomUUID(),title:'Synthetic exact HTTP participant journey',collectionMode:'SINGLE_UNLINKED'});await preservePrivateRecovery()
   await call(other,'GET','/survey/projects/'+project.id,undefined,404)
  }
  const prefix='/survey/projects/'+project.id
  if(!resumeImport){draft=await call(owner,'POST',prefix+'/catalog/'+use.id+'/import',{requestId:randomUUID(),instrumentKey:'exact_scale',title:'Administered fixed no-feedback scale'});await preservePrivateRecovery()}
  await call(owner,'PATCH',prefix+'/instruments/'+draft.id,{revision:draft.revision,title:draft.title,definition:{}},409)
  await call(owner,'POST',prefix+'/instruments/'+draft.id+'/measurement-release',{revision:draft.revision})
  wave=await call(owner,'POST',prefix+'/waves',{requestId:randomUUID(),title:'Synthetic exact admission',consentText:'Synthetic automated test; no human participant or production data.',generalText,instrumentIds:[draft.id],allowNewParticipants:true});await preservePrivateRecovery()
  await call(owner,'POST',prefix+'/waves/'+wave.id+'/prepare',{revision:wave.revision})
  wave=await call(owner,'GET',prefix+'/waves/'+wave.id)
  publication=await db.surveyPublication.findUniqueOrThrow({where:{id:wave.publicationId}})
  const unit=publication.compiledSnapshot.units[0]
  expect(unit.sourceProvenance.selectedBinding).toEqual(use.snapshot.provenance.selectedBinding)
  expect(unit.sourceProvenance.sourceGrantId).toBe(use.id)
  opened=await call(owner,'POST',prefix+'/waves/'+wave.id+'/open',{revision:wave.revision});await preservePrivateRecovery()
  admitted=await call(null,'POST','/public/survey/r/'+opened.publicId+'/waves/'+wave.id+'/start-unlinked',{entryToken:opened.entrySecret,consentVersion:1,consent:true});await preservePrivateRecovery()
  task=await call(null,'POST','/public/survey/r/'+opened.publicId+'/attempts/'+admitted.attemptId+'/task',proof())
  expect(task.units).toHaveLength(1);expect(task.units[0].kind).toBe('SCALE');expect(task.units[0].items.length).toBeGreaterThan(0)
  expect(JSON.stringify(task)).not.toMatch(/selectedBinding|configurationHash|scoringVersion|itemRules|sourceProvenance/)
  expect(await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`).toEqual(grants)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  ready=true;observations.push({projectId:project.id,waveId:wave.id,attemptId:admitted.attemptId,originalGrantId:use.id,selectedBinding:unit.sourceProvenance.selectedBinding,
   readOnlyConsumer:true,crossResearcherDenied:true,publicProjectionNoPrivateTechnicalDefinitions:true})
 },20000)
 it('denies new starts after ordinary use revocation while an admitted participant completes and rereads one frozen result',async()=>{
  if(!ready)throw Error('Admission stage incomplete; dependent revocation/FINAL forbidden')
  if(!continueFinal){
   await call(manager,'POST','/platform/survey/tool-grants/'+use.id+'/revoke',{currentPassword:password})
   await call(null,'POST','/public/survey/r/'+opened.publicId+'/waves/'+wave.id+'/start-unlinked',{entryToken:opened.entrySecret,consentVersion:1,consent:true},409)
  }
  const path='/public/survey/r/'+opened.publicId+'/attempts/'+admitted.attemptId
  expect(await call(null,'POST',path+'/task',proof())).toEqual(task)
  const unit=task.units[0],answers=Object.fromEntries(unit.items.map((item:any)=>[item.itemKey,(item.responseOptions??unit.responseOptions)[0].optionKey]))
  const submission={...proof(),submissionId:randomUUID(),answers:{[unit.instrumentKey]:answers},
   // Synthetic protocol fixture, not observed human response times or a
   // latency measurement. Preserve the existing ONE_BY_ONE timing contract.
   ...(unit.presentationMode==='ONE_BY_ONE'?{itemTimings:{[unit.instrumentKey]:Object.fromEntries(unit.items.map((item:any)=>[item.itemKey,
    {schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))}}:{})}
  const completed=await call(null,'POST',path+'/final',submission)
  expect(completed).toMatchObject({status:'COMPLETED',idempotent:false,generalText})
  expect(await call(null,'POST',path+'/final',submission)).toMatchObject({status:'COMPLETED',idempotent:true,receiptId:completed.receiptId})
  const result=await call(null,'POST',path+'/general',proof());expect(result).toMatchObject({kind:'GENERAL_ONLY',text:generalText})
  await call(null,'POST',path+'/general',{accessCredential:'A'.repeat(43)},403)
  expect(await db.surveyWaveFinal.count({where:{attemptId:admitted.attemptId}})).toBe(1)
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:publication.id}})).toEqual(publication)
  const finalGrants=await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`
  for(const old of grants){const current=finalGrants.find((g:any)=>g.id===old.id)
   if(old.id===use.id){expect(current.status).toBe('REVOKED');expect({...current,status:old.status,revoked_at:old.revoked_at}).toEqual(old)}else expect(current).toEqual(old)}
  expect(await db.surveyPublication.findMany({where:{id:{not:publication.id}},orderBy:{id:'asc'}})).toEqual(oldPublications)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  observations.push({newStartAfterRevokeDenied:true,admittedTaskUnchanged:true,completedAfterRevoke:true,idempotentOneFinal:true,generalOnlyNoFeedbackAsFrozen:true,
   oldFivePublicationsAndOriginalT1Unchanged:true,unauthorizedResultDenied:true,answeredItems:unit.items.length})
 },20000)
})
