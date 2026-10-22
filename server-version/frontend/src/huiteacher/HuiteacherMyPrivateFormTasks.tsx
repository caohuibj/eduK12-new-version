import {useCallback,useEffect,useRef,useState} from 'react'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import type {CompositeAttemptState} from '../modules/composite/types'

type Api=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
type Task={executionId:string;runId:string;organizationId:string;eventId:string;eventTitle:string;formTitle:string;status:string;runStatus:string;eventStatus:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null}
type Start={state:'STARTED'|'IN_PROGRESS'|'WITHHELD';runtimeBindingKind?:string;runtimeBindingRef?:string}
const canOpen=(task:Task)=>['ASSIGNED','STARTED'].includes(task.status)&&task.eventStatus==='OPEN'&&(task.runStatus==='PUBLISHED'||(task.runStatus==='CLOSED'&&task.status==='STARTED'&&task.runtimeBindingKind==='COMPOSITE'&&Boolean(task.runtimeBindingRef)))
const attemptPath=(id:string)=>'/private-form-composite-attempts/'+encodeURIComponent(id)
function assertAttempt(state:CompositeAttemptState,id:string){
 if(!state||state.id!==id||!['IN_PROGRESS','COMPLETED','ABANDONED'].includes(state.status)||!Array.isArray(state.items)||state.items.some(item=>item.type!=='FORM_SECTION')||
  (state.currentItem&&state.currentItem.type!=='FORM_SECTION')||
  (state.status==='IN_PROGRESS'&&state.currentItem&&!(state.currentItem.formSectionId||state.currentItem.formSection?.id)))throw Error('表单运行记录与当前获授权任务不一致，请重新读取。')
}
export function HuiteacherMyPrivateFormTasks(props:{api:Api;actorKey:string}){return <PrivateFormSession key={props.actorKey} {...props}/>}
function PrivateFormSession({api,actorKey}:{api:Api;actorKey:string}){
 const [listing,setListing]=useState<{api:Api;actorKey:string;rows:Task[];nextCursor:string|null}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [active,setActive]=useState<{api:Api;task:Task;attempt:CompositeAttemptState|null}|null>(null)
 const [completed,setCompleted]=useState<string[]>([])
 const epoch=useRef(0),listEpoch=useRef(0),alive=useRef(true),locked=useRef(false),currentApi=useRef(api),currentActor=useRef(actorKey),activeRef=useRef(active)
 currentApi.current=api;currentActor.current=actorKey;activeRef.current=active
 const currentListing=listing?.api===api&&listing.actorKey===actorKey?listing:null
 const tasks=currentListing?.rows??[],visible=active?.api===api?active:null
 const fetchPage=useCallback(async(cursor?:string)=>{
  if(!alive.current||currentApi.current!==api||currentActor.current!==actorKey)return
  const token=epoch.current,request=++listEpoch.current
  const data=await api<{list:Task[];nextCursor?:string|null}>('/my-private-form-tasks'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
  if(!alive.current||currentApi.current!==api||currentActor.current!==actorKey||token!==epoch.current||request!==listEpoch.current)return
  if(!Array.isArray(data.list)||(data.nextCursor!=null&&typeof data.nextCursor!=='string'))throw Error('表单任务列表响应无效，请重新读取。')
  setListing(old=>{
   if(cursor&&(!old||old.api!==api||old.actorKey!==actorKey||old.nextCursor!==cursor))return old
   const rows=Array.from(new Map([...(cursor&&old?old.rows:[]),...data.list].map(task=>[task.executionId,task])).values())
   return {api,actorKey,rows,nextCursor:data.nextCursor??null}
  })
 },[api,actorKey])
 const refresh=useCallback(()=>fetchPage(),[fetchPage])
 useEffect(()=>{
  alive.current=true;epoch.current++;setActive(null);setListing(null);setCompleted([]);setBusy(false);setMessage('');locked.current=false
  const token=epoch.current
  void refresh().catch(error=>{if(alive.current&&currentApi.current===api&&token===epoch.current)setMessage(error instanceof Error?error.message:'表单任务读取失败')})
  return()=>{alive.current=false;epoch.current++;listEpoch.current++;locked.current=false}
 },[api,refresh,actorKey])
 const work=async(action:(valid:()=>boolean)=>Promise<void>)=>{
  if(locked.current||!alive.current||currentApi.current!==api)return
  locked.current=true;setBusy(true);setMessage('')
  const token=epoch.current,valid=()=>alive.current&&currentApi.current===api&&token===epoch.current
  try{await action(valid)}catch(error){if(valid())setMessage(error instanceof Error?error.message:'表单操作未完成，请重试读取。')}
  finally{if(valid()){locked.current=false;setBusy(false)}}
 }
 const read=async(task:Task,id:string,valid:()=>boolean)=>{
  const state=await api<CompositeAttemptState>(attemptPath(id))
  if(!valid())return
  assertAttempt(state,id)
  setActive({api,task,attempt:state})
  if(state.status==='COMPLETED'){setCompleted(old=>Array.from(new Set([...old,task.executionId])));setMessage('本次表单已正式提交。表单不计算量表分数，也不新增个人报告读取权。')}
 }
 const open=(task:Task)=>void work(async valid=>{
  if(!canOpen(task)||completed.includes(task.executionId))throw Error('任务当前不接受新的作答；已收尾任务仅可继续获准的已有作答。')
  setActive(null)
  let id=task.runtimeBindingRef
  if(id&&task.runtimeBindingKind!=='COMPOSITE')throw Error('此任务不是受控的私有表单运行记录。')
  if(!id){
   const result=await api<Start>('/run-executions/'+encodeURIComponent(task.executionId)+'/start-private-form','POST',{})
   if(!valid())return
   if(result.state==='IN_PROGRESS'){setMessage('表单任务正在建立，请刷新任务后继续，不要重复开始。');return}
   if(result.state!=='STARTED'||result.runtimeBindingKind!=='COMPOSITE'||!result.runtimeBindingRef)throw Error('当前未获准打开此表单任务，请刷新任务列表核对。')
   id=result.runtimeBindingRef
  }
  const bound={...task,status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:id}
  setActive({api,task:bound,attempt:null})
  await read(bound,id,valid)
  try{await refresh()}catch{if(valid())setMessage('表单已打开，但任务列表刷新失败；可继续当前获授权作答。')}
 })
 const reload=async()=>{
  const source=activeRef.current
  if(!alive.current||currentApi.current!==api||!source||source.api!==api||!source.task.runtimeBindingRef)throw Error('当前表单任务已切换，请重新打开。')
  const token=epoch.current,valid=()=>alive.current&&currentApi.current===api&&token===epoch.current&&activeRef.current?.task.executionId===source.task.executionId
  setActive({...source,attempt:null})
  try{await read(source.task,source.task.runtimeBindingRef,valid)}catch(error){if(valid())setMessage(error instanceof Error?error.message:'表单读取失败，请重新读取当前表单。');throw error}
  try{await refresh()}catch{if(valid())setMessage('当前表单状态已读取，任务列表刷新失败，请稍后刷新列表。')}
 }
 const leave=()=>{epoch.current++;activeRef.current=null;setActive(null);setBusy(false);locked.current=false}
 return <section className="ht-panel" aria-label="我的自编表单任务"><h2>我的自编表单任务</h2>
  <p>完成分配给本人的固定版本表单，按分节逐步作答并提交；表单只记录作答，不生成量表分数。</p>
  <button type="button" disabled={busy} onClick={()=>void work(async()=>{await refresh()})}>刷新自编表单任务</button>
  {message&&<p role="status" className="ht-notice">{message}</p>}
  {currentListing&&!tasks.length&&<p className="ht-empty">暂无分配给本人的自编表单任务。</p>}
  <div className="ht-event-list">{tasks.map(task=><article className="ht-event" key={task.executionId}><strong>{task.formTitle}</strong><p>{task.eventTitle}</p>
   {completed.includes(task.executionId)||task.status==='COMPLETED'?<span className="ht-tag">已完成正式提交</span>:canOpen(task)?<button type="button" disabled={busy||Boolean(visible)} onClick={()=>open(task)}>{task.runStatus==='CLOSED'?'继续已有表单':'打开本人表单'}</button>:<p className="ht-muted">当前活动或任务未开放新的作答。</p>}
  </article>)}</div>
  {currentListing?.nextCursor&&<button type="button" disabled={busy} onClick={()=>void work(async()=>{await fetchPage(currentListing.nextCursor!)})}>加载更多表单任务</button>}
  {visible&&<div className="ht-task"><h3>正在完成：{visible.task.formTitle}</h3>
   {!visible.attempt&&<><button type="button" disabled={busy} onClick={()=>void work(async()=>{await reload()})}>重新读取当前表单</button><button type="button" disabled={busy} onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='ABANDONED'&&<><p>本次作答已终止，不能继续提交。</p><button type="button" onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='COMPLETED'&&<><p>本次表单已正式提交。</p><button type="button" onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='IN_PROGRESS'&&!visible.attempt.currentItem&&<><p>正在确认完成状态，请刷新。</p><button type="button" disabled={busy} onClick={()=>void work(async()=>{await reload()})}>重新读取当前表单</button><button type="button" disabled={busy} onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='IN_PROGRESS'&&visible.attempt.currentItem&&<FinalCompositeAssessment
    key={`${actorKey}:${visible.task.executionId}:${visible.attempt.id}:${visible.attempt.currentItem?.id}:${visible.attempt.currentItem?.definitionHash}`}
    state={visible.attempt}
    submitFormSection={async(id,sectionId,input)=>{
     const source=activeRef.current,token=epoch.current
     if(!alive.current||!source||source.api!==api||currentApi.current!==api||source.attempt?.id!==id||source.task.executionId!==visible.task.executionId||sectionId!==(source.attempt.currentItem?.formSectionId||source.attempt.currentItem?.formSection?.id))throw Error('当前表单分节已切换，请重新读取。')
     const result=await api<unknown>(attemptPath(id)+'/form-sections/'+encodeURIComponent(sectionId)+'/submit','POST',input)
     if(!alive.current||token!==epoch.current||currentApi.current!==api)throw Error('任务已切换，请从当前任务列表核对提交状态。')
     return {code:0,message:'本次表单正式提交已确认',data:result}
    }}
    submitScale={async()=>{throw Error('私有表单任务不接受量表提交')}}
    onReload={reload} onExit={leave} onCompleted={()=>{void work(async()=>{await reload()})}}
    onEnterCognitive={()=>setMessage('当前表单不包含认知任务')}
    onEnterSituational={()=>setMessage('当前表单不包含情境判断任务')}
   />}
  </div>}
 </section>
}
