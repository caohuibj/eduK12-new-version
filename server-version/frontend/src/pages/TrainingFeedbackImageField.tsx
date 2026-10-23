import apiClient,{ensureCsrfToken,sessionAxios} from '../api/client'
import type {RawScoreFeedbackImage} from '../modules/scale/rawScoreFeedback'
import {AssessmentImageField,AssessmentImagePreview,type ImageAuthoringAdapter} from '../modules/assessment-media/AssessmentImageField'

/** Default Training transport is unchanged. Other entries must inject their own scoped adapter. */
const trainingImageAdapter:ImageAuthoringAdapter={
 scopeKey:'TRAINING',
 async upload(file){
  const csrf=await ensureCsrfToken()
  if(!csrf)throw new Error('无法确认安全会话，请重新登录后上传')
  const body=new FormData();body.append('image',file)
  const response=await sessionAxios.post('/uploads/image',body,{headers:{'X-CSRF-Token':csrf}})
  const asset=response.data.data as RawScoreFeedbackImage['asset']|undefined
  if(response.data.code!==0||!asset?.assetId||!asset.contentHash||!['image/png','image/jpeg','image/webp'].includes(asset.mimeType))throw new Error('未获得可冻结的图片身份，请重新选择')
  return asset
 },
 async loadPreview(asset){
  const result=await apiClient.get<{url:string}>(`/assets/${encodeURIComponent(asset.assetId)}/url`)
  if(result.code!==0||!result.data?.url)throw new Error('图片预览暂不可用')
  return result.data.url
 },
}
export function TrainingFeedbackImageField({images=[],disabled,onChange,onBusy,adapter=trainingImageAdapter}:{
 images?:RawScoreFeedbackImage[];disabled:boolean;onChange:(images:RawScoreFeedbackImage[])=>void;onBusy?:(busy:boolean)=>void;adapter?:ImageAuthoringAdapter
}){return <AssessmentImageField adapter={adapter} images={images} disabled={disabled} onChange={onChange} onBusy={onBusy} allowCaption={adapter!==trainingImageAdapter} description={adapter===trainingImageAdapter?undefined:'图片仅供当前工具作者使用，随固定私有版本保留；不会公开或自动进入公共媒体库。'}/>}
export function TrainingFeedbackImagePreview({image,adapter=trainingImageAdapter}:{image:RawScoreFeedbackImage;adapter?:ImageAuthoringAdapter}){
 return <AssessmentImagePreview image={image} adapter={adapter}/>
}
