import {useCallback} from 'react'
import {AssessmentMaterialDisplay} from '../modules/assessment-media/AssessmentMaterialDisplay'
import type {PublicMaterial} from '../modules/assessment-media/material'
import type {SurveyImageProof} from './SurveyParticipantImage'
export function SurveyMaterialDisplay({item,proof,purpose='stimulus'}:{item:PublicMaterial;proof?:SurveyImageProof;purpose?:'stimulus'|'report'}){
  const {publicId,attemptId,accessCredential,researchCode}=proof??{}
  const participant=proof!==undefined
  const load=useCallback((asset:PublicMaterial['asset'],signal:AbortSignal)=>{
    const endpoint=participant?'/api/public/survey/r/'+encodeURIComponent(publicId??'')+'/attempts/'+encodeURIComponent(attemptId??'')+'/'+(purpose==='report'?'report-materials':'materials')+'/'+encodeURIComponent(asset.assetId):'/api/survey/media-library/'+encodeURIComponent(asset.assetId)+'/content'
    return fetch(endpoint,{method:participant?'POST':'GET',credentials:participant?'omit':'same-origin',cache:'no-store',signal,...(participant?{headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCredential,...(researchCode?{researchCode}:{})})}:{})})
  },[participant,publicId,attemptId,accessCredential,researchCode,purpose])
  return <AssessmentMaterialDisplay item={item} load={load}/>
}
