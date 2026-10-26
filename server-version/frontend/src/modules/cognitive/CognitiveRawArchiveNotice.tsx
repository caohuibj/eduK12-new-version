import React,{useEffect,useRef,useState} from 'react'
import type {CognitiveSession} from './types'
import type {CognitiveSessionApi} from './api'
import {cognitiveDraftKey} from './core/useCognitiveSession'
import {finalDraftStore} from '../../services/persistence/finalDraftStore'
import {finishCognitiveCoreDraft,retryCognitiveRawArchive,type CognitiveRawArchiveState} from './core/raw-archive'
import {nativeCompletedReceipt} from './core/native-session-contract'
/** The saved report never waits for research/raw archival. No background/closed-browser guarantee. */
export function CognitiveRawArchiveNotice({session,api}:{session:CognitiveSession;api:CognitiveSessionApi}){
 const [raw,setRaw]=useState<CognitiveRawArchiveState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const auto=useRef('')
 const retry=async()=>{
  if(!api.archiveRaw||busy)return
  setBusy(true);setMessage('')
  try{
   const meta=await finalDraftStore.get(cognitiveDraftKey(session))
   if(!meta)throw Error('本设备未找到等待归档的原记录')
   nativeCompletedReceipt(session,meta)
   await finishCognitiveCoreDraft(cognitiveDraftKey(session))
   const next=await retryCognitiveRawArchive(cognitiveDraftKey(session),async(identity,value)=>{
    const response=await api.archiveRaw!(identity,{...value,...(session.submissionPayloadHash?{expectedCoreHash:session.submissionPayloadHash}:{})})
    if(response.code!==0||!response.data)throw Error(response.message||'完整记录归档尚未确认')
    return response.data
   });setRaw(next)
  }catch(e){setMessage(e instanceof Error?e.message:'完整记录归档尚未确认')}
  finally{setBusy(false)}
 }
 useEffect(()=>{
  let cancelled=false
  if(!session.nativeTask||session.status!=='COMPLETED'||!api.archiveRaw)return
  void (async()=>{
   const meta=await finalDraftStore.get(cognitiveDraftKey(session))
   if(!meta?.cognitiveRawArchive)return
   nativeCompletedReceipt(session,meta)
   if(!cancelled)setRaw(meta.cognitiveRawArchive)
   const state=await finishCognitiveCoreDraft(cognitiveDraftKey(session))
   if(cancelled)return
   setRaw(state)
  })().catch(e=>{if(!cancelled)setMessage(e instanceof Error?e.message:'完整记录归档尚未确认')})
  return()=>{cancelled=true}
 },[session.sessionId,session.attemptEpoch,session.status,api])
 useEffect(()=>{
  if(!raw||raw.archiveConfirmed||!raw.coreSaved)return
  const key=JSON.stringify(raw.identity)
  if(auto.current===key)return
  auto.current=key;void retry()
 },[raw?.identity.sessionId,raw?.identity.attemptEpoch,raw?.identity.submissionId])
 if(raw&&raw.identity.sessionId!==session.sessionId)return null
 if(!raw&&!message)return null
 return <aside className="my-4 rounded border p-3 text-sm" data-report-screen-only aria-live="polite">
  <p>作答已提交，报告已保存。</p>
  <p>{raw?.archiveConfirmed?'完整记录已归档。':'完整记录仍保留在本设备，归档尚未确认。请保留本设备的浏览器数据；关闭页面后不会自动上传。'}</p>
  {message&&<p role="status">{message}</p>}
  {!raw?.archiveConfirmed&&raw&&<button type="button" disabled={busy} className="btn-secondary mt-2" onClick={()=>void retry()}>{busy?'正在归档…':'保存完整记录'}</button>}
 </aside>
}
