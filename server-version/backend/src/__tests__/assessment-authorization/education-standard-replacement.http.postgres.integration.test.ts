import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_REPLACEMENT_HTTP==='1'?describe:describe.skip
suite('education explicit replacement through the unchanged protected manager router',()=>{
 let db:any,server:Server|undefined,base='',actor:any,sign:any,use:any,oldAudit:any,source:any,root:any,body:any,issued:any
 const password='Synthetic-Education-Replace-20261029!',requests:any[]=[]
 const prefix=()=>`/api/platform/education/organizations/${use.scopeId}/products/HUITEACHER/standard-configurations`
 async function call(path:string,input?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=education-replacement-http','X-CSRF-Token':'education-replacement-http'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const value=await response.json() as any;requests.push({path,status:response.status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new replacement HTTP clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_replacement_http_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated replacement HTTP clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==7||await db.educationPrivateTool.count())throw Error('Inspect retained outcomes before HTTP retry')
  ;[use]=await db.$queryRaw`SELECT g.id,g.subject_id AS "userId",g.issuer_id AS "issuerId",g.scope_id AS "scopeId",g.resource_keys AS "resourceKeys"
   FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id
   WHERE g.product='TEACHER' AND g.revoked_at IS NULL AND e.metadata->>'configurationName'='管理员固定使用配置'`
  if(!use)throw Error('Known original empty-report use required')
  oldAudit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
  actor=await db.user.findUniqueOrThrow({where:{id:use.issuerId}});expect(actor.passwordHash).toBe('!synthetic-no-login')
  actor=await db.user.update({where:{id:actor.id},data:{passwordHash:await (await import('../../utils/password')).hashPassword(password)}})
  root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  const rows=await db.$queryRaw`SELECT id,combination_hash,snapshot FROM survey_standard_releases`
  source=rows.find((row:any)=>row.snapshot.parts.REPORT.payload!==null)
  body={requestId:randomUUID(),userId:use.userId,combinationHash:source.combination_hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
   validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'HTTP 明确替换报告',
   replaces:{grantId:use.id,expectedVersion:1,reason:'HTTP 管理员明确由无反馈切换到完整报告'}}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_REPLACEMENT_HTTP_EVIDENCE??'/tmp/education-replacement-http.json',JSON.stringify({productionAccessed:false,
   scope:'New replacement intent through existing Cookie/CSRF/origin/password/proof/rate-limited router; existing negative guard evidence reused; no real MFA/participant replay',requests,issuedId:issued?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('atomically replaces an existing R use and exposes the full original replacement intent and both histories',async()=>{
  issued=await call(prefix()+'/'+source.id+'/use-grants',{...body,currentPassword:password})
  const operation=await call(prefix()+'/'+source.id+'/operations/'+body.requestId)
  expect(operation).toMatchObject({kind:'ISSUE',request:{userId:use.userId,replaces:body.replaces}})
  const oldId=use.resourceKeys[0].split(':')[2],old=await call(prefix()+'/'+oldId+'/use-grants?requestId='+use.id)
  expect(old.list[0]).toMatchObject({id:use.id,version:2,revokedAt:expect.any(String)})
  const next=await call(prefix()+'/'+source.id+'/use-grants?requestId='+issued.id)
  expect(next.list[0].supersedes.selectedBinding.authorizationId).toBe(use.id);expect(next.list[0].supersedes.reason).toBe(body.replaces.reason)
  expect(await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})).toEqual(oldAudit)
 })
 it('replays only the complete replacement and rejects stale or injected replacement intents without additional grants',async()=>{
  if(!issued)throw Error('Prior replacement failed; dependent retry forbidden')
  expect(await call(prefix()+'/'+source.id+'/use-grants',{...body,currentPassword:password})).toMatchObject({id:issued.id,replayed:true})
  await call(prefix()+'/'+source.id+'/use-grants',{...body,currentPassword:password,replaces:{...body.replaces,reason:'Different intent'}},409)
  await call(prefix()+'/'+source.id+'/use-grants',{...body,requestId:randomUUID(),currentPassword:password},409)
  await call(prefix()+'/'+source.id+'/use-grants',{...body,requestId:randomUUID(),currentPassword:password,replaces:{...body.replaces,selectedBinding:{injected:true}}},400)
  expect(await db.contentCapabilityGrant.count()).toBe(8)
 })
})
