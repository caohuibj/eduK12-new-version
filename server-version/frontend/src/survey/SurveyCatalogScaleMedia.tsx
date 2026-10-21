import {useEffect,useRef,useState} from 'react'
import {AssessmentVideoPlayer} from '../modules/assessment-media/AssessmentVideoPlayer'
import type {AssessmentVideoPresentationV1,AssessmentVideoCapabilitySources} from '../modules/assessment-media/types'
import {SurveyParticipantImage,type SurveyImageProof} from './SurveyParticipantImage'
import type {SurveyPublicImage} from './builder.types'
export type SurveyScaleMedia={images?:SurveyPublicImage[];video?:AssessmentVideoPresentationV1}
export function SurveyCatalogScaleMedia({item,proof,instrumentKey,itemKey,complete=false,onComplete,readOnly=false,onImagesReadyChange}:{
  item:SurveyScaleMedia;proof:SurveyImageProof;instrumentKey:string;itemKey:string;
  complete?:boolean;onComplete?:()=>void;readOnly?:boolean;onImagesReadyChange?:(ready:boolean)=>void
}){
  const [sources,setSources]=useState<AssessmentVideoCapabilitySources|null>(null)
  const [error,setError]=useState(''),[retry,setRetry]=useState(0)
  const loadedImages=useRef<Record<string,boolean>>({})
  const imageIdentity=(image:SurveyPublicImage)=>image.asset.assetId+':'+image.asset.contentHash
  const imageReady=(image:SurveyPublicImage,ready:boolean)=>{
    loadedImages.current[imageIdentity(image)]=ready
    onImagesReadyChange?.((item.images??[]).every(candidate=>loadedImages.current[imageIdentity(candidate)]===true))
  }
  const video=item.video
  useEffect(()=>{
    setSources(null);setError('')
    if(!video)return
    const controller=new AbortController()
    const url='/api/public/survey/r/'+encodeURIComponent(proof.publicId)+'/attempts/'+encodeURIComponent(proof.attemptId)
      +'/scale-media/'+encodeURIComponent(instrumentKey)+'/'+encodeURIComponent(itemKey)+'/video-capabilities'
    void fetch(url,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCredential:proof.accessCredential,
        ...(proof.researchCode?{researchCode:proof.researchCode}:{})})})
      .then(async response=>{const envelope=await response.json();if(!response.ok||envelope.code!==0||!envelope.data)throw new Error(envelope.message||'视频授权不可用');return envelope.data as AssessmentVideoCapabilitySources})
      .then(value=>{if(!controller.signal.aborted)setSources(value)})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'视频读取失败')})
    return()=>controller.abort()
  },[proof.publicId,proof.attemptId,proof.accessCredential,proof.researchCode,instrumentKey,itemKey,video,retry])
  return <div>
    {item.images?.map(image=><SurveyParticipantImage key={imageIdentity(image)} image={image} proof={proof} onReadyChange={ready=>imageReady(image,ready)}/>)}
    {video&&(sources?<AssessmentVideoPlayer presentation={video} sources={sources}
      requiredViewing={!readOnly} viewingComplete={complete} onViewingComplete={onComplete}
      onRetry={()=>setRetry(value=>value+1)}/>:<p role="status">{error||'正在读取已授权视频…'}{error&&<button type="button" onClick={()=>setRetry(value=>value+1)}>重试</button>}</p>)}
  </div>
}
