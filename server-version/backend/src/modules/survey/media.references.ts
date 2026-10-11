import { Prisma } from '@prisma/client'
import { retainAssessmentAssetReferences } from '../assessment-media/assessment-asset'
import { ASSESSMENT_STATIC_IMAGE_MIME_TYPES } from '../assessment-media/assessment-image'
import type { SurveyKind,FormDraft,SjtDraft } from './builder.definition'

type Tx=Prisma.TransactionClient
export const surveyMaxImageBytes=2*1024*1024
export const surveyMimeTypes=[...ASSESSMENT_STATIC_IMAGE_MIME_TYPES]
export class SurveyMediaError extends Error{
  constructor(readonly statusCode:number,message:string){super(message)}
}
const fail=(statusCode:number,message:string):never=>{throw new SurveyMediaError(statusCode,message)}
type ImageIdentity={asset:{assetId:string;contentHash:string;mimeType:string};altText:string;caption?:string;
  rightsStatus:'self_authored'|'authorized'|'unknown';rightsNote:string}
type UnitDef={kind:SurveyKind;definition:unknown}
export const surveyImageRefs=(units:readonly UnitDef[]):ImageIdentity[]=>units.flatMap(({kind,definition})=>{
  if(kind==='FORM'){
    const d=definition as FormDraft
    return (d.pages||[]).flatMap(p=>(p.questions||[]).map(q=>q.image).filter(Boolean)) as ImageIdentity[]
  }
  if(kind==='SJT'){
    const d=definition as SjtDraft
    return d.image?[d.image as ImageIdentity]:[]
  }
  return []
})

export async function assertSurveyMediaOwned(tx:Tx,userId:string,projectId:string,units:readonly UnitDef[]){
  const refs=surveyImageRefs(units)
  const ids=[...new Set(refs.map(r=>r.asset.assetId))]
  if(!ids.length)return []
  if(ids.length>30)fail(400,'单次研究发布最多引用 30 个静态图片')
  const assets=await tx.storedAsset.findMany({where:{id:{in:ids},ownerId:userId,scopeId:projectId,
    accessScope:'PRIVATE',deletedAt:null},select:{
    id:true,mimeType:true,sha256:true,sizeBytes:true,
  }})
  const byId=new Map(assets.map(a=>[a.id,a]))
  for(const image of refs){
    if(!image.altText?.trim())fail(400,'研究图片必须提供可阅读替代文字')
    if(!['self_authored','authorized'].includes(image.rightsStatus)||!image.rightsNote?.trim())
      fail(403,'研究图片必须提供明确的原创或授权依据')
    const a=byId.get(image.asset.assetId)
    if(!a||a.sizeBytes<=0||a.sizeBytes>surveyMaxImageBytes
      ||a.sha256!==image.asset.contentHash||a.mimeType!==image.asset.mimeType
      ||!surveyMimeTypes.includes(a.mimeType as (typeof surveyMimeTypes)[number]))
      fail(403,'研究图片缺少本项目授权或与上传时的文件摘要不一致')
  }
  return refs.map(r=>r.asset)
}
export async function retainSurveyMedia(tx:Tx,userId:string,projectId:string,publicationId:string,
  units:readonly UnitDef[]){
  const refs=await assertSurveyMediaOwned(tx,userId,projectId,units)
  if(!refs.length)return
  await retainAssessmentAssetReferences({
    owner:{entityType:'SurveyResearchPublication',entityId:publicationId,field:'media'},
    references:refs,db:tx,
  })
}

