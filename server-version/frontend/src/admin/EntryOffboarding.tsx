import {useEffect,useState} from 'react'
import api from '../api/client'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import {entryLabels,type AdminEntry} from './authority'

type Review = {
 version:number
 digest:string
 items:{id:string;category:'COLLECTING'|'DRAFT'|'CONFIGURATION';title:string;ready:boolean}[]
 counts:{collecting:number;drafts:number;configurations:number;pending:number}
 successors:{id:string;username:string}[]
 truncated?:boolean
}

const names={COLLECTING:'正在收集',DRAFT:'待核对草稿',CONFIGURATION:'固定配置'}

export default function EntryOffboarding({account,entry,currentVersion,onClose,onComplete}:{
 account:{id:string;username:string};entry:AdminEntry;currentVersion:number;onClose:()=>void;onComplete:()=>void
}){
 const path=`/admin/permissions/accounts/${account.id}/entries/${entry}`
 const [review,setReview]=useState<Review|null>(null)
 const [mode,setMode]=useState<'PLANNED'|'EMERGENCY'>('PLANNED')
 const [successorId,setSuccessorId]=useState('')
 const [reason,setReason]=useState('')
 const [reload,refresh]=useState(0)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{
  let live=true
  const query=successorId?'?'+new URLSearchParams({successorId}):''
  setLoading(true);setReview(null);setError('')
  void api.get<Review>(path+'/offboarding'+query).then(({data})=>{
   if(live&&data)setReview(data)
  }).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:'影响读取失败')})
   .finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false}
 },[path,successorId,reload])
 const blocked=busy||!reason.trim()||mode==='PLANNED'&&(loading||!review||review.counts.pending>0)
 async function revoke(){
  if(blocked)return
  if(mode==='EMERGENCY'&&!window.confirm('确认立即撤销？依赖本账号的未交接配置可能停止发布或收集。'))return
  const offboarding=mode==='PLANNED'&&review
   ? {mode,digest:review.digest,...(successorId?{successorId}:{})}
   : {mode:'EMERGENCY'}
  setBusy(true);setError('')
  try{
   await api.put(path,{active:false,expectedVersion:review?.version??currentVersion,reason:reason.trim(),offboarding})
   onComplete()
  }catch(cause){setError(cause instanceof Error?cause.message:'撤销结果未确认，请刷新影响后核对')}
  finally{setBusy(false)}
 }
 return <ManagementDialog open title="撤销入口管理权限" description={`${account.username} · ${entryLabels[entry]}`}
  closeDisabled={busy} onClose={onClose} actions={<>
   <button type="button" disabled={busy} onClick={onClose}>关闭</button>
   <button type="button" disabled={blocked} onClick={()=>void revoke()}>{mode==='PLANNED'?'确认交接并撤权':'立即紧急撤权'}</button>
  </>}>
  <label className="system-field">撤权方式<select disabled={busy} value={mode} onChange={event=>{setMode(event.target.value as typeof mode);if(successorId){setReview(null);setSuccessorId('')}}}>
   <option value="PLANNED">正常交接</option><option value="EMERGENCY">紧急撤权</option>
  </select></label>
  {loading&&<p role="status">正在核对下游影响…</p>}
  {error&&<p role="alert">{error}</p>}
  {review&&<>
   {mode==='PLANNED'&&entry!=='TRAINING'&&review.successors.length>0&&<label className="system-field">接任管理员
    <select disabled={busy} value={successorId} onChange={event=>{setReview(null);setSuccessorId(event.target.value)}}>
     <option value="">选择接任人以核对重发</option>
     {review.successors.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.username}</option>)}
    </select>
   </label>}
   <p>在收任务 {review.counts.collecting} 项 · 草稿 {review.counts.drafts} 项 · 固定配置 {review.counts.configurations} 项 · 待处理 {review.counts.pending} 项</p>
   {review.items.length>0&&<ul>{review.items.map(item=><li key={item.category+':'+item.id}>
    {names[item.category]} · {item.title} · {item.ready?'已核对':'待处理'}
   </li>)}</ul>}
   {review.truncated&&<p>此处显示部分记录。上方数量包含全部受影响记录。</p>}
   {mode==='PLANNED'&&review.counts.pending>0&&<p>请由对应入口管理员核对在收任务、重发固定配置，并在原草稿重新选择新授权后刷新。</p>}
  </>}
  <label className="system-field">撤权原因<textarea maxLength={500} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  <button type="button" disabled={busy||loading} onClick={()=>refresh(value=>value+1)}>刷新下游影响</button>
 </ManagementDialog>
}
