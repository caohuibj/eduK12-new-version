import {Upload,Image as ImageIcon,FolderOpen,LoaderCircle} from 'lucide-react'
import './survey-image-field.css'
import {surveyAssetBase} from './tool-library-api'
import { useEffect,useId,useRef,useState } from 'react'
import type { SurveyImage } from './builder.types'

type Stored={assetId:string;contentHash:string;mimeType:SurveyImage['asset']['mimeType'];originalName:string|null;sizeBytes:number}
type Envelope<T>={code:number|string;message:string;data:T|null}
const cookie=()=>decodeURIComponent(document.cookie.split('; ').find(x=>
  x.startsWith('huisurvey_research_csrf='))?.split('=').slice(1).join('=')||'')
export function SurveyImageField({projectId,image,onChange,presentationOnly=false}:{
  projectId:string;image?:SurveyImage;presentationOnly?:boolean;onChange:(value:SurveyImage|undefined)=>void
}){
  const [library,setLibrary]=useState<Stored[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [libraryOpen,setLibraryOpen]=useState(false),[libraryLoading,setLibraryLoading]=useState(false)
  const [libraryError,setLibraryError]=useState(''),[uploadStatus,setUploadStatus]=useState('')
  const fileInput=useRef<HTMLInputElement>(null)
  const libraryId=useId(),libraryRequest=useRef<AbortController|null>(null)
  const base=surveyAssetBase(projectId)
  const scopeLabel=projectId.startsWith('tool:')?'工具素材库':'本项目素材库'
  const currentBase=useRef(base),mounted=useRef(true)
  const latestOnChange=useRef(onChange)
  latestOnChange.current=onChange
  currentBase.current=base
  useEffect(()=>{
    mounted.current=true
    setLibrary([]);setLibraryOpen(false);setLibraryLoading(false);setLibraryError('')
    setBusy(false);setError('');setUploadStatus('')
    return()=>{mounted.current=false;libraryRequest.current?.abort()}
  },[base])
  const loadLibrary=async()=>{
    libraryRequest.current?.abort()
    const controller=new AbortController()
    libraryRequest.current=controller
    setLibrary([]);setLibraryError('');setLibraryLoading(true)
    const current=()=>mounted.current&&currentBase.current===base&&!controller.signal.aborted
    try{
      const response=await fetch(base,{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      if(!response.ok)throw new Error('素材库无权访问或暂不可用')
      const result=await response.json() as Envelope<{assets:Stored[]}>
      if(result.code!==0||!result.data)throw new Error(result.message||'素材库加载失败')
      if(current())setLibrary(result.data.assets)
    }catch(e){if(current())setLibraryError(e instanceof Error?e.message:'素材库加载失败')}
    finally{if(current())setLibraryLoading(false)}
  }
  const toggleLibrary=()=>{
    if(libraryOpen){
      libraryRequest.current?.abort()
      setLibraryOpen(false);setLibrary([]);setLibraryError('');setLibraryLoading(false)
    }else{
      setLibraryOpen(true);void loadLibrary()
    }
  }
  const upload=async(file:File)=>{
    setUploadStatus('')
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024||!file.size){
      setError('只允许不超过 2MB 的 JPEG/PNG/WebP 静态图片');return
    }
    setBusy(true);setError('');setUploadStatus('正在上传：'+file.name)
    const current=()=>mounted.current&&currentBase.current===base
    try{
      let csrf=cookie()
      if(!csrf){
        const r=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
        const result=await r.json() as Envelope<{csrfToken:string}>
        csrf=result.data?.csrfToken||''
      }
      if(!csrf)throw new Error('缺少合法安全会话')
      if(!current())return
      const body=new FormData();body.append('image',file)
      const response=await fetch(base,{method:'POST',credentials:'same-origin',
        headers:{'X-CSRF-Token':csrf},body})
      const output=await response.json() as Envelope<Stored>
      if(!response.ok||!output.data)throw new Error(output.message||'图片上传失败')
      if(!current())return
      const media=output.data
      setLibrary(xs=>[media,...xs.filter(x=>x.assetId!==media.assetId)])
      setUploadStatus('已上传：'+file.name)
      latestOnChange.current({asset:{
        assetId:media.assetId,contentHash:media.contentHash,mimeType:media.mimeType,
      },altText:file.name.replace(/\.[^.]+$/,'').slice(0,300)||'研究图片',
        rightsStatus:'unknown',rightsNote:''})
    }catch(e){if(current()){setError(e instanceof Error?e.message:'图片上传失败');setUploadStatus('')}}
    finally{if(current())setBusy(false)}
  }
  return <fieldset className="survey-image-field">
    <legend><ImageIcon size={16} aria-hidden="true"/>研究图片 <small>可选</small></legend>
    <div className="survey-image-actions">
      <input ref={fileInput} type="file" aria-label="选择图片上传" accept="image/png,image/jpeg,image/webp" disabled={busy} hidden
        onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value=''}}/>
      <button type="button" className="btn-primary survey-image-upload" disabled={busy} onClick={()=>fileInput.current?.click()}>
        {busy?<LoaderCircle size={18} className="survey-image-spinner" aria-hidden="true"/>:<Upload size={18} aria-hidden="true"/>}{busy?'正在上传…':image?'更换图片':'上传图片'}
      </button>
      <button type="button" className="btn-secondary survey-image-library-toggle" disabled={busy}
        aria-expanded={libraryOpen} aria-controls={libraryId} onClick={toggleLibrary}><FolderOpen size={17} aria-hidden="true"/>
        {libraryOpen?'收起'+scopeLabel:'打开'+scopeLabel}</button>
    </div>
    <p className="survey-image-file-hint">PNG、JPG、WebP · 单张不超过 2 MB</p>
    {uploadStatus&&<p role="status" className="survey-image-status">{uploadStatus}</p>}
    {error&&<p role="alert" className="survey-image-error">{error}</p>}
    <div id={libraryId} hidden={!libraryOpen} className="survey-image-library space-y-2">{libraryOpen&&<>
    {libraryLoading&&<p role="status" className="text-sm">正在读取{scopeLabel}…</p>}
    {libraryError&&<><p role="alert" className="text-red-700 text-sm">{libraryError}</p>
      <button type="button" className="btn-secondary" disabled={busy||libraryLoading}
        onClick={()=>void loadLibrary()}>重试读取素材库</button></>}
    {!libraryLoading&&!libraryError&&<p className="survey-image-file-hint">{library.length?'可复用本人素材库及其他自建工具中的图片；当前显示最近 40 张。':'没有可选图片。请在素材库上传，或在当前工具中上传图片后重新打开。'}</p>}
    <label className="text-sm block">从{scopeLabel}选择
      <select className="input block w-full" value={image?.asset.assetId||''}
        disabled={busy||libraryLoading||!!libraryError}
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
    </>}</div>
    {image&&<div className="survey-image-details">
      <div className="survey-image-preview"><img src={base+'/'+encodeURIComponent(image.asset.assetId)+'/preview'}
        alt={image.altText||'研究图片预览'} loading="lazy"
        className="max-w-full max-h-56 object-contain rounded border"/></div>
      <div className="survey-image-information">
      <div className="survey-image-control"><label className="text-sm block">替代文字（屏幕阅读器可读，必填）
        <input className="input block w-full" value={image.altText} maxLength={300} aria-describedby={libraryId+'-alt-hint'} placeholder="简要描述图片内容"
          onChange={e=>onChange({...image,altText:e.target.value})}/></label><small id={libraryId+'-alt-hint'}>供屏幕阅读器朗读，通常不显示在题面上。</small></div>
      <div className="survey-image-control"><label className="text-sm block">图片说明（可选）
        <input className="input block w-full" maxLength={1000} value={image.caption||''} aria-describedby={libraryId+'-caption-hint'} placeholder="需要展示给被试的图片说明"
          onChange={e=>onChange({...image,caption:e.target.value})}/></label><small id={libraryId+'-caption-hint'}>显示在图片下方，被试可见。</small></div>
      {!presentationOnly&&<><label className="text-sm block">图片版权状态
        <select className="input block w-full" value={image.rightsStatus}
          onChange={e=>onChange({...image,rightsStatus:e.target.value as SurveyImage['rightsStatus']})}>
          <option value="unknown">未核实（不可发布）</option>
          <option value="self_authored">项目研究者原创</option>
          <option value="authorized">已取得本次研究展示授权</option>
        </select></label>
      <label className="text-sm block survey-image-wide">版权／授权凭据说明（必填）
        <textarea className="input block w-full" maxLength={2000} rows={2} placeholder="说明原创情况，或本次研究展示授权的来源与范围"
          value={image.rightsNote}
          onChange={e=>onChange({...image,rightsNote:e.target.value})}/>
      </label>
      </>}
      </div>{!presentationOnly&&<p className="survey-image-file-hint">版权信息用于发布校验，不展示在被试题面上。</p>}<button className="survey-image-remove" type="button" onClick={()=>onChange(undefined)}>从此题移除图片引用</button>
    </div>}
    <details className="survey-image-guidance"><summary>图片要求与使用说明</summary><p>图片在选用和发布前校验所有权、文件摘要和版权。不得使用任意外链图片、动态脚本或含隐私的人脸材料。</p></details>
  </fieldset>
}
