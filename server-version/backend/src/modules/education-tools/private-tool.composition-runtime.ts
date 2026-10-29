import {materializeStandardCombinationContent} from '../measurement-content/standard-combination-content'
import {randomUUID} from 'node:crypto'
import {Prisma,type EducationPrivateToolVersion} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {publishContentRelease} from '../measurement-content/repository'
import {hashScaleDefinition} from '../scale/scale-definition'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {privateScaleMeasurementInput} from './private-tool.runtime-source'
import {privateScaleCode} from './private-tool.runtime-origin'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {educationCompositionBindingSchema,educationCompositionOriginSchema,educationCompositionKey,
 type EducationCompositionOrigin,type EducationCompositionBinding} from './private-tool.composition-contracts'
import type {CompiledPrivateComposition,CompositionLeaf} from './private-tool.composition-compiler'
import {compositionLeafKey} from './private-tool.composition-compiler'
import {materializeEducationLibraryScale} from './library-source.scale'

type Tx=Prisma.TransactionClient
const identitySelect={id:true,creationKey:true,creationHash:true,createdBy:true,status:true,publishedAt:true,productKind:true,
 publicEnabled:true,copyable:true,trainingContentSnapshotHash:true} as const
export type SealedEducationIdentity={compositeId:string;resourceKey:string;version:'1.0.0';manifestHash:string;
 origin:EducationCompositionOrigin;status:'DRAFT'|'PUBLISHED';identityOnly:true;canPublish:false}

/** Header only: DB seal guards prove complete source/mapping/children once.
 * The caller must supply an independently frozen Run/attempt or owner anchor.
 * This helper grants neither new use, task entry nor report disclosure. */
export async function loadSealedEducationIdentity(tx:Tx,anchor:{compositeId:string;resourceKey:string;manifestHash:string;origin:EducationCompositionOrigin}):Promise<SealedEducationIdentity>{
 const origin=educationCompositionOriginSchema.parse(anchor.origin),key=educationCompositionKey(origin)
 if(key!==anchor.resourceKey||!/^[a-f0-9]{64}$/.test(anchor.manifestHash))privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const row=await tx.compositeAssessment.findUnique({where:{id:anchor.compositeId},select:identitySelect})
 if(!row||row.creationKey!==key||row.creationHash!==canonicalHash(origin)||row.createdBy!==origin.ownerUserId
  ||row.trainingContentSnapshotHash!==anchor.manifestHash||row.productKind!=='ORGANIZATION_RESOURCE'||row.publicEnabled||row.copyable
  ||!['DRAFT','PUBLISHED'].includes(row.status)||(row.status==='DRAFT'?row.publishedAt!==null:row.publishedAt===null))
  privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 return {compositeId:row.id,resourceKey:key,version:'1.0.0',manifestHash:anchor.manifestHash,origin,
  status:row.status as 'DRAFT'|'PUBLISHED',identityOnly:true,canPublish:false}
}

/** Owner freeze retry reads only the sealed header/origin; no full-source
 * recompilation. Scope/current author authorization belongs to its service. */
export async function readOwnedCompositionIdentity(tx:Tx,c:PrivateToolContext,version:Pick<EducationPrivateToolVersion,'id'|'toolId'|'entry'|'organizationId'|'ownerUserId'|'contentHash'>){
 if(version.entry!==c.entry||version.organizationId!==c.organizationId||version.ownerUserId!==c.principal.userId)
  privateToolFail('PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',404)
 const origin=educationCompositionOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:c.entry,
  organizationId:c.organizationId,ownerUserId:c.principal.userId,toolId:version.toolId,versionId:version.id,
  contentHash:version.contentHash,variantKey:c.entry==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF'})
 const row=await tx.compositeAssessment.findUnique({where:{creationKey:educationCompositionKey(origin)},select:identitySelect})
 if(!row||!row.trainingContentSnapshotHash)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 // Reuse the row already loaded in this request, rather than calling the reader
 // and issuing a second SQL query for the same immutable header.
 if(row.creationHash!==canonicalHash(origin)||row.createdBy!==origin.ownerUserId||row.productKind!=='ORGANIZATION_RESOURCE'
  ||row.publicEnabled||row.copyable||!['DRAFT','PUBLISHED'].includes(row.status)
  ||(row.status==='DRAFT'?row.publishedAt!==null:row.publishedAt===null))privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 return {compositeId:row.id,resourceKey:educationCompositionKey(origin),version:'1.0.0' as const,
  manifestHash:row.trainingContentSnapshotHash,origin,status:row.status as 'DRAFT'|'PUBLISHED',identityOnly:true as const,canPublish:false as const}
}

async function materializeScale(tx:Tx,leaf:Extract<CompositionLeaf,{provider:'PRIVATE_VERSION';kind:'SCALE'}>){
 const {version,definition}=leaf,code=privateScaleCode(version.id)
 const release=await publishContentRelease(tx,privateScaleMeasurementInput(version,definition),version.ownerUserId)
 if(release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED')privateToolFail('PRIVATE_TOOL_RUNTIME_RELEASE_NOT_SELECTABLE')
 let scale=await tx.scale.findUnique({where:{code}})
 if(!scale)scale=await tx.scale.create({data:{id:randomUUID(),code,name:version.title,description:'作者私有固定版本，只读使用',
  status:'PUBLISHED',visibility:'COURSE',creatorId:version.ownerUserId,instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1.0.0',
  definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),
  itemCount:definition.items.length,dimensionCount:definition.scoring.scores.length,measurementReleaseId:release.releaseId}})
 if(scale.creatorId!==version.ownerUserId||scale.libraryEntryId!==null||scale.status!=='PUBLISHED'||scale.visibility!=='COURSE'
  ||scale.instrumentClass!=='CUSTOM_DESCRIPTIVE'||scale.instrumentVersion!=='1.0.0'||scale.measurementReleaseId!==release.releaseId
  ||scale.definitionHash!==hashScaleDefinition(definition)||canonicalHash(scale.definition)!==canonicalHash(definition))
  privateToolFail('PRIVATE_TOOL_RUNTIME_WRAPPER_INVALID')
 return {scale,release}
}

/** Internal: same authorized RC freeze transaction, same already compiled leaves.
 * No public prepare API, per-leaf composite, independent review or task creation. */
export async function sealPrivateComposition(tx:Tx,c:PrivateToolContext,version:EducationPrivateToolVersion,compiled:CompiledPrivateComposition){
 const origin=educationCompositionOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:c.entry,
  organizationId:c.organizationId,ownerUserId:c.principal.userId,toolId:version.toolId,versionId:version.id,contentHash:version.contentHash,
  variantKey:compiled.definition.administration.population+':SELF'})
 const key=educationCompositionKey(origin)
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
 const prior=await tx.compositeAssessment.findUnique({where:{creationKey:key},select:{id:true}})
 if(prior)return readOwnedCompositionIdentity(tx,c,version)
 const scaleLeaves=new Map<string,Awaited<ReturnType<typeof materializeScale>>>()
 const libraryScales=new Map<string,Awaited<ReturnType<typeof materializeEducationLibraryScale>>>()
 for(const leaf of [...compiled.leaves.values()].filter(leaf=>leaf.provider==='LIBRARY_SCALE').sort((a,b)=>a.version.id.localeCompare(b.version.id))){
  libraryScales.set(leaf.version.id,await materializeEducationLibraryScale(tx,leaf.library))
 }
 const standardContent=new Map<string,Awaited<ReturnType<typeof materializeStandardCombinationContent>>>()
 for(const leaf of [...compiled.leaves.values()].filter(leaf=>leaf.provider==='STANDARD_SCALE').sort((a,b)=>a.version.id.localeCompare(b.version.id))){
  const {row,measurement,descriptor}=leaf.standard
  standardContent.set(leaf.version.id,await materializeStandardCombinationContent(tx,row,measurement,c.principal.userId,descriptor.reportAudience))
 }
 // Stable source locks serialize reuse across different questionnaire versions.
 for(const leaf of [...compiled.leaves.values()].filter((leaf):leaf is Extract<CompositionLeaf,{provider:'PRIVATE_VERSION';kind:'SCALE'}>=>leaf.provider==='PRIVATE_VERSION'&&leaf.kind==='SCALE').sort((a,b)=>a.version.id.localeCompare(b.version.id))){
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'private-scale:'+leaf.version.id}))`)
  scaleLeaves.set(leaf.version.id,await materializeScale(tx,leaf))
 }
 const parent=await tx.compositeAssessment.create({data:{id:randomUUID(),code:'internal-education-composition-'+randomUUID(),
  name:version.title,instruction:compiled.definition.instruction,createdBy:c.principal.userId,productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false}})
 const sections:Prisma.CompositeFormSectionCreateManyInput[]=[],items:Prisma.CompositeAssessmentItemCreateManyInput[]=[]
 const units:unknown[]=[],manifest:EducationCompositionBinding['manifest']=[]
 let context:EducationCompositionBinding['context']
 if(compiled.definition.contextFields?.length){
  const sectionId=randomUUID(),itemIds:string[]=[]
  sections.push({id:sectionId,compositeAssessmentId:parent.id,title:'背景信息',position:0,contextSection:true})
  for(const field of compiled.definition.contextFields){
   const id=randomUUID();itemIds.push(id);items.push({id,compositeAssessmentId:parent.id,type:'FORM',position:items.length,required:true,
    contextKey:field.contextKey,formType:field.formType,formLabel:field.formLabel,formOptions:field.formOptions as Prisma.InputJsonValue,formSectionId:sectionId,formSectionPosition:itemIds.length-1})
  }
  context={sectionId,itemIds}
 }
 for(const block of compiled.definition.blocks){
  const leaf=compiled.leaves.get(compositionLeafKey(block.source))!,itemIds:string[]=[],sectionIds:string[]=[]
  if(leaf.kind==='SCALE'){
   const {scale,release}=leaf.provider==='STANDARD_SCALE'?{scale:leaf.standard.scale,release:leaf.standard.measurement}:
    leaf.provider==='LIBRARY_SCALE'?{scale:libraryScales.get(leaf.version.id)!,release:leaf.library.measurement}:scaleLeaves.get(leaf.version.id)!,itemId=randomUUID()
   itemIds.push(itemId);items.push({id:itemId,compositeAssessmentId:parent.id,type:'SCALE',position:items.length,required:true,scaleId:scale.id})
   const derived=leaf.provider==='STANDARD_SCALE'?standardContent.get(leaf.version.id)!:null
   units.push({itemId,family:'SCALE',source:leaf.provider==='STANDARD_SCALE'?{kind:'SCALE',id:scale.id,ownerId:scale.creatorId,educationStandard:leaf.standard.descriptor}:
    leaf.provider==='LIBRARY_SCALE'?{kind:'SCALE',id:scale.id,ownerId:scale.creatorId,libraryEntryId:leaf.library.row.entryId,educationLibrary:leaf.library.descriptor}:
    {kind:'SCALE',id:scale.id,ownerId:leaf.version.ownerUserId,privateVersionId:leaf.version.id},
    measurement:{releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash},
    ...(derived?{referencePolicy:derived.referencePolicy,...(derived.report?{report:derived.report}:{})}:{})})
  }else for(const page of leaf.form.sections){
   const sectionId=randomUUID();sectionIds.push(sectionId)
   sections.push({id:sectionId,compositeAssessmentId:parent.id,title:page.title,description:page.description,position:sections.length,contextSection:false})
   for(const question of page.items){
    const itemId=randomUUID();itemIds.push(itemId)
    items.push({id:itemId,compositeAssessmentId:parent.id,type:'FORM',position:items.length,required:question.required,
     formSectionId:sectionId,formSectionPosition:question.formSectionPosition,formType:question.formType,formLabel:question.formLabel,
     formDefinition:question.formDefinition as Prisma.InputJsonValue,formOptions:question.formOptions as Prisma.InputJsonValue,formPolicy:question.formPolicy as Prisma.InputJsonValue})
   }
  }
  manifest.push({blockId:block.blockId,instruction:block.instruction,kind:leaf.kind,versionId:leaf.version.id,
   contentHash:leaf.version.contentHash,toolId:leaf.version.toolId,itemIds,sectionIds,sourceProvider:leaf.provider,
   ...(leaf.provider==='LIBRARY_SCALE'&&leaf.library.row.snapshot.instruction?{sourceInstruction:leaf.library.row.snapshot.instruction}:{}),
   ...(leaf.provider==='PUBLIC_FORM'&&leaf.sourceInstruction?{sourceInstruction:leaf.sourceInstruction}:{})})
 }
 if(sections.length)await tx.compositeFormSection.createMany({data:sections})
 await tx.compositeAssessmentItem.createMany({data:items})
 const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:parent.id,units,
  educationBinding:educationCompositionBindingSchema.parse({schemaVersion:1,origin,sealed:true,manifest,...(context?{context}:{})})})
 const manifestHash=canonicalHash(snapshot)
 if(compiled.publicUseExpiresAt){
  // Only time can change after the grant SHARE locks. Scale materialization or
  // source-key waits may outlive the interval; no grant/body chain is reread.
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(clock.now>=compiled.publicUseExpiresAt)privateToolFail('PUBLIC_SOURCE_USE_EXPIRED',403)
 }
 // DB guard verifies exact immutable sources, complete actual children, scope,
 // mapping and hash. Only this final write attaches the sealed namespace.
 await tx.compositeAssessment.update({where:{id:parent.id},data:{code:key,creationKey:key,creationHash:canonicalHash(origin),
  trainingContentSnapshot:snapshot as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:manifestHash}})
 return {compositeId:parent.id,resourceKey:key,version:'1.0.0' as const,manifestHash,origin,status:'DRAFT' as const,identityOnly:true as const,canPublish:false as const}
}
