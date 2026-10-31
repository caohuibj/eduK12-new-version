import { useCallback, useState } from 'react'
import { EducationTaskFeedback, type EducationFeedbackData } from './EducationTaskFeedback'
import type { EducationReportApi } from './EducationScalePersonalReport'

export type EducationAssessmentCompletion={executionId:string;attemptId?:string;title?:string;onClose?:()=>void;mode?:'COMPOSITION'|'PACKAGE_REFERENCE'|'TOOL'}
export function EducationAssessmentFeedback({api,entry,executionId,title='本次测评',onClose,mode}:{
  api:EducationReportApi;entry:'SCHOOL'|'TEACHER'
}&EducationAssessmentCompletion){
  const [closed,setClosed]=useState(false)
  const read=useCallback(()=>api<EducationFeedbackData>(mode==='COMPOSITION'
    ?'/run-executions/'+encodeURIComponent(executionId)+'/feedback':'/assessment-reports/executions/'+encodeURIComponent(executionId)),[api,executionId,entry,mode])
  if(closed)return <button type="button" onClick={()=>setClosed(false)}>重新查看获准反馈</button>
  return <EducationTaskFeedback api={api} entry={entry} executionId={executionId} title={title}
    loadFeedback={read} onClose={onClose??(()=>setClosed(true))}/>
}
