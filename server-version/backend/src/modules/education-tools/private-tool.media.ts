import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {attachAssetReferences,lockStoredAssetRows,storeAsset,syncAssetReferences} from '../../services/assetStorage'
import {assertAssessmentAssetReferencesReady,retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
import type {AssessmentAssetIdentityV1} from '../assessment-media/assessment-asset'
import {materialSchema} from '../assessment-media/material'
import {z} from 'zod'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolId,privateToolFail,type PrivateToolContext,type PrivateToolKind} from './private-tool.contracts'
import {privateToolImageMaxBytes,privateToolImageMimeTypes,privateToolImageReferences,privateToolMaterialMimeTypes,materialLimits} from './private-tool.media-definition'

type Tx=Prisma.TransactionClient
export const privateToolMediaScope=(c:PrivateToolContext,toolId:string)=>`education-private:${c.entry}:${c.organizationId}:${toolId}`
export const privateToolMediaLibrary=(toolId:string)=>({entityType:'EducationPrivateToolMediaLibrary',entityId:toolId,field:'image-library'})
const assetWhere=(c:PrivateToolContext,toolId:string)=>({ownerId:c.principal.userId,accessScope:'PRIVATE',scopeId:{startsWith:`education-private:${c.entry}:${c.organizationId}:`},deletedAt:null})
const identity=(a:{id:string;sha256:string;mimeType:string})=>({assetId:a.id,contentHash:a.sha256,mimeType:a.mimeType})
async function owned(tx:Tx,c:PrivateToolContext,toolId:string,mutation=false){
 privateToolId.parse(toolId)
 await authorizePrivateTool(tx,c,mutation)
 if(!await tx.educationPrivateTool.findFirst({where:{id:toolId,...privateToolScope(c)},select:{id:true}}))privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
}
export async function assertPrivateToolMediaAdmission(c:PrivateToolContext,toolId:string){
 await prisma.$transaction(tx=>owned(tx,c,toolId))
}
async function assertScopedImages(tx:Tx,c:PrivateToolContext,toolId:string,refs:readonly AssessmentAssetIdentityV1[],registered=true){
 if(!refs.length)return
 const ids=[...new Set(refs.map(ref=>ref.assetId))]
 await lockStoredAssetRows(tx,ids)
 const rows=await tx.storedAsset.findMany({where:{id:{in:ids},...assetWhere(c,toolId),
  ...(registered?{references:{some:privateToolMediaLibrary(toolId)}}:{scopeId:privateToolMediaScope(c,toolId)}),
  mimeType:{in:privateToolMaterialMimeTypes},sizeBytes:{gt:0,lte:50*1024*1024}},select:{id:true,sha256:true,mimeType:true,sizeBytes:true}})
 if(rows.length!==ids.length||refs.some(ref=>!rows.some(row=>row.id===ref.assetId&&row.sha256===ref.contentHash&&row.mimeType===ref.mimeType&&row.sizeBytes<=materialLimits[ref.mimeType as keyof typeof materialLimits])))
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
export async function registerPrivateToolImage(c:PrivateToolContext,toolId:string,reference:AssessmentAssetIdentityV1){
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
  const row=await tx.storedAsset.findFirst({where:{id:assetId,...assetWhere(c,toolId),references:{some:privateToolMediaLibrary(toolId)}},select:{id:true,sha256:true,mimeType:true,sizeBytes:true}})
  if(!row)privateToolFail('PRIVATE_TOOL_IMAGE_NOT_FOUND',404)
  const ref=identity(row)
  await assertScopedImages(tx,c,toolId,[ref])
  return ref
 })
}

/** Registration never imports a Training grant or a different tool's library. */
export async function uploadPrivateToolMaterial(c:PrivateToolContext,toolId:string,file:{buffer:Buffer;originalname:string;detectedMimeType:string}){
 await assertPrivateToolMediaAdmission(c,toolId)
 const mime=materialSchema.shape.asset.shape.mimeType.parse(file.detectedMimeType)
 if(!file.buffer.length||file.buffer.length>materialLimits[mime])privateToolFail('PRIVATE_TOOL_MATERIAL_INVALID',400)
 const asset=await storeAsset({buffer:file.buffer,originalName:file.originalname,mimeType:mime,
  ownerId:c.principal.userId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(c,toolId)})
 return registerPrivateToolImage(c,toolId,identity(asset))
}
const catalogQuery=z.object({kind:z.enum(['all','image','video','document']).default('all'),page:z.coerce.number().int().min(1).max(100).default(1)}).strict()
const ownedLibraryJoin=(c:PrivateToolContext)=>Prisma.sql`
 JOIN education_private_tools source ON source.owner_user_id=${c.principal.userId}
  AND source.entry=${c.entry} AND source.organization_id=${c.organizationId}
  AND a.scope_id=(${'education-private:'+c.entry+':'+c.organizationId+':'}||source.id)
 JOIN asset_references registration ON registration.asset_id=a.id
  AND registration.entity_type='EducationPrivateToolMediaLibrary' AND registration.entity_id=source.id AND registration.field='image-library'`
export async function listPrivateToolMaterials(c:PrivateToolContext,toolId:string,raw:unknown){
 const {kind,page}=catalogQuery.parse(raw),pageSize=9,maxCatalog=900
 return prisma.$transaction(async tx=>{
  await owned(tx,c,toolId)
  const mimeTypes=privateToolMaterialMimeTypes.filter(mime=>kind==='all'||(kind==='document'?mime==='application/pdf':mime.startsWith(kind+'/')))
  // Metadata-only indexed DB joins, never enumerate files or fetch each tool.
  // A bounded newest-900 window caps count/offset work and is disclosed in the UI.
  const [result]=await tx.$queryRaw<Array<{total:number;list:Array<{id:string;name:string;mimeType:string;contentHash:string;size:number}>}>>(Prisma.sql`
   WITH eligible AS MATERIALIZED (
    SELECT a.id,COALESCE(a.original_name,'素材') AS name,a.mime_type AS "mimeType",a.sha256 AS "contentHash",a.size_bytes AS size,a.created_at
    FROM stored_assets a ${ownedLibraryJoin(c)}
    WHERE a.owner_id=${c.principal.userId} AND a.access_scope='PRIVATE' AND a.deleted_at IS NULL
     AND a.mime_type IN (${Prisma.join(mimeTypes)}) AND a.size_bytes>0 AND a.size_bytes<=52428800
    ORDER BY a.created_at DESC,a.id DESC LIMIT ${maxCatalog+1}
   ), page AS (SELECT id,name,"mimeType","contentHash",size FROM eligible ORDER BY created_at DESC,id DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize})
   SELECT (SELECT count(*)::int FROM eligible) AS total,COALESCE((SELECT jsonb_agg(page) FROM page),'[]'::jsonb) AS list`)
  return {list:result.list,total:Math.min(result.total,maxCatalog),pageSize,truncated:result.total>maxCatalog}
 })
}
/** Explicit same-author reuse: original registration, same organization and entry,
 * and source tool ownership are checked. Public library grants are not inputs. */
export async function registerOwnedPrivateToolMaterial(c:PrivateToolContext,toolId:string,raw:unknown){
 const reference=materialSchema.shape.asset.parse(raw)
 return prisma.$transaction(async tx=>{
  await owned(tx,c,toolId,true)
  await lockStoredAssetRows(tx,[reference.assetId])
  const [asset]=await tx.$queryRaw<Array<{id:string;sha256:string;mimeType:string;sizeBytes:number}>>(Prisma.sql`
   SELECT a.id,a.sha256,a.mime_type AS "mimeType",a.size_bytes AS "sizeBytes" FROM stored_assets a ${ownedLibraryJoin(c)}
   WHERE a.id=${reference.assetId} AND a.owner_id=${c.principal.userId} AND a.access_scope='PRIVATE' AND a.deleted_at IS NULL LIMIT 1`)
  if(!asset||asset.sha256!==reference.contentHash||asset.mimeType!==reference.mimeType||asset.sizeBytes<=0||asset.sizeBytes>materialLimits[reference.mimeType])
   privateToolFail('PRIVATE_TOOL_MEDIA_SCOPE_OR_IDENTITY_INVALID',403)
  await assertAssessmentAssetReferencesReady([reference],tx)
  await attachAssetReferences([{assetId:reference.assetId,...privateToolMediaLibrary(toolId)}],tx)
  return reference
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
