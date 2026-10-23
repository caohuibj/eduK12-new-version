import {copyComposite} from '../../modules/composite/composite.service'
import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as tools from '../../modules/education-tools/private-tool.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {preparePrivateFormRuntimeResource,readPrivateFormRuntimeResource} from '../../modules/education-tools/private-tool.form-runtime-resources'
import type {FormDraft} from '../../modules/assessment-core/form/definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const form=():FormDraft=>({schemaVersion:2,pages:[{pageKey:'one',title:'First page',description:'First instructions',questions:[
 {itemKey:'first',type:'SINGLE',prompt:'Choose',required:true,allowRefusal:false,options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}],rows:[]},
 {itemKey:'second',type:'SHORT_TEXT',prompt:'Explain',required:true,allowRefusal:true,options:[],rows:[],displayIf:{itemKey:'first',operator:'EQUALS',optionKey:'a'}},
 ]},{pageKey:'two',title:'Second page',description:'Second instructions',questions:[{itemKey:'last',type:'LONG_TEXT',prompt:'Comment',required:false,options:[],rows:[],maxLength:150}]}]})
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
async function frozen(c:PrivateToolContext,definition:unknown=form()){
 const draft=await tools.createPrivateTool(c,{kind:'FORM',title:'Synthetic private form'})
 const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:draft.revision,title:draft.title,definition})
 return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
}
suite('Private Form internal fixed-version preparation, not publication',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('pins both entry sources, preserves pages and typed content, and idempotently prepares an immutable draft whose only lifecycle change is native publication',async()=>{
  const a=await actor()
  for(const entry of ['SCHOOL','TEACHER'] as const){
   const c={...a.context,entry},v=await frozen(c),input={versionId:v.id,contentHash:v.contentHash,administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'}}
   const prepared=await transaction(tx=>preparePrivateFormRuntimeResource(tx,c,input))
   expect(prepared).toMatchObject({identityOnly:true,canPublish:false,origin:{entry,versionId:v.id,contentHash:v.contentHash,ownerUserId:a.user.id}})
   expect(prepared.resourceEntry).toMatchObject({releaseStatus:'DRAFT',applicability:{resourceKind:'FORM'},resultDisclosure:{audiences:{RESPONDENT:{mode:'NONE'},PROFESSIONAL:{mode:'NONE'}}}})
   expect((await transaction(tx=>preparePrivateFormRuntimeResource(tx,c,input))).compositeId).toBe(prepared.compositeId)
   const composite=await db.compositeAssessment.findUniqueOrThrow({where:{id:prepared.compositeId},include:{formSections:{orderBy:{position:'asc'}},items:{orderBy:{position:'asc'}}}})
   expect(composite.formSections.map(page=>[page.title,page.description])).toEqual([['First page','First instructions'],['Second page','Second instructions']])
   expect(composite.items.map(item=>item.formDefinition)).toEqual((v.definition as ReturnType<typeof form>).pages.flatMap(page=>page.questions))
   expect(composite.items.every(item=>item.type==='FORM'&&item.scaleId===null)).toBe(true)
   expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE composite_id=${composite.id}`).toEqual([])
   expect(await db.scale.findMany({where:{code:'education-private-scale:'+v.id}})).toEqual([])
   // The publication transition is now allowed, but never a content rewrite or downgrade.
   await db.compositeAssessment.update({where:{id:composite.id},data:{status:'PUBLISHED',publishedAt:new Date()}})
   await expect(db.compositeAssessment.update({where:{id:composite.id},data:{status:'DRAFT',publishedAt:null}})).rejects.toThrow('PRIVATE_FORM_COMPOSITE_IMMUTABLE')
   await expect(db.compositeAssessment.update({where:{id:composite.id},data:{name:'Rewritten'}})).rejects.toThrow('PRIVATE_FORM_COMPOSITE_IMMUTABLE')
   const beforeCopy=await db.compositeAssessment.count({where:{createdBy:a.user.id}})
   await expect(copyComposite(a.user.id,'TEACHER',composite.id,{})).rejects.toMatchObject({statusCode:403,message:'组织资源仅可通过对应的组织任务访问'})
   expect(await db.compositeAssessment.count({where:{createdBy:a.user.id}})).toBe(beforeCopy)
   await expect(db.compositeAssessmentItem.update({where:{id:composite.items[0].id},data:{required:false}})).rejects.toThrow('PRIVATE_FORM_CHILD_IMMUTABLE')
   await expect(db.compositeFormSection.update({where:{id:composite.formSections[0].id},data:{title:'Rewrite'}})).rejects.toThrow('PRIVATE_FORM_CHILD_IMMUTABLE')
   await db.compositeAssessment.update({where:{id:composite.id},data:{revision:{increment:1}}})
   const forgedKey=prepared.resourceEntry.applicability.resourceKey.replace(':SELF',entry==='SCHOOL'?':PARENT_REPORT':':STUDENT_REPORT')
   await expect(db.compositeAssessment.create({data:{code:'education-'+forgedKey,creationKey:forgedKey,creationHash:'0'.repeat(64),createdBy:a.user.id,name:v.title,productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false}})).rejects.toThrow('PRIVATE_FORM_SOURCE_INVALID')
   expect((await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:v.id}})).contentHash).toBe(v.contentHash)
  }
 })
 it('requires current author/entry/org capability for new use, never retroactively equates identity with task/report permission',async()=>{
  const a=await actor(),v=await frozen(a.context),other=await actor(a.org)
  const input={versionId:v.id,contentHash:v.contentHash,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}}
  for(const context of [other.context,{...a.context,entry:'TEACHER' as const},{...a.context,organizationId:randomUUID()}])await expect(transaction(tx=>preparePrivateFormRuntimeResource(tx,context,input))).rejects.toThrow()
  await expect(transaction(tx=>preparePrivateFormRuntimeResource(tx,a.context,{...input,contentHash:'0'.repeat(64)}))).rejects.toThrow('PRIVATE_TOOL_VERSION_NOT_FOUND')
  const prepared=await transaction(tx=>preparePrivateFormRuntimeResource(tx,a.context,input)),key=prepared.resourceEntry.applicability.resourceKey
  expect(prepared.resourceEntry.allowedTargetModes).toEqual(['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'])
  await db.organizationCapabilityGrant.update({where:{id:a.capability.id},data:{revokedAt:new Date(),revokedByUserId:a.user.id}})
  await expect(transaction(tx=>preparePrivateFormRuntimeResource(tx,a.context,input))).rejects.toThrow()
  await expect(transaction(tx=>readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'NEW_USE',context:a.context}))).rejects.toThrow()
  expect(await transaction(tx=>readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'HISTORY'}))).toMatchObject({identityOnly:true,canPublish:false})
  await expect(transaction(tx=>readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'EXISTING_EXECUTION'}))).rejects.toThrow('PRIVATE_FORM_RUNTIME_NOT_PUBLISHED')
  await db.compositeAssessment.update({where:{id:prepared.compositeId},data:{status:'PUBLISHED',publishedAt:new Date()}})
  expect(await transaction(tx=>readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'EXISTING_EXECUTION'}))).toMatchObject({identityOnly:true,canPublish:false})
 })
 it('refuses nonrepresentable conditions before writes, rejects forged child-source sealing, and rolls back caller failures',async()=>{
  const a=await actor(),draft=form()
  draft.pages[1].questions=[draft.pages[0].questions.pop()!]
  const incompatible=await frozen(a.context,draft),before=canonicalHash(incompatible.definition)
  const input={versionId:incompatible.id,contentHash:incompatible.contentHash,administration:{population:'STUDENT',responseMode:'SELF'}}
  await expect(transaction(tx=>preparePrivateFormRuntimeResource(tx,a.context,input))).rejects.toMatchObject({code:'PRIVATE_FORM_RUNTIME_UNSUPPORTED',issues:expect.arrayContaining([expect.objectContaining({pageKey:'two',itemKey:'second',reason:'CONDITION_SCOPE_UNSUPPORTED'})])})
  expect(canonicalHash((await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:incompatible.id}})).definition)).toBe(before)
  expect(await db.compositeAssessment.findMany({where:{creationKey:{contains:incompatible.id}}})).toEqual([])
  const v=await frozen(a.context),valid={...input,versionId:v.id,contentHash:v.contentHash}
  await expect(transaction(async tx=>{await preparePrivateFormRuntimeResource(tx,a.context,valid);throw Error('caller rollback')})).rejects.toThrow('caller rollback')
  expect(await db.compositeAssessment.findMany({where:{creationKey:{contains:v.id}}})).toEqual([])
  const prepared=await transaction(tx=>preparePrivateFormRuntimeResource(tx,a.context,valid))
  const origin={...prepared.origin,variantKey:'STUDENT:PARENT_REPORT'},key=`private-form:SCHOOL:${v.id}:STUDENT:PARENT_REPORT`
  await expect(transaction(async tx=>{
   const fake=await tx.compositeAssessment.create({data:{code:'internal-form-build-'+randomUUID(),name:v.title,createdBy:a.user.id,productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false}})
   const section=await tx.compositeFormSection.create({data:{compositeAssessmentId:fake.id,title:'WRONG SOURCE PAGE',position:0}})
   await tx.compositeAssessmentItem.create({data:{compositeAssessmentId:fake.id,type:'FORM',position:0,required:false,formSectionId:section.id,formType:'SHORT_TEXT',formLabel:'wrong'}})
   const snapshot={schemaVersion:1,compositeId:fake.id,units:[]}
   await tx.compositeAssessment.update({where:{id:fake.id},data:{code:'education-'+key,creationKey:key,creationHash:canonicalHash(origin),trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
  })).rejects.toThrow('PRIVATE_FORM_SECTION_SOURCE_MISMATCH')
 })
})
