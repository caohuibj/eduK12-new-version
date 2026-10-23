import {useEffect,useState} from 'react'
import type {PublicMaterial} from '../modules/assessment-media/material'
import type {SurveyImageProof} from './SurveyParticipantImage'
import './survey-material-picker.css'

export function SurveyMaterialDisplay({item,proof,purpose='stimulus'}:{item:PublicMaterial;proof?:SurveyImageProof;purpose?:'stimulus'|'report'}){
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const {publicId,attemptId,accessCredential,researchCode}=proof??{}
  const participant=proof!==undefined
  useEffect(()=>{
    if(!open)return
    const controller=new AbortController();let objectUrl='';setUrl('');setError('')
    const endpoint=participant?'/api/public/survey/r/'+encodeURIComponent(publicId??'')+'/attempts/'+encodeURIComponent(attemptId??'')+'/'+(purpose==='report'?'report-materials':'materials')+'/'+encodeURIComponent(item.asset.assetId):'/api/survey/media-library/'+encodeURIComponent(item.asset.assetId)+'/content'
    void fetch(endpoint,{method:participant?'POST':'GET',credentials:participant?'omit':'same-origin',cache:'no-store',signal:controller.signal,
      ...(participant?{headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCredential,...(researchCode?{researchCode}:{})})}:{})
    }).then(async response=>{
      if(!response.ok||response.headers.get('Content-Type')?.split(';')[0]!==item.asset.mimeType)throw new Error('素材已失效、无权读取或类型不一致')
      const blob=await response.blob();const max=item.asset.mimeType.startsWith('video/')?50: item.asset.mimeType==='application/pdf'?20:2
      if(!blob.size||blob.size>max*1024*1024)throw new Error('素材大小不符合限制')
      if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'素材加载失败')})
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[open,item.asset.assetId,item.asset.contentHash,item.asset.mimeType,participant,publicId,attemptId,accessCredential,researchCode,purpose,retry])
  const kind=item.asset.mimeType.startsWith('image/')?'图片':item.asset.mimeType.startsWith('video/')?'视频':'PDF 文档'
  return <figure className="survey-material-display"><figcaption><strong>{item.name}</strong><span>{kind}</span></figcaption>
    <button type="button" className="btn-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起素材':'查看'+kind}</button>
    {open&&(error?<div role="alert">{error}<button type="button" className="btn-secondary" onClick={()=>setRetry(x=>x+1)}>重新加载素材</button></div>:!url?<p role="status">正在读取素材…</p>:item.asset.mimeType.startsWith('image/')?<img src={url} alt={item.name}/>:item.asset.mimeType.startsWith('video/')?<video src={url} controls preload="metadata" aria-label={item.name}/>:<><iframe src={url} title={item.name} sandbox=""/><a href={url} download={item.name}>下载 PDF 文档</a></>)}
    {item.caption&&<p>{item.caption}</p>}
  </figure>
}
