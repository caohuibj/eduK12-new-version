import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_SETUP==='1'?describe:describe.skip
suite('Isolated education exact cognitive source normal setup and distribution',()=>{
 let db:any,server:Server|undefined,base='',system:any,actors:any={},config:any,sign:any,stage='init'
 const requests:any[]=[],observations:any[]=[],state:any={}
 async function call(actor:any,method:string,path:string,body?:unknown){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:'ptool_session='+token+'; ptool_csrf=education-profile-setup','X-CSRF-Token':'education-profile-setup'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({method,path,status:response.status});expect(response.status,value.message??path).toBe(200);return value.data
 }
 async function checkpoint(){await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!;requireIsolatedReleaseDatabase(url);const parsed=new URL(url)
  if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_education_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime'||!process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT)throw Error('Explicit new isolated actual runtime fixture required')
  db=(await import('../../config/database')).prisma;expect(await db.user.count()).toBe(8);expect(await db.cognitiveTestConfig.count()).toBe(0)
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  for(const product of ['SCHOOL','TEACHER']){
   const [old]=await db.$queryRaw`SELECT g.issuer_id,g.subject_id,g.scope_id FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id AND e.action='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED' WHERE g.product=${product} ORDER BY g.created_at LIMIT 1`
   actors[product]={manager:await db.user.findUniqueOrThrow({where:{id:old.issuer_id}}),user:await db.user.findUniqueOrThrow({where:{id:old.subject_id}}),organizationId:old.scope_id}
  }
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-setup.json',JSON.stringify({productionAccessed:false,stage,requests,observations,scope:'Exact existing main reaction source, normal install/release and real protected system approval/delegation routes. Existing synthetic entry managers and current schools; restricted PostgreSQL role, synthetic recent-MFA JWT, no real-user or production grants.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally installs one config, approves both exact profiles for two entries and issues only exact M school-scoped distribution roots',async()=>{
  const {cognitiveSeeds}=await import('../../modules/cognitive/generated/seeds'),seed=cognitiveSeeds.find(s=>s.testType==='reaction'&&s.configVersion==='1.1.0'&&s.engineVersion==='1.0.0'&&s.scoringVersion==='1.1.0')!
  const installed=await(await import('../../modules/cognitive/onboarding/install')).installCognitiveConfigs(db,{schemaVersion:1,items:[{testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion}]},system.id)
  expect(installed.hasBlocked).toBe(false);config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:installed.rows[0].configId}});state.configId=config.id;stage='installed';await checkpoint()
  await(await import('../../modules/cognitive/release.service')).publishCognitiveConfig(config.id,system.id);config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:config.id}});stage='published';await checkpoint()
  state.profiles={};state.entries={}
  for(const profile of ['experience','research']){
   const path='/cognitive/profile-configurations/system/'+config.id+'/'+profile,preview=await call(system,'GET',path)
   await call(system,'POST',path+'/approve',{requestId:randomUUID(),expectedArtifactHash:preview.artifactHash,allowedProducts:['SCHOOL','TEACHER'],reason:'Synthetic existing native profile education entry approval'})
   state.profiles[profile]={artifactHash:preview.artifactHash,configuration:preview.configuration};stage='approved-'+profile;await checkpoint()
  }
  for(const product of ['SCHOOL','TEACHER']){
   const {manager,user,organizationId}=actors[product],root=await call(system,'POST','/admin/permissions/content-grants',{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact native M distribution to existing entry manager',grant:{subjectId:manager.id,
    scope:{product,scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:[config.measurementReleaseId]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
   state.entries[product]={managerId:manager.id,userId:user.id,organizationId,rootId:root.grantId};stage='delegated-'+product;await checkpoint()
   const page=await call(manager,'GET',`/platform/education/organizations/${organizationId}/products/${product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'}/cognitive-profile-configurations`)
   expect(page.list).toHaveLength(2);expect(page.list.every((r:any)=>r.assignable&&r.authorities.some((a:any)=>a.id===root.grantId))).toBe(true)
  }
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(2)
  stage='complete';observations.push({configId:config.id,profiles:state.profiles,entries:state.entries,noRecipientUseGranted:true,oneTestType:true})
 },30000)
})
