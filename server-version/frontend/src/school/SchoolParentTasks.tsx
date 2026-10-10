import { useEffect,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

type ParentRunTask={
  executionId:string;runId:string;organizationId:string;activityId:string
  activityTitle:string;runTitle:string;status:string;deadline:string|null
}
export function SchoolParentTasks({api}:{api:SchoolApi}){
  const [tasks,setTasks]=useState<ParentRunTask[]>([])
  const [active,setActive]=useState<CampusExecutionRef|null>(null)
  const [error,setError]=useState('')
  const refresh=async()=>{
    const result=await api<{list:ParentRunTask[]}>('/my/parent-run-tasks')
    setTasks(result.list)
  }
  useEffect(()=>{
    let current=true
    void api<{list:ParentRunTask[]}>('/my/parent-run-tasks')
      .then(r=>{if(current)setTasks(r.list)})
      .catch(e=>{if(current)setError(e instanceof Error?e.message:'家长测评任务暂不可用')})
    return()=>{current=false}
  },[api])
  return <section className="hs-panel">
    <h2>我的家校观察任务</h2>
    <p>只显示你作为答题者被正式分配、且关系当前仍有效的测评。答题不代表获得孩子的个人心理报告。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    <button onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:'刷新失败'))}>刷新任务</button>
    {!tasks.length?<p>暂无需要你参与的家校观察任务。</p>:
      <div className="hs-task-list">{tasks.map(task=><article className="hs-task-card"
        key={task.executionId}>
        <h3>{task.runTitle}</h3><p>{task.activityTitle}</p>
        <p>当前状态：{task.status}</p>
        {['ASSIGNED','STARTED'].includes(task.status)&&
          <button onClick={()=>setActive({
            organizationId:task.organizationId,courseId:task.activityId,
            runId:task.runId,executionId:task.executionId,
          })}>开始／继续校园正式测评</button>}
      </article>)}</div>}
    {active&&<SchoolCompositeRunner api={api} execution={active}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
