import { useEffect, useRef, useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

type SchoolTask={
  id:string;activityId:string;activityTitle:string
  kind:'ASSIGNMENT'|'READING'|'CHECKIN'|'MEASUREMENT'
  title:string;status:'PENDING'|'COMPLETED'|'EXPIRED'|'IN_PROGRESS'|'UNAVAILABLE'
  deadline:string|null;href:string|null
  consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
}
type TaskPage={list:SchoolTask[];total:number;hasMore:boolean;truncated:boolean;page:number}
type StudentFinalFeedback={mode:string;state:'WITHHELD'|'COMPLETED'|'READY';message?:string}
type TaskDetails={
  id:string;title:string;description?:string|null;content?:string|null
  mySubmission?:{content?:string|null;status:string}|null
}
const captions:Record<SchoolTask['status'],string>={
  PENDING:'待完成',COMPLETED:'已完成',EXPIRED:'已截止',
  IN_PROGRESS:'进行中',UNAVAILABLE:'当前不可使用',
}
const kinds:Record<SchoolTask['kind'],string>={
  ASSIGNMENT:'活动练习',READING:'阅读材料',CHECKIN:'活动记录',MEASUREMENT:'正式测评',
}

export function SchoolStudentTasks({api}: {api:SchoolApi}) {
  const [page,setPage]=useState(1)
  const [items,setItems]=useState<TaskPage|null>(null)
  const [selected,setSelected]=useState<SchoolTask|null>(null)
  const [details,setDetails]=useState<TaskDetails|null>(null)
  const [answer,setAnswer]=useState('')
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [execution,setExecution]=useState<CampusExecutionRef|null>(null)
  const [studentReference,setStudentReference]=useState<string|null>(null)
  const [feedback,setFeedback]=useState<{executionId:string;title:string;data:StudentFinalFeedback}|null>(null)
  const feedbackEpoch=useRef(0)
  const load=async(targetPage=page)=>{
    feedbackEpoch.current+=1;setFeedback(null)
    const result=await api<TaskPage>('/my/activity-tasks?page='+targetPage+'&pageSize=25')
    setItems(result);setPage(targetPage)
  }
  useEffect(()=>{
    let active=true
    void api<TaskPage>('/my/activity-tasks?page=1&pageSize=25')
      .then(result=>{if(active)setItems(result)})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:'活动待办暂不可用')})
    return ()=>{active=false}
  },[api])
  useEffect(()=>{
    let live=true
    void api<{reference:string}>('/my/student-reference')
      .then(data=>{if(live)setStudentReference(data.reference)})
      .catch(()=>{if(live)setStudentReference(null)})
    return ()=>{live=false}
  },[api])
  const showTask=async(task:SchoolTask)=>{
    if(!['READING','ASSIGNMENT','CHECKIN'].includes(task.kind))return
    setBusy(true);setError('');setNotice('')
    try{
      const segment=task.kind==='CHECKIN'?'checkins':'assignments'
      const d=await api<TaskDetails>(`/activities/${task.activityId}/${segment}/${task.id}`)
      setSelected(task);setDetails(d);setAnswer(d.mySubmission?.content??'')
    }catch(err){setError(err instanceof Error?err.message:'活动材料不可访问')}
    finally{setBusy(false)}
  }
  const showFeedback=async(task:SchoolTask)=>{
    const token=++feedbackEpoch.current
    setFeedback(null);setError('')
    try{
      const data=await api<StudentFinalFeedback>('/reports/student/executions/'+task.id)
      if(token===feedbackEpoch.current)setFeedback({executionId:task.id,title:task.title,data})
    }catch(err){
      if(token===feedbackEpoch.current)setError(err instanceof Error?err.message:'该测评目前没有允许查看的个人反馈')
    }
  }
  const submit=async()=>{
    if(!selected || !details)return
    setBusy(true);setError('');setNotice('')
    try{
      const segment=selected.kind==='CHECKIN'?'checkins':'assignments'
      await api(`/activities/${selected.activityId}/${segment}/${selected.id}/submit`,'POST',{
        content:selected.kind==='READING'?(answer.trim()||'已阅读'):answer,
      })
      setSelected(null);setDetails(null);setAnswer('')
      await load(page);setNotice('提交成功。感谢你完成今天的校园活动。')
    }catch(err){setError(err instanceof Error?err.message:'提交失败，请核实活动是否仍开放')}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>我的校园活动</h2>
    <p>这里只显示学校已开放、并且当前允许你参加的活动。
      心理测评结果需经过独立授权与审核，完成任务不会自动向教师或家长公开个人心理报告。</p>
    {studentReference&&<p>我的校园观察编号：<strong>{studentReference}</strong>。仅在需要老师核对正式观察任务时提供，不要分享登录密码。</p>}
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    <button disabled={busy} onClick={()=>void load(page).catch(err=>
      setError(err instanceof Error?err.message:'刷新失败'))}>刷新待办</button>
    {!items?<p>正在读取校园活动…</p>:
      items.list.length===0?<p>目前没有开放给你的活动。你不需要采取任何操作。</p>:
      <div className="hs-task-list">
        {items.list.map(task=><article className="hs-task-card" key={task.kind+task.id}>
          <small>{task.activityTitle} · {kinds[task.kind]}</small>
          <h3>{task.title}</h3>
          <p>状态：{captions[task.status]}{task.deadline?
            ' · 截止 '+new Date(task.deadline).toLocaleDateString('zh-CN'):''}</p>
          {task.kind==='MEASUREMENT'?
              task.href&&['PENDING','IN_PROGRESS'].includes(task.status)?
                <button disabled={busy} onClick={()=>{
                  const parts=task.href!.match(/^\/organizations\/([^/]+)\/activities\/([^/]+)\/runs\/([^/]+)\/executions\/([^/]+)$/)
                  if(!parts){setError('正式测评路径无效，请刷新后重试');return}
                  setExecution({organizationId:parts[1],courseId:parts[2],
                    runId:parts[3],executionId:parts[4],
                    consentRequired:task.consentRequired,
                    consentPurpose:task.consentPurpose,
                    consentVisibility:task.consentVisibility})
                }}>开始／继续官方测评</button>:
              task.status==='COMPLETED'?
                <button disabled={busy} onClick={()=>void showFeedback(task)}>查看我的测评反馈</button>:
                <p>测评目前不可作答。符合授权与科学规则的反馈才可查看。</p>:
            task.href&&task.status!=='EXPIRED'&&<button disabled={busy}
              onClick={()=>void showTask(task)}>查看{task.kind==='READING'?'阅读材料':'活动任务'}</button>}
        </article>)}
      </div>}
    {items&&<div className="hs-actions">
      <button disabled={page<=1||busy} onClick={()=>void load(page-1)}>上一页</button>
      <span>第 {page} 页 · 共 {items.total} 个任务</span>
      <button disabled={!items.hasMore||busy} onClick={()=>void load(page+1)}>下一页</button>
      {items.truncated&&<span>部分历史任务较多，请联系学校管理员。</span>}
    </div>}
    {feedback&&<div className="hs-task-detail" role="region" aria-label="获准的个人测评反馈">
      <h3>{feedback.title} · 我的反馈</h3>
      {feedback.data.state==='COMPLETED'&&
        <p>你的作答已完成。当前测评仅允许展示完成状态，不提供分数或诊断。</p>}
      {feedback.data.state==='WITHHELD'&&
        <p>当前反馈暂不适合公开，或尚未达到科学与隐私披露条件。如有疑问，可联系学校心理教师。</p>}
      {feedback.data.state==='READY'&&
        <p>结果已经生成，但针对学生的逐工具解释尚未完成科学与适龄内容审核，因此这里不会直接展示指标代码、分数或诊断推论。</p>}
      {feedback.data.message&&<p className="hs-multiline">{feedback.data.message}</p>}
      <button onClick={()=>{feedbackEpoch.current+=1;setFeedback(null)}}>关闭我的反馈</button>
    </div>}
    {execution&&<SchoolCompositeRunner api={api} execution={execution}
      onExit={()=>setExecution(null)}
      onFinished={()=>{setExecution(null);void load(page)}}/>}
    {selected&&details&&<div className="hs-task-detail">
      <h3>{details.title}</h3>
      {details.description&&<p>{details.description}</p>}
      {details.content&&<p className="hs-multiline">{details.content}</p>}
      <label className="hs-field"><span>{selected.kind==='READING'?'阅读感受（选填）':'你的回答'}</span>
        <textarea rows={5} value={answer} onChange={event=>setAnswer(event.target.value)}/></label>
      <div className="hs-actions"><button disabled={busy} onClick={()=>{setDetails(null);setSelected(null)}}>返回活动</button>
        <button className="hs-primary" disabled={busy||selected.status==='COMPLETED'}
          onClick={()=>void submit()}>{selected.kind==='READING'?'确认已阅读':'提交活动记录'}</button></div>
    </div>}
  </section>
}
