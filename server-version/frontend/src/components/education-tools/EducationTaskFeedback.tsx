import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EducationScalePersonalReport, type EducationReportApi, type EducationScalePersonalReportData } from './EducationScalePersonalReport'
import { EducationAssessmentReport } from './EducationAssessmentReport'
import {EducationOrdinaryFeedback,type OrdinaryFeedbackData} from './EducationOrdinaryFeedback'

export type EducationFeedbackData = EducationScalePersonalReportData & OrdinaryFeedbackData & { releaseAt?:string|null }
export type EducationTaskFeedbackProps = {
  entry:'SCHOOL'|'TEACHER';executionId:string;title:string;api:EducationReportApi
  loadFeedback:()=>Promise<EducationFeedbackData>;onClose:()=>void
  renderLegacy?:(data:EducationFeedbackData)=>ReactNode
}

/** Read-only feedback lifecycle. A completed FINAL stays completed even if the
 * report is pending, withdrawn or unreachable. No polling or authority cache. */
export function EducationTaskFeedback({entry,executionId,title,api,loadFeedback,onClose,renderLegacy}:EducationTaskFeedbackProps){
  const scope=useMemo(()=>({api,executionId,loadFeedback}),[api,executionId,loadFeedback])
  const current=useRef<typeof scope|null>(scope)
  current.current=scope
  const request=useRef<{scope:typeof scope;promise:Promise<EducationFeedbackData>}|null>(null)
  const [result,setResult]=useState<{scope:typeof scope;data?:EducationFeedbackData;error?:string;pending:boolean}|null>(null)
  const heading=useRef<HTMLHeadingElement>(null)
  const read=useCallback((fresh=false)=>{
    if(fresh||request.current?.scope!==scope){
      // Schedule through a promise so a synchronous transport error has the same
      // completion semantics. StrictMode reattachment reuses this one request.
      request.current={scope,promise:Promise.resolve().then(loadFeedback)}
    }
    const pending=request.current!
    setResult({scope,pending:true})
    void pending.promise.then(data=>{
      if(current.current===scope&&request.current===pending)setResult({scope,data,pending:false})
    },()=>{
      if(current.current===scope&&request.current===pending)setResult({scope,error:'反馈暂时无法读取。作答已完成，请稍后重新读取。',pending:false})
    })
  },[scope,loadFeedback])
  useEffect(()=>{
    current.current=scope;read()
    heading.current?.focus({preventScroll:true})
    heading.current?.scrollIntoView?.({block:'start'})
    return()=>{if(current.current===scope)current.current=null}
  },[scope,read])
  const close=()=>{current.current=null;request.current=null;onClose()}
  const visible=result?.scope===scope?result:null,data=visible?.data
  const ready=data?.state==='READY'
  const recognized=data?.kind==='EDUCATION_SCALE_PERSONAL_REPORT'||data?.kind==='EDUCATION_ASSESSMENT_PERSONAL_REPORT'||data?.kind==='EDUCATION_FEEDBACK'
  return <section className="education-task-feedback" role="region" aria-label="获准的个人测评反馈" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close()}}}>
    <h3 ref={heading} tabIndex={-1}>{title} · {entry==='SCHOOL'?'我的反馈':'本人反馈'}</h3>
    <p role="status">本次作答已完成，正式提交已确认。</p>
    {(!visible||visible.pending)&&<p role="status">正在读取获准反馈…</p>}
    {visible?.error&&<p role="alert">{visible.error}</p>}
    {data&&<>
      {data.state==='PENDING'&&<p role="status">报告正在生成，请稍后重新读取。无需再次交卷。</p>}
      {data.state==='WITHHELD'&&<p>当前反馈尚未获准显示，或暂未达到开放时间与披露条件。</p>}
      {data.state==='COMPLETED'&&<p>当前测评仅允许展示完成状态，不提供分数或诊断。</p>}
      {data.kind==='EDUCATION_FEEDBACK'?<EducationOrdinaryFeedback entry={entry} data={data} api={api} executionId={executionId}/>:
        data.kind==='EDUCATION_ASSESSMENT_PERSONAL_REPORT'?<EducationAssessmentReport data={data}/>:
        data.kind==='EDUCATION_SCALE_PERSONAL_REPORT'?<EducationScalePersonalReport data={data} api={api} executionId={executionId} entry={entry}/>:
        renderLegacy?renderLegacy(data):ready?<p>结果已经生成，但针对学生的逐工具解释尚未完成科学与适龄内容审核，因此这里不会直接展示指标代码、分数或诊断推论。</p>:null}
      {!recognized&&typeof data.message==='string'&&<p>{data.message}</p>}
    </>}
    <div className="education-feedback-actions">
      <button type="button" disabled={!visible||visible.pending} onClick={()=>read(true)}>{visible?.error?'重试读取反馈':'重新读取反馈'}</button>
      <button type="button" onClick={close}>{entry==='SCHOOL'?'关闭我的反馈':'关闭本人反馈'}</button>
    </div>
  </section>
}
