import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'

// Opt-in against the explicitly prepared synthetic browser fixture only. No
// developer/production fallback and no mutations to its retained source objects.
const suite=process.env.STANDARD_DELEGATION_PG==='1'?describe:describe.skip
suite('standard detail delegation, real isolated PostgreSQL',()=>{
 let db:any,service:typeof import('../../modules/measurement-content/standard-delegations.service'),system:any,schoolId:string,adminId:string,schoolCreated=false,adminCreated=false
 let releases:Array<{id:string;measurementReleaseId:string;allowedProducts?:string[]}>;let source:string,other:string,schoolOnly:string
 const requests:string[]=[],prefix='std-delegation-pg-'+randomUUID().slice(0,8)
 const proof=()=>({tokenVersion:system.tokenVersion,adminSessionId:'synthetic-pg-service-proof',adminVerifiedAt:Date.now()/1000,
  adminAuthenticationMethod:'TOTP' as const})
 const read=(product:'SCHOOL'|'TEACHER'='SCHOOL',releaseId=source)=>service.readStandardDelegations(system.id,proof(),releaseId,{product,schoolQuery:prefix,adminQuery:prefix})
 async function body(product:'SCHOOL'|'TEACHER'='SCHOOL',releaseId=source){
  const result=await read(product,releaseId),requestId=randomUUID();requests.push(requestId)
  return {product,schoolId,adminId,requestId,coverageDigest:result.cover.coverageDigest,reason:prefix,
   startsAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}
 }
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'')
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55434'||url.pathname!=='/scale_detail_browser_20261127')
   throw Error('Explicit synthetic scale detail fixture on loopback 55434 required')
  const path=process.env.STANDARD_DELEGATION_FIXTURE
  if(!path)throw Error('Safe fixture metadata path required')
  const fixture=JSON.parse(await readFile(path,'utf8'))
  releases=fixture.releases
  source=releases[0].id;other=releases.find(row=>row.measurementReleaseId!==releases[0].measurementReleaseId)!.id
  schoolOnly=releases.find(row=>row.allowedProducts?.length===1&&row.allowedProducts[0]==='SCHOOL')!.id
  // Match the application startup shape before opening any write transaction
  // or creating our own fixture. These source imports can be cold in Vitest.
  await import('../../modules/education-tools/assessment-resource.locks')
  service=await import('../../modules/measurement-content/standard-delegations.service')
  db=(await import('../../config/database')).prisma
  const row=await db.$queryRaw`SELECT current_database() AS name,inet_server_port() AS port`
  expect(row).toEqual([{name:'scale_detail_browser_20261127',port:55434}])
  system=await db.user.findUniqueOrThrow({where:{id:fixture.administrators.find((a:any)=>a.role==='SYSTEM_ADMIN').userId}})
  schoolId=randomUUID();adminId=randomUUID()
  await db.organization.create({data:{id:schoolId,name:prefix,productDomain:'SCHOOL',status:'ACTIVE',createdByUserId:system.id}});schoolCreated=true
  await db.educationProductEntitlement.createMany({data:['HUISCHOOL','HUITEACHER'].map(product=>({organizationId:schoolId,product,status:'ACTIVE',grantedByUserId:system.id}))})
  await db.user.create({data:{id:adminId,username:prefix,passwordHash:'SYNTHETIC NO LOGIN',role:'ADMIN',accountDomain:'TRAINING',platformRole:'STANDARD'}})
  adminCreated=true
  await db.adminEntryGrant.createMany({data:['HUISCHOOL','HUITEACHER'].map(entry=>({id:randomUUID(),userId:adminId,entry,grantedBy:system.id}))})
 },60000)
 afterAll(async()=>{
  if(!db)return
  try{
   // The real audit is append-only. Keep the exact synthetic evidence and
   // reversibly remove only our own actors from the candidate selectors.
   if(adminCreated)await db.user.update({where:{id:adminId},data:{isFrozen:true}})
   if(schoolCreated)await db.organization.update({where:{id:schoolId},data:{status:'SUSPENDED'}})
   if(schoolCreated||adminCreated)console.info('Retained synthetic delegation evidence: '+prefix)
  }catch{console.warn('Synthetic delegation PG fixture retained for explicit isolated-cluster teardown')}
  finally{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 },30000)
 it('reads exact current School/Teacher cover, named eligible candidates and product isolation from real rows',async()=>{
  const school=await read(),teacher=await read('TEACHER')
  expect(school.cover.assignable).toBe(true);expect(teacher.cover.assignable).toBe(true)
  expect(school.cover.combinations.map(row=>row.id)).toContain(schoolOnly)
  expect(teacher.cover.combinations.map(row=>row.id)).not.toContain(schoolOnly)
  expect(school.schools.map(row=>row.id)).toEqual([schoolId]);expect(school.administrators.map(row=>row.id)).toEqual([adminId])
  expect(JSON.stringify(school)).not.toMatch(/"snapshot"|"definition"|"answers"|"passwordHash"/)
 })
 it('uses the original root transaction for issuance, exact retry and reason-bound CAS revocation',async()=>{
  const input=await body()
  expect(await service.issueStandardDelegation(system.id,proof(),source,input)).toMatchObject({grantId:input.requestId,version:1,changed:true})
  expect(await service.issueStandardDelegation(system.id,proof(),source,input)).toMatchObject({grantId:input.requestId,version:1,changed:false})
  const record=(await read()).records.find(row=>row.id===input.requestId)
  expect(record).toMatchObject({schoolName:prefix,adminName:prefix,status:'ACTIVE',reason:prefix})
  const revoke={expectedVersion:1,reason:prefix+' revoked'}
  expect(await service.revokeStandardDelegation(system.id,proof(),source,input.requestId,revoke)).toMatchObject({version:2,changed:true})
  expect(await service.revokeStandardDelegation(system.id,proof(),source,input.requestId,revoke)).toMatchObject({version:2,changed:false})
 },20000)
 it('rolls the tentative root INSERT back on stale coverage or an unapproved product anchor',async()=>{
  const stale=await body();stale.coverageDigest='0'.repeat(64)
  await expect(service.issueStandardDelegation(system.id,proof(),source,stale)).rejects.toMatchObject({statusCode:409})
  expect(await db.contentCapabilityGrant.count({where:{id:stale.requestId}})).toBe(0)
  expect(await db.adminAuthorizationAudit.count({where:{id:stale.requestId}})).toBe(0)
  const denied=await body('TEACHER',schoolOnly)
  expect((await read('TEACHER',schoolOnly)).cover.assignable).toBe(false)
  await expect(service.issueStandardDelegation(system.id,proof(),schoolOnly,denied)).rejects.toMatchObject({statusCode:409})
  expect(await db.contentCapabilityGrant.count({where:{id:denied.requestId}})).toBe(0)
 })
 it('rejects the legacy system-owned distributor allowance through the new named-manager endpoint',async()=>{
  const input=await body();input.adminId=system.id
  await expect(service.issueStandardDelegation(system.id,proof(),source,input)).rejects.toMatchObject({statusCode:403})
  expect(await db.contentCapabilityGrant.count({where:{id:input.requestId}})).toBe(0)
 })
 it.each(['SCHOOL','TEACHER'] as const)('signs only R2, rejects the same-C sibling from management and direct issuance, and uses the exact root for R2 in %s',async product=>{
  const directory=await read(product)
  const release=directory.cover.combinations.find(row=>row.id!==source&&row.id!==schoolOnly)!
  expect(release.id).toBeTruthy()
  const selected=await read(product,release.id),sibling=await read(product,source)
  expect(selected.cover.measurementReleaseId).toBe(sibling.cover.measurementReleaseId)
  const input={...(await body(product,release.id)),scope:'COMBINATION',coverageDigest:selected.cover.combinationCoverageDigest!}
  await service.issueStandardDelegation(system.id,proof(),release.id,input)
  const root=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:input.requestId}})
  expect(root.resourceKeys).toEqual([selected.cover.combinationResourceKey])
  expect((await read(product,release.id)).records.find(row=>row.id===input.requestId)).toMatchObject({scope:'COMBINATION'})
  expect((await read(product,source)).records.some(row=>row.id===input.requestId)).toBe(false)
  const {adminContentRootRequestSchema}=await import('../../modules/measurement-content/admin-authority.service')
  expect(adminContentRootRequestSchema.safeParse({requestId:randomUUID(),expectedVersion:0,reason:prefix,grant:{
   subjectId:adminId,scope:{product,scopeKind:'ORGANIZATION',scopeId:schoolId,resourceKind:'material',resourceKeys:root.resourceKeys},
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:input.startsAt,expiresAt:input.expiresAt,
  }}).success).toBe(false)
  const management=await import('../../modules/assessment-authorization/education-standard-management')
  const {grantEducationStandardConfigurationUse}=await import('../../modules/assessment-authorization/education-standard-use')
  const {readEducationPublicUse}=await import('../../modules/education-tools/public-source.catalog')
  const scope={product,organizationId:schoolId}
  const catalog=await management.educationStandardManagementCatalog(adminId,scope,{})
  expect(catalog.list.filter(row=>row.assignable).map(row=>row.id)).toEqual([release.id])
  const hash=(key:string)=>key.split(':').at(-1)!
  await expect(management.educationStandardManagementPreview(adminId,scope,source,hash(sibling.cover.combinationResourceKey))).rejects.toMatchObject({statusCode:403})
  const recipient=await db.user.create({data:{username:prefix+'-recipient-'+product.toLowerCase(),passwordHash:'SYNTHETIC NO LOGIN',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const membershipId=randomUUID()
  await db.organizationMembership.create({data:{id:membershipId,organizationId:schoolId,userId:recipient.id}})
  if(product==='SCHOOL'){
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:schoolId,membershipId,persona:'COUNSELOR',grantedByUserId:system.id}})
   await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:schoolId,membershipId,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system.id}})
  }else await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:schoolId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
  const use={requestId:randomUUID(),userId:recipient.id,authorityGrantId:input.requestId,expectedAuthorityVersion:1,validFrom:input.startsAt,expiresAt:input.expiresAt}
  await expect(grantEducationStandardConfigurationUse(adminId,scope,source,{...use,combinationHash:hash(sibling.cover.combinationResourceKey)}))
   .rejects.toMatchObject({code:'CONTENT_AUTHORITY_DENIED'})
  expect(await db.contentCapabilityGrant.count({where:{id:use.requestId}})).toBe(0)
  await expect(grantEducationStandardConfigurationUse(adminId,scope,release.id,{...use,combinationHash:hash(selected.cover.combinationResourceKey)}))
   .resolves.toMatchObject({id:use.requestId,version:1})
  const useScope={entry:product,organizationId:schoolId,principal:{userId:recipient.id,accountDomain:'SCHOOL' as const}}
  const readUse=()=>db.$transaction((tx:any)=>readEducationPublicUse(tx,useScope,[selected.cover.combinationResourceKey],false))
  expect((await readUse()).get(selected.cover.combinationResourceKey)).toMatchObject({grantId:use.requestId})
  const revoke={expectedVersion:1,reason:prefix+' exact test cleanup'}
  await expect(service.revokeStandardDelegation(system.id,proof(),source,input.requestId,revoke)).rejects.toMatchObject({statusCode:403})
  await expect(service.revokeStandardDelegation(system.id,proof(),release.id,input.requestId,revoke)).resolves.toMatchObject({version:2})
  expect((await readUse()).size).toBe(0)
 },30000)
 it('cannot revoke another C and can still revoke its own historical root after the school and recipient stop being candidates',async()=>{
  const input=await body('TEACHER')
  await service.issueStandardDelegation(system.id,proof(),source,input)
  await expect(service.revokeStandardDelegation(system.id,proof(),other,input.requestId,{expectedVersion:1,reason:prefix})).rejects.toMatchObject({statusCode:403})
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:input.requestId}})).revokedAt).toBeNull()
  await db.organization.update({where:{id:schoolId},data:{status:'SUSPENDED'}})
  await db.user.update({where:{id:adminId},data:{isFrozen:true}})
  const history=await read('TEACHER')
  expect(history.schools).toEqual([]);expect(history.administrators).toEqual([])
  expect(history.records.find(row=>row.id===input.requestId)).toMatchObject({schoolName:prefix,adminName:prefix,status:'ACTIVE'})
  expect(await service.revokeStandardDelegation(system.id,proof(),source,input.requestId,{expectedVersion:1,reason:prefix})).toMatchObject({version:2})
  expect((await read('TEACHER')).records.find(row=>row.id===input.requestId)?.status).toBe('REVOKED')
 })
})
