import { useEffect,useState } from 'react'
import type { SurveyImage } from './builder.types'

type Stored={assetId:string;contentHash:string;mimeType:SurveyImage['asset']['mimeType'];originalName:string|null;sizeBytes:number}
type Envelope<T>={code:number|string;message:string;data:T|null}
const cookie=()=>decodeURIComponent(document.cookie.split('; ').find(x=>
  x.startsWith('huisurvey_research_csrf='))?.split('=').slice(1).join('=')||'')
export function SurveyImageField({projectId,image,onChange}:{
  projectId:string;image?:SurveyImage;onChange:(value:SurveyImage|undefined)=>void
}){
  const [library,setLibrary]=useState<Stored[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const base='/api/survey/projects/'+encodeURIComponent(projectId)+'/assets'
  useEffect(()=>{
    let mounted=true
    if(typeof globalThis.fetch!=='function')return()=>{mounted=false}
    void fetch(base,{credentials:'same-origin'}).then(async r=>{
      if(!r.ok)throw new Error('素材库无权访问')
      return r.json() as Promise<Envelope<{assets:Stored[]}>>
    }).then(x=>{if(mounted)setLibrary(x.data?.assets||[])}).catch(e=>{
      if(mounted)setError(e instanceof Error?e.message:'素材库加载失败')
    })
    return()=>{mounted=false}
  },[base])
  const upload=async(file:File)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024||!file.size){
      setError('只允许不超过 2MB 的 JPEG/PNG/WebP 静态图片');return
    }
    setBusy(true);setError('')
    try{
      let csrf=cookie()
      if(!csrf){
        const r=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
        const result=await r.json() as Envelope<{csrfToken:string}>
        csrf=result.data?.csrfToken||''
      }
      if(!csrf)throw new Error('缺少合法安全会话')
      const body=new FormData();body.append('image',file)
      const response=await fetch(base,{method:'POST',credentials:'same-origin',
        headers:{'X-CSRF-Token':csrf},body})
      const output=await response.json() as Envelope<Stored>
      if(!response.ok||!output.data)throw new Error(output.message||'图片上传失败')
      const media=output.data
      setLibrary(xs=>[media,...xs.filter(x=>x.assetId!==media.assetId)])
      onChange({asset:{
        assetId:media.assetId,contentHash:media.contentHash,mimeType:media.mimeType,
      },altText:file.name.replace(/\.[^.]+$/,'').slice(0,300)||'研究图片',
        rightsStatus:'unknown',rightsNote:''})
    }catch(e){setError(e instanceof Error?e.message:'图片上传失败')}
    finally{setBusy(false)}
  }
  return <fieldset className="border rounded-lg p-3 space-y-3">
    <legend className="text-sm font-semibold">授权静态研究图片（可选）</legend>
    <p className="text-xs text-slate-600">仅本项目上传并在冻结发布前校验所有权、文件摘要和版权。不得使用任意外链图片、动态脚本或含隐私的人脸材料。</p>
    {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
    <label className="text-sm block">选择图片上传
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        className="block mt-1 max-w-full"
        onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=''}}/>
    </label>
    <label className="text-sm block">从本项目素材库选择
      <select className="input block w-full" value={image?.asset.assetId||''} disabled={busy}
        onChange={e=>{
          const match=library.find(x=>x.assetId===e.target.value)
          onChange(match?{asset:{
            assetId:match.assetId,contentHash:match.contentHash,mimeType:match.mimeType,
          },altText:match.originalName?.replace(/\.[^.]+$/,'').slice(0,300)||'研究图片',
            rightsStatus:'unknown',rightsNote:''}:undefined)
        }}>
        <option value="">不使用图片</option>
        {library.map(a=><option key={a.assetId} value={a.assetId}>
          {a.originalName||a.assetId} · {Math.round(a.sizeBytes/1024)} KB</option>)}
      </select>
    </label>
    {image&&<div className="space-y-2">
      <img src={base+'/'+encodeURIComponent(image.asset.assetId)+'/preview'}
        alt={image.altText||'研究图片预览'} loading="lazy"
        className="max-w-full max-h-56 object-contain rounded border"/>
      <label className="text-sm block">替代文字（屏幕阅读器可读，必填）
        <input className="input block w-full" value={image.altText} maxLength={300}
          onChange={e=>onChange({...image,altText:e.target.value})}/></label>
      <label className="text-sm block">图片说明（可选）
        <input className="input block w-full" maxLength={1000} value={image.caption||''}
          onChange={e=>onChange({...image,caption:e.target.value})}/></label>
      <label className="text-sm block">图片版权状态
        <select className="input block w-full" value={image.rightsStatus}
          onChange={e=>onChange({...image,rightsStatus:e.target.value as SurveyImage['rightsStatus']})}>
          <option value="unknown">未核实（不可发布）</option>
          <option value="self_authored">项目研究者原创</option>
          <option value="authorized">已取得本次研究展示授权</option>
        </select></label>
      <label className="text-sm block">版权／授权凭据说明（必填）
        <textarea className="input block w-full" maxLength={2000} rows={2}
          value={image.rightsNote}
          onChange={e=>onChange({...image,rightsNote:e.target.value})}/>
      </label>
      <button className="btn-secondary" type="button" onClick={()=>onChange(undefined)}>从此题移除图片引用</button>
    </div>}
  </fieldset>
}
