import { useEffect,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'
import { SchoolCompositeRunner,type CampusExecutionRef } from './SchoolCompositeRunner'

type TeacherRunTask={
  executionId:string;runId:string;organizationId:string;activityId:string
  activityTitle:string;runTitle:string;studentReference:string
  status:string;deadline:string|null
  consentRequired:boolean;consentPurpose:string|null;consentVisibility:string|null
}
type Inbox={list:TeacherRunTask[];truncated:boolean}

/** Observers never receive student login names, responses or individual
 * psychological results. Execution rights remain with the canonical Run.
 */
export function SchoolTeacherTasks({api}:{api:SchoolApi}) {
  const [inbox,setInbox]=useState<Inbox|null>(null)
  const [active,setActive]=useState<CampusExecutionRef|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const refresh=async()=>{
    setBusy(true);setError('')
    try{setInbox(await api<Inbox>('/my/teacher-run-tasks'))}
    catch(e){setError(e instanceof Error?e.message:'教师观察任务暂不可读取')}
    finally{setBusy(false)}
  }
  useEffect(()=>{
    let live=true
    void api<Inbox>('/my/teacher-run-tasks')
      .then(data=>{if(live)setInbox(data)})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'教师观察任务暂不可读取')})
    return ()=>{live=false}
  },[api])
  return <section className="hs-panel">
    <h2>我的学生观察任务</h2>
    <p>仅显示学校正式发布、本人当前任教班级内的观察测评。
      学生使用独立校园观察编号核对身份；这里不显示登录名、其他学生答案或心理报告。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    <button disabled={busy} onClick={()=>void refresh()}>刷新观察任务</button>
    {!inbox?<p>正在核对当前任教关系…</p>:inbox.list.length===0?
      <p>目前没有可作答的教师观察任务。请确认任教关系、活动状态和测评发布情况。</p>:
      <div className="hs-task-list">{inbox.list.map(item=>
        <article key={item.executionId} className="hs-task-card">
          <small>{item.activityTitle}</small>
          <h3>{item.runTitle}</h3>
          <p>受评学生观察编号：<strong>{item.studentReference}</strong></p>
          <p>任务状态：{item.status}{item.deadline?
            ' · 截止 '+new Date(item.deadline).toLocaleDateString('zh-CN'):''}</p>
          {['ASSIGNED','STARTED'].includes(item.status)&&
            <button disabled={busy} onClick={()=>setActive({
              organizationId:item.organizationId,courseId:item.activityId,
              runId:item.runId,executionId:item.executionId,
              consentRequired:item.consentRequired,
              consentPurpose:item.consentPurpose,consentVisibility:item.consentVisibility,
            })}>开始／继续教师观察测评</button>}
          {item.status==='COMPLETED'&&<p>已完成。学生个人心理结果不会因教师作答自动开放。</p>}
        </article>)}</div>}
    {inbox?.truncated&&<p>任务数量较多，仅展示最近的部分任务；请联系学校管理员核查分配。</p>}
    {active&&<SchoolCompositeRunner api={api} execution={active}
      onExit={()=>setActive(null)}
      onFinished={()=>{setActive(null);void refresh()}}/>}
  </section>
}
