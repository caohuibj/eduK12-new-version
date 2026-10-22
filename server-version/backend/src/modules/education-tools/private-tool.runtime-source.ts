import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {privateToolContentHash,validatePrivateToolDefinition} from './private-tool.definition'
import {privateToolFail} from './private-tool.contracts'
import {privateScaleCode,privateScaleRuntimeOriginSchema} from './private-tool.runtime-origin'
import {privateToolImageReferences} from './private-tool.media-definition'
import {assertAssessmentAssetReferencesReady} from '../assessment-media/assessment-asset'

type Tx=Prisma.TransactionClient
/** Identity only, never permission to view or launch. Callers enforce the
 * current author for new use OR the current task/report audience for history. */
export async function readPrivateScaleVersionIdentity(tx:Tx,versionId:string){
 const version=await tx.educationPrivateToolVersion.findUnique({where:{id:versionId}})
 if(!version||version.kind!=='SCALE'||!['SCHOOL','TEACHER'].includes(version.entry)
  ||version.contentHash!==privateToolContentHash('SCALE',version.title,version.definition))privateToolFail('PRIVATE_TOOL_RUNTIME_SOURCE_INVALID')
 const validated=validatePrivateToolDefinition('SCALE',version.definition)
 if(!validated.valid||!validated.definition)privateToolFail('PRIVATE_TOOL_RUNTIME_SOURCE_INVALID')
 const definition=validated.definition as ScaleDefinitionV2
 if(definition.referencePolicy.type!=='none')privateToolFail('PRIVATE_TOOL_RUNTIME_REFERENCE_UNSUPPORTED')
 const refs=privateToolImageReferences('SCALE',definition)
 if(refs.all.length){
  const rows=await tx.storedAsset.findMany({where:{id:{in:refs.all.map(ref=>ref.assetId)},ownerId:version.ownerUserId,
   accessScope:'PRIVATE',scopeId:`education-private:${version.entry}:${version.organizationId}:${version.toolId}`,deletedAt:null,
   references:{some:{entityType:'EducationPrivateToolVersion',entityId:version.id,field:{in:['stimuli','reports']}}}},select:{id:true,sha256:true,mimeType:true}})
  if(refs.all.some(ref=>!rows.some(row=>row.id===ref.assetId&&row.sha256===ref.contentHash&&row.mimeType===ref.mimeType)))
   privateToolFail('PRIVATE_TOOL_RUNTIME_MEDIA_IDENTITY_INVALID')
  await assertAssessmentAssetReferencesReady(refs.all,tx)
 }
 return {version,definition}
}
export function privateScaleMeasurementInput(version:{id:string;entry:string;organizationId:string;ownerUserId:string;toolId:string;contentHash:string},definition:ScaleDefinitionV2){
 if(version.entry!=='SCHOOL'&&version.entry!=='TEACHER')privateToolFail('PRIVATE_TOOL_RUNTIME_SOURCE_INVALID')
 return scaleMeasurementRelease({localId:privateScaleCode(version.id),version:'1.0.0',instrumentVersion:'1.0.0',
  definition,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'RUNNER_DEFAULT',
  scope:{kind:'PRIVATE',product:version.entry,ownerId:version.ownerUserId,resourceId:version.id},
  provenance:{sourceKind:'EDUCATION_PRIVATE_TOOL_VERSION',versionId:version.id,toolId:version.toolId,
   organizationId:version.organizationId,entry:version.entry,ownerUserId:version.ownerUserId,privateContentHash:version.contentHash}})
}
export async function readPrivateRuntimeScaleSource(tx:Tx,scale:Scale,versionId:string){
 const {version,definition}=await readPrivateScaleVersionIdentity(tx,versionId)
 if(scale.code!==privateScaleCode(version.id)||scale.creatorId!==version.ownerUserId||scale.libraryEntryId!==null
  ||scale.status!=='PUBLISHED'||scale.visibility!=='COURSE'||scale.instrumentClass!=='CUSTOM_DESCRIPTIVE'||scale.instrumentVersion!=='1.0.0'
  ||canonicalHash(scale.definition)!==canonicalHash(definition)||scale.definitionHash!==hashScaleDefinition(definition)||!scale.measurementReleaseId)
  privateToolFail('PRIVATE_TOOL_RUNTIME_WRAPPER_INVALID')
 const release=await getContentRelease(tx,scale.measurementReleaseId,true)
 const expected=prepareRelease(privateScaleMeasurementInput(version,definition))
 if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status==='REVOKED'
  ||release.contentHash!==expected.contentHash||release.key!==expected.key||release.version!==expected.version||release.sourceReleaseId!==expected.sourceReleaseId
  ||canonicalHash(release.scope)!==canonicalHash(expected.scope)||canonicalHash(release.provenance)!==canonicalHash(expected.provenance))
  privateToolFail('PRIVATE_TOOL_RUNTIME_RELEASE_INVALID')
 return {version,definition,release}
}
/** Requires persisted registration, not provenance text supplied by a caller. */
export async function assertPrivateRuntimeCompositeIdentity(tx:Tx,compositeId:string,scaleId:string,versionId:string){
 const [row]=await tx.$queryRaw<Array<{entry:unknown;entry_hash:string;scale_id:string}>>(Prisma.sql`SELECT entry,entry_hash,scale_id
  FROM registered_assessment_resources WHERE composite_id=${compositeId} AND resource_key LIKE 'private-scale:%' AND status='PUBLISHED' FOR SHARE`)
 if(!row||row.scale_id!==scaleId||canonicalHash(row.entry)!==row.entry_hash)privateToolFail('PRIVATE_TOOL_RUNTIME_REGISTRATION_REQUIRED')
 const origin=privateScaleRuntimeOriginSchema.parse((row.entry as {privateOrigin:unknown}).privateOrigin)
 if(origin.versionId!==versionId)privateToolFail('PRIVATE_TOOL_RUNTIME_REGISTRATION_REQUIRED')
 return origin
}
