/** New empty isolated DB, real approved source and existing system delegation
 * API. Internal T1 service qualification only; no new route is mounted yet. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_USE==='1'?describe:describe.skip
suite('education platform manager exact standard use T1, isolated PostgreSQL',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,schoolManager:any,teacherManager:any,wrongManager:any,
  counselor:any,productAdmin:any,member:any,foreignAdmin:any,org:string,otherOrg:string,pointer:any,measurementId:string,
  schoolRoot:any,teacherRoot:any,schoolUse:any,teacherUse:any,service:any
 const requests:any[]=[],proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const key='academic_self_concept_biology_zh_cn',version='1.0.0'
 const validFrom='2020-01-01T00:00:00Z',expiresAt='2090-01-01T00:00:00Z'
 async function request(actor:any,path:string,body?:unknown,status=200){
  const jwt=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,...proof})
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'ptool_session='+jwt+'; ptool_csrf=education-use-csrf',
   'X-CSRF-Token':'education-use-csrf',Origin:'http://localhost:5173','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any;requests.push({path,status:response.status})
  expect(response.status,payload.message??path).toBe(status);return payload.data
 }
 const input=(user:any,root:any)=>({requestId:randomUUID(),userId:user.id,combinationHash:pointer.combinationHash,authorityGrantId:root.grantId,
  expectedAuthorityVersion:1,validFrom,expiresAt})
 const rootInput=(actor:any,product:string)=>({requestId:randomUUID(),expectedVersion:0,reason:'Isolated exact manager delegation',grant:{subjectId:actor.id,
  scope:{product,scopeKind:'ORGANIZATION',scopeId:org,resourceKind:'material',resourceKeys:[measurementId]},capabilities:['material.distribute'],
  delegableCapabilities:[],remainingDelegationDepth:0,validFrom,expiresAt:'2099-01-01T00:00:00Z'}})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit education use test URL required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated local education test database required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()||await db.scale.count())throw Error('Fresh schema-only DB required; inspect outcomes before retry')
  const create=(name:string,domain='TRAINING',role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'precise-edu-'+name+'-'+randomUUID(),
   passwordHash:'!synthetic-no-login',accountDomain:domain,role,platformRole,teacherApproved:role==='TEACHER'}})
  system=await create('system','TRAINING','STUDENT','SYSTEM_ADMIN');schoolManager=await create('school-manager');teacherManager=await create('teacher-manager');wrongManager=await create('wrong-manager')
  for(const [actor,entry]of [[schoolManager,'HUISCHOOL'],[teacherManager,'HUITEACHER'],[wrongManager,'TRAINING']])await db.adminEntryGrant.create({data:{id:randomUUID(),userId:actor.id,entry,grantedBy:system.id}})
  org=randomUUID();otherOrg=randomUUID()
  for(const id of [org,otherOrg]){
   await db.organization.create({data:{id,name:'Synthetic exact education school '+id,productDomain:'SCHOOL',createdByUserId:system.id}})
   for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId:id,product,grantedByUserId:system.id}})
  }
  async function recipient(name:string,organizationId:string,kind:'COUNSELOR'|'PRODUCT_ADMIN'|'MEMBER'){
   const user=await create(name,'SCHOOL','TEACHER'),membershipId=randomUUID()
   await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}})
   if(kind==='COUNSELOR'){
    await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId,persona:'COUNSELOR',grantedByUserId:system.id}})
    await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system.id}})
   }
   if(kind==='PRODUCT_ADMIN')await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
   return user
  }
  counselor=await recipient('counselor',org,'COUNSELOR');productAdmin=await recipient('product-admin',org,'PRODUCT_ADMIN');member=await recipient('member',org,'MEMBER');foreignAdmin=await recipient('foreign-admin',otherOrg,'PRODUCT_ADMIN')
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const registry=await import('../../modules/scale/onboarding/instrument-registry'),source=registry.getScaleInstrumentSource(key,version)!,runtime=registry.getScaleInstrumentRuntimePolicy(key,version)!
  await (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,
   deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],
    runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}})
  const publication=await import('../../modules/scale/onboarding/publish'),pub={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]}
  const plan=await publication.planStandardScalePublication(db,pub);expect(plan.blockers).toEqual([])
  await publication.publishStandardScale(db,{...pub,expectedProofHash:plan.proofHash})
  const candidate=await request(system,`/api/platform/survey-standard/candidate/${key}/${version}`),preview=await request(system,'/api/platform/survey-standard/preview',candidate.selection)
  const approved=await request(system,'/api/platform/survey-standard/approve',{...candidate.selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,
   allowedProducts:['SCHOOL','TEACHER'],reason:'Normal real source approval, no target use granted'})
  expect(approved.state,approved.blockers.join(';')).toBe('ONLINE');pointer={releaseId:approved.id,combinationHash:approved.combinationHash}
  const row=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,approved.id);measurementId=row.measurement_release!.releaseId
  service=await import('../../modules/assessment-authorization/education-standard-use')
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_USE_EVIDENCE??'/tmp/education-standard-use.json',JSON.stringify({productionAccessed:false,routeMounted:false,
   scope:'Internal T1 service and existing system-delegation HTTP only; no user/START/browser qualification',source:{key,version,pointer},
   organizationId:org,schoolUse,teacherUse,requests},null,2)+'\n')
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('requires formal matching manager qualification independently from the system-issued exact school/source delegation',async()=>{
  await request(system,'/api/admin/permissions/content-grants',rootInput(wrongManager,'SCHOOL'),403)
  schoolRoot=await request(system,'/api/admin/permissions/content-grants',rootInput(schoolManager,'SCHOOL'))
  teacherRoot=await request(system,'/api/admin/permissions/content-grants',rootInput(teacherManager,'TEACHER'))
  expect(await db.contentCapabilityGrant.count()).toBe(2)
  await expect(service.grantEducationStandardConfigurationUse(system.id,{product:'SCHOOL',organizationId:org},pointer.releaseId,input(counselor,schoolRoot))).rejects.toMatchObject({statusCode:403})
 })
 it('issues distinct immutable School counselor and Teacher productAdmin use configurations without elevating either recipient',async()=>{
  schoolUse=await service.grantEducationStandardConfigurationUse(schoolManager.id,{product:'SCHOOL',organizationId:org},pointer.releaseId,input(counselor,schoolRoot))
  teacherUse=await service.grantEducationStandardConfigurationUse(teacherManager.id,{product:'TEACHER',organizationId:org},pointer.releaseId,input(productAdmin,teacherRoot))
  for(const [use,issuer,user,product]of [[schoolUse,schoolManager,counselor,'SCHOOL'],[teacherUse,teacherManager,productAdmin,'TEACHER']]){
   const stored=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:use.id}}),audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
   expect(stored.capabilities).toEqual(['material.use']);expect(stored.delegableCapabilities).toEqual([]);expect(stored.parentGrantId).toBeNull()
   const sealed=service.readEducationStandardUseBinding(audit.metadata,{id:use.id,issuerId:issuer.id,recipientId:user.id,scope:{product,organizationId:org},resourceKey:stored.resourceKeys[0]})
   expect(sealed.bindingHash).toBe(use.bindingHash);expect(sealed.binding.authorization.authority).toHaveLength(2)
   expect(sealed.binding.configuration.combinationHash).toBe(pointer.combinationHash)
  }
  expect((await db.user.findUniqueOrThrow({where:{id:counselor.id}})).accountDomain).toBe('SCHOOL')
  expect(await db.adminEntryGrant.count({where:{userId:{in:[counselor.id,productAdmin.id]}}})).toBe(0)
 })
 it('rejects cross-entry/root/org, wrong recipient role, identity-domain selfGrant, excess validity and injected binding',async()=>{
  const before=await db.contentCapabilityGrant.count()
  for(const [actor,product,user,root]of [[schoolManager,'TEACHER',productAdmin,teacherRoot],[teacherManager,'TEACHER',productAdmin,schoolRoot],
   [schoolManager,'SCHOOL',productAdmin,schoolRoot],[teacherManager,'TEACHER',counselor,teacherRoot],[teacherManager,'TEACHER',foreignAdmin,teacherRoot],
   [schoolManager,'SCHOOL',schoolManager,schoolRoot],[schoolManager,'SCHOOL',member,schoolRoot]])
   await expect(service.grantEducationStandardConfigurationUse(actor.id,{product,organizationId:org},pointer.releaseId,input(user,root))).rejects.toBeTruthy()
  await expect(service.grantEducationStandardConfigurationUse(schoolManager.id,{product:'SCHOOL',organizationId:org},pointer.releaseId,{...input(counselor,schoolRoot),expiresAt:'2100-01-01T00:00:00Z'})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantEducationStandardConfigurationUse(schoolManager.id,{product:'SCHOOL',organizationId:org},pointer.releaseId,{...input(counselor,schoolRoot),selectedBinding:{arbitrary:true}})).rejects.toBeTruthy()
  expect(await db.contentCapabilityGrant.count()).toBe(before)
 })
 it('compares the complete request and preserves historical T1 evidence after distribution revocation',async()=>{
  const data=input(counselor,schoolRoot),scope={product:'SCHOOL',organizationId:org}
  const granted=await service.grantEducationStandardConfigurationUse(schoolManager.id,scope,pointer.releaseId,data)
  expect(await service.grantEducationStandardConfigurationUse(schoolManager.id,scope,pointer.releaseId,data)).toMatchObject({id:granted.id,replayed:true,changed:false})
  await expect(service.grantEducationStandardConfigurationUse(schoolManager.id,scope,pointer.releaseId,{...data,expiresAt:'2089-01-01T00:00:00Z'})).rejects.toMatchObject({statusCode:409})
  await request(system,`/api/admin/permissions/content-grants/${schoolRoot.grantId}/revoke`,{expectedVersion:1,reason:'Synthetic original exact delegation withdrawn'})
  await expect(service.grantEducationStandardConfigurationUse(schoolManager.id,scope,pointer.releaseId,data)).rejects.toBeTruthy()
  const row=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:granted.id}}),audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:granted.id}})
  expect(service.readEducationStandardUseBinding(audit.metadata,{id:row.id,issuerId:schoolManager.id,recipientId:counselor.id,scope,resourceKey:row.resourceKeys[0]}).bindingHash).toBe(granted.bindingHash)
  expect(row.revokedAt).toBeNull() // T1 history is not rewritten by ordinary upstream withdrawal.
 })
})
