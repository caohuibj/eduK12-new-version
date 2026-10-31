import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {loadSealedEducationIdentity} from '../../modules/education-tools/private-tool.composition-runtime'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const form={schemaVersion:2,pages:[{pageKey:'p',title:'Original page',description:'Original instructions',questions:[
 {itemKey:'q',type:'SINGLE',prompt:'Choose',required:true,options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}],rows:[]},
 {itemKey:'comment',type:'SHORT_TEXT',prompt:'Explain',required:false,options:[],rows:[],displayIf:{itemKey:'q',operator:'EQUALS',optionKey:'a'}},
]}]}
const scale=()=>compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'q',prompt:'Synthetic scale question',required:true,reverse:false,dimensionKeys:['total']}]})
async function actor(entry:'TEACHER'|'SCHOOL'='TEACHER',organizationId?:string){
 const user=await db.user.create({data:{id:randomUUID(),username:'composition_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const org=organizationId??randomUUID()
 if(!organizationId){
  await db.organization.create({data:{id:org,name:'Synthetic composition school',productDomain:'SCHOOL',createdByUserId:user.id}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:user.id}})
 }
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 if(entry==='TEACHER')await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
 else{
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:user.id}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:user.id}})
 }
 const context:PrivateToolContext={entry,organizationId:org,principal:{userId:user.id,accountDomain:'SCHOOL'}}
 return {user,org,member,context}
}
async function frozen(c:PrivateToolContext,kind:'SCALE'|'FORM',definition:unknown){
 const draft=await tools.createPrivateTool(c,{kind,title:'Synthetic '+kind})
 const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
 return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
}
async function fixture(entry:'TEACHER'|'SCHOOL'='TEACHER'){
 const author=await actor(entry),c=author.context,sources=[await frozen(c,'SCALE',scale()),await frozen(c,'FORM',form)]
 const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},
  instruction:'中文 “说明”\nline 2 😀',blocks:sources.map((source,i)=>({blockId:randomUUID(),instruction:'Block '+i,source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))}
 const draft=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'One real ordinary questionnaire'})
 const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
 return {author,c,sources,definition,draft,saved,command:{expectedRevision:saved.revision,expectedContentHash:saved.contentHash}}
}
const readParent=(id:string)=>db.compositeAssessment.findUniqueOrThrow({where:{id},include:{items:{orderBy:{position:'asc'}},formSections:{orderBy:{position:'asc'}}}})

suite('Ordinary private composition / actual source-bound PostgreSQL sealing',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it.each(['TEACHER','SCHOOL'] as const)('%s saves/reopens/previews and atomically freezes one ordered Scale + Form parent, once',async entry=>{
  const x=await fixture(entry)
  expect((await tools.readPrivateTool(x.c,x.draft.id)).definition).toEqual(x.definition)
  expect((await tools.listPrivateTools(x.c)).list.map(row=>row.id)).not.toContain(x.draft.id)
  expect((await tools.listPrivateTools(x.c,undefined,'COMPOSITION')).list.map(row=>row.id)).toEqual([x.draft.id])
  expect(await tools.previewPrivateTool(x.c,x.draft.id,{})).toMatchObject({previewOnly:true,persistedAnswers:false,
   result:{kind:'COMPOSITION_PREVIEW',instruction:x.definition.instruction,blocks:[{kind:'SCALE'},{kind:'FORM'}]}})
  expect(await db.compositeAssessment.count({where:{createdBy:x.author.user.id}})).toBe(0)
  const [first,second]=await Promise.all([tools.freezePrivateTool(x.c,x.draft.id,x.command),tools.freezePrivateTool(x.c,x.draft.id,x.command)])
  expect(first.id).toBe(second.id);expect([first,second].filter(row=>row.created)).toHaveLength(1)
  if(!('runtime' in first)||!first.runtime)throw new Error('missing composition runtime')
  const runtime=first.runtime,parent=await readParent(runtime.compositeId)
  expect(parent).toMatchObject({status:'DRAFT',publishedAt:null,instruction:x.definition.instruction,publicEnabled:false,copyable:false})
  expect(parent.items.map(item=>item.type)).toEqual(['SCALE','FORM','FORM'])
  expect(parent.formSections).toHaveLength(1)
  expect(parent.items.slice(1).map(item=>item.formDefinition)).toEqual(form.pages[0].questions)
  expect(parent.trainingContentSnapshotHash).toBe(canonicalHash(parent.trainingContentSnapshot))
  const snapshot=parent.trainingContentSnapshot as unknown as {units:unknown[];educationBinding:{manifest:unknown[]}}
  expect(snapshot.units).toHaveLength(1);expect(snapshot.educationBinding.manifest).toHaveLength(2)
  expect(await db.compositeAssessment.count({where:{createdBy:x.author.user.id}})).toBe(1)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:parent.id}})).toBe(0)
  expect(await db.$queryRaw(Prisma.sql`SELECT id FROM registered_assessment_resources WHERE composite_id=${parent.id}`)).toEqual([])
  await expect(db.$transaction(tx=>loadSealedEducationIdentity(tx,runtime))).resolves.toMatchObject(runtime)
  await tools.updatePrivateTool(x.c,x.draft.id,{expectedRevision:2,title:'Next draft',definition:{...x.definition,instruction:'Changed'}})
  expect((await tools.freezePrivateTool(x.c,x.draft.id,x.command)).id).toBe(first.id)
  expect(await readParent(parent.id)).toEqual(parent)
 },30_000)
 it('rejects cross-owner/cross-school/cross-entry sources and stale CAS without creating a version or parent',async()=>{
  const x=await fixture(),other=await actor('TEACHER',x.author.org),foreign=await actor(),school=await actor('SCHOOL',x.author.org)
  for(const c of [other.context,foreign.context,school.context])await expect(tools.readPrivateTool(c,x.draft.id)).rejects.toThrow('NOT_FOUND')
  const foreignVersion=await frozen(foreign.context,'FORM',form)
  const changed=await tools.updatePrivateTool(x.c,x.draft.id,{expectedRevision:2,title:x.draft.title,definition:{...x.definition,
   blocks:[{...x.definition.blocks[1],source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:foreignVersion.id,contentHash:foreignVersion.contentHash}}]}})
  await expect(tools.freezePrivateTool(x.c,x.draft.id,{expectedRevision:changed.revision,expectedContentHash:changed.contentHash})).rejects.toThrow('SOURCE_NOT_FOUND')
  await expect(tools.freezePrivateTool(x.c,x.draft.id,x.command)).rejects.toThrow('REVISION_CONFLICT')
  expect(await db.educationPrivateToolVersion.count({where:{toolId:x.draft.id}})).toBe(0)
  expect(await db.compositeAssessment.count({where:{createdBy:x.author.user.id}})).toBe(0)
 })
 it('enforces current Teacher administration for edits/freeze and keeps a non-admin participant outside the author path',async()=>{
  const x=await fixture()
  await db.$executeRaw(Prisma.sql`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${x.author.user.id}
   WHERE membership_id=${x.author.member.id} AND product='HUITEACHER'`)
  await expect(tools.freezePrivateTool(x.c,x.draft.id,x.command)).rejects.toThrow('AUTHOR_REQUIRED')
  await expect(tools.updatePrivateTool(x.c,x.draft.id,{expectedRevision:2,title:x.draft.title,definition:x.definition})).rejects.toThrow('AUTHOR_REQUIRED')
  expect(await db.educationPrivateToolVersion.count({where:{toolId:x.draft.id}})).toBe(0)
 })
 it('protects sealed parent, Form children and Scale identity while permitting only explicit publication lifecycle',async()=>{
  const x=await fixture(),version=await tools.freezePrivateTool(x.c,x.draft.id,x.command)
  if(!('runtime' in version)||!version.runtime)throw new Error('missing runtime')
  const parent=await readParent(version.runtime.compositeId)
  await expect(db.compositeAssessment.update({where:{id:parent.id},data:{instruction:'Changed'}})).rejects.toThrow('COMPOSITION_IMMUTABLE')
  await expect(db.compositeAssessmentItem.update({where:{id:parent.items[1].id},data:{formLabel:'Changed'}})).rejects.toThrow('CHILD_IMMUTABLE')
  await expect(db.compositeFormSection.delete({where:{id:parent.formSections[0].id}})).rejects.toThrow('CHILD_IMMUTABLE')
  await expect(db.scale.update({where:{id:parent.items[0].scaleId!},data:{name:'Changed source'}})).rejects.toThrow('SCALE_IMMUTABLE')
  await expect(db.compositeAssessment.delete({where:{id:parent.id}})).rejects.toThrow('COMPOSITION_IMMUTABLE')
  await db.compositeAssessment.update({where:{id:parent.id},data:{status:'PUBLISHED',publishedAt:new Date()}})
  await expect(db.compositeAssessment.update({where:{id:parent.id},data:{status:'DRAFT',publishedAt:null}})).rejects.toThrow('COMPOSITION_IMMUTABLE')
  expect((await readParent(parent.id)).items).toEqual(parent.items)
 })
 it('rejects a caller-created receipt even when its origin and all hashes are self-consistent',async()=>{
  const x=await fixture(),source=await tools.freezePrivateTool(x.c,x.draft.id,x.command)
  if(!('runtime' in source)||!source.runtime)throw new Error('missing runtime')
  const parent=await readParent(source.runtime.compositeId)
  const saved=await tools.updatePrivateTool(x.c,x.draft.id,{expectedRevision:2,title:x.draft.title,definition:x.definition})
  const fixed=await db.educationPrivateToolVersion.create({data:{id:randomUUID(),toolId:x.draft.id,entry:x.c.entry,organizationId:x.c.organizationId,
   ownerUserId:x.c.principal.userId,kind:'COMPOSITION',sourceRevision:3,title:x.draft.title,definition:x.definition,contentHash:saved.contentHash}})
  const forged=await db.compositeAssessment.create({data:{code:'internal-education-composition-'+randomUUID(),name:fixed.title,instruction:x.definition.instruction,
   createdBy:fixed.ownerUserId,productKind:'ORGANIZATION_RESOURCE'}})
  const snapshot=structuredClone(parent.trainingContentSnapshot) as unknown as {compositeId:string;educationBinding:{origin:Record<string,unknown>}}
  snapshot.compositeId=forged.id;snapshot.educationBinding.origin.versionId=fixed.id;snapshot.educationBinding.origin.contentHash=fixed.contentHash
  const key=`education-composition:TEACHER:${fixed.id}:TEACHER:SELF:1.0.0`
  for(const invalid of [{...snapshot,schemaVersion:'1'},{...snapshot,educationBinding:{...snapshot.educationBinding,schemaVersion:'1'}}])
   await expect(db.compositeAssessment.update({where:{id:forged.id},data:{code:key,creationKey:key,creationHash:canonicalHash(snapshot.educationBinding.origin),
    trainingContentSnapshot:invalid as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:canonicalHash(invalid)}})).rejects.toThrow('BINDING_INVALID')
  await expect(db.compositeAssessment.update({where:{id:forged.id},data:{code:key,creationKey:key,creationHash:canonicalHash(snapshot.educationBinding.origin),
   trainingContentSnapshot:snapshot as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:canonicalHash(snapshot)}})).rejects.toThrow('SCALE_ITEM_INVALID')
  expect((await db.compositeAssessment.findUniqueOrThrow({where:{id:forged.id}})).creationKey).toBeNull()
  expect(privateToolContentHash('COMPOSITION',fixed.title,x.definition)).toBe(fixed.contentHash)
 })
 it('serializes child insertion with sealing and validates the complete post-wait structure',async()=>{
  const x=await fixture(),version=await tools.freezePrivateTool(x.c,x.draft.id,x.command)
  if(!('runtime' in version)||!version.runtime)throw new Error('missing runtime')
  const original=await readParent(version.runtime.compositeId)
  const saved=await tools.updatePrivateTool(x.c,x.draft.id,{expectedRevision:2,title:x.draft.title,definition:x.definition})
  const fixed=await db.educationPrivateToolVersion.create({data:{id:randomUUID(),toolId:x.draft.id,entry:x.c.entry,organizationId:x.c.organizationId,
   ownerUserId:x.c.principal.userId,kind:'COMPOSITION',sourceRevision:3,title:x.draft.title,definition:x.definition,contentHash:saved.contentHash}})
  const parent=await db.compositeAssessment.create({data:{code:'internal-education-composition-'+randomUUID(),name:fixed.title,
   instruction:x.definition.instruction,createdBy:fixed.ownerUserId,productKind:'ORGANIZATION_RESOURCE'}})
  const ids=new Map([...original.items,...original.formSections].map(row=>[row.id,randomUUID()]))
  await db.compositeFormSection.createMany({data:original.formSections.map(({id,compositeAssessmentId:_parent,...row})=>
   ({...row,id:ids.get(id)!,compositeAssessmentId:parent.id}))})
  await db.compositeAssessmentItem.createMany({data:original.items.map(({id,compositeAssessmentId:_parent,formSectionId,...row})=>{
   const data:Record<string,unknown>={...row,id:ids.get(id)!,compositeAssessmentId:parent.id,formSectionId:formSectionId?ids.get(formSectionId)!:null}
   for(const field of ['standardCombinationSource','formDefinition','formPolicy','formOptions'])if(data[field]===null)delete data[field]
   return data
  }) as Prisma.CompositeAssessmentItemCreateManyInput[]})
  const snapshot=JSON.parse(JSON.stringify(original.trainingContentSnapshot),(_key,value)=>typeof value==='string'?ids.get(value)??value:value)
  snapshot.compositeId=parent.id;snapshot.educationBinding.origin.versionId=fixed.id;snapshot.educationBinding.origin.contentHash=fixed.contentHash
  const key=`education-composition:TEACHER:${fixed.id}:TEACHER:SELF:1.0.0`
  let pending:Promise<unknown>|undefined
  await db.$transaction(async tx=>{
   const [holder]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
   await tx.compositeAssessmentItem.create({data:{compositeAssessmentId:parent.id,type:'FORM',position:3,required:false,formType:'SHORT_TEXT',formLabel:'Racing extra item'}})
   pending=db.compositeAssessment.update({where:{id:parent.id},data:{code:key,creationKey:key,creationHash:canonicalHash(snapshot.educationBinding.origin),
    trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}}).then(value=>value,error=>error)
   let blocked=false
   for(let attempt=0;attempt<100&&!blocked;attempt++){
    const [row]=await db.$queryRaw<Array<{blocked:boolean}>>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
     WHERE ${holder.pid}=ANY(pg_blocking_pids(pid))) AS blocked`)
    blocked=row.blocked
    if(!blocked)await new Promise(resolve=>setTimeout(resolve,20))
   }
   expect(blocked).toBe(true)
  },{timeout:10000})
  expect(String(await pending)).toContain('CHILDREN_INVALID')
  expect((await db.compositeAssessment.findUniqueOrThrow({where:{id:parent.id}})).creationKey).toBeNull()
  expect(await db.compositeAssessmentItem.count({where:{compositeAssessmentId:parent.id}})).toBe(4)
 },20_000)
 it('loads a sealed header with one SELECT and no source, item or snapshot-body reads',async()=>{
  const x=await fixture(),version=await tools.freezePrivateTool(x.c,x.draft.id,x.command)
  if(!('runtime' in version)||!version.runtime)throw new Error('missing runtime')
  const measured=new PrismaClient({datasources:{db:{url:url!}},log:[{level:'query',emit:'event'}]}),queries:string[]=[]
  measured.$on('query',event=>queries.push(event.query))
  try{
   await measured.$connect()
   const started=performance.now(),cpu=process.cpuUsage(),memoryBefore=process.memoryUsage().rss
   const value=await measured.$transaction(tx=>loadSealedEducationIdentity(tx,version.runtime!))
   const elapsedMs=performance.now()-started,usedCpu=process.cpuUsage(cpu),memoryAfter=process.memoryUsage().rss
   const reads=queries.filter(query=>/^SELECT/i.test(query.trim()))
   expect(reads).toHaveLength(1)
   expect(reads[0]).not.toMatch(/education_private_tool_versions|composite_assessment_items|composite_form_sections|"training_content_snapshot"/)
   expect(value).toEqual(version.runtime)
   console.log(JSON.stringify({evidence:'single sealed-header read, not an end-to-end performance qualification',
    sqlStatements:queries.length,selects:reads.length,responseBytes:Buffer.byteLength(JSON.stringify(value)),elapsedMs,
    nodeCpuMicros:usedCpu.user+usedCpu.system,rssBefore:memoryBefore,rssAfter:memoryAfter}))
  }finally{await measured.$disconnect()}
 })
})
