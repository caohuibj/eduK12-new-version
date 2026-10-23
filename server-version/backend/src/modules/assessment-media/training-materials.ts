import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {mediaGrantFilter,mediaLibraryFilter} from '../../services/workspaceMedia'
import {lockStoredAssetRows} from '../../services/assetStorage'
import {materialListSchema,materialLimits,type AssessmentMaterial} from './material'

export async function authorizedTrainingMaterial(db:Prisma.TransactionClient,actorId:string,assetId:string){
  const rows=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT a.id FROM stored_assets a JOIN users u ON u.id=a.owner_id
    WHERE a.id=${assetId} AND ${mediaLibraryFilter} AND (a.owner_id=${actorId} OR (${mediaGrantFilter(actorId)})) LIMIT 1`)
  if(!rows.length)throw Object.assign(new Error('素材不存在或无权复用'),{statusCode:403})
  return db.storedAsset.findUniqueOrThrow({where:{id:assetId}})
}

/** Validate author use under the parent's existing transaction and sorted asset locks. */
export async function assertTrainingMaterialsUsable(db:Prisma.TransactionClient,actorId:string,lists:unknown[],requireRights=true){
  const materials=lists.flatMap(value=>materialListSchema.optional().parse(value)??[])
  if(!materials.length)return
  if(new Set(materials.map(item=>item.asset.assetId)).size>30)throw new Error('单次发布最多引用 30 个展示素材')
  await lockStoredAssetRows(db,materials.map(item=>item.asset.assetId))
  for(const item of materials){
    if(requireRights&&(item.rightsStatus==='unknown'||!item.rightsNote.trim()))throw new Error('请确认素材使用依据并填写原创或授权说明')
    const asset=await authorizedTrainingMaterial(db,actorId,item.asset.assetId)
    if(asset.sha256!==item.asset.contentHash||asset.mimeType!==item.asset.mimeType||asset.sizeBytes<=0||asset.sizeBytes>materialLimits[item.asset.mimeType])throw new Error('素材身份、类型或大小不符合编制要求')
    if(asset.ownerId!==actorId){
      // Keep the exact grant until the parent commit; recheck after waiting on it.
      const grants=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM material_grants WHERE teacher_id=${actorId} AND resource_type::text='MEDIA_ASSET' AND resource_id=${asset.id} FOR SHARE`
      if(!grants.length)throw new Error('素材授权已失效')
      await authorizedTrainingMaterial(db,actorId,asset.id)
    }
  }
}
export const trainingFormMaterials=(sections:Array<{items:Array<{formDefinition?:unknown}>}>)=>sections.flatMap(section=>section.items.flatMap(item=>{
  const definition=item.formDefinition as {materials?:AssessmentMaterial[]}|undefined
  return definition?.materials?[definition.materials]:[]
}))

export async function inspectTrainingMaterials(actorId:string,lists:unknown[],requireRights=false){
  return prisma.$transaction(db=>assertTrainingMaterialsUsable(db,actorId,lists,requireRights))
}
