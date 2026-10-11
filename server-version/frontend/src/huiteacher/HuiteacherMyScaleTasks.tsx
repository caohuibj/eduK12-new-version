import { useCallback,useEffect,useState } from 'react'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import type { CompositeAttemptState } from '../modules/composite/types'

type Api=<T>(path:string,method?:string,input?:unknown)=>Promise<T>
type Task={
  executionId:string;eventId:string;eventTitle:string;runId:string;
  organizationId:string;status:string;runtimeBindingRef:string|null;
  resourceKey:string;title:string;runStatus:string
}
type Summary={
  mode:string;state:'WITHHELD'|'COMPLETED'|'READY';
  metrics?:Record<string,number|null>
}
type Start={state:'STARTED'|'IN_PROGRESS'|'WITHHELD';
  runtimeBindingKind?:string;runtimeBindingRef?:string}

export function HuiteacherMyScaleTasks({api}:{api:Api}){
  const [tasks,setTasks]=useState<Task[]>([])
  const [selected,setSelected]=useState<Task|null>(null)
  const [attempt,setAttempt]=useState<CompositeAttemptState|null>(null)
  const [reports,setReports]=useState<Record<string,Summary>>({})
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const refresh=useCallback(async()=>{
    const data=await api<{list:Task[]}>('/my-scale-tasks')
    setTasks(data.list)
  },[api])
  useEffect(()=>{
    let mounted=true
    void api<{list:Task[]}>('/my-scale-tasks').then(data=>{
      if(mounted)setTasks(data.list)
    }).catch(e=>{if(mounted)setMessage(e instanceof Error?e.message:'评价任务读取失败')})
    return ()=>{mounted=false}
  },[api])
  const work=(task:()=>Promise<void>)=>{
    setLoading(true);setMessage('')
    void task().catch(e=>setMessage(e instanceof Error?e.message:'当前测评操作失败'))
      .finally(()=>setLoading(false))
  }
  const load=async(attemptId:string)=>{
    const value=await api<CompositeAttemptState>('/composite-attempts/'+attemptId)
    setAttempt(value)
    return value
  }
  const open=(item:Task)=>work(async()=>{
    let attemptId=item.runtimeBindingRef
    if(!attemptId){
      const started=await api<Start>(
        '/run-executions/'+item.executionId+'/start-scale','POST',{})
      if(started.state==='IN_PROGRESS'){
        setMessage('正式测评正在建立，请刷新任务后继续。')
        return
      }
      if(started.state!=='STARTED'
        ||started.runtimeBindingKind!=='COMPOSITE'
        ||!started.runtimeBindingRef)
        throw new Error('当前未找到获授权的教师自评运行记录')
      attemptId=started.runtimeBindingRef
    }
    setSelected(item)
    await load(attemptId)
    await refresh()
  })
  const showReport=(item:Task)=>work(async()=>{
    const data=await api<Summary>(
      '/run-executions/'+item.executionId+'/personal-summary')
    setReports(prev=>({...prev,[item.executionId]:data}))
  })
  const reload=async()=>{
    if(!attempt)return
    await load(attempt.id)
    await refresh()
  }
  const submitScale=async(attemptId:string,itemId:string,payload:unknown)=>{
    const result=await api<unknown>('/composite-attempts/'+attemptId+
      '/items/'+itemId+'/scale/submit','POST',payload)
    return {code:0,message:'本次正式提交已确认',data:result}
  }
  return <section className="ht-panel" aria-label="教师个人发展 Scale 自评">
    <h2>教师个人发展评价</h2>
    <p>正式计分仅来自经过独立发布、学校授权的教师自评量表。
      个人结果仅由本人获取，学校管理者不能代查。</p>
    {message&&<p role="status" className="ht-notice">{message}</p>}
    {!tasks.length?<p className="ht-empty">目前尚未安排经过授权的教师个人 Scale 测评。</p>:
      <div className="ht-event-list">{tasks.map(item=><article className="ht-event" key={item.executionId}>
        <strong>{item.title}</strong> <span className="ht-tag">{item.status}</span>
        <p>{item.eventTitle}</p>
        <div className="ht-inline">
          {item.status!=='COMPLETED'&&<button type="button" disabled={loading}
            onClick={()=>open(item)}>进入本人自评</button>}
          {item.status==='COMPLETED'&&<button type="button" disabled={loading}
            onClick={()=>showReport(item)}>查看本人反馈</button>}
        </div>
        {reports[item.executionId]&&<div className="ht-personal-report">
          <h4>本人描述性反馈</h4>
          {reports[item.executionId].state!=='READY'
            ?<p>当前报告尚未获准显示。</p>
            :<><p>以下结果由冻结版本的正式计分规则生成；非诊断、非教师绩效排名。</p>
              <div className="ht-units">{Object.entries(reports[item.executionId].metrics??{})
                .map(([key,value])=><span className="ht-tag" key={key}>
                  {key}：{typeof value==='number'?value:'不可计算'}
                </span>)}</div></>}
        </div>}
      </article>)}</div>}
    {selected&&attempt&&attempt.status!=='COMPLETED'&&<div className="ht-task">
      <h3>正在完成：{selected.title}</h3>
      <FinalCompositeAssessment
        state={attempt}
        campusMode={false}
        submitScale={submitScale}
        submitFormSection={async()=>{throw new Error('教师 Scale 任务不存在 Form Section')}}
        onReload={reload}
        onExit={()=>{setSelected(null);setAttempt(null)}}
        onCompleted={()=>{setSelected(null);setAttempt(null);void refresh()}}
        onEnterCognitive={()=>setMessage('该教师个人测评不允许启动认知任务')}
        onEnterSituational={()=>setMessage('该教师个人测评不允许启动情境任务')}
      />
    </div>}
  </section>
}
