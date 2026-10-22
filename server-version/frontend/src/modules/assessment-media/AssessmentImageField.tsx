import {useEffect,useRef,useState} from 'react'
import type {AssessmentStaticImageAssetIdentityV1,AssessmentImagePresentationItem} from './types'
export type OrderedAuthoringImage=AssessmentImagePresentationItem & {order:number}
export interface ImageAuthoringAdapter {
 scopeKey:string
 upload:(file:File)=>Promise<AssessmentStaticImageAssetIdentityV1>
 loadPreview:(asset:AssessmentStaticImageAssetIdentityV1)=>Promise<string|Blob>
}
export function AssessmentImageField({adapter,images=[],disabled,onChange,onBusy,legend='反馈图片（可选）',uploadLabel='上传反馈图片',description='仅上传有权使用的静态图片；保存文件身份，不接受外链。图片随发布版本固定。',maxImages=Infinity,allowCaption=false}:{
 adapter:ImageAuthoringAdapter;images?:OrderedAuthoringImage[];disabled:boolean;onChange:(images:OrderedAuthoringImage[])=>void;onBusy?:(busy:boolean)=>void;
 legend?:string;uploadLabel?:string;description?:string;maxImages?:number;allowCaption?:boolean
}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const mounted=useRef(true),generation=useRef(0),pending=useRef(false)
 const latest=useRef({disabled,onChange,images,scopeKey:adapter.scopeKey})
 latest.current={disabled,onChange,images,scopeKey:adapter.scopeKey}
 useEffect(()=>{mounted.current=true;pending.current=false;setBusy(false);setError('');return()=>{mounted.current=false;generation.current+=1}},[adapter.scopeKey])
 const upload=async(file:File)=>{
  if(disabled||pending.current||images.length>=maxImages)return
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>2*1024*1024){setError('请选择不超过 2MB 的 PNG、JPEG 或 WebP 静态图片');return}
  pending.current=true;setBusy(true);setError('');onBusy?.(true)
  const version=generation.current,scope=adapter.scopeKey
  const current=()=>mounted.current&&version===generation.current&&latest.current.scopeKey===scope
  try{
   const asset=await adapter.upload(file)
   if(current()&&!latest.current.disabled)latest.current.onChange([...latest.current.images,{
    asset:{assetId:asset.assetId,contentHash:asset.contentHash,mimeType:asset.mimeType},
    altText:file.name.replace(/\.[^.]+$/,'')||'反馈图片',order:Math.max(-1,...latest.current.images.map(image=>image.order))+1,
   }])
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'图片上传失败，请重试')}
  finally{onBusy?.(false);if(current()){pending.current=false;setBusy(false)}}
 }
 return <fieldset className="scale-feedback-images" disabled={disabled||busy}>
  <legend>{legend}</legend><p>{description}</p>
  {images.map((image,index)=><div className="scale-feedback-image" key={`${image.asset.assetId}-${index}`}>
   <AssessmentImagePreview adapter={adapter} image={image}/>
   <label>图片说明<input className="input" value={image.altText} onChange={event=>onChange(images.map((entry,i)=>i===index?{...entry,altText:event.target.value}:entry))}/></label>
   {allowCaption&&<label>图片标题（可选）<input className="input" value={image.caption??''} onChange={event=>onChange(images.map((entry,i)=>{if(i!==index)return entry;const next={...entry};if(event.target.value)next.caption=event.target.value;else delete next.caption;return next}))}/></label>}
   <button type="button" className="hui-button hui-button--secondary" onClick={()=>onChange(images.filter((_,i)=>i!==index).map((entry,order)=>({...entry,order})))}>移除图片</button>
  </div>)}
  <label className="scale-feedback-upload">{busy?'正在上传…':uploadLabel}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={images.length>=maxImages} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file)}}/></label>
  {images.length>=maxImages&&<p>此处最多选择 {maxImages} 张图片，请先移除现有图片再更换。</p>}
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}
export function AssessmentImagePreview({adapter,image}:{adapter:ImageAuthoringAdapter;image:AssessmentImagePresentationItem}){
 const [state,setState]=useState<{key:string;url:string|null}>({key:'',url:null})
 const {assetId,contentHash,mimeType}=image.asset
 const key=JSON.stringify([adapter.scopeKey,assetId,contentHash,mimeType])
 useEffect(()=>{
  let active=true,objectUrl:string|undefined
  setState({key,url:null})
  void adapter.loadPreview({assetId,contentHash,mimeType}).then(value=>{
   if(!active)return
   const url=typeof value==='string'?value:(objectUrl=URL.createObjectURL(value))
   setState({key,url})
  }).catch(()=>{/* Keep the immutable image reference if preview delivery is unavailable. */})
  return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[adapter,key,assetId,contentHash,mimeType])
 return state.key===key&&state.url?<img src={state.url} alt={image.altText} className="scale-feedback-thumbnail"/>:<span>图片已选择：{image.altText}</span>
}
