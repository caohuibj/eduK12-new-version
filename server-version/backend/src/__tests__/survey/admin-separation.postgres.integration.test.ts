import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {surveyPlatformRouter} from '../../modules/survey/platform.routes'
import {surveyLibraryAdminRouter} from '../../modules/survey/library-admin.routes'
import {surveySystemDataRouter} from '../../modules/survey/system-data.routes'
import {adminPermissionsRouter} from '../../modules/admin-permissions/routes'
import {platformSurveyOriginGuard} from '../../modules/survey/originGuard'
import {errorHandler} from '../../middleware/errorHandler'
import {assertSurveyManager} from '../../modules/survey/admin-role'
import {standardPolicyIdentity,assertSurveyToolPolicy,assertSurveyPublicationNotPaused} from '../../modules/survey/tool-policy'
import {standardContentReadiness,changeSurveyToolPolicy} from '../../modules/survey/library-admin.service'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {createDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {submitResearchFinal} from '../../modules/survey/final.service'
const suite=process.env.SURVEY_ADMIN_ISOLATED_TEST==='1'?describe:describe.skip
suite('independent Survey admin with real HTTP, current DB and deidentified export',()=>{
 let server:Server,base:string,pid:string,owner:string,manager:any,system:any,training:any,finalId:string
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const ready=listScaleInstrumentSources().find(s=>s.executable)!,notReady=listScaleInstrumentSources().find(s=>!s.executable)!
 let identity:ReturnType<typeof standardPolicyIdentity>
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(url.port!=='55433'||!url.pathname.startsWith('/survey_permissions_test_'))throw new Error('Dedicated Survey permission test DB required')
  process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true'
  const create=(name:string,role:'STANDARD'|'SYSTEM_ADMIN')=>db.user.create({data:{username:name+'-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:role,role:'STUDENT'}})
  manager=await create('survey-manager','STANDARD');system=await create('system','SYSTEM_ADMIN');training=await create('training','STANDARD')
  await db.adminEntryGrant.createMany({data:[{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id},{id:randomUUID(),userId:training.id,entry:'TRAINING',grantedBy:system.id}]})
  owner=(await db.user.create({data:{username:'research-'+randomUUID(),accountDomain:'SURVEY',passwordHash:'synthetic-only'}})).id
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18);await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:manager.id}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  pid=randomUUID();await db.surveyProject.create({data:{id:pid,ownerUserId:owner,title:'Synthetic permission fixture',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await createDraft(owner,pid,{requestId:randomUUID(),kind:'FORM',instrumentKey:'formone',title:'Synthetic privacy fixture'})
  const {updateDraft}=await import('../../modules/survey/builder.service')
  await updateDraft(owner,pid,draft.id,{revision:draft.revision,title:draft.title,definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Synthetic',questions:[
   {itemKey:'choice',type:'SINGLE',prompt:'Choice',required:true,options:[{optionKey:'privatecode',label:'Sensitive option label'},{optionKey:'othercode',label:'Other'}],rows:[]},
   {itemKey:'identity',type:'SHORT_TEXT',prompt:'Text',required:false,options:[],rows:[]}]}]}})
  const w=await createWave(owner,pid,{requestId:randomUUID(),title:'Wave',consentText:'This is an isolated synthetic consent fixture only.',generalText:'No personal diagnosis.',instrumentIds:[draft.id],allowNewParticipants:true})
  await prepareWave(owner,pid,w.id,w.revision);const frozen=await getWave(owner,pid,w.id),opened=await openWave(owner,pid,w.id,frozen.revision)
  const admitted=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:w.id,entryToken:opened.entrySecret,consentVersion:1,consent:true})
  const task=await getOwnResearchTask({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential})
  await submitResearchFinal({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential,submissionId:randomUUID(),answers:{[task.units[0].instrumentKey]:{choice:'privatecode',identity:'SECRET_NAME_AND_PHONE_13800000000'}}})
  finalId=(await db.surveyWaveFinal.findFirstOrThrow({where:{projectId:pid}})).id
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/platform',platformSurveyOriginGuard)
  app.use('/api/platform/survey',surveyPlatformRouter);app.use('/api/platform/survey-library',surveyLibraryAdminRouter);app.use('/api/platform/survey-system',surveySystemDataRouter)
  app.use('/api/admin/permissions',adminPermissionsRouter);app.use(errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  identity=standardPolicyIdentity(ready.identity.instrumentKey,ready.identity.instrumentVersion)
 },60000)
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
 async function call(user:any,path:string,body?:unknown,extra:Record<string,unknown>={},csrf=true,origin='http://localhost:5174'){
  const token=generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:user.accountDomain,tokenVersion:user.tokenVersion,...proof,...extra})
  const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'ptool_session='+token+'; ptool_csrf=synthetic-csrf','X-CSRF-Token':csrf?'synthetic-csrf':'wrong',Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json() as any}
 }
 it('allows the independent manager and rejects system and Training managers from researcher management',async()=>{
  expect((await call(manager,'/platform/survey/researchers')).status).toBe(200)
  expect((await call(system,'/platform/survey/researchers')).status).toBe(403)
  expect((await call(training,'/platform/survey/researchers')).status).toBe(403)
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:system.id,entry:'SURVEY',grantedBy:system.id}})
  expect((await call(system,'/platform/survey/researchers')).status).toBe(403)
  await expect(db.$transaction(tx=>assertSurveyManager(tx,system.id))).rejects.toMatchObject({statusCode:403})
  await db.adminEntryGrant.deleteMany({where:{userId:system.id}})
 })
 it('denies Survey managers platform authorization and denies self/coexisting Survey role grants',async()=>{
  expect((await call(manager,'/admin/permissions/accounts')).status).toBe(403)
  const {changeEntryGrant}=await import('../../modules/admin-permissions/service')
  await expect(changeEntryGrant({actorUserId:system.id,targetUserId:system.id,entry:'SURVEY',active:true,expectedVersion:0,reason:'Synthetic',actorSession:{...proof,tokenVersion:0}})).rejects.toMatchObject({statusCode:403})
 })
 it('checks current database role, revoked sessions, MFA freshness, CSRF and origin',async()=>{
  expect((await call(system,'/platform/survey-system/projects',{reason:'Inspect'},{adminVerifiedAt:Math.floor(Date.now()/1000)-301})).status).toBe(403)
  expect((await call(system,'/platform/survey-system/projects',{reason:'Inspect'},{tokenVersion:99})).status).toBe(401)
  expect((await call(system,'/platform/survey-system/projects',{reason:'Inspect'},{},false)).status).toBe(403)
  expect((await call(system,'/platform/survey-system/projects',{reason:'Inspect'},{},true,'http://survey.localhost:5174')).status).toBe(403)
 })
 it('keeps 53 content-ready packages separate from four catalog-only packages and blocked authorization',async()=>{
  expect(listScaleInstrumentSources().filter(s=>standardContentReadiness(s.identity.instrumentKey,s.identity.instrumentVersion).ready)).toHaveLength(53)
  expect(standardContentReadiness(notReady.identity.instrumentKey,notReady.identity.instrumentVersion).ready).toBe(false)
  const result=await call(manager,'/platform/survey-library/catalog?page=1');expect(result.status).toBe(200)
  expect(result.body.data.list.every((r:any)=>!r.states.assignment.ready&&!r.states.deployment.ready)).toBe(true)
 })
 it('permits both roles to approve Survey scope, with exact identity, CAS and no automatic grants',async()=>{
  const grants=await db.$queryRaw`SELECT id FROM survey_tool_grants`
  const update={...identity,expectedVersion:0,decision:'APPROVED' as const,paused:false,reason:'Synthetic exact-version review'}
  expect((await call(manager,'/platform/survey-library/policies',update)).status).toBe(200)
  expect((await call(system,'/platform/survey-library/policies',update)).status).toBe(409)
  await expect(db.$transaction(tx=>assertSurveyToolPolicy(tx,identity,true))).resolves.toBeUndefined()
  await expect(changeSurveyToolPolicy(manager.id,{...standardPolicyIdentity(notReady.identity.instrumentKey,notReady.identity.instrumentVersion),expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic'})).rejects.toMatchObject({statusCode:409})
  expect(await db.$queryRaw`SELECT id FROM survey_tool_grants`).toEqual(grants)
 })
 it('pauses Survey future use without altering FINALs, and retains old missing-policy attempts',async()=>{
  const before=await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}})
  expect((await call(system,'/platform/survey-library/policies',{...identity,expectedVersion:1,decision:'APPROVED',paused:true,reason:'Pause new Survey collection'})).status).toBe(200)
  await expect(db.$transaction(tx=>assertSurveyToolPolicy(tx,identity,false))).rejects.toMatchObject({statusCode:409})
  await expect(db.$transaction(tx=>assertSurveyToolPolicy(tx,{resourceKey:'historical:missing',fingerprint:'f'.repeat(64)},false))).resolves.toBeUndefined()
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}})).toEqual(before)
 })
 it('keeps private owner APIs closed to management identities; system reads require reason and persist audit',async()=>{
  await expect(loadSurveySource({actorUserId:manager.id,projectId:pid})).rejects.toThrow()
  await expect(loadSurveySource({actorUserId:system.id,projectId:pid})).rejects.toThrow()
  expect((await call(manager,'/platform/survey-system/answers',{projectId:pid,reason:'Inspect'})).status).toBe(403)
  expect((await call(system,'/platform/survey-system/answers',{projectId:pid,reason:''})).status).toBe(400)
  const viewed=await call(system,'/platform/survey-system/answers',{projectId:pid,reason:'Synthetic compliance review'})
  expect(viewed.status).toBe(200);expect(JSON.stringify(viewed.body)).toContain('SECRET_NAME_AND_PHONE_13800000000')
  const [audit]=await db.$queryRaw<any[]>`SELECT * FROM survey_admin_data_audits WHERE id=${viewed.body.data.auditId}`
  expect(audit.actor_id).toBe(system.id);expect(audit.project_id).toBe(pid)
  await expect(db.$executeRaw`DELETE FROM survey_admin_data_audits WHERE id=${audit.id}`).rejects.toThrow('append-only')
 })
 it('does not infer export from viewing; explicit grants exclude private/foreign identifiers and expire or revoke',async()=>{
  const denied=await call(system,'/platform/survey-system/export',{projectId:pid,reason:'Synthetic',grantId:randomUUID()});expect(denied.status).toBe(403)
  const grant=await call(system,'/platform/survey-system/export-grants',{projectId:pid,userId:system.id,reason:'Reviewed privacy scope explicitly',hours:1});expect(grant.status).toBe(200)
  const exported=await call(system,'/platform/survey-system/export',{projectId:pid,reason:'Synthetic deidentified extraction',grantId:grant.body.data.id})
  expect(exported.status).toBe(200);expect(exported.body.data.raw).toHaveLength(1);expect(exported.body.data.raw[0].value).toBe(1)
  const text=JSON.stringify(exported.body.data)
  for(const prohibited of ['SECRET_NAME','13800000000','privatecode','Sensitive option label',owner,pid,finalId,'researchCode','attemptId','username','completedAt'])expect(text).not.toContain(prohibited)
  expect((await call(manager,'/platform/survey-system/export',{projectId:pid,reason:'Synthetic',grantId:grant.body.data.id})).status).toBe(403)
  expect((await call(system,'/platform/survey-system/export-grants/revoke',{grantId:grant.body.data.id,reason:'Finished'})).status).toBe(200)
  expect((await call(system,'/platform/survey-system/export',{projectId:pid,reason:'Synthetic',grantId:grant.body.data.id})).status).toBe(403)
 })
})
