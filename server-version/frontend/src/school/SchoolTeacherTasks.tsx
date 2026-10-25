import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
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
export function SchoolTeacherTasks({api,organizationId}:{api:SchoolApi;organizationId:string}) {
  const inboxPath='/my/teacher-run-tasks?organizationId='+encodeURIComponent(organizationId)
  const [inbox,setInbox]=useState<Inbox|null>(null)
  const [active,setActive]=useState<CampusExecutionRef|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
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
    setInbox(null);setActive(null);setError('')
    void refresh()
    return()=>{currentScope.current=null}
  },[refresh,scope])
  return <section className="hs-panel hs-task-view">
    <details className="hs-task-inbox" open={!(active)}>
    <summary hidden={!(active)}>查看任务列表</summary>
    <h2>我的学生观察任务</h2>
    <p>仅显示学校正式发布、本人当前任教班级内的观察测评。
      学生使用独立校园观察编号核对身份；这里不显示登录名、其他学生答案或心理报告。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    <button disabled={busy} onClick={()=>void refresh()}>{busy?'正在读取…':error?'重试读取观察任务':'刷新观察任务'}</button>
    {busy&&<p role="status">正在核对当前任教关系…</p>}
    {!inbox?null:inbox.list.length===0?
      !busy&&!error&&
      <p>目前没有可作答的教师观察任务。请确认任教关系、活动状态和测评发布情况。</p>:
      <div className="hs-task-list">{inbox.list.map(item=>
        <article key={item.executionId} className="hs-task-card">
          <small>{item.activityTitle}</small>
          <h3>{item.runTitle}</h3>
          <p>受评学生观察编号：<strong>{item.studentReference}</strong></p>
          <p>任务状态：{({ASSIGNED:'待完成',STARTED:'进行中',COMPLETED:'已完成',EXPIRED:'已截止',CANCELLED:'已取消'} as Record<string,string>)[item.status]??item.status}{item.deadline?
            ' · 截止 '+new Date(item.deadline).toLocaleDateString('zh-CN'):''}</p>
          {['ASSIGNED','STARTED'].includes(item.status)&&
            <button disabled={busy} onClick={()=>setActive({
              organizationId:item.organizationId,courseId:item.activityId,
              runId:item.runId,executionId:item.executionId,
              resumeExisting:item.canResumeExisting===true,consentRequired:item.consentRequired,
              consentPurpose:item.consentPurpose,consentVisibility:item.consentVisibility,
            })}>开始／继续教师观察测评</button>}
          {item.status==='COMPLETED'&&<p>已完成。学生个人心理结果不会因教师作答自动开放。</p>}
        </article>)}</div>}
    {inbox?.truncated&&<p>任务数量较多，仅展示最近的部分任务；请联系学校管理员核查分配。</p>}
    </details>
    {active&&<SchoolCompositeRunner api={api} execution={active}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
