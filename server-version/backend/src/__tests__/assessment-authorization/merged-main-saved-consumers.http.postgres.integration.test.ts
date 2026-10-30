import {createServer,type Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const entry=process.env.PRECISE_MAIN_SAVED_ENTRY
const suite=entry==='TRAINING'||entry==='SURVEY'?describe:describe.skip
suite('saved exact '+entry+' result after current main native integration',()=>{
 let db:any,server:Server|undefined,base='',actor:any,token='',route='',body:unknown,parent:any,publication:any,use:any
 const requests:any[]=[],observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit retained saved-result fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url),name=entry==='TRAINING'?'/precise_runtime_role_test_20261029':'/precise_survey_journey_test_20261029'
  if(process.env.NODE_ENV!=='test'||parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!==name||entry==='TRAINING'&&parsed.username!=='precise_task1_runtime')throw Error('Exact retained local identity required')
  db=(await import('../../config/database')).prisma
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  if(entry==='TRAINING'){
   expect(await db.user.count()).toBe(6);expect(await db.compositeAssessment.count()).toBe(13)
   const task=await db.compositeAssessment.findFirstOrThrow({where:{name:'Synthetic exact COURSE participant journey'}})
   parent=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{compositeAssessmentId:task.id,status:'COMPLETED'}})
   const source=parent.trainingContentBinding.units.find((u:any)=>u.source.standardCombination).source.standardCombination.reference
   expect(source.selectedBinding.authorizationRevision).toBe(7)
   use=await db.materialGrant.findUniqueOrThrow({where:{id:source.selectedBinding.authorizationId}});expect(use).toMatchObject({version:9,revokedAt:null})
   actor=await db.user.findUniqueOrThrow({where:{id:task.createdBy}})
   token=(await import('../../utils/jwt')).generateToken({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
    adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
   route='/composite-assessments/'+task.id+'/attempts/'+parent.id+'/report'
   app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  }else{
   expect(await db.user.count()).toBe(11)
   const saved=JSON.parse(await readFile('/workspace/materials-load-20261029/survey-exact-journey-private.json','utf8'))
   parent=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:saved.admitted.attemptId}});expect(parent.status).toBe('COMPLETED')
   publication=await db.surveyPublication.findUniqueOrThrow({where:{id:saved.opened.publicationId}})
   const source=publication.compiledSnapshot.units[0].sourceProvenance
   ;[use]=await db.$queryRaw`SELECT id,status,snapshot_digest,snapshot FROM survey_tool_grants WHERE id=${source.sourceGrantId}`
   expect(use.status).toBe('REVOKED');expect(source.selectedBinding).toEqual(use.snapshot.provenance.selectedBinding)
   expect(source.reportConfigured).toBe(false)
   route='/public/survey/r/'+saved.opened.publicId+'/attempts/'+parent.id+'/general';body={accessCredential:saved.admitted.accessCredential}
   app.use('/api/public/survey',(await import('../../modules/survey/public.routes')).publicSurveyRouter)
  }
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_MAIN_SAVED_EVIDENCE??'/tmp/merged-main-saved-'+entry+'.json',JSON.stringify({entry,productionAccessed:false,
   scope:'Saved result HTTP only after main integration; no START/FINAL/regrant/browser or content-computation replay.',requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('reads the original completed result while preserving frozen selection and ordinary grant lifecycle',async()=>{
  const response=await fetch(base+'/api'+route,{method:entry==='TRAINING'?'GET':'POST',headers:{'Content-Type':'application/json',
   ...(token?{Cookie:'ptool_session='+token}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({method:entry==='TRAINING'?'GET':'POST',path:route,status:response.status});expect(response.status,value.message).toBe(200)
  if(entry==='TRAINING'){
   expect(value.data.contentReports).toHaveLength(1)
   expect(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parent.id}})).toEqual(parent)
   expect(await db.materialGrant.findUniqueOrThrow({where:{id:use.id}})).toEqual(use)
   observations.push({historicalFrozenRevision:7,currentUseRevision:9,fullReportReadable:true,originalAttemptAndGrantUnchanged:true,restrictedRuntimeRole:true})
  }else{
   expect(value.data).toMatchObject({kind:'GENERAL_ONLY',text:'This synthetic Survey study provides general completion feedback only.'})
   expect(value.data).not.toHaveProperty('nativeBundleReports')
   expect(await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:parent.id}})).toEqual(parent)
   expect(await db.surveyPublication.findUniqueOrThrow({where:{id:publication.id}})).toEqual(publication)
   const [after]=await db.$queryRaw`SELECT id,status,snapshot_digest,snapshot FROM survey_tool_grants WHERE id=${use.id}`;expect(after).toEqual(use)
   expect(await db.surveyWaveFinal.count({where:{attemptId:parent.id}})).toBe(1)
   observations.push({originalUseStillRevoked:true,generalOnlyAsFrozen:true,noNativeBundleUpgrade:true,originalPublicationAttemptAndT1Unchanged:true,ownerRole:true})
  }
 },20000)
})
