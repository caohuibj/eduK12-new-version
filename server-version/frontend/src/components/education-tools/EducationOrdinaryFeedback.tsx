import {FormDescription,type FormDescriptionData} from './FormDescription'
import {DeclaredReportContent} from '../../modules/composite/TrainingContentReports'
import type {TrainingContentReport} from '../../modules/composite/types'
import {useCallback} from 'react'
import ScaleUnitReportCard,{type SafeScaleUnitReport} from '../../modules/reporting/ScaleUnitReportCard'
import CognitiveV2ReportCard from '../../modules/cognitive/CognitiveV2ReportCard'
import type {CognitiveV2Report} from '../../modules/cognitive/types'
import SituationalReportCard,{type SituationalReportView} from '../../modules/reporting/SituationalReportCard'
import type {EducationReportApi} from './EducationScalePersonalReport'
export type OrdinaryFeedbackUnit={blockId:string;kind:'SCALE'|'FORM'|'COGNITIVE'|'SJT';title:string;state:'READY'|'WITHHELD'|'COMPLETION_ONLY';formDescription?:FormDescriptionData;nativeScaleUnits?:SafeScaleUnitReport[];nativeCognitiveReport?:CognitiveV2Report;nativeSituationalReport?:SituationalReportView&{limitations?:string[]};declaredReport?:NonNullable<TrainingContentReport['rendered']>;message?:string}
export type OrdinaryFeedbackData={schemaVersion?:number;kind?:string;mode?:string;state?:string;title?:string;units?:OrdinaryFeedbackUnit[]}
/** Only the server's block projection is rendered. No answers, same-key metric
 * merge, guessed overall score or Training image fallback exists here. */
export function EducationOrdinaryFeedback({data,api,executionId,entry}:{data:OrdinaryFeedbackData;api:EducationReportApi;executionId:string;entry:'SCHOOL'|'TEACHER'}){
 const loadImage=useCallback(async(assetId:string)=>{
  const blob=await api<Blob>(`/run-executions/${encodeURIComponent(executionId)}/feedback/images/${encodeURIComponent(assetId)}`,'GET',undefined,{responseType:'blob'})
  if(!(blob instanceof Blob)||!/^image\/(png|jpeg|webp)$/.test(blob.type))throw new Error('报告图片暂不可读取。')
  return blob
 },[api,executionId])
 if(data.schemaVersion!==1||data.kind!=='EDUCATION_FEEDBACK'||data.mode!=='COMPOSITION')return <p>当前反馈格式不可展示，请重新读取。</p>
 if(!['READY','COMPLETION_ONLY'].includes(data.state??''))return <p>问卷反馈尚未开放，请稍后重新读取。</p>
 return <div className={'education-personal-report education-personal-report--'+entry.toLowerCase()}><p>以下按工具展示本次固定版本允许的本人反馈。</p>
  {(Array.isArray(data.units)?data.units:[]).map(unit=><section key={unit.blockId} aria-label={unit.title}><h4>{unit.title}</h4>
   {unit.kind==='FORM'?(unit.state==='READY'&&unit.formDescription?<FormDescription report={unit.formDescription}/>:<p>表单已完成，不计算量表分数。</p>):unit.state!=='READY'?<p>本工具未开放个人反馈。</p>:
    unit.kind==='COGNITIVE'&&unit.nativeCognitiveReport?<CognitiveV2ReportCard report={unit.nativeCognitiveReport}/>:unit.kind==='SJT'&&unit.nativeSituationalReport?<>
     <SituationalReportCard report={unit.nativeSituationalReport}/>{unit.nativeSituationalReport.narrative&&unit.nativeSituationalReport.disclaimer&&<p>{unit.nativeSituationalReport.disclaimer}</p>}
     {!!unit.nativeSituationalReport.limitations?.length&&<ul>{unit.nativeSituationalReport.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul>}
    </>:unit.kind!=='SCALE'?<p>本工具未开放个人反馈。</p>:
    unit.declaredReport?<>{unit.message&&<p>{unit.message}</p>}<DeclaredReportContent report={unit.declaredReport} showMetricKeys={false}/></>:
    (unit.nativeScaleUnits??[]).filter(report=>report?.type==='SCALE'&&report.kind==='scale'&&typeof report.scaleName==='string').map((report,index)=>
     <ScaleUnitReportCard key={unit.blockId+':'+(report.itemId??index)} report={report} loadReportImage={loadImage}/>) }
  </section>)}
 </div>
}
