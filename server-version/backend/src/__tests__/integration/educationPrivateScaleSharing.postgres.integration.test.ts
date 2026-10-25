import {grantLibraryUseFixture} from '../fixtures/library-distribution'
import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import * as sharing from '../../modules/education-tools/private-tool.sharing.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {preparePrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {transitionContentRelease} from '../../modules/measurement-content/repository'
import {review,readSubmission} from '../../modules/scale-library-governance/service'
import {grantUse} from '../../modules/scale-library-governance/distribution'
import {readLibraryScaleMeasurementSource} from '../../modules/scale-library-governance/training-source'
import {softDeleteStoredAsset} from '../../services/assetStorage'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string
const metadata={title:'Synthetic education share',author:'Synthetic author',copyright:'Self authored; authorize bound scale use',applicability:'Synthetic only',scoringDescription:'Mean',reportDescription:'Descriptive only'}
const draftDefinition={schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]}
async function fixture(entry:'SCHOOL'|'TEACHER'='SCHOOL',withImage=false,mimeType:'image/png'|'video/mp4'|'application/pdf'='image/png'){
 const user=await db.user.create({data:{username:'share_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const organizationId=randomUUID()
 await db.organization.create({data:{id:organizationId,name:'Synthetic sharing school',productDomain:'SCHOOL',createdByUserId:admin}})
 for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId,product,grantedByUserId:admin}})
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:admin}})
 const capability=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:admin}})
 const c:PrivateToolContext={principal:{userId:user.id,accountDomain:'SCHOOL'},entry,organizationId}
 const draft=await tools.createPrivateTool(c,{kind:'SCALE',title:metadata.title})
 let assetId:string|undefined
 if(withImage){
  const asset=await db.storedAsset.create({data:{objectKey:'assets/synthetic-education-share-'+randomUUID(),provider:'local',mimeType,sizeBytes:42,sha256:'a'.repeat(64),ownerId:user.id,accessScope:'PRIVATE',scopeId:`education-private:${entry}:${organizationId}:${draft.id}`}})
  assetId=asset.id
  await db.assetReference.create({data:{assetId,entityType:'EducationPrivateToolMediaLibrary',entityId:draft.id,field:'image-library'}})
 }
 const definition=compileResearchScale(metadata.title,{...draftDefinition,...(assetId?{rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'range',min:1,max:2,includeMax:true,text:'Synthetic',images:[{asset:{assetId,contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'Synthetic image',order:0}]}]}]}}:{})})
 if(assetId&&mimeType!=='image/png'){const range=definition.report.rawScoreFeedback!.rules[0].ranges[0];delete range.images;range.materials=[{asset:{assetId,contentHash:'a'.repeat(64),mimeType},name:'Synthetic shared material',rightsStatus:'self_authored',rightsNote:'Synthetic authorized sharing fixture'}]}
 const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:draft.revision,title:draft.title,definition})
 const version=await tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 return {c,user,capability,draft,version,assetId}
}
const prepare=(f:Awaited<ReturnType<typeof fixture>>)=>sharing.preparePrivateScaleSharing(f.c,f.draft.id,f.version.id,{contentHash:f.version.contentHash})
const apply=(f:Awaited<ReturnType<typeof fixture>>,p:Awaited<ReturnType<typeof prepare>>,extra:Record<string,unknown>={})=>sharing.submitPrivateScaleSharing(f.c,f.draft.id,f.version.id,{contentHash:f.version.contentHash,releaseId:p.releaseId,requestId:randomUUID(),metadata,...extra})
suite('Education private SCALE sharing / isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'share_admin_'+randomUUID(),passwordHash:'synthetic',accountDomain:'LEGACY',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})).id
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('shares an unadministered fixed version through the existing administrator workflow in both origins',async()=>{
  for(const entry of ['SCHOOL','TEACHER'] as const){
   const f=await fixture(entry),p=await prepare(f)
   expect(p).toMatchObject({sourceId:f.draft.id,versionId:f.version.id,product:entry,canShare:false,canPublish:false})
   expect(await db.scale.findUnique({where:{code:'education-private-scale:'+f.version.id}})).toBeNull()
   const submitted=await apply(f,p)
   expect(submitted).toMatchObject({product:entry,status:'SUBMITTED',sourceId:f.draft.id,versionId:f.version.id})
   await expect(review(f.user.id,submitted.id,{expectedVersion:1,decision:'APPROVE',reason:'Self approval'})).rejects.toThrow()
   const approved=await review(admin,submitted.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic platform review'})
   expect(approved.status).toBe('APPROVED');expect(approved.entryId).toBeTruthy()
   await expect(sharing.withdrawPrivateScaleSharing(f.c,f.draft.id,submitted.id,{expectedVersion:2,reason:'Cannot withdraw approved'})).rejects.toThrow()
   const before=(await readSubmission(admin,submitted.id)).snapshot
   await tools.updatePrivateTool(f.c,f.draft.id,{expectedRevision:f.version.sourceRevision,title:'Changed private draft',definition:compileResearchScale('Changed private draft',draftDefinition)})
   expect((await readSubmission(admin,submitted.id)).snapshot).toEqual(before)
   await expect(db.$executeRaw(Prisma.sql`UPDATE scale_library_submissions SET product='TRAINING' WHERE id=${submitted.id}`)).rejects.toThrow()
  }
 },120000)
 it('preserves user-before-org writer ordering, reuses runtime identity and never revives retired releases',async()=>{
  // Real account-writer barrier: application must wait on user BEFORE taking
  // org. NOWAIT proves the writer can still take org, then revoke and finish.
  for(const operation of ['PREPARE','SUBMIT'] as const){
   const a=await fixture(),prepared=operation==='SUBMIT'?await prepare(a):null
   let pending:Promise<{value?:unknown;error?:unknown}>|undefined
   let settled:{value?:unknown;error?:unknown}|undefined
   try{await db.$transaction(async tx=>{
    const [holder]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
    await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${a.user.id} FOR UPDATE`)
    pending=(prepared?apply(a,prepared):prepare(a)).then(value=>({value}),error=>({error}))
    let blocked=false
    const deadline=Date.now()+3000
    while(Date.now()<deadline&&!blocked){
     const [row]=await db.$queryRaw<Array<{blocked:boolean}>>(Prisma.sql`SELECT EXISTS(
      SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'
       AND lower(query) LIKE '%from users%' AND ${holder.pid}=ANY(pg_blocking_pids(pid))) AS blocked`)
     blocked=row.blocked
     if(!blocked)await new Promise(resolve=>setTimeout(resolve,10))
    }
    expect(blocked).toBe(true)
    await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${a.c.organizationId} FOR UPDATE NOWAIT`)
    await tx.$executeRaw(Prisma.sql`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${a.capability.id}`)
   },{timeout:10000})}finally{settled=await pending}
   expect(settled?.error).toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
   expect(await db.scaleLibrarySubmission.count({where:{sourceId:a.draft.id}})).toBe(0)
  }
  const f=await fixture()
  const [p,runtime]=await Promise.all([prepare(f),db.$transaction(tx=>preparePrivateScaleRuntimeResource(tx,f.c,{versionId:f.version.id,contentHash:f.version.contentHash,administration:{population:'STUDENT',responseMode:'SELF'}}),{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})])
  expect(runtime.origin.releaseId).toBe(p.releaseId)
  expect((await prepare(f)).releaseId).toBe(p.releaseId)
  await db.$transaction(tx=>transitionContentRelease(tx,{releaseId:p.releaseId,expectedStatus:'PUBLISHED',status:'RETIRED',actorId:f.user.id,reason:'Synthetic retirement'}))
  await expect(prepare(f)).rejects.toThrow('EDUCATION_LIBRARY_SOURCE_NOT_AVAILABLE')
  await expect(apply(f,p)).rejects.toThrow()
 },120000)
 it('enforces scoped author capability, rejects FORM, and permits only pending withdrawal',async()=>{
  const f=await fixture(),p=await prepare(f)
  for(const c of [{...f.c,entry:'TEACHER' as const},{...f.c,organizationId:randomUUID()},{...f.c,principal:{userId:admin,accountDomain:'LEGACY' as const}}])
   await expect(sharing.preparePrivateScaleSharing(c,f.draft.id,f.version.id,{contentHash:f.version.contentHash})).rejects.toThrow()
  const form=await tools.createPrivateTool(f.c,{kind:'FORM',title:'Never a public scale'})
  await expect(sharing.preparePrivateScaleSharing(f.c,form.id,f.version.id,{contentHash:f.version.contentHash})).rejects.toThrow('PRIVATE_TOOL_NOT_FOUND')
  const application=await apply(f,p)
  expect((await sharing.withdrawPrivateScaleSharing(f.c,f.draft.id,application.id,{expectedVersion:1,reason:'Synthetic withdrawal'})).status).toBe('WITHDRAWN')
  expect(await db.scaleLibraryEntry.findUnique({where:{submissionId:application.id}})).toBeNull()
  await db.organizationCapabilityGrant.update({where:{id:f.capability.id},data:{revokedAt:new Date(),revokedByUserId:admin}})
  await expect(prepare(f)).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
 },120000)
 it.each(['image/png','video/mp4','application/pdf'] as const)('%s pins consented report media and makes approved content independent of author membership',async mimeType=>{
  const f=await fixture('SCHOOL',true,mimeType),p=await prepare(f)
  expect(p.mediaManifest.items.map(item=>item.assetId)).toEqual([f.assetId])
  await expect(apply(f,p)).rejects.toThrow('CONSENT')
  await expect(apply(f,p,{mediaConsent:{manifestHash:'0'.repeat(64),shareWithAuthorizedUsers:true}})).rejects.toThrow('CONSENT')
  const requestId=randomUUID(),extra={requestId,mediaConsent:{manifestHash:p.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}}
  const application=await apply(f,p,extra)
  expect((await apply(f,p,extra)).id).toBe(application.id)
  expect(await db.assetReference.count({where:{entityType:'ScaleLibrarySubmission',entityId:application.id,assetId:f.assetId!}})).toBe(1)
  const approved=await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic media review'})
  expect(await db.assetReference.count({where:{entityType:'ScaleLibraryMedia',entityId:approved.entryId!,assetId:f.assetId!}})).toBe(1)
  expect((await db.storedAsset.findUniqueOrThrow({where:{id:f.assetId!}})).accessScope).toBe('PRIVATE')
  expect(await softDeleteStoredAsset({assetId:f.assetId!,authorize:async()=>true,db})).toBe('referenced')
  await db.organizationCapabilityGrant.update({where:{id:f.capability.id},data:{revokedAt:new Date(),revokedByUserId:admin}})
  const recipient=await db.user.create({data:{username:'share_reader_'+randomUUID(),passwordHash:'synthetic',accountDomain:'TRAINING',role:'TEACHER',teacherApproved:true}})
  await grantLibraryUseFixture(db,admin,approved.entryId!,{requestId:randomUUID(),product:'TRAINING',userId:recipient.id})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:approved.entryId!}})
  const source=await db.$transaction(tx=>readLibraryScaleMeasurementSource(tx,wrapper))
  expect(source.release.releaseId).toBe(p.releaseId)
  expect((await readSubmission(admin,application.id)).snapshot.product).toBe('SCHOOL')
 },120000)
})
