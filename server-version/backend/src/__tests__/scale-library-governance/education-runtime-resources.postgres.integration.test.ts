import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review,stopCollection} from '../../modules/scale-library-governance/service'
import {readEducationLibraryUse} from '../../modules/scale-library-governance/education-use'
import {grantUse,revokeUse} from '../../modules/scale-library-governance/distribution'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import {readEducationLibraryRegisteredSource,assertEducationLibraryRegisteredUse} from '../../modules/scale-library-governance/education-runtime-resources'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,owner:string,project:string
const metadata={title:'教育公库合成量表',author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic research only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
async function waitForBlocked(fragment:string){
 const deadline=Date.now()+4000
 while(Date.now()<deadline){
  const rows=await db.$queryRaw<Array<{pid:number}>>(Prisma.sql`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
   AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND lower(query) LIKE ${'%'+fragment+'%'}`)
  if(rows.length)return
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 throw new Error('Synthetic lock barrier was not reached: '+fragment)
}
suite('Education library registered resources / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'edlibadmin'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  owner=(await db.user.create({data:{username:'edlibauthor'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})).id
  const login='edlib'+randomUUID().replaceAll('-','').slice(0,20)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic education library',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('atomically binds exact approved resources and scoped grants, rejecting incomplete public identities',async()=>{
  const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'v1',instrumentVersion:'1',
   definition:compileResearchScale(metadata.title,definition),instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
   scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},provenance:{authoringRelationship:'ORIGINAL',
    authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
  const application=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata,
   educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]}})
  const approved=await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic version approval'})
  const entryId=approved.entryId!,organizationId=randomUUID()
  await db.organization.create({data:{id:organizationId,name:'Synthetic exact resource school',productDomain:'SCHOOL',createdByUserId:admin}})
  for(const product of ['HUISCHOOL','HUITEACHER'] as const)await db.educationProductEntitlement.create({data:{organizationId,product,grantedByUserId:admin}})
  const member=(await db.user.create({data:{username:'edlibmember'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'SCHOOL'}})).id
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:member}})
  const request={requestId:randomUUID(),product:'SCHOOL' as const,scopeKind:'USER' as const,organizationId,userId:member}
  // The internal command is not a valid public request: public distribution
  // must receive the exact immutable release/hash, never infer the latest.
  await expect(grantUse(admin,entryId,request)).rejects.toMatchObject({name:'ZodError',issues:[{
   code:'invalid_union',unionErrors:expect.arrayContaining([expect.objectContaining({issues:expect.arrayContaining([
    expect.objectContaining({code:'invalid_type',expected:'string',received:'undefined',path:['releaseId']}),
    expect.objectContaining({code:'invalid_type',expected:'string',received:'undefined',path:['contentHash']}),
   ])})]),
  }]})
  expect(await db.scale.findUnique({where:{libraryEntryId:entryId}})).toBeNull()
  // Deliberate transaction rollback must not leave resources or grants behind.
  await expect(db.$transaction(async tx=>{await grantEducationLibraryUseInTransaction(tx,admin,entryId,request);throw new Error('synthetic rollback')})).rejects.toThrow('synthetic rollback')
  expect(await db.scale.findUnique({where:{libraryEntryId:entryId}})).toBeNull()
  const granted=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin,entryId,request))
  expect(granted.resources).toHaveLength(1)
  expect(granted.resources[0].resourceEntry.libraryOrigin.variantKey).toBe('STUDENT:SELF')
  const resource=granted.resources[0],ref={product:'SCHOOL' as const,resourceKey:resource.resourceEntry.applicability.resourceKey,resourceVersion:'1.0.0' as const}
  const repeated=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin,entryId,request))
  expect(repeated.grant.id).toBe(granted.grant.id)
  expect(repeated.resources.map(r=>r.compositeId)).toEqual(granted.resources.map(r=>r.compositeId))
  const use=()=>db.$transaction(tx=>assertEducationLibraryRegisteredUse(tx,{...ref,organizationId,actorId:member}))
  expect((await use()).source.entryId).toBe(entryId)
  await expect(db.$transaction(tx=>assertEducationLibraryRegisteredUse(tx,{...ref,organizationId,actorId:member}),
   {isolationLevel:Prisma.TransactionIsolationLevel.Serializable})).rejects.toThrow('READ_COMMITTED_REQUIRED')
  // Account management takes issuer user UPDATE then org UPDATE. The reader
  // must wait on the issuer BEFORE acquiring org, otherwise these deadlock.
  let issuerReady!:()=>void,resumeIssuer!:()=>void
  const issuerLocked=new Promise<void>(resolve=>{issuerReady=resolve}),issuerMayContinue=new Promise<void>(resolve=>{resumeIssuer=resolve})
  const accountWriter=db.$transaction(async tx=>{
   await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${admin} FOR UPDATE`);issuerReady()
   await issuerMayContinue
   await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`)
  },{timeout:10000})
  await issuerLocked
  const waitingUse=use().then(value=>({value,error:null}),error=>({value:null,error}))
  try{await waitForBlocked('from users')}finally{resumeIssuer()}
  await accountWriter
  expect((await waitingUse).error).toBeNull()
  // A governance deny committed while a caller awaits org must be seen by the
  // post-lock READ COMMITTED recheck, not its earlier member projection.
  let denyReady!:()=>void,resumeDeny!:()=>void
  const denyLocked=new Promise<void>(resolve=>{denyReady=resolve}),denyMayCommit=new Promise<void>(resolve=>{resumeDeny=resolve})
  const denyId=randomUUID()
  const denyWriter=db.$transaction(async tx=>{
   await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`)
   await tx.organizationAccessDeny.create({data:{id:denyId,organizationId,userId:member,permission:'HUISCHOOL_ACCESS',reason:'Synthetic concurrent deny',deniedByUserId:admin}})
   denyReady();await denyMayCommit
  },{timeout:10000})
  await denyLocked
  const deniedUse=use().then(value=>({value,error:null}),error=>({value:null,error}))
  try{await waitForBlocked('from organizations')}finally{resumeDeny()}
  await denyWriter
  expect(String((await deniedUse).error)).toContain('MEMBERSHIP_REQUIRED')
  await db.organizationAccessDeny.update({where:{id:denyId},data:{liftedAt:new Date(),liftedByUserId:admin}})

  await expect(db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{...ref,product:'TEACHER',purpose:'HISTORY'}))).rejects.toThrow('IDENTITY_MISMATCH')
  const teacher=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin,entryId,{...request,requestId:randomUUID(),product:'TEACHER',scopeKind:'ORGANIZATION',userId:null}))
  expect(teacher.resources).toHaveLength(1)
  expect(teacher.resources[0].resourceEntry.libraryOrigin.variantKey).toBe('TEACHER:SELF')
  expect(teacher.resources[0].scaleId).toBe(resource.scaleId)
  expect(teacher.resources[0].compositeId).not.toBe(resource.compositeId)
  const [row]=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM registered_assessment_resources WHERE resource_key=${ref.resourceKey} AND resource_version=${ref.resourceVersion}`)
  await expect(db.$executeRaw(Prisma.sql`UPDATE registered_assessment_resources SET entry=jsonb_set(entry,'{libraryOrigin,approvedSnapshotHash}',to_jsonb(${'0'.repeat(64)}::text)) WHERE id=${row.id}`)).rejects.toThrow()
  const malformed=await db.compositeAssessment.create({data:{code:'synthetic-bad-library-'+randomUUID(),name:'Synthetic bad binding',createdBy:admin,
   productKind:'ORGANIZATION_RESOURCE',publicEnabled:false,items:{create:{type:'SCALE',position:0,required:true,scaleId:resource.scaleId}}}})
  const original=await db.compositeAssessment.findUniqueOrThrow({where:{id:resource.compositeId}})
  const malformedSnapshot={...(original.trainingContentSnapshot as any),compositeId:malformed.id,
   units:[{...(original.trainingContentSnapshot as any).units[0],itemId:randomUUID()}]}
  await db.compositeAssessment.update({where:{id:malformed.id},data:{status:'PUBLISHED',trainingContentSnapshot:malformedSnapshot,
   trainingContentSnapshotHash:canonicalHash(malformedSnapshot)}})
  const malformedEntry={...resource.resourceEntry,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:malformed.id}}
  const wrapper=await db.scale.findUniqueOrThrow({where:{id:resource.scaleId}})
  await expect(db.$executeRaw(Prisma.sql`INSERT INTO registered_assessment_resources
   (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,status,created_by_user_id)
   VALUES(${randomUUID()},${ref.resourceKey},'1.0.0',${resource.scaleId},${wrapper.definitionHash},${malformed.id},
     ${JSON.stringify(malformedEntry)}::jsonb,${canonicalHash(malformedEntry)},'PUBLISHED',${admin})`)).rejects.toThrow('source linkage mismatch')
  await expect(db.compositeAssessmentItem.update({where:{id:resource.compositeItemId},data:{required:false}})).rejects.toThrow()
  await expect(db.compositeAssessment.update({where:{id:resource.compositeId},data:{publicEnabled:true}})).rejects.toThrow()
  await db.compositeAssessment.update({where:{id:resource.compositeId},data:{revision:{increment:1}}})
  await expect(registerDescriptiveResource({userId:admin,platformRole:'SYSTEM_ADMIN'},resource.scaleId)).rejects.toThrow('共用库量表')
  await expect(transitionDescriptiveResource({userId:admin,platformRole:'SYSTEM_ADMIN'},row.id,'retire')).rejects.toThrow('共用库资源')
  await revokeUse(admin,granted.grant.id,{expectedVersion:1,reason:'Synthetic ordinary distribution revoke'})
  await expect(use()).rejects.toThrow('USE_GRANT_REQUIRED')
  const alternative=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin,entryId,
   {...request,requestId:randomUUID(),scopeKind:'ORGANIZATION',userId:null}))
  await expect(db.$transaction(tx=>readEducationLibraryUse(tx,{product:'SCHOOL',organizationId,actorId:member,entryId,
   releaseId:release.releaseId,contentHash:release.contentHash},{onlyGrantId:granted.grant.id}))).rejects.toThrow('USE_GRANT_REQUIRED')
  await revokeUse(admin,alternative.grant.id,{expectedVersion:1,reason:'Synthetic alternate revoke'})

  const read=(purpose:'EXISTING_EXECUTION'|'HISTORY')=>db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{...ref,purpose}))
  expect((await read('EXISTING_EXECUTION')).identityOnly).toBe(true)
  await db.$transaction(tx=>stopCollection(tx,admin,'RELEASE',release.releaseId,'Synthetic collection stop'))
  await expect(read('EXISTING_EXECUTION')).rejects.toThrow('紧急停用')
  expect((await read('HISTORY')).releaseId).toBe(release.releaseId)
 },20000)
})
