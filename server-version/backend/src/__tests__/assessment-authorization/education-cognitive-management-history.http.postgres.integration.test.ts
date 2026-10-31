import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_MANAGEMENT_REVIEW==='1'?describe:describe.skip
suite('Education cognitive own-issuance management after authority/source withdrawal',()=>{
 let db:any,state:any,system:any,sign:any,server:Server|undefined,base=''
 const requests:any[]=[],observations:any[]=[],password='Synthetic-manager-test-20261029!'
 async function call(actor:any,method:string,path:string,body?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:'ptool_session='+token+'; ptool_csrf=management-review','X-CSRF-Token':'management-review'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({method,path,status:response.status,expectedStatus:status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const u=new URL(process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/precise_education_cognitive_management_test_20261030'||u.username!=='precise_task1_runtime')throw Error('Separate retained synthetic clone and actual restricted role required')
  db=(await import('../../config/database')).prisma;state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,'utf8'));system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}});sign=(await import('../../utils/jwt')).generateToken
  expect(await db.user.count()).toBe(8);expect(await db.cognitiveSession.count()).toBe(0)
  const [role]=await db.$queryRaw`SELECT rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;expect(role).toEqual({rolsuper:false,rolcreaterole:false,rolbypassrls:false})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use('/api/cognitive/profile-configurations',(await import('../../modules/cognitive/profile-configurations.routes')).cognitiveProfileConfigurationsRouter)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-management-review.json',JSON.stringify({productionAccessed:false,database:'precise_education_cognitive_management_test_20261030',requests,observations,scope:'Existing synthetic source/identities/uses cloned unchanged. Actual restricted role and protected HTTP; normal root revoke, exact profile entry-scope update and own-use revoke. No new users/use grants/native attempts/scoring, production or human-MFA/rate-limit qualification.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s keeps own history inspectable and revocable without permitting new distribution',async product=>{
  const e=state.entries[product],manager=await db.user.findUniqueOrThrow({where:{id:e.managerId}}),profile=product==='SCHOOL'?'research':'experience',artifactHash=state.profiles[profile].artifactHash
  const path='/platform/education/organizations/'+e.organizationId+'/products/'+(product==='SCHOOL'?'HUISCHOOL':'HUITEACHER')+'/cognitive-profile-configurations'
  const old=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:e.browserReplacementId}});expect(old.revokedAt).toBeNull();expect(old.version).toBe(1)
  const before=await call(manager,'GET',path);expect(before.list.find((r:any)=>r.artifactHash===artifactHash)).toMatchObject({assignable:true})
  const original=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:old.id}}),originalHash=(await import('../../modules/assessment-runtime/canonical')).canonicalHash(original.metadata)
  if(product==='SCHOOL')await call(system,'POST','/admin/permissions/content-grants/'+e.rootId+'/revoke',{expectedVersion:1,reason:'Synthetic review: last exact delegation withdrawn'})
  else await call(system,'POST','/cognitive/profile-configurations/system/'+state.configId+'/'+profile+'/approve',{requestId:randomUUID(),expectedArtifactHash:artifactHash,allowedProducts:['SCHOOL'],reason:'Synthetic review: remove Teacher admission for this exact profile'})
  const after=await call(manager,'GET',path),row=after.list.find((r:any)=>r.artifactHash===artifactHash);expect(row).toMatchObject({configId:state.configId,profile,assignable:false,authorities:[]})
  const grants=await call(manager,'GET',path+'/'+state.configId+'/use-grants?page=1');expect(grants.list.find((g:any)=>g.id===old.id)).toMatchObject({canManage:true,revokedAt:null})
  await call(manager,'GET',path+'/'+state.configId+'/'+profile+'/preview?artifactHash='+artifactHash,undefined,product==='SCHOOL'?403:409)
  await call(manager,'POST',path+'/'+state.configId+'/use-grants/'+old.id+'/revoke',{currentPassword:password,requestId:randomUUID(),expectedVersion:1,reason:'Synthetic review: revoke own historical configuration after source withdrawal'})
  expect(await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:old.id}})).toMatchObject({version:2,revokedBy:manager.id})
  expect((await import('../../modules/assessment-runtime/canonical')).canonicalHash((await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:old.id}})).metadata)).toBe(originalHash)
  expect((await call(manager,'GET',path)).list.find((r:any)=>r.artifactHash===artifactHash)).toMatchObject({assignable:false})
  expect(await db.cognitiveSession.count()).toBe(0);observations.push({product,profile,artifactHash,grantId:old.id,historyRetained:true,assignable:false,ownRevokeVersion:2,originalT1Unchanged:true,noNativeAttemptsOrNewUse:true})
 },30000)
})
