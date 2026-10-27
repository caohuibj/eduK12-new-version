import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {ClipboardList,RefreshCw} from 'lucide-react'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText,schoolDeadline} from './school-collection'
import {SchoolTaskHelp} from './SchoolTaskHelp'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

type TeacherRunTask={
  executionId:string;runId:string;organizationId:string;activityId:string
  activityTitle:string;runTitle:string;studentReference:string
  status:string;deadline:string|null
  canResumeExisting?:boolean
  consentRequired:boolean;consentPurpose:string|null;consentVisibility:string|null
}
type Inbox={list:TeacherRunTask[];truncated:boolean}

/** Observers never receive student login names, responses or individual
 * psychological results. Execution rights remain with the canonical Run.
 */
export function SchoolTeacherTasks({api,organizationId,compact=false}:{api:SchoolApi;organizationId:string;compact?:boolean}) {
  const inboxPath='/my/teacher-run-tasks?organizationId='+encodeURIComponent(organizationId)
  const [inbox,setInbox]=useState<Inbox|null>(null)
  const [active,setActive]=useState<CampusExecutionRef|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [query,setQuery]=useState(''),[sort,setSort]=useState('recommended'),[view,setView]=useState<SchoolCollectionView>('list')
  const scope=useMemo(()=>({pending:false}),[api,inboxPath])
  const currentScope=useRef<typeof scope|null>(scope)
  currentScope.current=scope
  const refresh=useCallback(async()=>{
    if(currentScope.current!==scope||scope.pending)return
    scope.pending=true;setBusy(true);setError('')
    try{
      const result=await api<Inbox>(inboxPath)
      if(currentScope.current===scope){setInbox(result)}
    }catch(e){
      if(currentScope.current===scope)setError(e instanceof Error?e.message:'教师观察任务暂不可读取')
    }finally{
      scope.pending=false
      if(currentScope.current===scope)setBusy(false)
    }
  },[api,scope,inboxPath])
  useEffect(()=>{
    currentScope.current=scope
    setInbox(null);setActive(null);setError('');setQuery('');setSort('recommended')
    void refresh()
    return()=>{currentScope.current=null}
  },[refresh,scope])
  const visible=(inbox?.list??[]).filter(item=>schoolSearchText(item.runTitle+' '+item.activityTitle+' '+item.studentReference).includes(schoolSearchText(query))).slice().sort((a,b)=>sort==='title'?a.runTitle.localeCompare(b.runTitle,'zh-CN',{numeric:true}):sort==='deadline'?(schoolDeadline(a.deadline)-schoolDeadline(b.deadline))||0:0)
  const refreshButton=<button type="button" disabled={busy} onClick={()=>void refresh()} aria-label={busy?'正在读取…':error?'重试读取观察任务':'刷新观察任务'} title="刷新观察任务"><RefreshCw size={18} aria-hidden="true"/></button>
  return <section className={'hs-panel hs-task-view hs-teacher-tasks'+(compact?' hs-teacher-tasks--compact':'')}>
    <details className="hs-task-inbox" open={!active}>
    <summary hidden={!active||compact}>查看任务列表</summary>
    <header className="hs-teacher-task-heading"><div className="hs-teacher-task-summary"><h2>我的学生观察任务</h2>{inbox&&<p className="hs-collection-summary" role="status">{query?`检索到 ${visible.length} 项`:`${inbox.list.length} 项观察任务`}{inbox.truncated?' · 检索和排序仅作用于当前已加载任务':''}</p>}{compact&&<SchoolTaskHelp><p>仅显示学校正式发布、本人当前任教班级内的观察测评。学生使用独立校园观察编号核对身份；这里不显示登录名、其他学生答案或心理报告。</p><p>学生个人心理结果不会因教师作答自动开放。</p></SchoolTaskHelp>}</div>
    {inbox?<SchoolCollectionControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} view={view} onView={setView} searchLabel="检索观察任务" placeholder="搜索任务、活动名称或观察编号" sorts={[{value:'recommended',label:'默认顺序'},{value:'deadline',label:'截止时间优先'},{value:'title',label:'任务名称 A–Z'}]} actions={refreshButton}/>:refreshButton}</header>
    {!compact&&<details className="hs-teacher-task-help"><summary>观察任务与隐私说明</summary><p>仅显示学校正式发布、本人当前任教班级内的观察测评。学生使用独立校园观察编号核对身份；这里不显示登录名、其他学生答案或心理报告。</p></details>}
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {busy&&<p role="status">正在核对当前任教关系…</p>}
    {!inbox?null:inbox.list.length===0?
      !busy&&!error&&<p className="hs-collection-empty">目前没有可作答的教师观察任务。请确认任教关系、活动状态和测评发布情况。</p>:
      <div className={'hs-task-list hs-teacher-task-list'+(view==='cards'?' hs-teacher-task-list--cards':'')}>{visible.map(item=>
        <article key={item.executionId} className="hs-task-card" data-execution-id={item.executionId}>
          <span className="hs-teacher-task-icon" aria-hidden="true"><ClipboardList size={21}/></span>
          <div className="hs-teacher-task-copy"><small>{item.activityTitle}</small><h3>{item.runTitle}</h3>
          <p>受评学生观察编号：<strong>{item.studentReference}</strong></p>
          <p>任务状态：{({ASSIGNED:'待完成',STARTED:'进行中',COMPLETED:'已完成',EXPIRED:'已截止',CANCELLED:'已取消'} as Record<string,string>)[item.status]??item.status}{item.deadline?' · 截止 '+new Date(item.deadline).toLocaleDateString('zh-CN'):''}</p></div>
          <div className="hs-teacher-task-action">{['ASSIGNED','STARTED'].includes(item.status)&&
            <button disabled={busy} onClick={()=>setActive({
              organizationId:item.organizationId,courseId:item.activityId,
              runId:item.runId,executionId:item.executionId,
              resumeExisting:item.canResumeExisting===true,consentRequired:item.consentRequired,
              consentPurpose:item.consentPurpose,consentVisibility:item.consentVisibility,
            })}>开始／继续教师观察测评</button>}
          {item.status==='COMPLETED'&&!compact&&<p>已完成。学生个人心理结果不会因教师作答自动开放。</p>}</div>
        </article>)}</div>}
    {inbox&&inbox.list.length>0&&visible.length===0&&<p className="hs-collection-empty">没有匹配的已加载观察任务，请尝试其他关键词。</p>}
    {inbox?.truncated&&<p>任务数量较多，仅展示最近的部分任务；请联系学校管理员核查分配。</p>}
    </details>
    {active&&<SchoolCompositeRunner api={api} execution={active} observer={compact}
      observerTaskTitle={compact?inbox?.list.find(item=>item.executionId===active.executionId)?.runTitle:undefined}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
