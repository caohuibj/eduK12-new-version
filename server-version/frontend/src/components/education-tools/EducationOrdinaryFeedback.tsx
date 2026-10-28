import {useCallback} from 'react'
import ScaleUnitReportCard,{type SafeScaleUnitReport} from '../../modules/reporting/ScaleUnitReportCard'
import type {EducationReportApi} from './EducationScalePersonalReport'
export type OrdinaryFeedbackUnit={blockId:string;kind:'SCALE'|'FORM';title:string;state:'READY'|'WITHHELD'|'COMPLETION_ONLY';nativeScaleUnits?:SafeScaleUnitReport[]}
export type OrdinaryFeedbackData={schemaVersion?:number;kind?:string;mode?:string;state?:string;title?:string;units?:OrdinaryFeedbackUnit[]}
/** Only the server's block projection is rendered. No answers, same-key metric
 * merge, guessed overall score or Training image fallback exists here. */
export function EducationOrdinaryFeedback({data,api,executionId}:{data:OrdinaryFeedbackData;api:EducationReportApi;executionId:string}){
 const loadImage=useCallback(async(assetId:string)=>{
  const blob=await api<Blob>(`/run-executions/${encodeURIComponent(executionId)}/feedback/images/${encodeURIComponent(assetId)}`,'GET',undefined,{responseType:'blob'})
  if(!(blob instanceof Blob)||!/^image\/(png|jpeg|webp)$/.test(blob.type))throw new Error('报告图片暂不可读取。')
  return blob
 },[api,executionId])
 if(data.schemaVersion!==1||data.kind!=='EDUCATION_FEEDBACK'||data.mode!=='COMPOSITION')return <p>当前反馈格式不可展示，请重新读取。</p>
 if(!['READY','COMPLETION_ONLY'].includes(data.state??''))return <p>问卷反馈尚未开放，请稍后重新读取。</p>
 return <div className="education-personal-report education-personal-report--teacher"><p>以下按工具展示本次固定版本允许的本人反馈。</p>
  {(Array.isArray(data.units)?data.units:[]).map(unit=><section key={unit.blockId} aria-label={unit.title}><h4>{unit.title}</h4>
   {unit.kind==='FORM'?<p>表单已完成，不计算量表分数。</p>:unit.kind!=='SCALE'||unit.state!=='READY'?<p>本工具未开放个人反馈。</p>:
    (unit.nativeScaleUnits??[]).filter(report=>report?.type==='SCALE'&&report.kind==='scale'&&typeof report.scaleName==='string').map((report,index)=>
     <ScaleUnitReportCard key={unit.blockId+':'+(report.itemId??index)} report={report} loadReportImage={loadImage}/>) }
  </section>)}
 </div>
}
