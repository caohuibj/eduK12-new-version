import type {ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import type {AssessmentStaticImageAssetIdentityV1} from '../../modules/assessment-media/types'
import {privateToolBase,privateToolError,type PrivateToolApi} from './privateToolClient'

export function createEducationPrivateImageAdapter({api,entry,organizationId,toolId,actorId}:{api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';organizationId:string;toolId:string;actorId:string}):ImageAuthoringAdapter{
 const base=`${privateToolBase(organizationId)}/${encodeURIComponent(toolId)}/assets`
 return {
  scopeKey:JSON.stringify([entry,actorId,organizationId,toolId]),
  async upload(file){
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>2*1024*1024)throw new Error('请选择不超过 2MB 的 PNG、JPEG 或 WebP 静态图片')
   const body=new FormData();body.append('image',file)
   try{
    const asset=await api<AssessmentStaticImageAssetIdentityV1>(`${base}/images`,'POST',body)
    if(!asset?.assetId||!asset.contentHash||!['image/png','image/jpeg','image/webp'].includes(asset.mimeType))throw new Error('未获得可固定的图片身份，请重新选择')
    return asset
   }catch(cause){throw new Error(privateToolError(cause))}
  },
  async loadPreview(asset){
   const blob=await api<Blob>(`${base}/${encodeURIComponent(asset.assetId)}/content`,'GET',undefined,{responseType:'blob'})
   if(!(blob instanceof Blob)||blob.type!==asset.mimeType||!blob.size||blob.size>2*1024*1024)throw new Error('图片内容暂不可用，请重新读取草稿后重试')
   return blob
  },
 }
}
