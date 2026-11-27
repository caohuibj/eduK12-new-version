import {randomBytes,randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import express from 'express'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {SURVEY_AUTH_COOKIE_NAME,SURVEY_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {generateToken} from '../../utils/jwt'
import {createToolLicense,terminateToolLicense} from '../../modules/tool-licensing/management'
import {listLicenseTools} from '../../modules/tool-licensing/directory'
import {surveyAnalyticsRouter} from '../../modules/survey/analytics.routes'
import {surveyBuilderRouter} from '../../modules/survey/builder.routes'
import {grantCatalogSource} from '../../modules/survey/catalog.service'
import {approveGovernedTool,governedRow,submitOwnedSurveyTool} from '../../modules/survey/governed-tool.service'
import {surveyOriginGuard} from '../../modules/survey/originGuard'
import {publicSurveyRouter} from '../../modules/survey/public.routes'
import {surveyWavesRouter} from '../../modules/survey/waves.routes'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {surveyStartKeys} from '../integration/survey-test-keys'

const suite=process.env.SURVEY_TOOL_LICENSE_FLOW_PG==='1'?describe:describe.skip
type Actor={id:string;username:string;role:'STUDENT';accountDomain:'SURVEY'|'TRAINING';tokenVersion:number}
type Wave={id:string;revision:number;status:string;publicationId:string|null}
type Opened={publicId:string;waveId:string;publicationId:string;entrySecret:string}
type Response<T>={status:number;body:{message?:string;data:T}}

suite('Survey governed FORM commercial publication in isolated PostgreSQL',()=>{
 let server:Server,origin:string
 beforeAll(async()=>{
  const databaseUrl=process.env.DATABASE_URL??''
  requireIsolatedReleaseDatabase(databaseUrl)
  const locator=new URL(databaseUrl)
  if(process.env.NODE_ENV!=='test'||locator.port!=='55434'||locator.pathname!=='/tool_licensing_survey_test_20261127')
   throw new Error('The dedicated Survey tool licensing test database is required')
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true')
  vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  vi.stubEnv('SURVEY_ANALYTICS_ENABLED','true')
  vi.stubEnv('SURVEY_TOOL_LICENSING_ENABLED','true')
  vi.stubEnv('DATA_ENCRYPTION_KEY',randomBytes(32).toString('hex'))
  vi.stubEnv('DATA_PSEUDONYM_KEY',randomBytes(32).toString('hex'))
  const app=express()
  app.use(express.json())
  app.use('/api',csrfProtection)
  app.use('/api/survey/projects',surveyOriginGuard,surveyBuilderRouter,surveyWavesRouter,surveyAnalyticsRouter)
  app.use('/api/public/survey',surveyOriginGuard,publicSurveyRouter)
  app.use(errorHandler)
  server=createServer(app)
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  origin='http://127.0.0.1:'+(server.address() as AddressInfo).port
 })
 afterAll(async()=>{
  server?.closeAllConnections()
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  await (await import('../../config/queue')).closeQueues(true)
  vi.unstubAllEnvs()
  await db.$disconnect()
 })
 async function request<T>(path:string,actor:Actor|null,body?:unknown,method=body===undefined?'GET':'POST'):Promise<Response<T>>{
  const headers:Record<string,string>={origin,'content-type':'application/json'}
  if(actor){
   const token=generateToken({userId:actor.id,username:actor.username,role:actor.role,
    accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
   const csrf='survey-commercial-form-synthetic-csrf'
   headers.cookie=`${SURVEY_AUTH_COOKIE_NAME}=${token}; ${SURVEY_CSRF_COOKIE_NAME}=${csrf}`
   headers[CSRF_HEADER_NAME]=csrf
  }
  const response=await fetch(origin+'/api'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
 }
 async function accepted<T>(path:string,actor:Actor|null,body?:unknown,method?:string){
  const response=await request<T>(path,actor,body,method)
  expect(response.status,response.status===200?path:path+': '+response.body.message).toBe(200)
  return response.body.data
 }
 it('charges only a successful formal open and preserves checkpoint resume, FINAL and researcher analytics after termination',async()=>{
  const user=async(domain:Actor['accountDomain'],platformRole:'STANDARD'|'SYSTEM_ADMIN'='STANDARD'):Promise<Actor>=>{
   const row=await db.user.create({data:{username:'survey-commercial-'+randomUUID(),accountDomain:domain,platformRole,
    role:'STUDENT',passwordHash:'synthetic-only'}})
   return {id:row.id,username:row.username,tokenVersion:row.tokenVersion,role:'STUDENT',accountDomain:domain}
  }
  const [system,manager,researcher]=await Promise.all([user('TRAINING','SYSTEM_ADMIN'),user('TRAINING'),user('SURVEY')])
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id}})
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
  await db.surveyAccount.create({data:{userId:researcher.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:researcher.id,status:'ACTIVE',grantedBy:manager.id}})
  await db.surveyMfaCredential.create({data:{userId:researcher.id,enabled:true,secretCipher:'synthetic-only'}})
  const sourceProject=randomUUID(),projectId=randomUUID()
  await db.surveyProject.createMany({data:[{id:sourceProject,title:'Synthetic creator project',ownerUserId:researcher.id,collectionMode:'SINGLE_UNLINKED'},
   {id:projectId,title:'Synthetic licensed project',ownerUserId:researcher.id,collectionMode:'SINGLE_UNLINKED'}]})
  const sourcePath='/survey/projects/'+sourceProject+'/instruments'
  const draft=await accepted<{id:string;revision:number;title:string}>(sourcePath,researcher,
   {requestId:randomUUID(),instrumentKey:'sourceform',kind:'FORM',title:'Synthetic governed licensed form'})
  const updated=await accepted<{revision:number}>(sourcePath+'/'+draft.id,researcher,{revision:draft.revision,title:draft.title,
   definition:{schemaVersion:1,pages:[{pageKey:'classroom',title:'Survey test',questions:[{
    itemKey:'choice',type:'SINGLE',prompt:'Synthetic binary choice',required:true,rows:[],
    options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],
   }]}]}},'PATCH')
  const submitted=await submitOwnedSurveyTool(researcher.id,sourceProject,draft.id,{requestId:randomUUID(),revision:updated.revision,
   version:'1',statement:'Synthetic tool created solely for isolated license verification',reference:{}})
  const current=await governedRow(db,submitted.id)
  const actorSession={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),tokenVersion:system.tokenVersion,
   adminAuthenticationMethod:'TOTP' as const}
  const approved=await approveGovernedTool(system.id,submitted.id,{expectedVersion:current.version,hash:current.snapshot_hash,
   reason:'Approve isolated synthetic FORM',decision:'APPROVE',allowedProducts:['SURVEY']},actorSession)
  expect(approved.state).toBe('ONLINE')
  const key=current.tool_key.startsWith('FORM:')?current.tool_key:'FORM:'+current.tool_key
  expect((await listLicenseTools(db,'SURVEY',{key})).list).toEqual([expect.objectContaining({key,family:'FORM'})])
  const licenseId=randomUUID()
  const actor={actorUserId:system.id,actorSession}
  expect(await createToolLicense(actor,{requestId:licenseId,product:'SURVEY',subjectId:researcher.id,reason:'Allow one synthetic formal opening',
   startsAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3_600_000).toISOString(),tools:[{key,limit:1}]}))
   .toMatchObject({status:'ACTIVE',revision:1})
  const grant=await grantCatalogSource(manager.id,researcher.id,{kind:'FORM',sourceId:'survey-tool:'+submitted.id,sourceVersion:current.snapshot_hash})
  const projectPath='/survey/projects/'+projectId
  const imported=await accepted<{id:string;instrumentKey:string}>(projectPath+'/catalog/'+grant.id+'/import',researcher,
   {requestId:randomUUID(),instrumentKey:'qualifiedform',title:'Approved assigned form'})
  const waves=projectPath+'/waves'
  const prepare=async(title:string)=>{
   const w=await accepted<Wave>(waves,researcher,{requestId:randomUUID(),title,instrumentIds:[imported.id],
    consentText:'Synthetic participant consents to isolated testing',allowNewParticipants:true,
    checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:1}})
   await accepted(waves+'/'+w.id+'/prepare',researcher,{revision:w.revision})
   return accepted<Wave>(waves+'/'+w.id,researcher)
  }
  const charges=()=>db.$queryRaw<{toolKey:string;publicationId:string;quantity:number}[]>`
   SELECT tool_key AS "toolKey",publication_id AS "publicationId",quantity
   FROM tool_license_charges WHERE license_id=${licenseId}`
  const used=async()=>(await db.$queryRaw<{used:number}[]>`SELECT used FROM tool_license_items
   WHERE license_id=${licenseId} AND tool_key=${key}`)[0].used
  const first=await prepare('First commercial wave')
  expect(await charges()).toEqual([])
  const opened=await accepted<Opened>(waves+'/'+first.id+'/open',researcher,{revision:first.revision})
  expect((await accepted<Wave>(waves+'/'+first.id,researcher)).status).toBe('OPEN')
  const oneCharge=[{toolKey:key,publicationId:opened.publicationId,quantity:1}]
  expect(await charges()).toEqual(oneCharge)
  expect(await used()).toBe(1)
  expect((await request(waves+'/'+first.id+'/open',researcher,{revision:first.revision})).status).toBe(409)
  const second=await prepare('Second commercial wave must remain a draft')
  const overdraw=await request(waves+'/'+second.id+'/open',researcher,{revision:second.revision})
  expect(overdraw.status).toBe(409)
  expect(overdraw.body.message).toContain('剩余额度不足')
  expect(await db.surveyEntryToken.count({where:{waveId:second.id}})).toBe(0)
  expect(await charges()).toEqual(oneCharge)
  const publicPath='/public/survey/r/'+opened.publicId
  const started=await accepted<{attemptId:string;accessCredential:string;status:string}>(
   publicPath+'/waves/'+first.id+'/start-unlinked',null,{
    ...surveyStartKeys('survey-form-licensing'),entryToken:opened.entrySecret,consentVersion:1,consent:true,
   })
  expect(started.status).toBe('STARTED')
  const proof={accessCredential:started.accessCredential}
  const attemptPath=publicPath+'/attempts/'+started.attemptId
  const answers={[imported.instrumentKey]:{choice:'yes'}}
  const task=await accepted<{status:string;units:{instrumentKey:string;kind:string}[]}>(attemptPath+'/task',null,proof)
  expect(task.units).toMatchObject([{instrumentKey:imported.instrumentKey,kind:'FORM'}])
  const saved=await accepted<{revision:number}>(attemptPath+'/checkpoint/save',null,{...proof,revision:0,answers})
  expect(saved.revision).toBe(1)
  expect(await terminateToolLicense(actor,licenseId,{expectedRevision:1,reason:'End synthetic publication license'}))
   .toMatchObject({status:'TERMINATED',revision:2})
  const terminated=await request(waves+'/'+second.id+'/open',researcher,{revision:second.revision})
  expect(terminated.status).toBe(409)
  expect(terminated.body.message).toContain('已结束')
  expect((await accepted<Wave>(waves+'/'+second.id,researcher)).status).toBe('DRAFT')
  expect(await accepted(attemptPath+'/task',null,proof)).toMatchObject({status:'STARTED'})
  expect(await accepted(attemptPath+'/checkpoint/read',null,proof)).toMatchObject({revision:1,checkpoint:{answers}})
  const submission={...proof,submissionId:randomUUID(),answers}
  await accepted(attemptPath+'/final',null,submission)
  await accepted(attemptPath+'/final',null,submission)
  expect(await db.surveyWaveFinal.count({where:{attemptId:started.attemptId,publicationId:opened.publicationId}})).toBe(1)
  expect(await charges()).toEqual(oneCharge)
  expect(await used()).toBe(1)
  expect(await accepted(projectPath+'/analytics/overview',researcher)).toMatchObject({waves:[
   {id:first.id,starts:1,finalCompleted:1},{id:second.id,starts:0,finalCompleted:0},
  ]})
  expect(await accepted(projectPath+'/analytics/waves/'+first.id+'/items',researcher)).toMatchObject({
   source:'VERIFIED_ENCRYPTED_SURVEY_FINAL',items:[{kind:'FORM',itemKey:'choice',respondentN:1,frequencies:[{value:'yes',count:1}]}],
  })
 },45_000)
})
