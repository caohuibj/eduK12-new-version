import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateFormOriginSchema,privateFormResourceKey,privateFormResourceKeySchema,privateFormRuntimeInput,privateFormVariant,type PrivateFormOrigin} from './private-tool.form-runtime-contracts'
import {privateFormRuntimeItem} from './private-tool.form-runtime-adapter'
import {readPrivateFormVersionIdentity,privateFormResourceEntry} from './private-tool.form-runtime-source'
type Tx=Prisma.TransactionClient
/** This internal draft never enters the public registry. Existing/history modes
 * verify identity only, not author/participant access or report disclosure. */
export async function readPrivateFormRuntimeResource(tx:Tx,input:{key:string;version:'1.0.0';purpose:'NEW_USE'|'EXISTING_EXECUTION'|'HISTORY';context?:PrivateToolContext}){
 privateFormResourceKeySchema.parse(input.key)
 const [,entry,versionId,population,responseMode]=input.key.split(':')
 const composite=await tx.compositeAssessment.findUnique({where:{creationKey:input.key},include:{items:{orderBy:{position:'asc'}},formSections:{orderBy:{position:'asc'}}}})
 if(!composite)privateToolFail('PRIVATE_FORM_RUNTIME_RESOURCE_INVALID')
 if(input.purpose==='NEW_USE'){
  const c=input.context
  if(!c||c.entry!==entry)privateToolFail('PRIVATE_TOOL_RUNTIME_AUTHOR_REQUIRED',403)
  await authorizePrivateTool(tx,c)
  if(!await tx.educationPrivateToolVersion.findFirst({where:{id:versionId,kind:'FORM',entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId},select:{id:true}}))privateToolFail('PRIVATE_TOOL_RUNTIME_AUTHOR_REQUIRED',403)
 }
 const source=await readPrivateFormVersionIdentity(tx,versionId),v=source.version
 const origin=privateFormOriginSchema.parse({schemaVersion:1,adapterVersion:input.version,kind:'AUTHOR_PRIVATE_FORM',entry:v.entry,
  organizationId:v.organizationId,ownerUserId:v.ownerUserId,toolId:v.toolId,versionId:v.id,contentHash:v.contentHash,variantKey:population+':'+responseMode})
 privateFormVariant(origin.entry,{population,responseMode})
 if(origin.entry!==entry||privateFormResourceKey(origin)!==input.key)privateToolFail('PRIVATE_FORM_RUNTIME_RESOURCE_INVALID')
 if(composite.code!=='education-'+input.key||composite.creationHash!==canonicalHash(origin)||composite.name!==v.title
  ||composite.createdBy!==v.ownerUserId||composite.productKind!=='ORGANIZATION_RESOURCE'||composite.status!=='DRAFT'
  ||composite.copyable||composite.publicEnabled||composite.publishedAt!==null||composite.reportPackageKey!==null
  ||composite.analysisProtocolKey!==null||composite.formSections.length!==source.sections.length
  ||composite.items.length!==source.sections.reduce((sum,page)=>sum+page.items.length,0))privateToolFail('PRIVATE_FORM_RUNTIME_COMPOSITE_INVALID')
 const snapshot=trainingContentSnapshotSchema.parse(composite.trainingContentSnapshot)
 if(snapshot.compositeId!==composite.id||snapshot.units.length||canonicalHash(snapshot)!==composite.trainingContentSnapshotHash)privateToolFail('PRIVATE_FORM_RUNTIME_COMPOSITE_INVALID')
 let position=0
 for(const [index,page] of source.sections.entries()){
  const section=composite.formSections[index]
  if(section.position!==index||section.title!==page.title||section.description!==page.description||section.contextSection)privateToolFail('PRIVATE_FORM_RUNTIME_COMPOSITE_INVALID')
  for(const [itemIndex,q] of source.definition.pages[index].questions.entries()){
   const item=composite.items[position],expected=privateFormRuntimeItem(q,item.id,position++,itemIndex)
   if(item.type!=='FORM'||item.scaleId!==null||item.cognitiveAssignmentId!==null||item.situationalInstrumentKey!==null
    ||item.situationalInstrumentVersion!==null||item.formSectionId!==section.id||item.formType!==expected.formType
    ||item.formLabel!==expected.formLabel||item.required!==expected.required||item.contextKey!==null||item.formPlaceholder!==null
    ||item.position!==expected.position||item.formSectionPosition!==expected.formSectionPosition
    ||canonicalHash(item.formDefinition)!==canonicalHash(expected.formDefinition)||canonicalHash(item.formPolicy)!==canonicalHash(expected.formPolicy)
    ||canonicalHash(item.formOptions)!==canonicalHash(expected.formOptions))privateToolFail('PRIVATE_FORM_RUNTIME_COMPOSITE_INVALID')
  }
 }
 return {origin,compositeId:composite.id,resourceEntry:privateFormResourceEntry(origin,v.title,composite.id),identityOnly:true as const,canPublish:false as const}
}
/** Only preparation, no activity, grant, publication, or report permission.
 * Stage DRAFT protection must be deliberately replaced by the later, reviewed
 * activity adapter. This is not an additional approval workflow. */
export async function preparePrivateFormRuntimeResource(tx:Tx,c:PrivateToolContext,raw:unknown){
 const input=privateFormRuntimeInput.parse(raw)
 const [isolation]=await tx.$queryRaw<Array<{value:string}>>`SELECT current_setting('transaction_isolation') AS value`
 if(isolation?.value!=='read committed')privateToolFail('PRIVATE_TOOL_RUNTIME_READ_COMMITTED_REQUIRED')
 await authorizePrivateTool(tx,c,true)
 const scoped=await tx.educationPrivateToolVersion.findFirst({where:{id:input.versionId,entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId,kind:'FORM'}})
 if(!scoped||scoped.contentHash!==input.contentHash)privateToolFail('PRIVATE_TOOL_VERSION_NOT_FOUND',404)
 const source=await readPrivateFormVersionIdentity(tx,scoped.id),variant=privateFormVariant(c.entry,input.administration),v=source.version
 const origin=privateFormOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE_FORM',entry:c.entry,
  organizationId:v.organizationId,ownerUserId:v.ownerUserId,toolId:v.toolId,versionId:v.id,contentHash:v.contentHash,variantKey:variant.variantKey})
 const key=privateFormResourceKey(origin)
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
 if(await tx.compositeAssessment.findUnique({where:{creationKey:key},select:{id:true}}))return readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'NEW_USE',context:c})
 const composite=await tx.compositeAssessment.create({data:{code:'internal-form-build-'+randomUUID(),name:v.title,createdBy:v.ownerUserId,
  productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false}})
 let position=0
 for(const [pageIndex,page] of source.definition.pages.entries()){
  const section=await tx.compositeFormSection.create({data:{compositeAssessmentId:composite.id,title:page.title,description:page.description??null,position:pageIndex}})
  for(const [itemIndex,q] of page.questions.entries()){
   const item=privateFormRuntimeItem(q,randomUUID(),position++,itemIndex)
   await tx.compositeAssessmentItem.create({data:{id:item.id,compositeAssessmentId:composite.id,type:'FORM',position:item.position,required:item.required,
    formType:item.formType,formLabel:item.formLabel,formSectionId:section.id,formSectionPosition:itemIndex,
    formOptions:item.formOptions as Prisma.InputJsonValue,formPolicy:item.formPolicy as Prisma.InputJsonValue,formDefinition:q as unknown as Prisma.InputJsonValue}})
  }
 }
 const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:composite.id,units:[]})
 // Namespace attachment is the DB's sealing boundary, after all children exist.
 await tx.compositeAssessment.update({where:{id:composite.id},data:{code:'education-'+key,creationKey:key,creationHash:canonicalHash(origin),
  trainingContentSnapshot:snapshot as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:canonicalHash(snapshot)}})
 return readPrivateFormRuntimeResource(tx,{key,version:'1.0.0',purpose:'NEW_USE',context:c})
}
