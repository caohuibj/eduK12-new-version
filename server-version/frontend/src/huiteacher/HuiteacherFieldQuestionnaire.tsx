import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {deferredPage} from '../components/page-loading/deferredPage'
import type {CompositeAttemptState} from '../modules/composite/types'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import {createTeacherAssessmentMediaTransport,teacherAssessmentParentPath} from './assessmentRuntime.client'
const FinalCompositeAssessment=deferredPage(()=>import('../components/FinalCompositeAssessment'))
export type FieldQuestionnaireTask={title:string;targetName:string;assessmentRef:{origin:{versionId:string;contentHash:string;targetKind:string}};attemptId:string|null;status:string;attemptEpoch:number|null}
export type FieldQuestionnaireProgress={attemptId:string|null;completed:boolean;writing:boolean}
type Props={api:EducationReportApi;invitationId:string;task:FieldQuestionnaireTask;onProgress:(state:FieldQuestionnaireProgress)=>void;onExit:()=>void}
export function HuiteacherFieldQuestionnaire({api,invitationId,task,onProgress,onExit}:Props){
 const [attempt,setAttempt]=useState<CompositeAttemptState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const alive=useRef(true),generation=useRef(0),pending=useRef(false),callback=useRef(onProgress),latest=useRef<FieldQuestionnaireProgress>({attemptId:task.attemptId,completed:task.status==='COMPLETED',writing:false})
 callback.current=onProgress
 latest.current={attemptId:attempt?.id??task.attemptId,completed:attempt?attempt.status==='COMPLETED':task.status==='COMPLETED',writing:busy}
 // Invalidate every in-flight read/action, including actions begun after the
 // initial load. Cleanup must not restore an older generation number.
 const invalidate=useCallback(()=>{alive.current=false;generation.current++},[])
 const fieldApi=useMemo<EducationReportApi>(()=><T,>(path:string,method?:string,body?:unknown,options?:{responseType?:'blob'})=>api<T>('/field-assessments'+path,method,body,options),[api])
 const media=useMemo(()=>attempt?.currentItem?createTeacherAssessmentMediaTransport(fieldApi,attempt.id,attempt.currentItem):undefined,[fieldApi,attempt])
 useEffect(()=>{callback.current(latest.current)},[attempt,busy])
 useEffect(()=>()=>callback.current({...latest.current,writing:false}),[])
 const read=async(id:string,token:number)=>{
  const state=await fieldApi<CompositeAttemptState>(teacherAssessmentParentPath(id)+'?view=current-unit')
  if(!alive.current||generation.current!==token)return
  if(state.id!==id||state.deliveryMode!=='FINAL_ONLY'||!['IN_PROGRESS','COMPLETED'].includes(state.status))throw Error('现场作答与当前固定问卷不匹配')
  setAttempt(state)
 }
 useEffect(()=>{
  alive.current=true;const token=++generation.current;pending.current=false;setBusy(false);setAttempt(null);setError('')
  if(task.attemptId){setBusy(true);void read(task.attemptId,token).catch(reason=>{if(alive.current&&generation.current===token)setError(reason instanceof Error?reason.message:'观察问卷暂不可读取')})
   .finally(()=>{if(alive.current&&generation.current===token)setBusy(false)})}
  return invalidate
  // The parent keys this host by account/invitation/source. A list refresh must
  // not replace an active native unit or a sealed FINAL draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[fieldApi,invitationId,task.assessmentRef.origin.versionId,invalidate])
 const action=async(job:(token:number)=>Promise<void>)=>{
  if(pending.current)return
  pending.current=true;setBusy(true);setError('');const token=++generation.current
  try{await job(token)}catch(reason){if(alive.current&&token===generation.current)setError(reason instanceof Error?reason.message:'观察问卷操作失败，请核对同一任务后重试');throw reason}
  finally{if(alive.current&&token===generation.current){pending.current=false;setBusy(false)}}
 }
 const start=()=>{void action(async token=>{
  const result=await fieldApi<{attemptId:string}>('/invitations/'+encodeURIComponent(invitationId)+'/start','POST',{})
  if(alive.current&&token===generation.current)await read(result.attemptId,token)
 }).catch(()=>undefined)}
 const reload=async()=>{if(attempt)await action(token=>read(attempt.id,token))}
 const submit=async(id:string,unitId:string,kind:'scale'|'form',payload:unknown)=>{
  if(!attempt||id!==attempt.id||!attempt.currentItem)throw Error('请先核对当前观察问卷')
  if(kind==='scale'&&(attempt.currentItem.type!=='SCALE'||attempt.currentItem.id!==unitId)
   ||kind==='form'&&(attempt.currentItem.type!=='FORM_SECTION'||attempt.currentItem.formSectionId!==unitId))throw Error('提交单元不属于当前固定问卷')
  let receipt:unknown
  await action(async _token=>{
   const suffix=kind==='scale'?'/items/'+encodeURIComponent(unitId)+'/scale/submit?response=receipt':'/form-sections/'+encodeURIComponent(unitId)+'/submit'
   receipt=await fieldApi(teacherAssessmentParentPath(id)+suffix,'POST',payload)
   const response=receipt as {submissionId?:unknown;payloadHash?:unknown;replayed?:unknown;completed?:unknown;sectionId?:unknown}|null
   if(!response||response.submissionId!==(payload as {submissionId?:unknown}).submissionId||typeof response.payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(response.payloadHash)
    ||typeof response.replayed!=='boolean'||(kind==='scale'?response.completed!==true:response.sectionId!==unitId))throw Error('服务器确认与本次提交不匹配，请保留同一草稿并重新核对进度')
  })
  return {code:0,message:'正式提交已确认',data:receipt}
 }
 return <section aria-label="专家观察固定问卷"><h4>{task.title}</h4><p>观察目标：{task.targetName} · 固定版本 {task.assessmentRef.origin.contentHash.slice(0,12)}…</p>
  <p>按已接受的本次邀请作答。量表独立计分，表单不计分；完成问卷后，再由你确认正式提交专业意见。正式证据仅供获权管理员经 MFA 和审计读取，不自动向被评价者公开个人答案。</p>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在核对同一观察任务…</p>}
  {attempt?.status==='COMPLETED'?<p role="status">观察问卷已完成，正式提交已确认。请保存专业意见后完成本次正式反馈。</p>:
   attempt?<FinalCompositeAssessment key={attempt.id+':'+(attempt.currentItem?.id??'')} state={attempt} campusMode mediaTransport={media}
    submitScale={(id,itemId,payload)=>submit(id,itemId,'scale',payload)} submitFormSection={(id,sectionId,payload)=>submit(id,sectionId,'form',payload)}
    onReload={reload} onCompleted={()=>{void reload().catch(()=>undefined)}} onExit={onExit}
    onEnterCognitive={()=>setError('专家观察仅支持量表和表单')} onEnterSituational={()=>setError('专家观察仅支持量表和表单')}/>:
   <button disabled={busy} onClick={start}>开始或恢复本次观察问卷</button>}
  {attempt&&error&&<button disabled={busy} onClick={()=>void reload().catch(()=>undefined)}>重新核对观察问卷进度</button>}
 </section>
}
