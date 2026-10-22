import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createHuiteacherForm} from '../../modules/huiteacher/forms.service'
import {softDeleteStoredAsset} from '../../services/assetStorage'
import * as media from '../../modules/education-tools/private-tool.media'
import * as tools from '../../modules/education-tools/private-tool.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const form={schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[{itemKey:'q',type:'LIKERT',prompt:'Synthetic question',required:true,options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}],rows:[]}]}]}
const scale=()=>compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]})
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
suite('Education author-private tool API services / isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('isolates author, entry and school; never expands organization-owned Teacher Form authority',async()=>{
  const a=await actor(),other=await actor(a.org),foreign=await actor()
  const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Private'})
  expect((await tools.listPrivateTools(a.context)).list.map(x=>x.id)).toContain(draft.id)
  for(const context of [other.context,foreign.context,{...a.context,entry:'TEACHER' as const}]){
   expect((await tools.listPrivateTools(context)).list.map(x=>x.id)).not.toContain(draft.id)
   await expect(tools.readPrivateTool(context,draft.id)).rejects.toThrow('NOT_FOUND')
   await expect(tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:'Hijack',definition:form})).rejects.toThrow('NOT_FOUND')
  }
  await expect(createHuiteacherForm({organizationId:a.org,actorUserId:a.user.id,title:'Not product admin'})).rejects.toThrow('MANAGER_REQUIRED')
  const teacher=await tools.createPrivateTool({...a.context,entry:'TEACHER'},{kind:'SCALE',title:'Teacher private'})
  expect(teacher).toMatchObject({entry:'TEACHER',visibility:'AUTHOR_PRIVATE',canPublish:false,canShare:false})
  expect((await tools.validatePrivateTool({...a.context,entry:'TEACHER'},teacher.id)).valid).toBe(false)
 })
 it('uses revision CAS, immutable exact snapshots and concurrent freeze idempotence',async()=>{
  const a=await actor();const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Original'})
  const saved=await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Version one',definition:form})
  await expect(tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Stale',definition:form})).rejects.toThrow('REVISION_CONFLICT')
  const command={expectedRevision:saved.revision,expectedContentHash:saved.contentHash}
  const frozen=await Promise.all([tools.freezePrivateTool(a.context,draft.id,command),tools.freezePrivateTool(a.context,draft.id,command)])
  expect(frozen[0].id).toBe(frozen[1].id)
  expect(frozen.filter(x=>x.created)).toHaveLength(1)
  await expect(db.$executeRaw(Prisma.sql`UPDATE education_private_tool_versions SET title='changed' WHERE id=${frozen[0].id}`)).rejects.toThrow()
  await expect(db.$executeRaw(Prisma.sql`DELETE FROM education_private_tool_versions WHERE id=${frozen[0].id}`)).rejects.toThrow('history is retained')
  const other=await actor(a.org)
  await expect(db.$executeRaw(Prisma.sql`UPDATE education_private_tools SET owner_user_id=${other.user.id},revision=revision+1 WHERE id=${draft.id}`)).rejects.toThrow('ownership is immutable')
  await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:2,title:'Version two',definition:form})
  expect((await tools.readPrivateToolVersion(a.context,draft.id,frozen[0].id)).title).toBe('Version one')
  expect((await tools.freezePrivateTool(a.context,draft.id,command)).id).toBe(frozen[0].id)
  await expect(tools.freezePrivateTool(a.context,draft.id,{...command,expectedContentHash:'0'.repeat(64)})).rejects.toThrow('FREEZE_CONFLICT')
  await expect(db.$executeRaw(Prisma.sql`INSERT INTO education_private_tool_versions(id,tool_id,entry,organization_id,owner_user_id,kind,source_revision,title,definition,content_hash)
   VALUES(${randomUUID()},${draft.id},'SCHOOL',${a.org},${a.user.id},'FORM',99,'fake','{}'::jsonb,${'0'.repeat(64)})`)).rejects.toThrow()
 })
 it('serializes update versus freeze without freezing mixed revisions',async()=>{
  const a=await actor();const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Race'})
  const saved=await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Before',definition:form})
  const outcomes=await Promise.allSettled([
   tools.updatePrivateTool(a.context,draft.id,{expectedRevision:2,title:'After',definition:form}),
   tools.freezePrivateTool(a.context,draft.id,{expectedRevision:2,expectedContentHash:saved.contentHash}),
  ])
  expect(outcomes[0].status).toBe('fulfilled')
  const frozen=outcomes[1]
  if(frozen.status==='fulfilled')expect(frozen.value).toMatchObject({title:'Before',sourceRevision:2,contentHash:saved.contentHash})
  else expect(String(frozen.reason)).toMatch(/REVISION_CONFLICT|CONCURRENT_CHANGE/)
  expect((await tools.readPrivateTool(a.context,draft.id)).title).toBe('After')
 })
 it('waits for the governance org lock and rejects a revoke committed before authority reads',async()=>{
  const a=await actor();const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Revoke race'})
  let pending:Promise<unknown>|undefined
  await db.$transaction(async tx=>{
   const [holder]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
   await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${a.org} FOR UPDATE`)
   pending=tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Must not write',definition:form}).then(value=>value,error=>error)
   let blocked=false
   for(let i=0;i<100&&!blocked;i++){
    const [row]=await db.$queryRaw<Array<{blocked:boolean}>>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${holder.pid}=ANY(pg_blocking_pids(pid))) AS blocked`)
    blocked=row.blocked
    if(!blocked)await new Promise(resolve=>setTimeout(resolve,20))
   }
   expect(blocked).toBe(true)
   await tx.$executeRaw(Prisma.sql`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${a.capability.id}`)
  },{timeout:10000})
  expect(await pending).toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
  expect((await db.educationPrivateTool.findUniqueOrThrow({where:{id:draft.id}})).revision).toBe(1)
 })
 it('previews native Scale and unscored Form without publishing or storing participant answers',async()=>{
  const a=await actor()
  for(const kind of ['SCALE','FORM'] as const){
   const draft=await tools.createPrivateTool(a.context,{kind,title:kind})
   const definition=kind==='SCALE'?scale():form
   await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:kind,definition})
   expect((await tools.validatePrivateTool(a.context,draft.id)).valid).toBe(true)
   const result=await tools.previewPrivateTool(a.context,draft.id,{answers:kind==='SCALE'?[{itemCode:'q',responseValue:'a'}]:{q:'a'}})
   expect(result).toMatchObject({previewOnly:true,persistedAnswers:false,canPublish:false,canShare:false})
   if(kind==='FORM')expect(result.result).toMatchObject({rawAnswers:{q:'a'}})
   const current=await tools.readPrivateTool(a.context,draft.id)
   expect(current.revision).toBe(2)
   expect((await tools.listPrivateToolVersions(a.context,draft.id)).list).toHaveLength(0)
   const frozen=await tools.freezePrivateTool(a.context,draft.id,{expectedRevision:2,expectedContentHash:current.contentHash})
   expect(frozen.state).toBe('PRIVATE_SNAPSHOT')
  }
 })
 it('rechecks revoked capability for all operations and has no administrator owner bypass',async()=>{
  const a=await actor();const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Private'})
  await db.$executeRaw(Prisma.sql`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${a.capability.id}`)
  const calls=[()=>tools.createPrivateTool(a.context,{kind:'FORM',title:'No'}),()=>tools.listPrivateTools(a.context),()=>tools.readPrivateTool(a.context,draft.id),
   ()=>tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'No',definition:form}),()=>tools.validatePrivateTool(a.context,draft.id),
   ()=>tools.previewPrivateTool(a.context,draft.id,{answers:{q:'a'}}),()=>tools.freezePrivateTool(a.context,draft.id,{expectedRevision:1,expectedContentHash:draft.contentHash}),
   ()=>tools.listPrivateToolVersions(a.context,draft.id),()=>tools.readPrivateToolVersion(a.context,draft.id,randomUUID())]
  for(const call of calls)await expect(call()).rejects.toThrow('AUTHOR_REQUIRED')
  const admin=await actor(a.org)
  await db.user.update({where:{id:admin.user.id},data:{role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  await expect(tools.readPrivateTool(admin.context,draft.id)).rejects.toThrow('NOT_FOUND')
 })
 it('requires exact registered image scope across author, entry, school and tool',async()=>{
  const a=await actor(),other=await actor(a.org),foreign=await actor()
  const draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Images'})
  const sibling=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Other tool'})
  const id=randomUUID(),reference={assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png' as const}
  await db.storedAsset.create({data:{id,objectKey:'synthetic/'+id,provider:'local',mimeType:reference.mimeType,sizeBytes:16,sha256:reference.contentHash,
   ownerId:a.user.id,accessScope:'PRIVATE',scopeId:media.privateToolMediaScope(a.context,draft.id)}})
  expect((await media.listPrivateToolImages(a.context,draft.id)).assets).toHaveLength(0)
  await expect(media.readPrivateToolImage(a.context,draft.id,id)).rejects.toThrow('NOT_FOUND')
  const definition=structuredClone(form) as typeof form & {pages:Array<{questions:Array<{image?:unknown}>}>}
  Object.assign(definition.pages[0].questions[0],{image:{asset:reference,altText:'Synthetic',rightsStatus:'self_authored',rightsNote:'Synthetic test fixture'}})
  await expect(tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Images',definition})).rejects.toThrow('SCOPE_OR_IDENTITY')
  await media.registerPrivateToolImage(a.context,draft.id,reference)
  expect((await media.listPrivateToolImages(a.context,draft.id)).assets.map(x=>x.assetId)).toContain(id)
  expect(await media.readPrivateToolImage(a.context,draft.id,id)).toEqual(reference)
  for(const context of [other.context,foreign.context,{...a.context,entry:'TEACHER' as const}]){
   await expect(media.listPrivateToolImages(context,draft.id)).rejects.toThrow('NOT_FOUND')
   await expect(media.readPrivateToolImage(context,draft.id,id)).rejects.toThrow('NOT_FOUND')
   await expect(media.registerPrivateToolImage(context,draft.id,reference)).rejects.toThrow('NOT_FOUND')
  }
  await expect(media.registerPrivateToolImage(a.context,sibling.id,reference)).rejects.toThrow('SCOPE_OR_IDENTITY')
  await expect(tools.updatePrivateTool(a.context,sibling.id,{expectedRevision:1,title:'Other',definition})).rejects.toThrow('SCOPE_OR_IDENTITY')
  await expect(media.registerPrivateToolImage(a.context,draft.id,{...reference,contentHash:'b'.repeat(64)})).rejects.toThrow('SCOPE_OR_IDENTITY')
 })
 it('pins report and stimulus images separately and retains frozen images after draft removal',async()=>{
  const a=await actor(),draft=await tools.createPrivateTool(a.context,{kind:'SCALE',title:'Images'})
  const images=[]
  for(let i=0;i<2;i++){
   const id=randomUUID(),ref={assetId:id,contentHash:String(i).repeat(64),mimeType:'image/png' as const}
   await db.storedAsset.create({data:{id,objectKey:'synthetic/'+id,provider:'local',mimeType:ref.mimeType,sizeBytes:16,sha256:ref.contentHash,
    ownerId:a.user.id,accessScope:'PRIVATE',scopeId:media.privateToolMediaScope(a.context,draft.id)}})
   await media.registerPrivateToolImage(a.context,draft.id,ref)
   images.push({asset:ref,altText:'Synthetic',order:0})
  }
  const definition=scale()
  definition.items[0].images=[images[0]]
  definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:definition.report.primaryScoreKeys[0],ranges:[{key:'all',min:0,max:3,includeMax:true,text:'Synthetic',images:[images[1]]}]}]}
  const saved=await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:1,title:'Images',definition})
  const version=await tools.freezePrivateTool(a.context,draft.id,{expectedRevision:2,expectedContentHash:saved.contentHash})
  const pins=await db.assetReference.findMany({where:{entityType:'EducationPrivateToolVersion',entityId:version.id}})
  expect(pins.map(p=>[p.field,p.assetId])).toEqual(expect.arrayContaining([['stimuli',images[0].asset.assetId],['reports',images[1].asset.assetId]]))
  expect(pins.filter(p=>p.field==='stimuli').map(p=>p.assetId)).not.toContain(images[1].asset.assetId)
  await tools.updatePrivateTool(a.context,draft.id,{expectedRevision:2,title:'No images',definition:scale()})
  expect(await db.assetReference.count({where:{entityType:'EducationPrivateToolDraft',entityId:draft.id}})).toBe(0)
  expect(await db.assetReference.count({where:{entityType:'EducationPrivateToolVersion',entityId:version.id}})).toBe(2)
  expect((await tools.readPrivateToolVersion(a.context,draft.id,version.id)).definition).toEqual(version.definition)
  expect(await softDeleteStoredAsset({assetId:images[1].asset.assetId,authorize:async()=>true,db})).toBe('referenced')
 })
 it('rejects invalid registered bytes/catalog identities and revoked finalization without deleting the private object',async()=>{
  const a=await actor(),draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Images'})
  for(const patch of [{sizeBytes:0},{sizeBytes:2*1024*1024+1},{mimeType:'image/gif'},{deletedAt:new Date()},{accessScope:'PUBLIC'},{ownerId:randomUUID()}]){
   const id=randomUUID(),ref={assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png' as const}
   await db.storedAsset.create({data:{id,objectKey:'synthetic/'+id,provider:'local',mimeType:ref.mimeType,sizeBytes:16,sha256:ref.contentHash,
    ownerId:a.user.id,accessScope:'PRIVATE',scopeId:media.privateToolMediaScope(a.context,draft.id),...patch}})
   await expect(media.registerPrivateToolImage(a.context,draft.id,ref)).rejects.toThrow('SCOPE_OR_IDENTITY')
   expect(await db.assetReference.count({where:{assetId:id}})).toBe(0)
  }
  const id=randomUUID(),ref={assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png' as const}
  await db.storedAsset.create({data:{id,objectKey:'synthetic/'+id,provider:'local',mimeType:ref.mimeType,sizeBytes:16,sha256:ref.contentHash,
   ownerId:a.user.id,accessScope:'PRIVATE',scopeId:media.privateToolMediaScope(a.context,draft.id)}})
  await db.$executeRaw(Prisma.sql`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${a.capability.id}`)
  await expect(media.registerPrivateToolImage(a.context,draft.id,ref)).rejects.toThrow('AUTHOR_REQUIRED')
  expect(await db.assetReference.count({where:{assetId:id}})).toBe(0)
  expect(await db.storedAsset.findUnique({where:{id}})).toMatchObject({deletedAt:null,accessScope:'PRIVATE'})
  await expect(media.listPrivateToolImages(a.context,draft.id)).rejects.toThrow('AUTHOR_REQUIRED')
  await expect(media.readPrivateToolImage(a.context,draft.id,id)).rejects.toThrow('AUTHOR_REQUIRED')
 })

 it('serializes image registration against soft deletion on the stable logical asset lock',async()=>{
  const a=await actor(),draft=await tools.createPrivateTool(a.context,{kind:'FORM',title:'Asset race'})
  const id=randomUUID(),ref={assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png' as const}
  await db.storedAsset.create({data:{id,objectKey:'synthetic/'+id,provider:'local',mimeType:ref.mimeType,sizeBytes:16,sha256:ref.contentHash,
   ownerId:a.user.id,accessScope:'PRIVATE',scopeId:media.privateToolMediaScope(a.context,draft.id)}})
  const [registration,deletion]=await Promise.allSettled([
   media.registerPrivateToolImage(a.context,draft.id,ref),
   softDeleteStoredAsset({assetId:id,authorize:async()=>true,db}),
  ])
  expect(deletion.status).toBe('fulfilled')
  if(registration.status==='fulfilled'){
   expect(deletion).toMatchObject({value:'referenced'})
   expect(await db.assetReference.count({where:{assetId:id}})).toBe(1)
  }else{
   expect(String(registration.reason)).toContain('SCOPE_OR_IDENTITY')
   expect(deletion).toMatchObject({value:'deleted'})
   expect(await db.assetReference.count({where:{assetId:id}})).toBe(0)
  }
 })

})
