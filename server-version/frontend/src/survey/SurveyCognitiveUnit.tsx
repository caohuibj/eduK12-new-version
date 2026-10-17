import { holdSurveyCognitiveDraft } from './survey-cognitive-retention'
import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { CognitiveRunner } from '../modules/cognitive/pages/CognitiveRunner'
import { finalDraftStore } from '../services/persistence/finalDraftStore'
import { SurveyCognitiveDeviceGate,verifySurveyCognitiveStorage } from './SurveyCognitiveDeviceGate'
import { clearSurveyCognitiveSession,rememberSurveyCognitiveSession } from './survey-cognitive-local'
import { createSurveyCognitiveApi,surveyCognitivePath,type SurveyCognitiveRequest,type SurveyCredential,
  type SurveyCognitiveReference,type SurveyCognitiveSession,type SurveyCognitiveSessionInfo } from './survey-cognitive-api'

async function hasMatchingSealedFinal(session:SurveyCognitiveSession){
  const local=await finalDraftStore.get('cognitive:'+session.sessionId)
  return !!local?.sealedSubmission&&local.attemptId===session.sessionId
    &&local.attemptEpoch===(session.attemptEpoch??session.attemptNo)
    &&local.definitionHash===session.definitionHash
    &&local.contextSnapshotHash===(session.contextSnapshotHash??null)
}
export function SurveyCognitiveUnit({publicId,attemptId,instrumentKey,title,proof,request,priorAnswers,existing,
  onStarted,onCommitted,onRunningChange}:{publicId:string;attemptId:string;instrumentKey:string;title:string;
  proof:SurveyCredential;request:SurveyCognitiveRequest;priorAnswers:Record<string,Record<string,unknown>>;
  existing?:SurveyCognitiveSessionInfo;onStarted:(info:SurveyCognitiveSessionInfo,lockedPriorAnswers?:Record<string,Record<string,unknown>>)=>void;
  onCommitted:(reference:SurveyCognitiveReference)=>void;onRunningChange:(running:boolean)=>void}){
  const [sessionId,setSessionId]=useState(''),[epoch,setEpoch]=useState(existing?.epoch??1)
  const [recovery,setRecovery]=useState(false),[checking,setChecking]=useState(!!existing)
  const [committed,setCommitted]=useState<SurveyCognitiveReference|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0)
  const enteredHere=useRef(false),restartPending=useRef(false),inFlight=useRef(false)
  const startPending=useRef<Record<string,unknown>|null>(null),activeSessionId=useRef(existing?.sessionId??'')
  const mounted=useRef(true),generation=useRef(0)
  const draftLease=useRef<{id:string;controller:AbortController;ready:Promise<void>}|null>(null)
  const releaseDraft=()=>{draftLease.current?.controller.abort();draftLease.current=null}
  const holdDraft=async(id:string)=>{
    if(draftLease.current?.id===id){await draftLease.current.ready;return}
    releaseDraft()
    const controller=new AbortController()
    const ready=holdSurveyCognitiveDraft(id,controller.signal).then(release=>{if(controller.signal.aborted)release()})
    draftLease.current={id,controller,ready}
    try{await ready}catch(error){if(draftLease.current?.controller===controller)releaseDraft();throw error}
  }
  const isCurrent=(token:number)=>mounted.current&&generation.current===token
  const path=surveyCognitivePath(publicId,attemptId,instrumentKey)
  const callbacks=useRef({onStarted,onCommitted,onRunningChange});callbacks.current={onStarted,onCommitted,onRunningChange}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;releaseDraft();callbacks.current.onRunningChange(false)}},[])
  const cleanup=useCallback(async(id:string)=>{
    const token=generation.current
    if(id&&!await clearSurveyCognitiveSession(publicId,id)&&isCurrent(token))setError('服务器状态已确认，但本机试次清理失败。请关闭本研究页面并清理本网站存储。')
  },[publicId])
  const accept=useCallback((reference:SurveyCognitiveReference)=>{
    if(!mounted.current)return
    releaseDraft()
    void cleanup(activeSessionId.current)
    setCommitted(reference);callbacks.current.onCommitted(reference);callbacks.current.onRunningChange(false)
  },[cleanup])
  const api=useMemo(()=>createSurveyCognitiveApi(request,path,proof,accept),[request,path,proof.accessCredential,proof.researchCode,accept])
  const recordSession=(session:SurveyCognitiveSession)=>{
    activeSessionId.current=session.sessionId
    rememberSurveyCognitiveSession(publicId,attemptId,session.sessionId,proof.researchCode)
    setSessionId(session.sessionId);setEpoch(session.attemptEpoch??session.attemptNo)
    callbacks.current.onStarted({slotKey:instrumentKey,sessionId:session.sessionId,status:session.status,
      epoch:session.attemptEpoch??session.attemptNo,resultReference:session.resultReference},session.lockedPriorAnswers)
  }
  const admit=async(session:SurveyCognitiveSession,allowFresh:boolean,token=generation.current)=>{
    if(!isCurrent(token))return false
    await holdDraft(session.sessionId)
    if(!isCurrent(token))return false
    setRecovery(true);recordSession(session)
    if(session.status==='COMPLETED'&&session.resultReference){accept(session.resultReference);return false}
    // Server allocation is the one-use fresh admission. Replayed starts and
    // restarts may only submit an exactly matching sealed FINAL, never rerun trials.
    const runnable=(allowFresh&&session.freshAdmission===true)||await hasMatchingSealedFinal(session)
    if(!isCurrent(token))return false
    if(runnable){
      setRecovery(false);callbacks.current.onRunningChange(true);return true
    }else{
      releaseDraft()
      setRecovery(true);callbacks.current.onRunningChange(false)
      if((session.attemptEpoch??session.attemptNo)>=2)setError('整单元重做机会已使用，无法安全恢复计时任务。仅能核对已封存提交；若没有，请联系研究者。')
      return false
    }
  }
  useEffect(()=>{
    if(!existing||enteredHere.current){setChecking(false);return}
    setChecking(true);setError('')
    let alive=true
    const token=generation.current
    void (async()=>{
      try{
        await holdDraft(existing.sessionId)
        if(!alive||!isCurrent(token))return
        const current=await request<SurveyCognitiveSession>(path+'/'+encodeURIComponent(existing.sessionId)+'/read','POST',proof)
        if(!alive||!isCurrent(token))return
        await admit(current,false,token)
      }catch(e){if(alive&&isCurrent(token)){releaseDraft();setError(e instanceof Error?e.message:'任务状态无法确认，请重试读取')}}
      finally{if(alive&&isCurrent(token))setChecking(false)}
    })()
    return()=>{alive=false}
  },[existing?.sessionId,path,reload])
  const enter=async()=>{
    if(!mounted.current||inFlight.current)return
    const token=generation.current
    inFlight.current=true;setBusy(true);setError('');callbacks.current.onRunningChange(true)
    // Hold both navigation and the exact start input across an ambiguous network
    // outcome. A retry cannot silently allocate using subsequently edited answers.
    startPending.current??=JSON.parse(JSON.stringify({...proof,priorAnswers,
      administrationProvenance:{schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}}))
    let resolved=false
    try{
      const session=await request<SurveyCognitiveSession>(path+'/start','POST',startPending.current)
      if(!isCurrent(token))return
      resolved=true;startPending.current=null;enteredHere.current=true
      await admit(session,true,token)
    }catch(e){
      if(!isCurrent(token))return
      const status=(e as {status?:number})?.status
      if(status===400||status===413){startPending.current=null;resolved=true}
      if(resolved){releaseDraft();callbacks.current.onRunningChange(false)}
      setError(e instanceof Error?e.message:'任务无法开始')
    }
    finally{if(isCurrent(token)){inFlight.current=false;setBusy(false)}}
  }
  const readThenRestart=async()=>{
    if(!mounted.current||inFlight.current)return
    const token=generation.current
    inFlight.current=true;setBusy(true);setError('');callbacks.current.onRunningChange(true)
    let runnerMounted=false
    try{
      await holdDraft(sessionId)
      if(!isCurrent(token))return
      if(!restartPending.current){
        const current=await request<SurveyCognitiveSession>(path+'/'+encodeURIComponent(sessionId)+'/read','POST',proof)
        if(!isCurrent(token))return
        recordSession(current)
        if(current.status==='COMPLETED'&&current.resultReference){accept(current.resultReference);return}
        const sealed=await hasMatchingSealedFinal(current)
        if(!isCurrent(token))return
        if(sealed){setRecovery(false);runnerMounted=true;return}
        if((current.attemptEpoch??epoch)>=2)throw new Error('已达到本研究的一次整单元重做上限。没有可重交的已封存提交，请联系研究者。')
        await verifySurveyCognitiveStorage()
        if(!isCurrent(token))return
        await request(path+'/'+encodeURIComponent(sessionId)+'/interrupt','POST',{...proof,attemptEpoch:epoch})
        if(!isCurrent(token))return
        restartPending.current=true
      }
      const previous=sessionId
      const next=await request<SurveyCognitiveSession>(path+'/'+encodeURIComponent(previous)+'/restart','POST',{...proof,attemptEpoch:epoch})
      if(!isCurrent(token))return
      restartPending.current=false;enteredHere.current=true
      await cleanup(previous)
      runnerMounted=await admit(next,true,token)
    }catch(e){if(isCurrent(token))setError(e instanceof Error?e.message:'无法重做任务')}
    finally{if(isCurrent(token)){if(!runnerMounted){releaseDraft();callbacks.current.onRunningChange(false)};inFlight.current=false;setBusy(false)}}
  }
  return <section className="border rounded-xl p-4 bg-white space-y-3" aria-label={'认知任务 '+title}>
    <h3 className="font-semibold text-lg">{title}</h3>
    {error&&<p role="alert">{error}</p>}
    {committed?<div role="status" className="space-y-2"><h4 className="font-semibold">此任务已提交</h4>
      <p>认知子结果已由服务器确认。请继续完成本轮研究并提交整轮回答。</p>
      <p className="text-xs">任务回执：{committed.resultId} · 尝试 {committed.epoch}</p></div>:
      checking?<p role="status">正在核对已保存的任务状态…</p>:
      recovery?<div className="space-y-3"><p>此前任务未确认完成。不会混入旧试次或从中间续测；先查询已封存提交，再按冻结规则整单元重做。</p>
        <p className="text-sm">已用尝试：{epoch} / 2。之前的普通问卷答案保持锁定。</p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void readThenRestart()}>{epoch>=2?'仅核对已封存提交':'核对提交并处理整单元重做'}</button></div>:
      sessionId?<MemoryRouter><CognitiveRunner key={sessionId} embedded={{sessionId,api,
        requiredInput:'KEYBOARD',failClosedOnTrialPersistence:true,completionTitle:'此认知任务已提交',completionAction:'确认任务回执，继续研究',
        completionNotice:'单个任务已持久化；整轮研究尚需最终提交。',
        onCompleted:()=>{const token=generation.current;void api.getSession(sessionId).catch(e=>{if(isCurrent(token))setError(e instanceof Error?e.message:'回执读取失败')})},
        onExit:()=>{releaseDraft();setRecovery(true);callbacks.current.onRunningChange(false)},
      }}/></MemoryRouter>:
      !busy&&!error&&!startPending.current&&<SurveyCognitiveDeviceGate onReady={()=>void enter()}/>}
    {busy&&<p role="status">正在核对认知任务…</p>}
    {error&&!sessionId&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{if(startPending.current)void enter();else if(existing)setReload(n=>n+1);else setError('')}}>{startPending.current?'核对本次开始请求':'重新检查设备和任务'}</button>}
  </section>
}
