import {useEffect,useState} from 'react'
import type {PublicMaterial} from './material'
import './material-picker.css'

export function AssessmentMaterialDisplay({item,load,appearance='survey'}:{item:PublicMaterial;load:(asset:PublicMaterial['asset'],signal:AbortSignal)=>Promise<Response>;appearance?:'survey'|'training'}){
  const {assetId,contentHash,mimeType}=item.asset
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{
    if(!open)return
    const controller=new AbortController();let objectUrl='';setUrl('');setError('')
    void load({assetId,contentHash,mimeType},controller.signal).then(async response=>{
      if(!response.ok||response.headers.get('Content-Type')?.split(';')[0]!==mimeType)throw new Error('素材已失效、无权读取或类型不一致')
      const blob=await response.blob();const max=mimeType.startsWith('video/')?50: mimeType==='application/pdf'?20:2
      if(!blob.size||blob.size>max*1024*1024)throw new Error('素材大小不符合限制')
      if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'素材加载失败')})
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[open,assetId,contentHash,mimeType,load,retry])
  const kind=item.asset.mimeType.startsWith('image/')?'图片':item.asset.mimeType.startsWith('video/')?'视频':'PDF 文档'
  return <figure className="assessment-material-display" data-appearance={appearance}><figcaption><strong>{item.name}</strong><span>{kind}</span></figcaption>
    <button type="button" className="btn-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起素材':'查看'+kind}</button>
    {open&&(error?<div role="alert">{error}<button type="button" className="btn-secondary" onClick={()=>setRetry(x=>x+1)}>重新加载素材</button></div>:!url?<p role="status">正在读取素材…</p>:item.asset.mimeType.startsWith('image/')?<img src={url} alt={item.name}/>:item.asset.mimeType.startsWith('video/')?<video src={url} controls preload="metadata" aria-label={item.name}/>:<><iframe src={url} title={item.name} sandbox=""/><a href={url} download={item.name}>下载 PDF 文档</a></>)}
    {item.caption&&<p>{item.caption}</p>}
  </figure>
}
