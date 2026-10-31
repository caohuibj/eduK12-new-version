/** Continue the retained known HTTP fixture; do not replay Teacher writes. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_MANAGER_SCHOOL_HTTP==='1'?describe:describe.skip
suite('School manager actual exact-configuration HTTP with a new explicit system delegation',()=>{
 let db:any,server:Server|undefined,base='',sign:any,actor:any,use:any,source:any,root:any,body:any,issued:any
 const requests:any[]=[],secret='Synthetic-manager-test-20261029!'
 const prefix=()=>`/api/platform/education/organizations/${use.scopeId}/products/HUISCHOOL/standard-configurations`
 async function call(path:string,input?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=school-manager-http','X-CSRF-Token':'school-manager-http'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const payload=await response.json() as any;requests.push({path,status:response.status})
  expect(response.status,payload.message??path).toBe(status);if(status===200)expect(response.headers.get('cache-control')).toBe('no-store')
  return payload.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Retained known HTTP fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_manager_http_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated known HTTP fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==6)throw Error('Inspect retained Teacher HTTP outcomes before continuation')
  use=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'SCHOOL',capabilities:{equals:['material.use']}}})
  actor=await db.user.findUniqueOrThrow({where:{id:use.issuerId}})
  source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(use.resourceKeys[0])!
  const system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  const original=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'SCHOOL',capabilities:{equals:['material.distribute']}}})
  expect(original.revokedAt).not.toBeNull()
  root=await (await import('../../modules/measurement-content/admin-authority.service')).issueAdminContentRoot(system.id,
   {tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},
   {requestId:randomUUID(),expectedVersion:0,reason:'Synthetic new explicit School manager authority',grant:{subjectId:actor.id,
    scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:use.scopeId,resourceKind:'material',resourceKeys:original.resourceKeys},capabilities:['material.distribute'],
    delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  body={requestId:randomUUID(),userId:use.subjectId,combinationHash:source.hash,authorityGrantId:root.grantId,expectedAuthorityVersion:1,
   validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'心理教师固定配置'}
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_MANAGER_SCHOOL_HTTP_EVIDENCE??'/tmp/education-manager-school-http.json',JSON.stringify({productionAccessed:false,
   scope:'Real School platform manager path, canonical psychologist, password/proof, exact new system delegation; no participant replay',requests,issuedId:issued?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('exposes the newly delegated exact source and only the psychologist, then issues through the protected School endpoint',async()=>{
  const catalog=await call(prefix());expect(catalog.list[0]).toMatchObject({id:source.id,assignable:true,authorities:[expect.objectContaining({id:root.grantId})]})
  expect((await call(prefix()+'/'+source.id+'/recipients?combinationHash='+source.hash)).list.map((row:any)=>row.userId)).toEqual([use.subjectId])
  issued=await call(prefix()+'/'+source.id+'/use-grants',{...body,currentPassword:secret});expect(issued).toMatchObject({id:body.requestId,version:1,revoked:false})
  expect(await call(prefix()+'/'+source.id+'/operations/'+body.requestId)).toMatchObject({kind:'ISSUE',request:{userId:use.subjectId,authorityGrantId:root.grantId,configurationName:body.configurationName}})
  expect((await call(prefix()+'/'+source.id+'/use-grants?requestId='+body.requestId)).list[0].selectedBinding.authorizationId).toBe(body.requestId)
  await call(prefix()+'/'+source.id+'/use-grants',{...body,requestId:randomUUID(),combinationHash:'f'.repeat(64),currentPassword:secret},409)
 })
 it('uses the same protected School revoke path and preserves the original configuration identity',async()=>{
  if(!issued)throw Error('Prior School issuance failed; dependent mutation forbidden')
  const input={requestId:randomUUID(),expectedVersion:1,reason:'Synthetic School exact withdrawal'}
  expect(await call(prefix()+'/'+source.id+'/use-grants/'+issued.id+'/revoke',{...input,currentPassword:secret})).toMatchObject({id:issued.id,version:2,revoked:true})
  expect(await call(prefix()+'/'+source.id+'/operations/'+input.requestId)).toMatchObject({kind:'REVOKE',request:input})
  const read=await call(prefix()+'/'+source.id+'/use-grants?requestId='+issued.id)
  expect(read.list[0]).toMatchObject({version:2,revokedAt:expect.any(String),selectedBinding:{authorizationId:issued.id,authorizationRevision:1}})
  expect(await db.contentCapabilityGrant.count()).toBe(8)
 })
})
