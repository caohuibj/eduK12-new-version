import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_MANAGER_HTTP==='1'?describe:describe.skip
suite('education manager exact configuration HTTP, real key/password and scope guards',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,teacher:any,school:any,wrong:any,use:any,schoolUse:any,root:any,source:any,body:any,issued:any,revokeBody:any
 const requests:any[]=[],secret='Synthetic-manager-test-20261029!'
 const prefix=(product='HUITEACHER',org=use.scopeId)=>`/api/platform/education/organizations/${org}/products/${product}/standard-configurations`
 async function call(actor:any,path:string,input?:unknown,status=200,age=0,cookie='ptool_session'){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000)-age,adminSessionId:randomUUID()})
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:cookie+'='+token+'; ptool_csrf=manager-http-csrf','X-CSRF-Token':'manager-http-csrf'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const payload=await response.json() as any;requests.push({path,method:input===undefined?'GET':'POST',status:response.status,noStore:response.headers.get('cache-control')==='no-store'})
  expect(response.status,payload.message??path).toBe(status)
  if(status===200)expect(response.headers.get('cache-control')).toBe('no-store')
  return payload.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit local manager HTTP fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_manager_http_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated new HTTP fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect previous outcomes before retry')
  const uses=await db.contentCapabilityGrant.findMany({where:{capabilities:{equals:['material.use']}}});use=uses.find((use:any)=>use.product==='TEACHER');schoolUse=uses.find((use:any)=>use.product==='SCHOOL')
  teacher=await db.user.findUniqueOrThrow({where:{id:use.issuerId}});school=await db.user.findUniqueOrThrow({where:{id:schoolUse.issuerId}})
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  const role=await db.adminEntryGrant.findFirstOrThrow({where:{entry:'TRAINING'}});wrong=await db.user.findUniqueOrThrow({where:{id:role.userId}})
  root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(use.resourceKeys[0])!
  // Only disposable fixture passwords are prepared. Existing production login,
  // TOTP/WebAuthn ceremony and security configuration are not changed or replayed.
  const passwordHash=await (await import('../../utils/password')).hashPassword(secret)
  for(const id of [teacher.id,school.id])await db.user.update({where:{id},data:{passwordHash}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  body={requestId:randomUUID(),userId:use.subjectId,combinationHash:source.hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
   validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'合成本校固定配置'}
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_MANAGER_HTTP_EVIDENCE??'/tmp/education-manager-http.json',JSON.stringify({productionAccessed:false,
   scope:'Actual platform education router/auth/CSRF/entry/recent-proof/password + exact issue/readback/revoke; signed test claims, not a fresh MFA ceremony',requests,issuedId:issued?.id,requestId:body?.requestId,revokeRequestId:revokeBody?.requestId},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('reads the exact legal source/recipient/preview and refuses system, wrong entry and wrong session realm',async()=>{
  expect((await call(teacher,prefix())).list[0]).toMatchObject({id:source.id,assignable:true})
  expect((await call(teacher,prefix()+'/'+source.id+'/recipients?combinationHash='+source.hash)).list.map((row:any)=>row.userId)).toEqual([use.subjectId])
  expect(await call(teacher,prefix()+'/'+source.id+'/preview?combinationHash='+source.hash)).toMatchObject({previewOnly:true})
  expect(await call(teacher,prefix()+'/'+source.id+'/operations/'+randomUUID())).toBeNull()
  expect((await call(school,prefix('HUISCHOOL'))).list[0].assignable).toBe(false)
  await call(school,prefix('HUISCHOOL')+'/'+source.id+'/recipients?combinationHash='+source.hash,undefined,403)
  await call(system,prefix(),undefined,403);await call(wrong,prefix(),undefined,403)
  await call(teacher,prefix(),undefined,401,0,'huischool_session')
 })
 it('preserves current password, recent proof, exact entry/root and strict binding input requirements before writing',async()=>{
  const path=prefix()+'/'+source.id+'/use-grants'
  await call(teacher,path,body,400)
  await call(teacher,path,{...body,currentPassword:'Incorrect-synthetic-password'},403)
  await call(teacher,path,{...body,currentPassword:secret},403,301)
  await call(teacher,path,{...body,currentPassword:secret,selectedBinding:{arbitrary:true}},400)
  const schoolRoot=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'SCHOOL',capabilities:{equals:['material.distribute']}}})
  await call(school,prefix('HUISCHOOL')+'/'+source.id+'/use-grants',{...body,userId:schoolUse.subjectId,authorityGrantId:schoolRoot.id,currentPassword:secret},403)
  await call(teacher,prefix('HUISCHOOL')+'/'+source.id+'/use-grants',{...body,currentPassword:secret},403)
  expect(await db.contentCapabilityGrant.count()).toBe(5)
 })
 it('issues through the protected actual endpoint and recovers complete original intent after distribution withdrawal',async()=>{
  issued=await call(teacher,prefix()+'/'+source.id+'/use-grants',{...body,currentPassword:secret})
  expect(issued).toMatchObject({id:body.requestId,version:1,revoked:false})
  await (await import('../../modules/measurement-content/admin-authority.service')).revokeAdminContentGrant(system.id,
   {tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},root.id,{expectedVersion:1,reason:'Synthetic original distribution withdrawn after issue'})
  const found=await call(teacher,prefix()+'/'+source.id+'/operations/'+body.requestId)
  expect(found).toMatchObject({kind:'ISSUE',grant:{id:body.requestId,version:1,revokedAt:null},request:{...body,
   validFrom:new Date(body.validFrom).toISOString(),expiresAt:new Date(body.expiresAt).toISOString()}})
  const exact=await call(teacher,prefix()+'/'+source.id+'/use-grants?requestId='+body.requestId)
  expect(exact.list).toHaveLength(1);expect(exact.list[0].selectedBinding.authorizationId).toBe(body.requestId)
 })
 it('revokes its own original use with intact password/key requirements and exact request readback and replay',async()=>{
  if(!issued)throw Error('Prior issuance failed; dependent revoke is forbidden')
  revokeBody={requestId:randomUUID(),expectedVersion:1,reason:'Synthetic exact request-level revoke'}
  const path=prefix()+'/'+source.id+'/use-grants/'+issued.id+'/revoke'
  expect(await call(teacher,path,{...revokeBody,currentPassword:secret})).toMatchObject({id:issued.id,version:2,revoked:true})
  const operation=await call(teacher,prefix()+'/'+source.id+'/operations/'+revokeBody.requestId)
  expect(operation).toMatchObject({kind:'REVOKE',grant:{id:issued.id,version:2,revokedAt:expect.any(String)},request:revokeBody})
  expect(await call(teacher,path,{...revokeBody,currentPassword:secret})).toMatchObject({id:issued.id,version:2,replayed:true,changed:false})
  expect(await db.contentCapabilityGrant.count()).toBe(6)
 })
})
