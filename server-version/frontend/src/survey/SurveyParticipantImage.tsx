import { useEffect,useState } from 'react'
import type { SurveyPublicImage } from './builder.types'

export type SurveyImageProof={
  publicId:string;attemptId:string;accessCredential:string;researchCode?:string
}
/** A binary POST exchanges the person's current bearer proof for frozen
 * bytes without ever putting the secret in URL, query or browser history.
 */
export function SurveyParticipantImage({image,proof,purpose='stimulus'}:{
  image:SurveyPublicImage;proof:SurveyImageProof;purpose?:'stimulus'|'report'
}){
  const [url,setUrl]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    let objectUrl=''
    setUrl('');setError('')
    const endpoint='/api/public/survey/r/'+encodeURIComponent(proof.publicId)
      +'/attempts/'+encodeURIComponent(proof.attemptId)
      +(purpose==='report'?'/report-images/':'/images/')+encodeURIComponent(image.asset.assetId)
    void fetch(endpoint,{
      method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        accessCredential:proof.accessCredential,
        ...(proof.researchCode?{researchCode:proof.researchCode}:{}),
      }),
    }).then(async response=>{
      if(!response.ok)throw new Error('研究图片已失效或无读取权限')
      const mime=response.headers.get('Content-Type')?.split(';')[0]
      if(mime!==image.asset.mimeType||!['image/jpeg','image/png','image/webp'].includes(mime||''))
        throw new Error('图片类型与冻结定义不一致')
      return response.blob()
    }).then(blob=>{
      if(controller.signal.aborted)return
      objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)
    }).catch(e=>{
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:'图片加载失败')
    })
    return()=>{
      controller.abort()
      if(objectUrl)URL.revokeObjectURL(objectUrl)
    }
  },[
    purpose,image.asset.assetId,image.asset.contentHash,image.asset.mimeType,
    proof.publicId,proof.attemptId,proof.accessCredential,proof.researchCode,
  ])
  return <figure className="my-3">
    {url?<img src={url} className="max-w-full max-h-80 object-contain rounded-lg border"
      alt={image.altText} loading="lazy"/>:
      <p className="text-xs text-slate-600" role="status">{error||'正在读取已授权研究图片…'}</p>}
    {image.caption&&<figcaption className="text-xs mt-2">{image.caption}</figcaption>}
  </figure>
}
