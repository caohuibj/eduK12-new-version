import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CalendarCheck2, ClipboardList, FileText, RefreshCw, ArrowLeft, Clock3 } from 'lucide-react'
import { EducationScalePersonalReport, type EducationScalePersonalReportData } from '../components/education-tools/EducationScalePersonalReport'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText,schoolDeadline} from './school-collection'
import {workspaceHref} from './school-navigation'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

export type SchoolTask={
  id:string;activityId:string;activityTitle:string
  kind:'ASSIGNMENT'|'READING'|'CHECKIN'|'MEASUREMENT'
  title:string;status:'PENDING'|'COMPLETED'|'EXPIRED'|'IN_PROGRESS'|'UNAVAILABLE'
  deadline:string|null;href:string|null;resourceFamily?:string
  canResumeExisting?:boolean
  consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
}
export type TaskPage={list:SchoolTask[];total:number;hasMore:boolean;truncated:boolean;page:number}
type StudentFinalFeedback=EducationScalePersonalReportData
type TaskDetails={
  id:string;title:string;description?:string|null;content?:string|null
  mySubmission?:{content?:string|null;status:string}|null
}
const captions:Record<SchoolTask['status'],string>={
  PENDING:'待完成',COMPLETED:'已完成',EXPIRED:'已截止',
  IN_PROGRESS:'进行中',UNAVAILABLE:'当前不可使用',
}
const taskIcons={ASSIGNMENT:ClipboardList,READING:BookOpen,CHECKIN:CalendarCheck2,MEASUREMENT:FileText}
const kinds:Record<SchoolTask['kind'],string>={
  ASSIGNMENT:'活动练习',READING:'阅读材料',CHECKIN:'活动记录',MEASUREMENT:'正式测评',
}

export function SchoolStudentTasks({api,activityId}: {api:SchoolApi;activityId?:string}) {
  const [query,setQuery]=useState(''),[sort,setSort]=useState('recommended'),[view,setView]=useState<SchoolCollectionView>('list')
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
  const [loading,setLoading]=useState(false)
  const [listError,setListError]=useState('')
  const [retryPage,setRetryPage]=useState(1)
  const scope=useMemo(()=>({pending:false}),[api,activityId])
  const currentScope=useRef<typeof scope|null>(scope)
  currentScope.current=scope
  const detailRef=useRef<HTMLDivElement>(null)
  const inboxTitle=useRef<HTMLHeadingElement>(null),wasDetailOpen=useRef(false)
  useEffect(()=>{
    if(selected&&details){detailRef.current?.focus({preventScroll:true});(detailRef.current?.parentElement?.querySelector('.hs-student-task-navigation')??detailRef.current)?.scrollIntoView?.({block:'start'})}
    else if(wasDetailOpen.current){inboxTitle.current?.focus({preventScroll:true});inboxTitle.current?.scrollIntoView?.({block:'start'})}
    wasDetailOpen.current=Boolean(selected&&details)
  },[selected,details])
  const load=useCallback(async(targetPage:number)=>{
    if(currentScope.current!==scope||scope.pending)return
    scope.pending=true;setLoading(true);setListError('');setRetryPage(targetPage)
    try{
      const result=await api<TaskPage>('/my/activity-tasks?page='+targetPage+'&pageSize=25'+(activityId?'&activityId='+encodeURIComponent(activityId):''))
      if(currentScope.current===scope){setItems(result);setPage(targetPage)}
    }catch(err){
      if(currentScope.current===scope)setListError(err instanceof Error?err.message:'活动待办暂不可用')
    }finally{
      scope.pending=false
      if(currentScope.current===scope)setLoading(false)
    }
  },[api,scope,activityId])
  useEffect(()=>{
    currentScope.current=scope
    feedbackEpoch.current+=1;setFeedback(null);setItems(null);setPage(1)
    setSelected(null);setDetails(null);setAnswer('');setExecution(null);setError('');setNotice('');setQuery('');setSort('recommended')
    setStudentReference(null);setBusy(false)
    void load(1)
    return ()=>{currentScope.current=null;feedbackEpoch.current+=1}
  },[load,scope])
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
      if(currentScope.current!==scope)return
      setSelected(task);setDetails(d);setAnswer(d.mySubmission?.content??'')
    }catch(err){if(currentScope.current===scope)setError(err instanceof Error?err.message:'活动材料不可访问')}
    finally{if(currentScope.current===scope)setBusy(false)}
  }
  const showFeedback=async(task:SchoolTask)=>{
    const token=++feedbackEpoch.current
    setFeedback(null);setError('')
    try{
      const data=await api<StudentFinalFeedback>('/reports/student/executions/'+task.id)
      if(currentScope.current===scope&&token===feedbackEpoch.current)setFeedback({executionId:task.id,title:task.title,data})
    }catch(err){
      if(currentScope.current===scope&&token===feedbackEpoch.current)setError(err instanceof Error?err.message:'该测评目前没有允许查看的个人反馈')
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
  const partial=Boolean(items&&(items.total>items.list.length||items.hasMore||items.truncated))
  const visibleTasks=(items?.list??[]).filter(task=>schoolSearchText(task.title+' '+task.activityTitle).includes(schoolSearchText(query))).slice().sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN',{numeric:true}):sort==='deadline'?(schoolDeadline(a.deadline)-schoolDeadline(b.deadline))||0:0)
  return <section className={'hs-panel hs-task-view hs-student-tasks'+(!selected&&!execution&&!feedback?' hs-student-task-index':'')}>
    <div className={selected?'hs-student-task-navigation':undefined}>
    {selected&&<button type="button" className="hs-student-detail-back" disabled={busy} onClick={()=>{setDetails(null);setSelected(null)}}><ArrowLeft size={17} aria-hidden="true"/>返回活动</button>}
    <details className="hs-task-inbox" open={!(selected||execution||feedback)}>
    <summary hidden={!(selected||execution||feedback)}>查看任务列表</summary>
    <div className="hs-student-task-trail"><a href={workspaceHref('overview')}><ArrowLeft size={16} aria-hidden="true"/>返回概览</a>{activityId&&<a href={workspaceHref('tasks')}>查看全部任务</a>}</div>
    <header className="hs-student-task-heading"><div><h1 ref={inboxTitle} tabIndex={-1}>我的校园任务</h1><p>{activityId&&items?.list[0]?.activityTitle?items.list[0].activityTitle:'学校已开放的活动任务'}</p></div>
    {items?<SchoolCollectionControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} view={view} onView={setView} searchLabel={partial?'检索本页任务':'检索任务'} placeholder="搜索任务名称或活动名称" sorts={[{value:'recommended',label:'默认顺序'},{value:'deadline',label:'截止时间优先'},{value:'title',label:'任务名称 A–Z'}]} actions={<button type="button" disabled={busy||loading} onClick={()=>void load(listError?retryPage:page)} aria-label={loading?'正在读取…':listError?'重试读取待办':'刷新待办'} title="刷新待办"><RefreshCw size={18} aria-hidden="true"/></button>}/>:<button type="button" disabled={busy||loading} onClick={()=>void load(listError?retryPage:page)} aria-label={loading?'正在读取…':listError?'重试读取待办':'刷新待办'} title="刷新待办"><RefreshCw size={18} aria-hidden="true"/></button>}</header>

    {!selected&&error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {listError&&<p className="hs-alert" role="alert">{listError}</p>}
    <div className="hs-student-task-info">
    {items&&
    <p className="hs-collection-summary" role="status">{query?`检索到 ${visibleTasks.length} 项 · “${query}”`:`${items.total} 项任务`}{partial?' · 检索和排序仅作用于本页已加载的任务':''}</p>}
    <details className="hs-student-task-help"><summary>任务与隐私说明{studentReference?' · 校园观察编号':''}</summary><p>这里只显示学校已开放、并且当前允许你参加的活动。心理测评结果需经过独立授权与审核，完成任务不会自动向教师或家长公开个人心理报告。</p>
    {studentReference&&<p>我的校园观察编号：<strong>{studentReference}</strong>。仅在需要老师核对正式观察任务时提供，不要分享登录密码。</p>}</details>
    </div>
    {loading&&<p role="status">正在读取校园活动…</p>}
    {!items?null:
      items.list.length===0?!loading&&!listError&&<p>目前没有开放给你的活动。你不需要采取任何操作。</p>:
      <div className={"hs-task-list"+(view==='cards'?' hs-task-list--cards':'')}>
        {visibleTasks.map(task=>{const Icon=taskIcons[task.kind];return <article className="hs-task-card" data-task-id={task.id} key={task.kind+task.id}>
          <span className="hs-student-task-icon" aria-hidden="true"><Icon size={21}/></span>
          <div className="hs-student-task-copy">{!activityId&&<small>{task.activityTitle}</small>}<h3>{task.title}</h3>
          <div className="hs-student-task-meta"><span>{kinds[task.kind]}</span><span className="hs-student-task-state" data-status={task.status} aria-label={'状态：'+captions[task.status]}>{captions[task.status]}</span>
          {task.deadline&&<span>截止 {new Date(task.deadline).toLocaleDateString('zh-CN')}</span>}</div></div>
          <div className="hs-student-task-action">
          {task.kind==='MEASUREMENT'?
              task.href&&['PENDING','IN_PROGRESS'].includes(task.status)?
                <button disabled={busy} onClick={()=>{
                  const parts=task.href!.match(/^\/organizations\/([^/]+)\/activities\/([^/]+)\/runs\/([^/]+)\/executions\/([^/]+)$/)
                  if(!parts){setError('正式测评路径无效，请刷新后重试');return}
                  setExecution({organizationId:parts[1],courseId:parts[2],
                    runId:parts[3],executionId:parts[4],
                    resumeExisting:task.canResumeExisting===true,consentRequired:task.consentRequired,
                    consentPurpose:task.consentPurpose,
                    consentVisibility:task.consentVisibility})
                }}>开始／继续官方测评</button>:
              task.status==='COMPLETED'?task.resourceFamily==='FORM'?
                <p>本次表单已正式提交。表单只记录作答，不计算量表分数，也不新增个人报告读取权。</p>:
                <button disabled={busy} onClick={()=>void showFeedback(task)}>查看我的测评反馈</button>:
                <p>测评目前不可作答。符合授权与科学规则的反馈才可查看。</p>:
            task.href&&task.status!=='EXPIRED'&&<button disabled={busy}
              onClick={()=>void showTask(task)}>查看{task.kind==='READING'?'阅读材料':'活动任务'}</button>}
          </div>
        </article>})}
      </div>}
    {items&&items.list.length>0&&visibleTasks.length===0&&<p className="hs-collection-empty">{partial?'本页没有匹配的任务。可清空检索或切换其他页面。':'没有匹配的任务，请尝试其他关键词。'}</p>}
    {items&&(page>1||items.hasMore)&&<div className="hs-actions hs-student-task-pagination">
      <button disabled={page<=1||busy||loading} onClick={()=>void load(page-1)}>上一页</button>
      <span>第 {page} 页 · 共 {items.total} 个任务</span>
      <button disabled={!items.hasMore||busy||loading} onClick={()=>void load(page+1)}>下一页</button>

    </div>}
    {items?.truncated&&<p className="hs-collection-summary">部分历史任务较多，请联系学校管理员。</p>}
    </details>
    </div>
    {!selected&&(execution||feedback)&&error&&<p className="hs-alert" role="alert">{error}</p>}
    {feedback&&<div className="hs-task-detail" role="region" aria-label="获准的个人测评反馈">
      <h3>{feedback.title} · 我的反馈</h3>
      {feedback.data.kind!==undefined?<EducationScalePersonalReport key={feedback.executionId} data={feedback.data}
        api={api} executionId={feedback.executionId} entry="SCHOOL"/>:<>
      {feedback.data.state==='COMPLETED'&&
        <p>你的作答已完成。当前测评仅允许展示完成状态，不提供分数或诊断。</p>}
      {feedback.data.state==='WITHHELD'&&
        <p>当前反馈暂不适合公开，或尚未达到科学与隐私披露条件。如有疑问，可联系学校心理教师。</p>}
      {feedback.data.state==='READY'&&
        <p>结果已经生成，但针对学生的逐工具解释尚未完成科学与适龄内容审核，因此这里不会直接展示指标代码、分数或诊断推论。</p>}
      {feedback.data.message&&<p className="hs-multiline">{feedback.data.message}</p>}
      </>}
      <button onClick={()=>{feedbackEpoch.current+=1;setFeedback(null)}}>关闭我的反馈</button>
    </div>}
    {execution&&<SchoolCompositeRunner api={api} execution={execution} title={items?.list.find(task=>task.id===execution.executionId)?.title}
      onExit={()=>setExecution(null)}
      onFinished={()=>{setExecution(null);void load(page)}}/>}
    {selected&&details&&<div className="hs-task-detail hs-student-task-detail" ref={detailRef} tabIndex={-1} role="region" aria-label={details.title}>
      <header className="hs-student-detail-header"><p className="hs-student-detail-kicker">{selected.activityTitle} · {kinds[selected.kind]}</p><h1>{details.title}</h1>
        {details.description&&<p className="hs-student-detail-description">{details.description}</p>}
        <div className="hs-student-detail-meta"><span className="hs-student-task-state" data-status={selected.status}>{captions[selected.status]}</span>{selected.deadline&&<span><Clock3 size={15} aria-hidden="true"/>截止 {new Date(selected.deadline).toLocaleString('zh-CN',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>}</div>
      </header>
      {details.content&&<section className="hs-student-detail-instructions" aria-labelledby="hs-task-instructions"><h2 id="hs-task-instructions">{selected.kind==='READING'?'阅读材料':'任务说明'}</h2><div className="hs-multiline">{details.content}</div></section>}
      <section className="hs-student-detail-answer" aria-labelledby="hs-task-answer-title">
        <header><span className="hs-student-detail-answer-icon" aria-hidden="true"><FileText size={20}/></span><div><h2 id="hs-task-answer-title">{selected.status==='COMPLETED'?'我的提交':selected.kind==='READING'?'阅读记录':'我的作答'}</h2><p>{selected.status==='COMPLETED'?'本次记录已提交，以下为已有内容。':selected.kind==='READING'?'读完材料后可以留下感受，也可以直接确认已阅读。':'根据任务说明填写本次记录，提交前可以继续修改。'}</p></div></header>
        {error&&<p className="hs-alert" role="alert">{error}</p>}
        <label className="hs-field"><span>{selected.kind==='READING'?'阅读感受（选填）':'你的回答'}</span>
          <textarea rows={7} readOnly={selected.status==='COMPLETED'} aria-describedby="hs-task-answer-help" placeholder={selected.kind==='READING'?'可以记录一个收获，或一段阅读感受。':'在这里填写你的活动记录…'} value={answer} onChange={event=>setAnswer(event.target.value)}/></label>
        <footer className="hs-student-detail-footer"><p id="hs-task-answer-help">返回不会提交当前内容。{selected.status==='COMPLETED'?'本次任务已完成。':'填写完成后，请点击下方按钮提交。'}</p>
          <button type="button" className="hs-primary" disabled={busy||selected.status==='COMPLETED'} onClick={()=>void submit()}>{busy?'正在提交…':selected.kind==='READING'?'确认已阅读':'提交活动记录'}</button></footer>
      </section>
    </div>}
  </section>
}
