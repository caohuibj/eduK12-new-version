import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {MemoryRouter} from 'react-router-dom'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import {CognitiveRunner} from '../modules/cognitive/pages/CognitiveRunner'
import SituationalRunner from '../modules/situational/pages/SituationalRunner'
import type {CompositeAttemptState,CompositeCurrentItem} from '../modules/composite/types'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import {TeacherAssessmentPage} from './TeacherAssessmentPage'
import {assessmentStatus,type AssessmentListPresentation} from './assessmentTaskPresentation'
import {createTeacherCognitiveClient,createTeacherSituationalClient,createTeacherAssessmentMediaTransport,
 teacherAssessmentParentPath,type TeacherAssessmentTask,type TeacherAssessmentCompletion} from './assessmentRuntime.client'

export type TeacherAssessmentRuntimeProps={
 api:EducationReportApi;actorKey:string;
 onCompleted?:(completion:TeacherAssessmentCompletion)=>void;
 renderFeedback?:(completion:TeacherAssessmentCompletion)=>ReactNode
}&AssessmentListPresentation
type Session={task:TeacherAssessmentTask;attempt:CompositeAttemptState|null;child:CompositeCurrentItem|null;completion:TeacherAssessmentCompletion|null}
/** A change of account replaces the complete host, including pending requests,
 * consent state, local completion identity and any injected feedback component. */
export function HuiteacherMyAssessmentTasks(props:TeacherAssessmentRuntimeProps){
 const context=useRef({api:props.api,actorKey:props.actorKey,version:0})
 if(context.current.api!==props.api||context.current.actorKey!==props.actorKey)
  context.current={api:props.api,actorKey:props.actorKey,version:context.current.version+1}
 return <TeacherAssessmentTasksSession key={context.current.version} {...props}/>
}
function TeacherAssessmentTasksSession({api,actorKey,unified=false,onListStateChange,onCompleted,renderFeedback}:TeacherAssessmentRuntimeProps){
 const [rows,setRows]=useState<TeacherAssessmentTask[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const [list,setList]=useState({pending:true,error:'',loaded:false})
 const [session,setSession]=useState<Session|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [accepted,setAccepted]=useState(false)
 const generation=useRef(0),listGeneration=useRef(0),active=useRef(session),apiRef=useRef(api)
 const completed=useRef(new Set<string>()),completionCallback=useRef(onCompleted)
 active.current=session;apiRef.current=api;completionCallback.current=onCompleted
 const panel=useRef<HTMLDivElement>(null)
 const mounted=useRef(true)
 const invalidateRequests=useCallback(()=>{generation.current++;listGeneration.current++},[])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;invalidateRequests()}},[invalidateRequests])
 const refresh=useCallback(async(appendCursor?:string)=>{
  const token=++listGeneration.current
  const valid=()=>mounted.current&&apiRef.current===api&&token===listGeneration.current
  setList(old=>({...old,pending:true,error:''}))
  try{
   const data=await api<{list:TeacherAssessmentTask[];nextCursor:string|null}>('/my-assessment-tasks'+(appendCursor?'?cursor='+encodeURIComponent(appendCursor):''))
   if(!valid())return
   setRows(old=>appendCursor?[...old,...data.list.filter(row=>!old.some(value=>value.executionId===row.executionId))]:data.list)
   setCursor(data.nextCursor);setList({pending:false,error:'',loaded:true})
  }catch(reason){if(valid())setList(old=>({...old,pending:false,error:reason instanceof Error?reason.message:'任务列表暂不可读取'}))}
 },[api])
 useEffect(()=>{
  generation.current++;setSession(null);setBusy(false);setError('');setAccepted(false);completed.current.clear()
  setRows([]);setCursor(null);setList({pending:true,error:'',loaded:false});void refresh()
  return invalidateRequests
 },[api,refresh,invalidateRequests])
 useEffect(()=>onListStateChange?.({pending:list.pending,error:!!list.error,count:rows.length}),[onListStateChange,list.pending,list.error,rows.length])
 const activeExecutionId=session?.task.executionId
 useEffect(()=>{if(activeExecutionId){panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView?.({block:'start'})}},[activeExecutionId])
 const leave=()=>{generation.current++;active.current=null;setSession(null);setBusy(false);setError('');setAccepted(false)}
 const execute=async(work:(valid:()=>boolean)=>Promise<void>)=>{
  if(!mounted.current||apiRef.current!==api)return
  const token=++generation.current
  const valid=()=>mounted.current&&apiRef.current===api&&generation.current===token
  setBusy(true);setError('')
  try{await work(valid)}catch(reason){if(valid())setError(reason instanceof Error?reason.message:'测评暂不可读取，请重试')}
  finally{if(valid())setBusy(false)}
 }
 const load=async(task:TeacherAssessmentTask,attemptId:string,valid:()=>boolean)=>{
  const state=await api<CompositeAttemptState>(teacherAssessmentParentPath(attemptId)+'?view=current-unit')
  if(!valid())return
  if(state.id!==attemptId||state.deliveryMode!=='FINAL_ONLY')throw new Error('测评记录与当前冻结任务不一致')
  if(state.status==='COMPLETED'){
   const completion={executionId:task.executionId,attemptId:state.id},key=completion.executionId+':'+completion.attemptId
   setSession({task,attempt:state,child:null,completion})
   // Completion is durable even when list refresh or report reading fails.
   void refresh()
   if(!completed.current.has(key)){completed.current.add(key);completionCallback.current?.(completion)}
  }else{
   if(state.status!=='IN_PROGRESS')throw new Error('当前测评已结束，不能继续作答')
   setSession({task,attempt:state,child:null,completion:null})
  }
 }
 const open=(task:TeacherAssessmentTask)=>{
  if(active.current||busy)return
  generation.current++;setAccepted(false);setError('')
  const next={task,attempt:null,child:null,completion:null};active.current=next;setSession(next)
  if(task.runtimeBindingRef)void execute(valid=>load(task,task.runtimeBindingRef!,valid))
 }
 const launch=()=>{
  const source=active.current
  if(!source||busy)return
  void execute(async valid=>{
   const task=source.task
   if(task.runtimeBindingRef){await load(task,task.runtimeBindingRef,valid);return}
   if(task.consentRequired){
    if(!accepted)throw new Error('请先阅读并明确同意本次测评用途与可见性说明')
    await api('/run-executions/'+encodeURIComponent(task.executionId)+'/assessment-consent/accept','POST',{})
    if(!valid())return
   }
   const result=await api<{state:string;runtimeBindingKind?:string;runtimeBindingRef?:string}>(
    '/run-executions/'+encodeURIComponent(task.executionId)+'/start-assessment','POST',{})
   if(!valid())return
   if(result.state==='IN_PROGRESS')throw new Error('测评正在建立，请稍后重新核对同一任务')
   if(result.state!=='STARTED'||result.runtimeBindingKind!=='COMPOSITE'||!result.runtimeBindingRef)throw new Error('当前任务尚无获授权的正式运行记录')
   await load(task,result.runtimeBindingRef,valid)
  })
 }
 const reload=async()=>{
  const source=active.current,token=generation.current
  if(!source?.attempt)return
  const valid=()=>mounted.current&&apiRef.current===api&&generation.current===token&&active.current===source
  await load(source.task,source.attempt.id,valid)
 }
 const childFinished=()=>{void execute(async valid=>{
  const source=active.current
  if(source?.attempt)await load(source.task,source.attempt.id,valid)
 })}
 const attempt=session?.attempt,child=session?.child
 const parentId=attempt?.id
 const cognitive=useMemo(()=>parentId&&child?.type==='COGNITIVE'&&child.cognitiveSession?.sessionId
  ?createTeacherCognitiveClient(api,parentId,child.id,child.cognitiveSession.sessionId):null,[api,parentId,child])
 const situational=useMemo(()=>parentId&&child?.type==='SITUATIONAL'&&child.situationalAttemptId
  ?createTeacherSituationalClient(api,parentId,child.id,child.situationalAttemptId):null,[api,parentId,child])
 const media=useMemo(()=>attempt?.currentItem?createTeacherAssessmentMediaTransport(api,attempt.id,attempt.currentItem):undefined,[api,attempt])
 const submit=async(id:string,unitId:string,type:'scale'|'form',payload:unknown)=>{
  const source=active.current,token=generation.current
  if(!source?.attempt||source.attempt.id!==id||source.completion||source.child
   ||(type==='scale'?source.attempt.currentItem?.id:source.attempt.currentItem?.formSectionId??source.attempt.currentItem?.id)!==unitId)
   throw new Error('作答单元已切换，请重新读取任务')
  const suffix=type==='scale'?'/items/'+encodeURIComponent(unitId)+'/scale/submit?response=receipt':'/form-sections/'+encodeURIComponent(unitId)+'/submit'
  const data=await api<unknown>(teacherAssessmentParentPath(id)+suffix,'POST',payload)
  if(!mounted.current||apiRef.current!==api||generation.current!==token||active.current!==source)throw new Error('任务已切换，请重新读取提交状态')
  return {code:0,message:'本次提交已确认',data}
 }
 const enterChild=(item:CompositeCurrentItem)=>{
  const source=active.current
  if(!source?.attempt||source.attempt.currentItem?.id!==item.id)return
  if(item.type==='COGNITIVE'&&!item.cognitiveSession?.sessionId||item.type==='SITUATIONAL'&&!item.situationalAttemptId){setError('当前子测评缺少冻结运行记录');return}
  setSession({...source,child:item})
 }
 return <section className={unified?'ht-assessment-source':'ht-panel'} aria-label={unified?undefined:'教师认知情境与组合测评'}>
  {!unified&&<h2>我的测评任务</h2>}
  {!unified&&list.pending&&<p role="status">正在读取任务…</p>}
  {list.error&&<div role="alert"><p>{list.error}</p><button disabled={list.pending} onClick={()=>void refresh()}>重试读取任务</button></div>}
  {list.loaded&&!rows.length&&!unified&&!list.pending&&!list.error&&<p>暂无分配给你的测评任务。</p>}
  <div className="ht-event-list">{rows.map(task=><article className="ht-event" key={task.executionId}>
   <strong>{task.title}</strong> <span className="ht-tag">{assessmentStatus(task.status)}</span><p>{task.eventTitle}</p>
   <button disabled={!!session||busy} onClick={()=>open(task)}>{task.status==='COMPLETED'?'查看完成状态':task.runtimeBindingRef?'继续测评':'开始测评'}</button>
  </article>)}</div>
  {cursor&&<button disabled={list.pending} onClick={()=>void refresh(cursor)}>加载更多测评任务</button>}
  {session&&<TeacherAssessmentPage kind="answer" title={session.task.title} showTitle={false}>
   <div ref={panel} tabIndex={-1} role="region" aria-label="当前教师测评作答">
    <button onClick={leave}>返回任务列表</button>
    {error&&<p role="alert">{error}</p>}
    {busy&&<p role="status">正在核对测评状态…</p>}
    {session.completion?<div role="status"><h3>本次测评已完成</h3><p>正式作答已提交并确认，反馈按独立授权规则开放。</p>
      {renderFeedback?.(session.completion)}
     </div>:
     child?.type==='COGNITIVE'&&child.cognitiveSession?.sessionId&&cognitive?
      <MemoryRouter key={actorKey+':'+child.cognitiveSession.sessionId}><CognitiveRunner embedded={{sessionId:child.cognitiveSession.sessionId,api:cognitive,
       completionTitle:'本项认知测评已完成',completionAction:'继续本次测评',completionNotice:'正式提交已确认；继续核对整份任务进度。',
       onCompleted:childFinished,onExit:()=>setSession(old=>old?{...old,child:null}:null)}}/></MemoryRouter>:
     child?.type==='SITUATIONAL'&&child.situationalAttemptId&&attempt&&situational?
      <MemoryRouter key={actorKey+':'+child.situationalAttemptId}><SituationalRunner host={{attemptId:child.situationalAttemptId,parentAttemptId:attempt.id,
       compositeItemId:child.id,instructionsSummary:'作答说明',client:situational,onCompleted:childFinished}}/></MemoryRouter>:
     attempt?<FinalCompositeAssessment key={attempt.id+':'+(attempt.currentItem?.id??'')} state={attempt} campusMode mediaTransport={media}
      submitScale={(id,itemId,input)=>submit(id,itemId,'scale',input)}
      submitFormSection={(id,sectionId,input)=>submit(id,sectionId,'form',input)}
      onReload={reload} onCompleted={()=>{void execute(valid=>load(session.task,attempt.id,valid))}} onExit={leave}
      onEnterCognitive={enterChild} onEnterSituational={enterChild}/>:
     <div><h3>{session.task.title}</h3>
      {session.task.consentRequired&&!session.task.runtimeBindingRef&&<div>
       <p>用途：{session.task.consentPurpose??'本次正式测评'}</p><p>可见性：{session.task.consentVisibility??'按任务授权范围'}</p>
       <label><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>我已阅读用途与可见性说明，自愿同意作答。</label>
      </div>}
      <button disabled={busy||session.task.consentRequired&&!session.task.runtimeBindingRef&&!accepted} onClick={launch}>开始或继续测评</button>
     </div>}
    {attempt&&!session.completion&&error&&<button disabled={busy} onClick={childFinished}>重新核对任务进度</button>}
   </div>
  </TeacherAssessmentPage>}
 </section>
}
