import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {assessmentStatus,type AssessmentListPresentation} from './assessmentTaskPresentation'
import {isCapabilitySources} from '../modules/assessment-media/video-capability-client'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import { EducationScalePersonalReport, type EducationScalePersonalReportData, type EducationReportApi } from '../components/education-tools/EducationScalePersonalReport'
import type { CompositeAttemptState } from '../modules/composite/types'

type Api=EducationReportApi
type Task={
  executionId:string;eventId:string;eventTitle:string;runId:string;
  organizationId:string;status:string;runtimeBindingRef:string|null;
  resourceKey:string;title:string;runStatus:string
}
type Summary=EducationScalePersonalReportData&{
  state:'WITHHELD'|'COMPLETED'|'READY';mode?:string;
  title?:string;scientificMaturity?:'PILOT';
  metrics?:Array<{
    key:string;label:string;value:number|null;precision:number;
    headline?:string;summary?:string;direction:string;
    guidance?:Array<{category:string;text:string}>
  }>
  disclaimer?:string;limitations?:string[];explanation?:string
}
type Start={state:'STARTED'|'IN_PROGRESS'|'WITHHELD';
  runtimeBindingKind?:string;runtimeBindingRef?:string}

export function HuiteacherMyScaleTasks({api,unified=false,onListStateChange}:{api:Api}&AssessmentListPresentation){
  const [taskRows,setTasks]=useState<Task[]>([])
  const [session,setSession]=useState<{api:Api;selected:Task;attempt:CompositeAttemptState}|null>(null)
  const currentApi=useRef(api),sessionRef=useRef(session),sessionEpoch=useRef(0)
  currentApi.current=api;sessionRef.current=session
  const visible=session?.api===api?session:null
  const selected=visible?.selected??null,attempt=visible?.attempt??null
  const mediaTransport=useMemo(()=>{
    if(!attempt?.currentItem||attempt.currentItem.type!=='SCALE')return undefined
    const attemptId=encodeURIComponent(attempt.id)
    const itemId=encodeURIComponent(attempt.currentItem.id)
    const prefix=`/api/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/`
    const scopedPath=(path:string,kind:'image'|'video')=>{
      if(!path.startsWith(prefix))throw new Error('视觉内容不属于当前冻结测评单元')
      const suffix=path.slice(prefix.length)
      const match=(kind==='image'?/^assets\/([^/]+)\/content$/:/^items\/([^/]+)\/video-capability$/).exec(suffix)
      if(!match)throw new Error('视觉内容路径无效')
      let segment:string
      try{segment=decodeURIComponent(match[1])}catch{throw new Error('视觉内容路径无效')}
      if(!segment||segment==='.'||segment==='..'||/[\\/?#]/.test(segment)||encodeURIComponent(segment)!==match[1])throw new Error('视觉内容路径无效')
      return `/composite-attempts/${attemptId}/items/${itemId}/scale/${suffix}`
    }
    return {
      loadImage:async(path:string)=>{
        const blob=await api<Blob>(scopedPath(path,'image'),'GET',undefined,{responseType:'blob'})
        if(!(blob instanceof Blob))throw new Error('视觉内容响应无效')
        return blob
      },
      loadVideoCapability:async(path:string)=>{
        const data=await api<unknown>(scopedPath(path,'video'),'POST',{})
        if(!isCapabilitySources(data))throw new Error('视频授权响应无效')
        return data
      },
    }
  },[api,attempt])
  const [reports,setReports]=useState<Record<string,Summary>>({})
  const [loading,setLoading]=useState(false)
  const [reportBusy,setReportBusy]=useState(false)
  const reportEpoch=useRef(0)
  const [message,setMessage]=useState('')
  const listSource=useRef({api,endpoint:'/my-scale-tasks'})
  const listRequest=useRef(0)
  const [listState,setListState]=useState<{api:Api;endpoint:string;pending:boolean;error:string;loaded:boolean}>(
    {api,endpoint:'/my-scale-tasks',pending:true,error:'',loaded:false})
  listSource.current={api,endpoint:'/my-scale-tasks'}
  const listCurrent=listState.api===api&&listState.endpoint==='/my-scale-tasks'
  const listPending=!listCurrent||listState.pending
  const listError=listCurrent?listState.error:''
  const listReady=listCurrent&&listState.loaded
  const tasks=listReady?taskRows:[]
  useEffect(()=>{onListStateChange?.({pending:listPending,error:Boolean(listError),count:tasks.length})},[onListStateChange,listPending,listError,tasks.length])
  const refresh=useCallback(async()=>{
    if(listSource.current.api!==api||listSource.current.endpoint!=='/my-scale-tasks')return
    const request=++listRequest.current
    const valid=()=>request===listRequest.current&&listSource.current.api===api&&listSource.current.endpoint==='/my-scale-tasks'
    setListState(old=>({api,endpoint:'/my-scale-tasks',pending:true,error:'',loaded:old.api===api&&old.endpoint==='/my-scale-tasks'&&old.loaded}))
    try{
      const data=await api<{list:Task[]}>('/my-scale-tasks')
      if(!valid())return
      setTasks(data.list)
      setListState({api,endpoint:'/my-scale-tasks',pending:false,error:'',loaded:true})
    }catch(error){
      if(valid())setListState(old=>({...old,pending:false,error:error instanceof Error?error.message:'任务列表读取失败，请重试。'}))
    }
  },[api])
  useEffect(()=>{
    void refresh()
    return()=>{listRequest.current+=1}
  },[refresh])
  useEffect(()=>{
    reportEpoch.current+=1;sessionEpoch.current+=1;setReports({});setReportBusy(false);setSession(null);setLoading(false)
    return()=>{reportEpoch.current+=1;sessionEpoch.current+=1}
  },[api])
  const work=(task:(valid:()=>boolean)=>Promise<void>)=>{
    const token=++sessionEpoch.current
    const valid=()=>currentApi.current===api&&sessionEpoch.current===token
    setLoading(true);setMessage('')
    void task(valid).catch(e=>{if(valid())setMessage(e instanceof Error?e.message:'当前测评操作失败')})
      .finally(()=>{if(valid())setLoading(false)})
  }
  const load=async(attemptId:string)=>{
    const value=await api<CompositeAttemptState>('/composite-attempts/'+attemptId)
    if(value.id!==attemptId)throw new Error('测评记录与当前任务不一致，请重新读取。')
    return value
  }
  const open=(item:Task)=>{
    if(sessionRef.current?.api===api){setMessage('请先在当前测评中保存并退出，再打开另一项自评。');return}
    work(async valid=>{
    if(item.runStatus!=='PUBLISHED'
      &&!(item.runStatus==='CLOSED'&&item.status==='STARTED'&&item.runtimeBindingRef)){
      throw new Error('任务已结束，不能建立新的作答。')
    }
    let attemptId=item.runtimeBindingRef
    if(!attemptId){
      const started=await api<Start>(
        '/run-executions/'+item.executionId+'/start-scale','POST',{})
      if(!valid())return
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
    const value=await load(attemptId)
    if(!valid())return
    setSession(value.status==='COMPLETED'?null:{api,selected:item,attempt:value})
    await refresh()
    })
  }
  const closeReport=(executionId:string)=>{
    reportEpoch.current+=1;setReportBusy(false)
    setReports(previous=>{
      const next={...previous};delete next[executionId];return next
    })
  }
  const showReport=async(item:Task)=>{
    closeReport(item.executionId)
    const token=++reportEpoch.current
    setReportBusy(true);setMessage('')
    try{
      const data=await api<Summary>(
        '/run-executions/'+item.executionId+'/personal-summary')
      if(token===reportEpoch.current)setReports(previous=>({...previous,[item.executionId]:data}))
    }catch(error){
      if(token===reportEpoch.current)setMessage(error instanceof Error?error.message:'当前报告暂不可读取，请重试。')
    }finally{
      if(token===reportEpoch.current)setReportBusy(false)
    }
  }
  const leave=()=>{sessionEpoch.current+=1;sessionRef.current=null;setSession(null);setLoading(false)}
  const reload=async()=>{
    const source=visible,token=sessionEpoch.current
    if(!source||source.api!==api||currentApi.current!==api||sessionRef.current!==source)return
    const value=await load(source.attempt.id)
    if(currentApi.current!==api||sessionEpoch.current!==token||sessionRef.current!==source)return
    setSession(value.status==='COMPLETED'?null:{...source,attempt:value})
    await refresh()
  }
  const submitScale=async(attemptId:string,itemId:string,payload:unknown)=>{
    const source=visible,token=sessionEpoch.current
    const valid=()=>currentApi.current===api&&sessionEpoch.current===token&&sessionRef.current===source
    if(!source||source.api!==api||source.attempt.id!==attemptId||source.attempt.currentItem?.id!==itemId||!valid())throw new Error('当前测评任务已切换，请重新读取。')
    const result=await api<unknown>('/composite-attempts/'+attemptId+
      '/items/'+itemId+'/scale/submit','POST',payload)
    if(!valid())throw new Error('测评任务已切换，请重新读取提交状态。')
    return {code:0,message:'本次正式提交已确认',data:result}
  }
  return <section className={unified?"ht-assessment-source":"ht-panel"} aria-label={unified?undefined:"教师个人发展 Scale 自评"}>
    {!unified&&<><h2>教师个人发展评价</h2>
    <p>正式计分仅来自经过独立发布、学校授权的教师自评量表。
      个人结果仅由本人获取，学校管理者不能代查。</p></>}
    {!unified&&listPending&&<p role="status">正在读取任务列表，请稍候…</p>}
    {listError&&<div role="alert" className="ht-notice"><p>任务列表读取失败，请重试。</p><p>{listError}</p>
      <button type="button" disabled={listPending} onClick={()=>void refresh()}>重试读取任务列表</button>
    </div>}
    {visible&&<p className="ht-muted">请先在当前测评中保存并退出，再打开另一项自评。</p>}
    {loading&&!visible&&<button type="button" onClick={leave}>取消打开测评</button>}
    {message&&<p role="status" className="ht-notice">{message}</p>}
    {listReady&&!listPending&&!listError&&!tasks.length&&!unified?<p className="ht-empty">目前尚未安排经过授权的教师个人 Scale 测评。</p>:
      <div className="ht-event-list">{tasks.map(item=><article className="ht-event" key={item.executionId}>
        <strong>{item.title}</strong> <span className="ht-tag">{unified?assessmentStatus(item.status):item.status}</span>
        <p>{item.eventTitle}</p>
        <div className="ht-inline">
          {item.status!=='COMPLETED'&&(item.runStatus==='PUBLISHED'
            ||(item.runStatus==='CLOSED'&&item.status==='STARTED'&&Boolean(item.runtimeBindingRef)))&&
            <button type="button" disabled={loading||reportBusy||Boolean(visible)}
              onClick={()=>open(item)}>{unified?(item.status==='STARTED'?'继续测评':'开始测评'):(item.runStatus==='CLOSED'?'继续已有自评':'进入本人自评')}</button>}
          {item.status!=='COMPLETED'&&item.runStatus!=='PUBLISHED'
            &&!(item.runStatus==='CLOSED'&&item.status==='STARTED'&&item.runtimeBindingRef)&&
            <p className="ht-muted">任务已结束或不再接受新的 START，不能重新开始。</p>}
          {item.status==='COMPLETED'&&<button type="button" disabled={loading||reportBusy}
            onClick={()=>void showReport(item)}>查看本人反馈</button>}
        </div>
        {reports[item.executionId]&&<div className="ht-personal-report">
          <h4>本人描述性反馈</h4>
          {reports[item.executionId].kind!==undefined?<EducationScalePersonalReport
            data={reports[item.executionId]} api={api} executionId={item.executionId} entry="TEACHER"/>:
          reports[item.executionId].state!=='READY'
            ?<p>当前报告尚未获准显示。</p>
            :<>
              <p className="ht-muted">{reports[item.executionId].explanation}</p>
              <p>科学成熟度：描述性 Pilot，尚无适用常模或临床临界值。</p>
              {(reports[item.executionId].metrics??[]).map(metric=>
                <article key={metric.key} className="ht-personal-metric">
                  <h5>{metric.label}</h5>
                  <strong>{typeof metric.value==='number'
                    ?metric.value.toFixed(Math.min(6,Math.max(0,metric.precision)))
                    :'当前数据不足，不能计算'}</strong>
                  {metric.headline&&<p>{metric.headline}</p>}
                  {metric.summary&&<p>{metric.summary}</p>}
                  {metric.guidance?.map((guide,i)=><p key={i}>{guide.text}</p>)}
                </article>)}
              {reports[item.executionId].limitations?.map((t,i)=>
                <p key={i} className="ht-muted">说明：{t}</p>)}
              {reports[item.executionId].disclaimer&&<p className="ht-muted">
                {reports[item.executionId].disclaimer}</p>}
            </>}
          <button type="button" onClick={()=>closeReport(item.executionId)}>关闭本人反馈</button>
        </div>}
      </article>)}</div>}
    {selected&&attempt&&attempt.status!=='COMPLETED'&&<div className="ht-task">
      <h3>正在完成：{selected.title}</h3>
      <FinalCompositeAssessment
        key={`${attempt.id}:${attempt.currentItem?.id??''}:${attempt.currentItem?.definitionHash??''}`}
        state={attempt}
        campusMode={false}
        mediaTransport={mediaTransport}
        submitScale={submitScale}
        submitFormSection={async()=>{throw new Error('教师 Scale 任务不存在 Form Section')}}
        onReload={reload}
        onExit={()=>{if(sessionRef.current===visible)leave()}}
        onCompleted={()=>{if(sessionRef.current===visible){leave();void refresh()}}}
        onEnterCognitive={()=>setMessage('该教师个人测评不允许启动认知任务')}
        onEnterSituational={()=>setMessage('该教师个人测评不允许启动情境任务')}
      />
    </div>}
  </section>
}
