import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {attachAssetReferences,lockStoredAssetRows,storeAsset,syncAssetReferences} from '../../services/assetStorage'
import {assertAssessmentAssetReferencesReady,retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
import type {AssessmentStaticImageAssetIdentityV1} from '../assessment-media/assessment-image'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolId,privateToolFail,type PrivateToolContext,type PrivateToolKind} from './private-tool.contracts'
import {privateToolImageMaxBytes,privateToolImageMimeTypes,privateToolImageReferences} from './private-tool.media-definition'

type Tx=Prisma.TransactionClient
export const privateToolMediaScope=(c:PrivateToolContext,toolId:string)=>`education-private:${c.entry}:${c.organizationId}:${toolId}`
export const privateToolMediaLibrary=(toolId:string)=>({entityType:'EducationPrivateToolMediaLibrary',entityId:toolId,field:'image-library'})
const assetWhere=(c:PrivateToolContext,toolId:string)=>({ownerId:c.principal.userId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(c,toolId),deletedAt:null})
const identity=(a:{id:string;sha256:string;mimeType:string})=>({assetId:a.id,contentHash:a.sha256,mimeType:a.mimeType as AssessmentStaticImageAssetIdentityV1['mimeType']})
async function owned(tx:Tx,c:PrivateToolContext,toolId:string,mutation=false){
 privateToolId.parse(toolId)
 await authorizePrivateTool(tx,c,mutation)
 if(!await tx.educationPrivateTool.findFirst({where:{id:toolId,...privateToolScope(c)},select:{id:true}}))privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
}
export async function assertPrivateToolMediaAdmission(c:PrivateToolContext,toolId:string){
 await prisma.$transaction(tx=>owned(tx,c,toolId))
}
async function assertScopedImages(tx:Tx,c:PrivateToolContext,toolId:string,refs:readonly AssessmentStaticImageAssetIdentityV1[],registered=true){
 if(!refs.length)return
 const ids=[...new Set(refs.map(ref=>ref.assetId))]
 await lockStoredAssetRows(tx,ids)
 const rows=await tx.storedAsset.findMany({where:{id:{in:ids},...assetWhere(c,toolId),
  ...(registered?{references:{some:privateToolMediaLibrary(toolId)}}:{}),
  mimeType:{in:privateToolImageMimeTypes},sizeBytes:{gt:0,lte:privateToolImageMaxBytes}},select:{id:true,sha256:true,mimeType:true}})
 if(rows.length!==ids.length||refs.some(ref=>!rows.some(row=>row.id===ref.assetId&&row.sha256===ref.contentHash&&row.mimeType===ref.mimeType)))
  privateToolFail('PRIVATE_TOOL_MEDIA_SCOPE_OR_IDENTITY_INVALID',403)
 await assertAssessmentAssetReferencesReady(refs,tx)
}
/** Called only inside an already-authorized tool operation. */
export async function assertPrivateToolImages(tx:Tx,c:PrivateToolContext,toolId:string,kind:PrivateToolKind,definition:unknown){
 const refs=privateToolImageReferences(kind,definition)
 await assertScopedImages(tx,c,toolId,refs.all)
 return refs
}
export async function syncPrivateToolDraftImages(tx:Tx,toolId:string,refs:ReturnType<typeof privateToolImageReferences>){
 // A distinct owner prevents draft replacement from releasing library/version pins.
 await syncAssetReferences({entityType:'EducationPrivateToolDraft',entityId:toolId,
  values:{stimuli:refs.stimuli,reports:refs.reports},db:tx})
}
export async function retainPrivateToolVersionImages(tx:Tx,versionId:string,refs:ReturnType<typeof privateToolImageReferences>){
 // Lock the full union first; separate groups must not reverse asset lock order.
 await lockStoredAssetRows(tx,refs.all.map(ref=>ref.assetId))
 for(const field of ['stimuli','reports'] as const)await retainAssessmentAssetReferences({
  owner:{entityType:'EducationPrivateToolVersion',entityId:versionId,field},references:refs[field],db:tx,
 })
}
export async function registerPrivateToolImage(c:PrivateToolContext,toolId:string,reference:AssessmentStaticImageAssetIdentityV1){
 return prisma.$transaction(async tx=>{
  await owned(tx,c,toolId,true)
  await assertScopedImages(tx,c,toolId,[reference],false)
  await attachAssetReferences([{assetId:reference.assetId,...privateToolMediaLibrary(toolId)}],tx)
  return reference
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
/** Input comes exclusively from boundedUpload after magic/decode validation.
 * Storage IO never runs under an org lock. Failed final authorization leaves an
 * unregistered private object; no destructive compensation or worker is started. */
export async function uploadPrivateToolImage(c:PrivateToolContext,toolId:string,file:{buffer:Buffer;originalname:string;detectedMimeType:string}){
 await assertPrivateToolMediaAdmission(c,toolId)
 if(!file.buffer.length||file.buffer.length>privateToolImageMaxBytes||!privateToolImageMimeTypes.includes(file.detectedMimeType))
  privateToolFail('PRIVATE_TOOL_IMAGE_INVALID',400)
 const asset=await storeAsset({buffer:file.buffer,originalName:file.originalname,mimeType:file.detectedMimeType,
  ownerId:c.principal.userId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(c,toolId)})
 return registerPrivateToolImage(c,toolId,identity(asset))
}
export async function listPrivateToolImages(c:PrivateToolContext,toolId:string){
 return prisma.$transaction(async tx=>{
  await owned(tx,c,toolId)
  const rows=await tx.storedAsset.findMany({where:{...assetWhere(c,toolId),references:{some:privateToolMediaLibrary(toolId)},
   mimeType:{in:privateToolImageMimeTypes},sizeBytes:{gt:0,lte:privateToolImageMaxBytes}},
   orderBy:[{createdAt:'desc'},{id:'desc'}],take:40,select:{id:true,sha256:true,mimeType:true,originalName:true,sizeBytes:true}})
  return {assets:rows.map(row=>({...identity(row),originalName:row.originalName,sizeBytes:row.sizeBytes}))}
 })
}
export async function readPrivateToolImage(c:PrivateToolContext,toolId:string,assetId:string){
 privateToolId.parse(assetId)
 return prisma.$transaction(async tx=>{
  await owned(tx,c,toolId)
  const row=await tx.storedAsset.findFirst({where:{id:assetId,...assetWhere(c,toolId),references:{some:privateToolMediaLibrary(toolId)}},select:{id:true,sha256:true,mimeType:true}})
  if(!row)privateToolFail('PRIVATE_TOOL_IMAGE_NOT_FOUND',404)
  const ref=identity(row)
  await assertScopedImages(tx,c,toolId,[ref])
  return ref
 })
}
