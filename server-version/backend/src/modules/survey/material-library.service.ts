import {ownedScope} from './material-scope'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizeToolOwner} from './tool-library.service'
import {SurveyMediaError} from './media.references'
import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {loadEntry} from '../scale-library-governance/service'
import {assertLibraryMediaManifest,assertLibraryMediaReady} from '../scale-library-governance/media'

export const materialKinds={
  image:{types:['image/png','image/jpeg','image/webp'],maxBytes:2*1024*1024},
  video:{types:['video/mp4','video/webm'],maxBytes:50*1024*1024},
  document:{types:['application/pdf'],maxBytes:20*1024*1024},
} as const
export const materialQuery=z.object({keyword:z.string().trim().max(200).default(''),kind:z.enum(['all','image','video','document']).default('all'),source:z.enum(['all','owned','granted']).default('all'),page:z.coerce.number().int().min(1).max(1000).default(1)}).strict()
export type MaterialQuery=z.infer<typeof materialQuery>
type Tx=Prisma.TransactionClient
const allowed=Object.values(materialKinds).flatMap(value=>[...value.types])
// An owner match alone must never expose unrelated evidence or course attachments.

type Row={id:string;contentHash:string;name:string;mimeType:string;size:number;updatedAt:Date;source:'owned'|'granted';entryId:string|null;boundTitle:string|null}
export async function listSurveyMaterials(userId:string,input:MaterialQuery){
  return prisma.$transaction(async tx=>{
    await authorizeToolOwner(tx,userId)
    const rows=Prisma.sql`SELECT a.id,a.sha256 AS "contentHash",COALESCE(a.original_name,'未命名素材') AS name,a.mime_type AS "mimeType",a.size_bytes AS size,a.created_at AS "updatedAt",'owned'::text AS source,NULL::text AS "entryId",NULL::text AS "boundTitle"
      FROM stored_assets a WHERE a.deleted_at IS NULL AND a.mime_type=ANY(${allowed}::text[]) AND ${ownedScope(userId)}
      UNION ALL SELECT a.id,a.sha256 AS "contentHash",COALESCE(a.original_name,'授权素材') AS name,a.mime_type AS "mimeType",a.size_bytes AS size,g.created_at AS "updatedAt",'granted'::text AS source,e.id AS "entryId",s.metadata->>'title' AS "boundTitle"
      FROM scale_library_use_grants g JOIN scale_library_entries e ON e.id=g.entry_id
      JOIN scale_library_submissions s ON s.id=e.submission_id
      CROSS JOIN LATERAL jsonb_array_elements(s.snapshot->'mediaManifest'->'items') item
      JOIN stored_assets a ON a.id=(item->>'assetId')
      WHERE g.user_id=${userId} AND g.product='SURVEY' AND g.status='ACTIVE' AND e.status='ACTIVE'
      AND a.deleted_at IS NULL AND a.mime_type=ANY(${allowed}::text[])
      AND a.sha256=(item->>'contentHash') AND a.mime_type=(item->>'mimeType')`
    const filter=Prisma.sql`(${input.source}='all' OR source=${input.source}) AND position(lower(${input.keyword}) in lower(name||' '||COALESCE("boundTitle",'')))>0
      AND (${input.kind}='all' OR (${input.kind}='image' AND "mimeType" LIKE 'image/%') OR (${input.kind}='video' AND "mimeType" LIKE 'video/%') OR (${input.kind}='document' AND "mimeType"='application/pdf'))`
    const list=await tx.$queryRaw<Row[]>`WITH r AS (${rows}) SELECT * FROM r WHERE ${filter} ORDER BY "updatedAt" DESC,id,"entryId" NULLS FIRST LIMIT 9 OFFSET ${(input.page-1)*9}`
    const [count]=await tx.$queryRaw<Array<{total:bigint}>>`WITH r AS (${rows}) SELECT count(*) AS total FROM r WHERE ${filter}`
    const manifests=new Map<string,ReturnType<typeof assertLibraryMediaManifest>>()
    for(const row of list){
      if(!row.entryId||manifests.has(row.entryId))continue
      await assertLibraryUseGrantCurrent(tx,{entryId:row.entryId,userId,product:'SURVEY'})
      const {submission}=await loadEntry(tx,row.entryId)
      const manifest=assertLibraryMediaManifest(submission.snapshot.mediaManifest)
      await assertLibraryMediaReady(tx,row.entryId,manifest)
      manifests.set(row.entryId,manifest)
    }
    return {list:list.map(row=>({...row,kind:row.mimeType.startsWith('image/')?'image':row.mimeType.startsWith('video/')?'video':'document',
      ...(row.entryId?{bound:{entryId:row.entryId,title:row.boundTitle,item:manifests.get(row.entryId)!.items.find(item=>item.assetId===row.id)}}:{})})),total:Number(count.total),page:input.page,pageSize:9}
  })
}
export async function ownSurveyMaterial(tx:Tx,userId:string,assetId:string,lock=false){
  await authorizeToolOwner(tx,userId)
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT a.id FROM stored_assets a WHERE a.id=${assetId} AND a.deleted_at IS NULL AND a.mime_type=ANY(${allowed}::text[]) AND ${ownedScope(userId)} ${lock?Prisma.sql`FOR UPDATE OF a`:Prisma.empty}`
  if(!rows.length)throw new SurveyMediaError(404,'素材不存在或无权访问')
  return tx.storedAsset.findUniqueOrThrow({where:{id:assetId}})
}
export async function renameSurveyMaterial(userId:string,assetId:string,name:string){
  return prisma.$transaction(async tx=>{await ownSurveyMaterial(tx,userId,assetId,true);await tx.storedAsset.update({where:{id:assetId},data:{originalName:name}});return {id:assetId,name}})
}
