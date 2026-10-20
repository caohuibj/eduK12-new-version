import { useEffect, useRef, useState } from 'react'
import { assertCheckpointBinding, requestTrainingCheckpoint, type TrainingCheckpoint, type TrainingCheckpointDraft, type TrainingPersistence } from './training-checkpoint'
type Props = { preserveOtherDrafts?: boolean; policy?: TrainingPersistence; definitionHash?: string; publicMode?: boolean; recoveryToken?: string; disabled: boolean; getDrafts: () => Promise<TrainingCheckpointDraft[]>; restore: (drafts: TrainingCheckpointDraft[]) => Promise<void>; onBusy: (busy: boolean) => void; activeSlotKeys: string[] }
/** Explicit saves only. A read observes CAS; it never authorizes overwriting a conflict. */
export function TrainingCheckpointPanel(props: Props) {
  const {policy, definitionHash, publicMode=false, recoveryToken, disabled, getDrafts, restore, onBusy, activeSlotKeys} = props
  const [remote,setRemote]=useState<TrainingCheckpoint|null>(null)
  const [choice,setChoice]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const operation=useRef(false)
  const enabled=!!policy?.checkpoint?.enabled && !!definitionHash
  const run=async (action:()=>Promise<void>)=>{
    if(operation.current)return
    operation.current=true;setBusy(true);onBusy(true);setError('')
    try{await action()}catch(cause){setError(cause instanceof Error?cause.message:'操作失败，本机草稿已保留。')}
    finally{operation.current=false;setBusy(false);onBusy(false)}
  }
  const read=async()=>{
    const next=await requestTrainingCheckpoint(policy!.attemptId,publicMode,recoveryToken,'GET')
    assertCheckpointBinding(next,policy!,definitionHash!);setRemote(next);setChoice(!!next.envelope)
    setMessage(next.envelope?'检测到服务器草稿，请选择继续使用本机内容或恢复服务器内容。':'服务器暂无有效草稿。')
  }
  useEffect(()=>{
    if(!enabled)return
    let cancelled=false
    operation.current=true;setBusy(true);onBusy(true)
    void requestTrainingCheckpoint(policy!.attemptId,publicMode,recoveryToken,'GET').then(next=>{
      assertCheckpointBinding(next,policy!,definitionHash!)
      if(!cancelled){setRemote(next);setChoice(!!next.envelope);setMessage(next.envelope?'检测到服务器草稿，请明确选择恢复来源。':'服务器暂无有效草稿。')}
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'读取失败，本机草稿已保留。')}).finally(()=>{operation.current=false;if(!cancelled){setBusy(false);onBusy(false)}})
    return()=>{cancelled=true;onBusy(false)}
    // Only identity changes trigger reads, never answers or ordinary renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enabled,policy?.attemptId,policy?.attemptEpoch,policy?.snapshotHash,definitionHash,publicMode,recoveryToken])
  if(!enabled)return null
  const mutate=async(clear:boolean)=>{
    if(!remote||choice)return
    const local=clear?[]:await getDrafts()
    const envelope={schemaVersion:1 as const,snapshotHash:policy!.snapshotHash,definitionHash:definitionHash!,drafts:[...(remote.envelope?.drafts??[]).filter(row=>(props.preserveOtherDrafts||activeSlotKeys.includes(row.slotKey))&&!local.some(d=>d.slotKey===row.slotKey)),...local],cognitiveResults:remote.envelope?.cognitiveResults??[]}
    try{
      const next=await requestTrainingCheckpoint(policy!.attemptId,publicMode,recoveryToken,clear?'DELETE':'PUT',{expectedRevision:remote.revision,attemptEpoch:policy!.attemptEpoch,...(clear?{}:{envelope})})
      assertCheckpointBinding(next,policy!,definitionHash!);setRemote(clear?next:{...next,envelope});setMessage(clear?'服务器草稿已清除，本机答案仍保留。':'服务器已确认保存草稿；这不是正式交卷。')
    }catch(cause){
      // A failed/uncertain mutation must be reconciled explicitly before another write.
      setRemote(null);setChoice(false)
      throw new Error((cause as {status?:number})?.status===409?'服务器版本已改变。本机草稿未改动，请重新读取后选择恢复来源。':'保存结果未确认，本机草稿已保留。请重新读取服务器状态后再操作。')
    }
  }
  return <section aria-label="服务器草稿" className="mb-4 rounded border border-slate-200 p-3 space-y-2">
    <p>服务器草稿：每次成功保存后最长保留 {policy!.checkpoint!.ttlHours} 小时，课程或任务提前截止时会缩短。每次作答最多成功保存 100 次，清除或过期不重置次数。</p>
    {remote?.discardedTerminalSlotKeys?.length?<p>已正式交卷的单元保持服务器接受结果，不会恢复旧草稿或再次交卷。其余未提交单元仍可恢复。</p>:null}
    {remote?<p>已成功保存 {remote.successfulSaveCount}/100 次。{remote.expiresAt?`到期时间：${new Date(remote.expiresAt).toLocaleString()}`:''}</p>:null}
    <p role="status">{busy?'正在确认服务器草稿…':message}</p>{error?<p role="alert" className="text-red-700">{error}</p>:null}
    {choice?<div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy||disabled} onClick={()=>{setChoice(false);setMessage('继续使用本机草稿；服务器内容只有在点击保存后才会更新。')}}>继续使用本机草稿</button><button type="button" className="btn-secondary" disabled={busy||disabled} onClick={()=>void run(async()=>{await restore((remote?.envelope?.drafts??[]).filter(row=>activeSlotKeys.includes(row.slotKey)));setChoice(false);setMessage('已恢复服务器草稿到本机，尚未正式交卷。')})}>用服务器草稿替换本机未提交答案</button></div>:null}
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy||disabled||choice||!remote||remote.successfulSaveCount>=100} onClick={()=>void run(()=>mutate(false))}>保存服务器草稿</button><button type="button" className="btn-secondary" disabled={busy||disabled||choice||!remote} onClick={()=>void run(()=>mutate(true))}>清除服务器草稿</button><button type="button" className="btn-secondary" disabled={busy||disabled} onClick={()=>void run(read)}>重新读取服务器状态</button></div>
  </section>
}
