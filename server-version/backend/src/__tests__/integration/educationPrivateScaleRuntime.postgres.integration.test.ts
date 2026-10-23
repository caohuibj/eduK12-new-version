import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {preparePrivateScaleRuntimeResource,readPrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {prepareTrainingContentAttemptBinding} from '../../modules/composite/training-content-binding'
import {transitionContentRelease} from '../../modules/measurement-content/repository'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const definition=()=>compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]})
async function actor(organizationId?:string){
 const user=await db.user.create({data:{id:randomUUID(),username:'private_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const org=organizationId??randomUUID()
 if(!organizationId){
  await db.organization.create({data:{id:org,name:'Synthetic private tool school',productDomain:'SCHOOL',createdByUserId:user.id}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:user.id}})
 }
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:user.id}})
 const capability=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:user.id}})
 const context:PrivateToolContext={principal:{userId:user.id,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org}
 return {user,org,member,capability,context}
}

const transaction=<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>)=>db.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
async function frozen(c:PrivateToolContext){
 const draft=await tools.createPrivateTool(c,{kind:'SCALE',title:'Synthetic private runtime'})
 const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:draft.revision,title:draft.title,definition:definition()})
 return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
}
suite('Private Scale internal preparation, not activity publication',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('pins both entry sources and explicit variants, prepares idempotently without public grant or author approval',async()=>{
  const a=await actor()
  for(const entry of ['SCHOOL','TEACHER'] as const){
   const c={...a.context,entry},v=await frozen(c)
   const input={versionId:v.id,contentHash:v.contentHash,administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'}}
   const prepared=await transaction(tx=>preparePrivateScaleRuntimeResource(tx,c,input))
   expect(prepared.canPublish).toBe(false)
   expect(prepared.origin).toMatchObject({kind:'AUTHOR_PRIVATE',entry,ownerUserId:a.user.id,versionId:v.id,contentHash:v.contentHash})
   expect(prepared.resourceEntry).not.toHaveProperty('libraryOrigin')
   expect((await transaction(tx=>preparePrivateScaleRuntimeResource(tx,c,input))).compositeId).toBe(prepared.compositeId)
   const other=await actor(a.org)
   // The BEFORE INSERT source guard must reject a forged origin itself, not
   // merely rely on the existing row's later unique-identity constraint.
   const forgedEntry={...prepared.resourceEntry,privateOrigin:{...prepared.origin,ownerUserId:other.user.id}}
   await expect(db.$executeRaw(Prisma.sql`INSERT INTO registered_assessment_resources
    (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,status,created_by_user_id,published_by_user_id,published_at)
    VALUES(${randomUUID()},${prepared.resourceEntry.applicability.resourceKey},'1.0.0',${prepared.scaleId},${prepared.origin.definitionHash},
     ${prepared.compositeId},${JSON.stringify(forgedEntry)}::jsonb,${canonicalHash(forgedEntry)},'PUBLISHED',${a.user.id},${a.user.id},clock_timestamp())`))
    .rejects.toThrow('PRIVATE_SCALE_REGISTERED_SOURCE_MISMATCH')
   for(const context of [other.context,{...c,entry:entry==='SCHOOL'?'TEACHER' as const:'SCHOOL' as const},{...c,organizationId:randomUUID()}]){
    await expect(transaction(tx=>preparePrivateScaleRuntimeResource(tx,context,input))).rejects.toThrow()
   }
   await expect(transaction(tx=>preparePrivateScaleRuntimeResource(tx,c,{...input,contentHash:'0'.repeat(64)}))).rejects.toThrow('PRIVATE_TOOL_VERSION_NOT_FOUND')
   const key=prepared.resourceEntry.applicability.resourceKey
   expect((await transaction(tx=>readPrivateScaleRuntimeResource(tx,{key,version:'1.0.0',purpose:'HISTORY'}))).identityOnly).toBe(true)
   const composite=await db.compositeAssessment.findUniqueOrThrow({where:{id:prepared.compositeId},include:{items:{include:{scale:true}}}})
   const binding=()=>transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:composite.id,attemptId:randomUUID(),epoch:1,
    snapshot:composite.trainingContentSnapshot,snapshotHash:composite.trainingContentSnapshotHash,composite,resolvedSituational:new Map()}))
   expect(await binding()).not.toBeNull()
   await expect(db.scale.update({where:{id:prepared.scaleId},data:{name:'Rewrite'}})).rejects.toThrow('PRIVATE_SCALE_WRAPPER_IMMUTABLE')
   await expect(db.compositeAssessment.update({where:{id:prepared.compositeId},data:{publicEnabled:true}})).rejects.toThrow('PRIVATE_SCALE_COMPOSITE_IMMUTABLE')
   await db.compositeAssessment.update({where:{id:prepared.compositeId},data:{revision:{increment:1}}})
   await expect(db.$executeRaw`UPDATE registered_assessment_resources SET entry_hash=${'0'.repeat(64)} WHERE composite_id=${prepared.compositeId}`).rejects.toThrow('PRIVATE_SCALE_REGISTERED_IDENTITY_IMMUTABLE')
   const fakeId=randomUUID(),snapshot={...(composite.trainingContentSnapshot as object),compositeId:fakeId}
   await expect(transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:fakeId,attemptId:randomUUID(),epoch:1,snapshot,
    snapshotHash:canonicalHash(snapshot),composite:{...composite,id:fakeId},resolvedSituational:new Map()}))).rejects.toThrow('PRIVATE_TOOL_RUNTIME_REGISTRATION_REQUIRED')
  }
 })
 it('current author capability gates new use but does not retrospectively gate existing identity',async()=>{
  const a=await actor(),v=await frozen(a.context)
  const input={versionId:v.id,contentHash:v.contentHash,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}}
  const prepared=await transaction(tx=>preparePrivateScaleRuntimeResource(tx,a.context,input))
  expect(prepared.resourceEntry.allowedTargetModes).toEqual(['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'])
  await db.organizationCapabilityGrant.update({where:{id:a.capability.id},data:{revokedAt:new Date(),revokedByUserId:a.user.id}})
  await expect(transaction(tx=>preparePrivateScaleRuntimeResource(tx,a.context,input))).rejects.toThrow()
  const key=prepared.resourceEntry.applicability.resourceKey
  await expect(transaction(tx=>readPrivateScaleRuntimeResource(tx,{key,version:'1.0.0',purpose:'NEW_USE',context:a.context}))).rejects.toThrow()
  for(const purpose of ['HISTORY','EXISTING_EXECUTION'] as const)expect((await transaction(tx=>readPrivateScaleRuntimeResource(tx,{key,version:'1.0.0',purpose}))).identityOnly).toBe(true)
 })
 it('rejects incompatible pair and rolls back all derived resources on failed caller transaction',async()=>{
  const a=await actor(),v=await frozen(a.context)
  const input={versionId:v.id,contentHash:v.contentHash,administration:{population:'STUDENT',responseMode:'SELF'}}
  await expect(transaction(tx=>preparePrivateScaleRuntimeResource(tx,a.context,{...input,administration:{population:'TEACHER',responseMode:'SELF'}}))).rejects.toThrow('PRIVATE_TOOL_RUNTIME_VARIANT_UNSUPPORTED')
  await expect(transaction(async tx=>{await preparePrivateScaleRuntimeResource(tx,a.context,input);throw new Error('synthetic rollback')})).rejects.toThrow('synthetic rollback')
  expect(await db.scale.findUnique({where:{code:'education-private-scale:'+v.id}})).toBeNull()
  expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE resource_key LIKE ${'%:'+v.id+':%'}`).toEqual([])
  const prepared=await transaction(tx=>preparePrivateScaleRuntimeResource(tx,a.context,input))
  await transaction(tx=>transitionContentRelease(tx,{releaseId:prepared.origin.releaseId,expectedStatus:'PUBLISHED',status:'RETIRED',actorId:a.user.id,reason:'Synthetic test'}))
  await expect(transaction(tx=>preparePrivateScaleRuntimeResource(tx,a.context,input))).rejects.toThrow('PRIVATE_TOOL_RUNTIME_RELEASE_NOT_SELECTABLE')
  const key=prepared.resourceEntry.applicability.resourceKey
  await expect(transaction(tx=>readPrivateScaleRuntimeResource(tx,{key,version:'1.0.0',purpose:'NEW_USE',context:a.context}))).rejects.toThrow('PRIVATE_TOOL_RUNTIME_RELEASE_NOT_SELECTABLE')
  expect((await transaction(tx=>readPrivateScaleRuntimeResource(tx,{key,version:'1.0.0',purpose:'HISTORY'}))).origin.releaseId).toBe(prepared.origin.releaseId)
 })
})
