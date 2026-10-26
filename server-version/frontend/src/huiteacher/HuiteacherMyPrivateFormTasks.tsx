import {TeacherAssessmentPage} from './TeacherAssessmentPage'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {assessmentStatus,type AssessmentListPresentation} from './assessmentTaskPresentation'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import type {CompositeAttemptState} from '../modules/composite/types'

type Api=<T>(path:string,method?:string,payload?:unknown,options?:{responseType?:'blob'})=>Promise<T>
type Task={executionId:string;runId:string;organizationId:string;eventId:string;eventTitle:string;formTitle:string;status:string;runStatus:string;eventStatus:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null}
type Start={state:'STARTED'|'IN_PROGRESS'|'WITHHELD';runtimeBindingKind?:string;runtimeBindingRef?:string}
const canOpen=(task:Task)=>['ASSIGNED','STARTED'].includes(task.status)&&task.eventStatus==='OPEN'&&(task.runStatus==='PUBLISHED'||(task.runStatus==='CLOSED'&&task.status==='STARTED'&&task.runtimeBindingKind==='COMPOSITE'&&Boolean(task.runtimeBindingRef)))
const attemptPath=(id:string)=>'/private-form-composite-attempts/'+encodeURIComponent(id)
function assertAttempt(state:CompositeAttemptState,id:string){
 // The server's items are FORM field summaries; units are FORM_SECTION navigation entries.
 const sectionId=state?.currentItem?.formSectionId||state?.currentItem?.formSection?.id
 if(!state||state.id!==id||!['IN_PROGRESS','COMPLETED','ABANDONED'].includes(state.status)||
  !Array.isArray(state.items)||state.items.some(item=>item.type!=='FORM')||
  !Array.isArray(state.units)||state.units.some(unit=>unit.type!=='FORM_SECTION'||!unit.formSectionId||unit.id!==unit.formSectionId)||
  (state.currentItem&&(state.currentItem.type!=='FORM_SECTION'||!sectionId||state.currentItem.id!==sectionId||!state.units.some(unit=>unit.id===sectionId))))throw Error('表单运行记录与当前获授权任务不一致，请重新读取。')
}

export function HuiteacherMyPrivateFormTasks(props:{api:Api;actorKey:string}&AssessmentListPresentation){return <PrivateFormSession key={props.actorKey} {...props}/>}
function PrivateFormSession({api,actorKey,unified=false,onListStateChange}:{api:Api;actorKey:string}&AssessmentListPresentation){
 const [listing,setListing]=useState<{api:Api;actorKey:string;rows:Task[];nextCursor:string|null}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [active,setActive]=useState<{api:Api;task:Task;attempt:CompositeAttemptState|null}|null>(null)
 const [listPending,setListPending]=useState(true),[listError,setListError]=useState(''),[retryCursor,setRetryCursor]=useState<string|undefined>(undefined)
 const [completed,setCompleted]=useState<string[]>([])
 const epoch=useRef(0),listEpoch=useRef(0),alive=useRef(true),locked=useRef(false),currentApi=useRef(api),currentActor=useRef(actorKey),activeRef=useRef(active)
 currentApi.current=api;currentActor.current=actorKey;activeRef.current=active
 const currentListing=listing?.api===api&&listing.actorKey===actorKey?listing:null
 const tasks=currentListing?.rows??[],visible=active?.api===api?active:null
 useEffect(()=>{onListStateChange?.({pending:listPending,error:Boolean(listError),count:tasks.length})},[onListStateChange,listPending,listError,tasks.length])
 const mediaTransport=useMemo(()=>{
  const attempt=visible?.attempt,item=attempt?.currentItem
  const rawSectionId=item?.formSectionId||item?.formSection?.id
  const rejectUnavailable=async()=>{throw Error('当前表单区段不可读取素材，请重新读取')}
  if(!visible||!attempt||item?.type!=='FORM_SECTION'||!rawSectionId)return {loadImage:rejectUnavailable,loadVideoCapability:rejectUnavailable}
  const capturedEpoch=epoch.current,executionId=visible.task.executionId,attemptEpoch=attempt.attemptEpoch,definitionHash=item.definitionHash
  const attemptId=encodeURIComponent(attempt.id),sectionId=encodeURIComponent(rawSectionId)
  const prefix=`/api/composite-assessments/attempts/${attemptId}/form-sections/${sectionId}/`
  const current=()=>{
   const now=activeRef.current
   if(!alive.current||currentApi.current!==api||currentActor.current!==actorKey||now?.api!==api||epoch.current!==capturedEpoch||now.task.executionId!==executionId||now.attempt!==attempt||now.attempt.id!==attempt.id||now.attempt.attemptEpoch!==attemptEpoch||now.attempt.currentItem?.id!==item.id||(now.attempt.currentItem?.formSectionId||now.attempt.currentItem?.formSection?.id)!==rawSectionId||now.attempt.currentItem?.definitionHash!==definitionHash)throw Error('表单任务或区段已切换，请重新读取素材')
  }
  const scopedPath=(path:string,kind:'image'|'video')=>{
   current()
   if(!path.startsWith(prefix))throw Error('视觉内容不属于当前冻结表单区段')
   const suffix=path.slice(prefix.length),match=(kind==='image'?/^assets\/([^/]+)\/content$/:/^items\/([^/]+)\/options\/(0|[1-9]\d*)\/video-capability$/).exec(suffix)
   if(!match)throw Error('视觉内容路径无效')
   let segment:string
   try{segment=decodeURIComponent(match[1])}catch{throw Error('视觉内容路径无效')}
   if(!segment||segment==='.'||segment==='..'||/[\\/?#]/.test(segment)||encodeURIComponent(segment)!==match[1])throw Error('视觉内容路径无效')
   return `/private-form-composite-attempts/${attemptId}/form-sections/${sectionId}/${suffix}`
  }
  return {
   loadImage:async(path:string)=>{const blob=await api<Blob>(scopedPath(path,'image'),'GET',undefined,{responseType:'blob'});current();if(!(blob instanceof Blob))throw Error('视觉内容响应无效');return blob},
   loadVideoCapability:async()=>{throw Error('私有表单仅支持展示素材，不支持选项视频协议')},
  }
 },[api,actorKey,visible])
 const fetchPage=useCallback(async(cursor?:string)=>{
  if(!alive.current||currentApi.current!==api||currentActor.current!==actorKey)return
  const request=++listEpoch.current
  const valid=()=>alive.current&&currentApi.current===api&&currentActor.current===actorKey&&request===listEpoch.current
  setListPending(true);setListError('');setRetryCursor(cursor)
  try{
  const data=await api<{list:Task[];nextCursor?:string|null}>('/my-private-form-tasks'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
  if(!valid())return
  if(!Array.isArray(data.list)||(data.nextCursor!=null&&typeof data.nextCursor!=='string'))throw Error('表单任务列表响应无效，请重新读取。')
  setListing(old=>{
   if(cursor&&(!old||old.api!==api||old.actorKey!==actorKey||old.nextCursor!==cursor))return old
   const rows=Array.from(new Map([...(cursor&&old?old.rows:[]),...data.list].map(task=>[task.executionId,task])).values())
   return {api,actorKey,rows,nextCursor:data.nextCursor??null}
  })
  }catch(error){if(valid())setListError(error instanceof Error?error.message:'表单任务读取失败，请重试。')}
  finally{if(valid())setListPending(false)}
 },[api,actorKey])
 const refresh=useCallback(()=>fetchPage(),[fetchPage])
 useEffect(()=>{
  alive.current=true;epoch.current++;setActive(null);setListing(null);setCompleted([]);setBusy(false);setMessage('');locked.current=false
  void refresh()
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
 return <section className={unified?"ht-assessment-source":"ht-panel"} aria-label={unified?undefined:"我的自编表单任务"}>{!unified&&<><h2>我的自编表单任务</h2>
  <p>完成分配给本人的固定版本表单，按分节逐步作答并提交；表单只记录作答，不生成量表分数。</p>
  <button type="button" disabled={busy||listPending} onClick={()=>void refresh()}>刷新自编表单任务</button></>}
  {!unified&&listPending&&<p role="status">正在读取任务列表，请稍候…</p>}
  {listError&&<div role="alert" className="ht-notice"><p>任务列表读取失败，请重试。</p><p>{listError}</p><button type="button" disabled={listPending} onClick={()=>void fetchPage(retryCursor)}>重试读取任务列表</button></div>}
  {message&&!visible&&<p role="status" className="ht-notice">{message}</p>}
  {!unified&&currentListing&&!listPending&&!listError&&!tasks.length&&<p className="ht-empty">暂无分配给本人的自编表单任务。</p>}
  <div className="ht-event-list">{tasks.map(task=><article className="ht-event" key={task.executionId}><strong>{task.formTitle}</strong>{unified&&<span className="ht-tag">{assessmentStatus(completed.includes(task.executionId)?"COMPLETED":task.status)}</span>}<p>{task.eventTitle}</p>
   {completed.includes(task.executionId)||task.status==='COMPLETED'?<span className="ht-tag">{unified?"本次测评已提交":"已完成正式提交"}</span>:canOpen(task)?<button type="button" disabled={busy||Boolean(visible)} onClick={()=>open(task)}>{unified?(task.status==='STARTED'?'继续测评':'开始测评'):(task.runStatus==='CLOSED'?'继续已有表单':'打开本人表单')}</button>:<p className="ht-muted">当前活动或任务未开放新的作答。</p>}
  </article>)}</div>
  {currentListing?.nextCursor&&<button type="button" disabled={busy||listPending} onClick={()=>void fetchPage(currentListing.nextCursor!)}>{unified?"加载更多测评任务":"加载更多表单任务"}</button>}
  {visible&&<TeacherAssessmentPage kind="answer" title={visible.task.formTitle} showTitle={false}><div className="ht-task">{message&&<p role="status" className="ht-notice">{message}</p>}{!unified&&<h3>正在完成：{visible.task.formTitle}</h3>}
   {!visible.attempt&&<><button type="button" disabled={busy} onClick={()=>void work(async()=>{await reload()})}>重新读取当前表单</button><button type="button" disabled={busy} onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='ABANDONED'&&<><p>本次作答已终止，不能继续提交。</p><button type="button" onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='COMPLETED'&&<><p>本次表单已正式提交。</p><button type="button" onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='IN_PROGRESS'&&!visible.attempt.currentItem&&<><p>正在确认完成状态，请刷新。</p><button type="button" disabled={busy} onClick={()=>void work(async()=>{await reload()})}>重新读取当前表单</button><button type="button" disabled={busy} onClick={leave}>返回任务列表</button></>}
   {visible.attempt?.status==='IN_PROGRESS'&&visible.attempt.currentItem&&<FinalCompositeAssessment
    key={`${actorKey}:${visible.task.executionId}:${visible.attempt.id}:${visible.attempt.currentItem?.id}:${visible.attempt.currentItem?.definitionHash}`}
    state={visible.attempt}
    autoAdvanceSingleChoice
        instructionsSummary="作答说明"
    submitFormSection={async(id,sectionId,input)=>{
     const source=activeRef.current,token=epoch.current
     if(!alive.current||!source||source.api!==api||currentApi.current!==api||source.attempt?.id!==id||source.task.executionId!==visible.task.executionId||sectionId!==(source.attempt.currentItem?.formSectionId||source.attempt.currentItem?.formSection?.id))throw Error('当前表单分节已切换，请重新读取。')
     const result=await api<unknown>(attemptPath(id)+'/form-sections/'+encodeURIComponent(sectionId)+'/submit','POST',input)
     if(!alive.current||token!==epoch.current||currentApi.current!==api)throw Error('任务已切换，请从当前任务列表核对提交状态。')
     return {code:0,message:'本次表单正式提交已确认',data:result}
    }}
    submitScale={async()=>{throw Error('私有表单任务不接受量表提交')}}
    mediaTransport={mediaTransport}
    onReload={reload} onExit={leave} onCompleted={()=>{void work(async()=>{await reload()})}}
    onEnterCognitive={()=>setMessage('当前表单不包含认知任务')}
    onEnterSituational={()=>setMessage('当前表单不包含情境判断任务')}
   />}
  </div></TeacherAssessmentPage>}
 </section>
}
