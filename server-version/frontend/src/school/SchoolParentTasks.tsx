import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

type ParentRunTask={
  executionId:string;runId:string;organizationId:string;activityId:string
  activityTitle:string;runTitle:string;status:string;deadline:string|null
  canResumeExisting?:boolean
  consentRequired:boolean;consentPurpose:string|null;consentVisibility:string|null
}
export function SchoolParentTasks({api}:{api:SchoolApi}){
  const [tasks,setTasks]=useState<ParentRunTask[]|null>(null)
  const [active,setActive]=useState<CampusExecutionRef|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const scope=useMemo(()=>({pending:false}),[api])
  const currentScope=useRef<typeof scope|null>(scope)
  currentScope.current=scope
  const refresh=useCallback(async()=>{
    if(currentScope.current!==scope||scope.pending)return
    scope.pending=true;setBusy(true);setError('')
    try{
      const result=await api<{list:ParentRunTask[]}>('/my/parent-run-tasks')
      if(currentScope.current===scope){setTasks(result.list)}
    }catch(e){
      if(currentScope.current===scope)setError(e instanceof Error?e.message:'家长测评任务暂不可用')
    }finally{
      scope.pending=false
      if(currentScope.current===scope)setBusy(false)
    }
  },[api,scope])
  useEffect(()=>{
    currentScope.current=scope
    setTasks(null);setActive(null);setError('')
    void refresh()
    return()=>{currentScope.current=null}
  },[refresh,scope])
  return <section className="hs-panel hs-task-view">
    <details className="hs-task-inbox" open={!(active)}>
    <summary hidden={!(active)}>查看任务列表</summary>
    <h2>我的家校观察任务</h2>
    <p>只显示你作为答题者被正式分配、且关系当前仍有效的测评。答题不代表获得孩子的个人心理报告。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    <button disabled={busy} onClick={()=>void refresh()}>{busy?'正在读取…':error?'重试读取任务':'刷新任务'}</button>
    {busy&&<p role="status">正在读取家校观察任务…</p>}
    {!tasks?null:!tasks.length?!busy&&!error&&<p>暂无需要你参与的家校观察任务。</p>:
      <div className="hs-task-list">{tasks.map(task=><article className="hs-task-card"
        key={task.executionId}>
        <h3>{task.runTitle}</h3><p>{task.activityTitle}</p>
        <p>当前状态：{({ASSIGNED:'待完成',STARTED:'进行中',COMPLETED:'已完成',EXPIRED:'已截止',CANCELLED:'已取消'} as Record<string,string>)[task.status]??task.status}</p>
        {['ASSIGNED','STARTED'].includes(task.status)&&
          <button onClick={()=>setActive({
            organizationId:task.organizationId,courseId:task.activityId,
            runId:task.runId,executionId:task.executionId,
            resumeExisting:task.canResumeExisting===true,consentRequired:task.consentRequired,
            consentPurpose:task.consentPurpose,
            consentVisibility:task.consentVisibility,
          })}>开始／继续校园正式测评</button>}
      </article>)}</div>}
    </details>
    {active&&<SchoolCompositeRunner api={api} execution={active}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
