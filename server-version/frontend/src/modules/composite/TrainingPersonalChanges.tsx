import {useCallback,useEffect,useRef,useState} from 'react'
import apiClient from '../../api/client'
import {publicStudyApi} from '../../api/anonymousStudy'
import {PersonalChangesReport,type PersonalChangesResponse} from '../reporting/PersonalChangesReport'

export function TrainingPersonalChanges({attemptId,actorId,study}:{attemptId:string;actorId?:string;study?:{studyId:string;credential:string}}){
 const [report,setReport]=useState<PersonalChangesResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const epoch=useRef(0)
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{invalidate();setReport(null);setBusy(false);setError('');return invalidate},[attemptId,actorId,study?.studyId,study?.credential,invalidate])
 const load=async()=>{
  const current=++epoch.current;setBusy(true);setError('')
  try{
   const result=study?await publicStudyApi(study.credential).changes(study.studyId,attemptId):await (async()=>{
    const response=await apiClient.post<PersonalChangesResponse>('/composite-assessments/attempts/'+encodeURIComponent(attemptId)+'/changes',{})
    if(response.code!==0||!response.data)throw new Error(response.message||'变化报告暂不可用')
    return response.data
   })()
   if(current===epoch.current)setReport(result)
  }catch(cause){if(current===epoch.current)setError(cause instanceof Error?cause.message:'变化报告暂不可用')}
  finally{if(current===epoch.current)setBusy(false)}
 }
 return <div className="space-y-3 border-t pt-3"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void load()}>{busy?'正在读取变化…':'查看我的变化'}</button>
  {error&&<p role="alert">{error}</p>}{report&&<PersonalChangesReport report={report}/>}</div>
}
