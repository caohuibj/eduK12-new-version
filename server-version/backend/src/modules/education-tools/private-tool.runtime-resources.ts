import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {publishContentRelease} from '../measurement-content/repository'
import {hashScaleDefinition} from '../scale/scale-definition'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {privateScaleCode,privateScaleResourceKey,privateScaleRuntimeInput,privateScaleRuntimeOriginSchema,privateScaleVariant,type PrivateScaleRuntimeOrigin} from './private-tool.runtime-origin'
import {readPrivateScaleVersionIdentity,privateScaleMeasurementInput,readPrivateRuntimeScaleSource} from './private-tool.runtime-source'
import {privateScaleResourceEntry} from './private-tool.runtime-policy'
import {parseSchoolPrivateGroupSelection} from './school-private-group-selection'
import {schoolPrivateScaleGroupChoice} from './school-private-group-source'
type Tx=Prisma.TransactionClient
type Row={resource_key:string;resource_version:string;scale_id:string;composite_id:string;definition_hash:string;entry:unknown;entry_hash:string;status:string}
/** Read identity only for an existing execution/history. These modes never
 * authorize a caller: actual task/report access remains the caller's obligation. */
export async function readPrivateScaleRuntimeResource(tx:Tx,input:{key:string;version:'1.0.0'|'2.0.0';purpose:'NEW_USE'|'EXISTING_EXECUTION'|'HISTORY';context?:PrivateToolContext}){
 const [row]=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM registered_assessment_resources
  WHERE resource_key=${input.key} AND resource_version=${input.version} FOR SHARE`)
 if(!row||!row.resource_key.startsWith('private-scale:')||row.status!=='PUBLISHED'||canonicalHash(row.entry)!==row.entry_hash)
  privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const origin=privateScaleRuntimeOriginSchema.parse((row.entry as {privateOrigin:unknown}).privateOrigin)
 if(privateScaleResourceKey(origin)!==input.key||origin.adapterVersion!==input.version)privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 if(input.purpose==='NEW_USE'){
  const c=input.context
  if(!c||c.entry!==origin.entry||c.organizationId!==origin.organizationId||c.principal.userId!==origin.ownerUserId)
   privateToolFail('PRIVATE_TOOL_RUNTIME_AUTHOR_REQUIRED',403)
  await authorizePrivateTool(tx,c)
 }
 const scale=await tx.scale.findUnique({where:{id:row.scale_id}})
 if(!scale)privateToolFail('PRIVATE_TOOL_RUNTIME_WRAPPER_INVALID')
 const source=await readPrivateRuntimeScaleSource(tx,scale,origin.versionId),v=source.version
 if(input.purpose==='NEW_USE'&&source.release.status!=='PUBLISHED')privateToolFail('PRIVATE_TOOL_RUNTIME_RELEASE_NOT_SELECTABLE')
 if(v.entry!==origin.entry||v.organizationId!==origin.organizationId||v.ownerUserId!==origin.ownerUserId||v.toolId!==origin.toolId
  ||v.contentHash!==origin.contentHash||scale.definitionHash!==origin.definitionHash||row.definition_hash!==origin.definitionHash
  ||source.release.releaseId!==origin.releaseId||source.release.contentHash!==origin.releaseHash)
  privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const composite=await tx.compositeAssessment.findUnique({where:{id:row.composite_id},include:{items:true}})
 if(!composite||composite.productKind!=='ORGANIZATION_RESOURCE'||composite.publicEnabled||composite.copyable||composite.status!=='PUBLISHED'
  ||composite.createdBy!==origin.ownerUserId||composite.items.length!==1||composite.items[0].scaleId!==scale.id
  ||composite.items[0].type!=='SCALE'||composite.items[0].position!==0||!composite.items[0].required
  ||canonicalHash(composite.trainingContentSnapshot)!==composite.trainingContentSnapshotHash)
  privateToolFail('PRIVATE_TOOL_RUNTIME_COMPOSITE_INVALID')
 const snapshot=trainingContentSnapshotSchema.parse(composite.trainingContentSnapshot),unit=snapshot.units[0]
 if(snapshot.compositeId!==composite.id||snapshot.units.length!==1||unit.itemId!==composite.items[0].id||unit.family!=='SCALE'
  ||unit.source.id!==scale.id||unit.source.kind!=='SCALE'||unit.source.ownerId!==origin.ownerUserId
  ||unit.source.privateVersionId!==origin.versionId||unit.source.libraryEntryId!==undefined
  ||unit.measurement.releaseId!==origin.releaseId||unit.measurement.contentHash!==origin.releaseHash
  ||unit.measurement.measurementHash!==source.release.content.measurementHash||unit.report!==undefined||unit.referencePolicy!==undefined)
  privateToolFail('PRIVATE_TOOL_RUNTIME_COMPOSITE_INVALID')
 const entry=privateScaleResourceEntry(origin,v.title,source.definition,composite.id)
 if(canonicalHash(entry)!==row.entry_hash)privateToolFail('PRIVATE_TOOL_RUNTIME_POLICY_INVALID')
 return {origin,scaleId:scale.id,compositeId:composite.id,compositeItemId:composite.items[0].id,
  sourceDefinitionHash:canonicalHash(source.definition),resourceEntry:entry,identityOnly:true as const,canPublish:false as const}
}
/** INTERNAL PREPARATION ONLY. This creates no activity/track, no shared grant,
 * and gives no publication/report right. Future activity callers must separately
 * verify actual workflow publication authority in the same transaction. */
export async function preparePrivateScaleRuntimeResource(tx:Tx,c:PrivateToolContext,raw:unknown){
 const input=privateScaleRuntimeInput.parse(raw)
 const [isolation]=await tx.$queryRaw<Array<{value:string}>>`SELECT current_setting('transaction_isolation') AS value`
 if(isolation?.value!=='read committed')privateToolFail('PRIVATE_TOOL_RUNTIME_READ_COMMITTED_REQUIRED')
 await authorizePrivateTool(tx,c,true)
 const scoped=await tx.educationPrivateToolVersion.findFirst({where:{id:input.versionId,entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId,kind:'SCALE'}})
 if(!scoped||scoped.contentHash!==input.contentHash)privateToolFail('PRIVATE_TOOL_VERSION_NOT_FOUND',404)
 const {version,definition}=await readPrivateScaleVersionIdentity(tx,scoped.id)
 const variant=privateScaleVariant(c.entry,input.administration)
 const ceiling=input.groupReporting?schoolPrivateScaleGroupChoice(version,definition):null
 const groupReporting=input.groupReporting?parseSchoolPrivateGroupSelection(input.groupReporting,{entry:c.entry,
  administration:input.administration,sources:ceiling?[ceiling]:[]}):null
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'private-scale:'+version.id}))`)
 const code=privateScaleCode(version.id)
 const release=await publishContentRelease(tx,privateScaleMeasurementInput(version,definition),version.ownerUserId)
 if(release.layer!=='MEASUREMENT'||release.family!=='SCALE')privateToolFail('PRIVATE_TOOL_RUNTIME_RELEASE_INVALID')
 if(release.status!=='PUBLISHED')privateToolFail('PRIVATE_TOOL_RUNTIME_RELEASE_NOT_SELECTABLE')
 let scale=await tx.scale.findUnique({where:{code}})
 if(!scale)scale=await tx.scale.create({data:{id:randomUUID(),code,name:version.title,description:'作者私有固定版本，只读使用',
  status:'PUBLISHED',visibility:'COURSE',creatorId:version.ownerUserId,instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1.0.0',
  definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),
  itemCount:definition.items.length,dimensionCount:definition.scoring.scores.length,measurementReleaseId:release.releaseId}})
 await readPrivateRuntimeScaleSource(tx,scale,version.id)
 const origin=privateScaleRuntimeOriginSchema.parse({schemaVersion:groupReporting?2:1,adapterVersion:groupReporting?'2.0.0':'1.0.0',kind:'AUTHOR_PRIVATE',entry:c.entry,
  organizationId:version.organizationId,ownerUserId:version.ownerUserId,toolId:version.toolId,versionId:version.id,
  contentHash:version.contentHash,definitionHash:scale.definitionHash!,releaseId:release.releaseId,releaseHash:release.contentHash,
  variantKey:variant.variantKey as PrivateScaleRuntimeOrigin['variantKey'],...(groupReporting?{groupReporting}:{})})
 const key=privateScaleResourceKey(origin)
 const [prior]=await tx.$queryRaw<Array<{entry:unknown}>>(Prisma.sql`SELECT entry FROM registered_assessment_resources
  WHERE resource_key=${key} AND resource_version=${origin.adapterVersion} FOR SHARE`)
 if(prior)return readPrivateScaleRuntimeResource(tx,{key,version:origin.adapterVersion,purpose:'NEW_USE',context:c})
 const composite=await tx.compositeAssessment.create({data:{code:'org-private-resource-'+randomUUID(),name:version.title,
  createdBy:version.ownerUserId,productKind:'ORGANIZATION_RESOURCE',publicEnabled:false,copyable:false,
  items:{create:{type:'SCALE',position:0,required:true,scaleId:scale.id}}},include:{items:true}})
 const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:composite.id,units:[{
  itemId:composite.items[0].id,family:'SCALE',source:{kind:'SCALE',id:scale.id,ownerId:version.ownerUserId,privateVersionId:version.id},
  measurement:{releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash}}]})
 await tx.compositeAssessment.update({where:{id:composite.id},data:{status:'PUBLISHED',publishedAt:new Date(),
  trainingContentSnapshot:snapshot as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:canonicalHash(snapshot)}})
 const entry=privateScaleResourceEntry(origin,version.title,definition,composite.id)
 await tx.$executeRaw(Prisma.sql`INSERT INTO registered_assessment_resources
  (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,status,created_by_user_id,published_by_user_id,published_at)
  VALUES(${randomUUID()},${key},${origin.adapterVersion},${scale.id},${scale.definitionHash},${composite.id},${JSON.stringify(entry)}::jsonb,
   ${canonicalHash(entry)},'PUBLISHED',${version.ownerUserId},${version.ownerUserId},clock_timestamp())`)
 return readPrivateScaleRuntimeResource(tx,{key,version:origin.adapterVersion,purpose:'NEW_USE',context:c})
}
