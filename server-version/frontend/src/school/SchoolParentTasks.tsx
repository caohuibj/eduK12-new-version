import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {ClipboardList,RefreshCw} from 'lucide-react'
import {SchoolCollectionControls,type SchoolCollectionView} from './SchoolCollectionControls'
import {schoolSearchText,schoolDeadline} from './school-collection'
import {SchoolTaskHelp} from './SchoolTaskHelp'
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
  const [query,setQuery]=useState(''),[sort,setSort]=useState('recommended'),[view,setView]=useState<SchoolCollectionView>('list')
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
    setTasks(null);setActive(null);setError('');setQuery('');setSort('recommended')
    void refresh()
    return()=>{currentScope.current=null}
  },[refresh,scope])
  const visible=(tasks??[]).filter(task=>schoolSearchText(task.runTitle+' '+task.activityTitle).includes(schoolSearchText(query))).slice().sort((a,b)=>sort==='title'?a.runTitle.localeCompare(b.runTitle,'zh-CN',{numeric:true}):sort==='deadline'?(schoolDeadline(a.deadline)-schoolDeadline(b.deadline))||0:0)
  const refreshButton=<button type="button" disabled={busy} onClick={()=>void refresh()} aria-label={busy?'正在读取…':error?'重试读取任务':'刷新任务'} title="刷新任务"><RefreshCw size={18} aria-hidden="true"/></button>
  return <section className="hs-panel hs-task-view hs-parent-tasks">
    <details className="hs-task-inbox" open={!active}>
    <summary hidden={!active}>查看任务列表</summary>
    <header className="hs-parent-task-heading"><div className="hs-parent-task-summary"><h2>我的家校观察任务</h2>{tasks&&<p className="hs-collection-summary">{query?`检索到 ${visible.length} 项`:`${tasks.length} 项观察任务`}</p>}
      <SchoolTaskHelp label="家长观察任务与隐私说明" buttonText="任务说明"><p>只显示你作为答题者被正式分配、且关系当前仍有效的测评。答题不代表获得孩子的个人心理报告。</p></SchoolTaskHelp>
    </div>
    {tasks?<SchoolCollectionControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} view={view} onView={setView} searchLabel="检索家长观察任务" placeholder="搜索任务或活动名称" sorts={[{value:'recommended',label:'默认顺序'},{value:'deadline',label:'截止时间优先'},{value:'title',label:'任务名称 A–Z'}]} actions={refreshButton}/>:refreshButton}</header>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {busy&&<p role="status">正在读取家校观察任务…</p>}
    {!tasks?null:!tasks.length?!busy&&!error&&<p className="hs-collection-empty">暂无需要你参与的家校观察任务。</p>:
      <div className={'hs-task-list hs-parent-task-list'+(view==='cards'?' hs-parent-task-list--cards':'')}>{visible.map(task=><article className="hs-task-card" key={task.executionId}>
        <span className="hs-parent-task-icon" aria-hidden="true"><ClipboardList size={21}/></span>
        <div className="hs-parent-task-copy"><small>{task.activityTitle}</small><h3>{task.runTitle}</h3>
        <p>当前状态：{({ASSIGNED:'待完成',STARTED:'进行中',COMPLETED:'已完成',EXPIRED:'已截止',CANCELLED:'已取消'} as Record<string,string>)[task.status]??task.status}{task.deadline?' · 截止 '+new Date(task.deadline).toLocaleDateString('zh-CN'):''}</p></div>
        <div className="hs-parent-task-action">{['ASSIGNED','STARTED'].includes(task.status)&&
          <button disabled={busy} aria-label={(task.status==='STARTED'?'继续作答':'查看任务')+'（开始／继续校园正式测评）'} onClick={()=>setActive({
            organizationId:task.organizationId,courseId:task.activityId,
            runId:task.runId,executionId:task.executionId,
            resumeExisting:task.canResumeExisting===true,consentRequired:task.consentRequired,
            consentPurpose:task.consentPurpose,
            consentVisibility:task.consentVisibility,
          })}>{task.status==='STARTED'?'继续作答':'查看任务'}</button>}</div>
      </article>)}</div>}
      {tasks&&tasks.length>0&&visible.length===0&&<p className="hs-collection-empty">没有匹配的观察任务，请尝试其他关键词。</p>}
    </details>
    {active&&<SchoolCompositeRunner api={api} execution={active} observer observerRole="parent" observerTaskTitle={tasks?.find(task=>task.executionId===active.executionId)?.runTitle}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
