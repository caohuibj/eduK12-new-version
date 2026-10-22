import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {grantUse,recipients} from '../../modules/scale-library-governance/distribution'
import {educationRecipientsInTransaction,grantEducationPublicUseInTransaction} from '../../modules/scale-library-governance/education-distribution-public'
import {resolveEducationProductMemberScope} from '../../modules/organization/educationProductAccess'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,owner:string,organizationId:string,otherOrg:string,entryId:string,releaseId:string,contentHash:string,outsider:string,project:string
const eligible:string[]=[],excluded:string[]=[],prefix='picker'+randomUUID().slice(0,8)
const metadata={title:'Synthetic picker scale',author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic research only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
const user=async(domain:'LEGACY'|'SURVEY'|'SCHOOL',extra:Record<string,unknown>={})=>db.user.create({data:{username:prefix+randomUUID().slice(0,8),passwordHash:'synthetic-only',accountDomain:domain,...extra}})
const query=()=>({product:'SCHOOL' as const,scopeKind:'USER' as const,organizationId,releaseId,contentHash})
const read=(raw:unknown,actor=admin)=>db.$transaction(tx=>educationRecipientsInTransaction(tx,actor,entryId,raw))
const grant=(raw:unknown)=>db.$transaction(tx=>grantEducationPublicUseInTransaction(tx,admin,entryId,raw),{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
suite('Education admin distribution seams / isolated PostgreSQL, public gate closed',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await user('LEGACY',{role:'ADMIN',platformRole:'SYSTEM_ADMIN'})).id
  owner=(await user('SURVEY')).id
  const login=prefix+'owner'
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic picker source',collectionMode:'SINGLE_UNLINKED'}})
  const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'v1',instrumentVersion:'1',
   definition:compileResearchScale(metadata.title,definition),instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
   scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},provenance:{authoringRelationship:'ORIGINAL',
    authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
  releaseId=release.releaseId;contentHash=release.contentHash
  const application=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId,metadata,
   educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]}})
  entryId=(await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic approval'})).entryId!
  organizationId=randomUUID();otherOrg=randomUUID()
  for(const id of [organizationId,otherOrg])await db.organization.create({data:{id,name:prefix+id,productDomain:'SCHOOL',createdByUserId:admin}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUISCHOOL',grantedByUserId:admin}})
  for(let i=0;i<26;i++){
   const id=(await user('SCHOOL')).id;eligible.push(id)
   await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:id,validFrom:new Date('2020-01-01')}})
  }
  outsider=(await user('SCHOOL')).id
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId:otherOrg,userId:outsider}})
  for(const [index,extra] of [{isFrozen:true},{mustChangePassword:true},{expiresAt:new Date('2020-01-01')},{},{}].entries()){
   const id=(await user('SCHOOL',extra)).id;excluded.push(id)
   await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:id,validFrom:new Date('2020-01-01'),
    ...(index===3?{validUntil:new Date('2021-01-01')}:{})}})
   if(index===4)await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId,userId:id,permission:'HUISCHOOL_ACCESS',reason:'Synthetic deny',deniedByUserId:admin}})
  }
 },120000)
 afterAll(async()=>{await db?.$disconnect()})
 it('paginates exact eligible members, including ordinary members with no authoring capability, without cross-scope cursors or writes',async()=>{
  const first=await read(query());expect(first.list).toHaveLength(25);expect(first.nextCursor).toBeTruthy()
  const second=await read({...query(),cursor:first.nextCursor});expect(second.list).toHaveLength(1);expect(second.nextCursor).toBeNull()
  expect([...first.list,...second.list].map(row=>row.id).sort()).toEqual([...eligible].sort())
  for(const id of [eligible[0],...excluded,outsider]){
   const current=await resolveEducationProductMemberScope({actorUserId:id,organizationId,product:'HUISCHOOL'},db)
   expect(Boolean(current)).toBe(eligible.includes(id))
  }
  await expect(read({...query(),cursor:outsider})).rejects.toThrow('RECIPIENT_CURSOR_INVALID')
  await expect(read({...query(),cursor:excluded[0]})).rejects.toThrow('RECIPIENT_CURSOR_INVALID')
  await expect(read({...query(),product:'TEACHER'})).rejects.toThrow('TARGET_ORGANIZATION_UNAVAILABLE')
  const orgs=await read({releaseId,contentHash,product:'SCHOOL',scopeKind:'ORGANIZATION',keyword:prefix})
  expect(orgs.list.map(row=>row.id)).toEqual([organizationId])
  await expect(read({releaseId,contentHash,product:'SCHOOL',scopeKind:'ORGANIZATION',cursor:otherOrg})).rejects.toThrow('RECIPIENT_CURSOR_INVALID')
  expect(await db.scale.findUnique({where:{libraryEntryId:entryId}})).toBeNull()
 },120000)
 it('requires exact current distribution authority and fixed release/hash; public routes remain closed',async()=>{
  await expect(read(query(),owner)).rejects.toThrow()
  await expect(read({...query(),releaseId:randomUUID()})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  await expect(read({...query(),contentHash:'f'.repeat(64)})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  await expect(recipients(admin,entryId,query())).rejects.toThrow('ADAPTER_NOT_READY')
  await expect(grantUse(admin,entryId,{...query(),requestId:randomUUID(),userId:eligible[0]})).rejects.toThrow('ADAPTER_NOT_READY')
 })
 it('controlled internal seam grants exact USER and ORGANIZATION scopes, rechecks current membership and preserves idempotence',async()=>{
  const request={...query(),requestId:randomUUID(),userId:eligible[0]}
  await expect(grant({...request,contentHash:'f'.repeat(64)})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  expect(await db.scale.findUnique({where:{libraryEntryId:entryId}})).toBeNull()
  await expect(grant({...request,userId:excluded[4]})).rejects.toThrow()
  const granted=await grant(request)
  expect((await grant(request)).id).toBe(granted.id)
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',grantedByUserId:admin}})
  const organizationGrant=await grant({requestId:randomUUID(),releaseId,contentHash,product:'TEACHER',scopeKind:'ORGANIZATION',organizationId,userId:null})
  expect(organizationGrant.scopeKind).toBe('ORGANIZATION');expect(organizationGrant.userId).toBeNull()
  const rows=await db.$queryRaw<Array<{product:string;scope_kind:string;organization_id:string;user_id:string|null}>>(Prisma.sql`SELECT product,scope_kind,organization_id,user_id FROM scale_library_use_grants WHERE entry_id=${entryId} AND status='ACTIVE' ORDER BY product`)
  expect(rows).toEqual([{product:'SCHOOL',scope_kind:'USER',organization_id:organizationId,user_id:eligible[0]},
   {product:'TEACHER',scope_kind:'ORGANIZATION',organization_id:organizationId,user_id:null}])
 },120000)
 it('rejects a student-only version for Teacher in both picker and exact grant without creating unusable resources',async()=>{
  const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'v1',instrumentVersion:'1',
   definition:compileResearchScale(metadata.title,definition),instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
   scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},provenance:{authoringRelationship:'ORIGINAL',
    authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
  const application=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata,
   educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'}]}})
  const id=(await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic student-only approval'})).entryId!
  const input={...query(),product:'TEACHER',releaseId:release.releaseId,contentHash:release.contentHash}
  await expect(db.$transaction(tx=>educationRecipientsInTransaction(tx,admin,id,input))).rejects.toThrow('PRODUCT_VARIANT_ADAPTER_NOT_READY')
  await expect(db.$transaction(tx=>grantEducationPublicUseInTransaction(tx,admin,id,{...input,requestId:randomUUID(),userId:eligible[0]}),
   {isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})).rejects.toThrow('PRODUCT_VARIANT_ADAPTER_NOT_READY')
  expect(await db.scale.findUnique({where:{libraryEntryId:id}})).toBeNull()
  const [count]=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT count(*)::int AS count FROM scale_library_use_grants WHERE entry_id=${id}`)
  expect(count.count).toBe(0)
 },120000)

})
