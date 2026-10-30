import {useEffect,useRef,useState} from 'react'
import {PersonalChangesReport,type PersonalChangesResponse} from '../modules/reporting/PersonalChangesReport'

export function SurveyPersonalChanges({publicId,attemptId,proof}:{publicId:string;attemptId:string;proof:{accessCredential:string;researchCode?:string}}){
  const [report,setReport]=useState<PersonalChangesResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const epoch=useRef(0)
  useEffect(()=>{epoch.current++;setReport(null);setError('');setBusy(false);return()=>{epoch.current++}},[publicId,attemptId,proof.accessCredential,proof.researchCode])
  const load=async()=>{
    const request=++epoch.current;setBusy(true);setError('')
    try{
      const response=await fetch('/api/public/survey/r/'+encodeURIComponent(publicId)+'/attempts/'+encodeURIComponent(attemptId)+'/changes',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)})
      const result=await response.json() as {code:number;message:string;data:PersonalChangesResponse}
      if(!response.ok||result.code!==0||!result.data)throw new Error(result.message||'暂时无法读取变化报告')
      if(request===epoch.current)setReport(result.data)
    }catch(cause){if(request===epoch.current)setError(cause instanceof Error?cause.message:'暂时无法读取变化报告')}
    finally{if(request===epoch.current)setBusy(false)}
  }
  return <div className="space-y-3 border-t pt-3"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void load()}>{busy?'正在读取变化…':'查看我的变化'}</button>
    {error&&<p role="alert">{error}</p>}{report&&<PersonalChangesReport report={report}/>}</div>
}
