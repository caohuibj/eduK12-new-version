import { useCallback } from 'react'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../../modules/reporting/ScaleUnitReportCard'
import './education-personal-report.css'

export type EducationReportApi = <T>(path:string,method?:string,input?:unknown,
  options?:{responseType?:'blob'})=>Promise<T>

export type EducationScalePersonalReportData = {
  schemaVersion?:number;kind?:string;state?:string;mode?:string;message?:string;
  unitReports?:SafeScaleUnitReport[]
}

/** The route owns authorization and projection. Never derive a report from answers,
 * or use the Training image loader as a fallback in an education account realm. */
export function EducationScalePersonalReport({data,api,executionId,entry}:{
  data:EducationScalePersonalReportData;api:EducationReportApi;
  executionId:string;entry:'SCHOOL'|'TEACHER'
}){
  const loadReportImage=useCallback(async(assetId:string)=>{
    const blob=await api<Blob>(`/library-scale/executions/${encodeURIComponent(executionId)}/report/images/${encodeURIComponent(assetId)}`,
      'GET',undefined,{responseType:'blob'})
    if(!(blob instanceof Blob)||!/^image\/(png|jpeg|webp)$/.test(blob.type))
      throw new Error('报告图片暂不可读取，请重试。')
    return blob
  },[api,executionId])
  const recognized=data.schemaVersion===1&&data.kind==='EDUCATION_SCALE_PERSONAL_REPORT'
  const ready=recognized&&data.state==='READY'&&data.mode==='INDIVIDUAL_SUMMARY'
  const units=ready&&Array.isArray(data.unitReports)?data.unitReports.filter(report=>
    report&&typeof report==='object'&&report.type==='SCALE'&&report.kind==='scale'
      &&typeof report.scaleName==='string'):[]
  return <div className={`education-personal-report education-personal-report--${entry.toLowerCase()}`}>
    {recognized&&typeof data.message==='string'&&data.message&&<p>{data.message}</p>}
    {!ready?<p>当前报告尚未获准显示，不提供个人分数、解释或图片。</p>:
      !units.length?<p>本次测评已完成，当前没有获准展示的逐工具报告内容。</p>:
        units.map((report,index)=><ScaleUnitReportCard key={report.itemId??`${report.scaleId??report.scaleCode}:${index}`}
          report={report} loadReportImage={loadReportImage}/>)}
  </div>
}
