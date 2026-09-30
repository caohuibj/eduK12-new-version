import { useCallback, useEffect, useRef, useState } from 'react'
import { anonymousStudyApi, type Study, type WaveStatistics } from '../api/anonymousStudy'
import { sessionFetch } from '../api/client'
import { publicDeliveryAdapter, type PublicDeliveryLink } from '../api/publicDelivery'
import { useAuth } from '../contexts/AuthContext'

export function AnonymousStudyManager({compositeId,links}:{compositeId:string;links:PublicDeliveryLink[]}) {
 const {user}=useAuth(),epoch=useRef(0),scope=useRef(0)
 const invalidateEpoch=useCallback(()=>{epoch.current++},[])
 const invalidateScope=useCallback(()=>{scope.current++;epoch.current++},[])
 const [studies,setStudies]=useState<Study[]>([]),[selected,setSelected]=useState(''),[title,setTitle]=useState(''),[waveTitle,setWaveTitle]=useState('')
 const [stats,setStats]=useState<{list:WaveStatistics[];countMeaning:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{
  const current=++scope.current;epoch.current++;setStudies([]);setSelected('');setStats(null);setError('');setNotice('');setBusy(true)
  void anonymousStudyApi.list().then(v=>{if(current===scope.current)setStudies(v.list)}).catch(()=>{if(current===scope.current)setError('研究列表暂不可用')}).finally(()=>{if(current===scope.current)setBusy(false)})
  return invalidateScope
 },[compositeId,user?.id,invalidateScope])
 useEffect(()=>{
  const current=++epoch.current;setStats(null);setError('');setNotice('');setWaveTitle('')
  if(!selected){setBusy(false);return}
  setBusy(true);void anonymousStudyApi.statistics(selected).then(v=>{if(current===epoch.current)setStats(v)}).catch(()=>{if(current===epoch.current)setError('研究统计暂不可用')}).finally(()=>{if(current===epoch.current)setBusy(false)})
  return invalidateEpoch
 },[selected,invalidateEpoch])
 const act=async(work:()=>Promise<void>)=>{const current=epoch.current;setBusy(true);setError('');setNotice('');try{await work()}catch(e){if(current===epoch.current){setStats(null);setError(e instanceof Error?e.message:'研究操作失败')}}finally{if(current===epoch.current)setBusy(false)}}
 const create=()=>act(async()=>{const current=epoch.current,study=await anonymousStudyApi.create(title.trim());if(current===epoch.current){setStudies(old=>[study,...old]);setTitle('');setSelected(study.id)}})
 const copyEntry=async(waveId:string,tokenId:string)=>{
  const current=epoch.current
  const link=await publicDeliveryAdapter('COMPOSITE',compositeId).revealLink(tokenId)
  if(current!==epoch.current)return
  if(!link.token)throw new Error('研究入口不可恢复')
  await navigator.clipboard.writeText(`${window.location.origin}/public/studies/waves/${waveId}/${link.token}`)
 }
 const add=(link:PublicDeliveryLink)=>act(async()=>{
  const current=epoch.current,wave=await anonymousStudyApi.addWave(selected,compositeId,link.id,waveTitle.trim())
  const rows=await anonymousStudyApi.statistics(selected)
  if(current===epoch.current){setStats(rows);setWaveTitle('');setNotice('波次已建立，使用“复制研究入口”邀请参与者选择单次访客或研究内身份。');await copyEntry(wave.id,link.id)}
 })
 const download=(wave:WaveStatistics)=>act(async()=>{
  setStats(null);const current=epoch.current,response=await sessionFetch(`/api/anonymous-studies/${encodeURIComponent(selected)}/waves/${encodeURIComponent(wave.id)}/export.csv`)
  if(!response.ok)throw new Error('导出失败，请确认当前研究和内容数据权限')
  const blob=await response.blob();if(current!==epoch.current)return
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`wave-${wave.ordinal}.csv`;anchor.click();URL.revokeObjectURL(url)
  const rows=await anonymousStudyApi.statistics(selected);if(current===epoch.current)setStats(rows)
 })
 return <section className="space-y-4 rounded border p-4" aria-label="匿名研究波次">
  <h3 className="font-semibold">匿名研究与波次</h3><p>每个波次绑定一个尚未使用的公开链接。参与者可选择单次访客，或保存仅在本研究使用的身份码；不会建立组织成员或师生关系。</p>
  {error && <p role="alert" className="text-red-600">{error}</p>}{notice && <p role="status">{notice}</p>}
  <div className="flex flex-wrap gap-3"><label>新研究名称<input className="input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/></label><button disabled={busy || !title.trim()} className="btn-secondary" onClick={()=>void create()}>创建研究</button></div>
  <label className="grid gap-2">选择本人的研究<select className="input" disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">请选择</option>{studies.map(s=><option key={s.id} value={s.id}>{s.title}{s.status==='CLOSED'?'（已结束）':''}</option>)}</select></label>
  {selected && <>
   <button disabled={busy} onClick={()=>void act(async()=>{setStats(null);const current=epoch.current,rows=await anonymousStudyApi.statistics(selected);if(current===epoch.current)setStats(rows)})}>刷新波次统计</button>
   {studies.find(s=>s.id===selected)?.status==='ACTIVE' && <div className="space-y-2"><label className="grid gap-2">本波次名称<input className="input" value={waveTitle} onChange={e=>setWaveTitle(e.target.value)} maxLength={120}/></label>{links.filter(l=>l.isActive && l.usedCount===0 && !stats?.list.some(w=>w.tokenId===l.id)).map(link=><button key={link.id} className="btn-secondary mr-2" disabled={busy || !waveTitle.trim()} onClick={()=>void add(link)}>用 {link.createdAt?new Date(link.createdAt).toLocaleString():'新'} 链接建立波次</button>)}</div>}
   {stats?.list.map(w=><article key={w.id} className="space-y-2 rounded border p-3"><h4>第 {w.ordinal} 波：{w.title}</h4><p>参与人数 {w.participants} · 完成人数 {w.completedParticipants} · 作答次数 {w.attempts} · 已完成作答 {w.completedAttempts} · 已放弃 {w.abandonedAttempts}</p><div className="flex flex-wrap gap-3">{links.some(l=>l.id===w.tokenId) && <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;await copyEntry(w.id,w.tokenId);if(current===epoch.current)setNotice('研究入口已复制')})}>复制研究入口</button>}<button disabled={busy} onClick={()=>void download(w)}>导出本波次已完成数据（CSV）</button></div></article>)}
   {stats && <p className="text-sm text-gray-600">{stats.countMeaning} 导出继续遵循内容的字段权限；人数统计不提供群体心理指标。</p>}
   {studies.find(s=>s.id===selected)?.status==='ACTIVE' && <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;await anonymousStudyApi.close(selected);if(current!==epoch.current)return;setStudies(old=>old.map(s=>s.id===selected?{...s,status:'CLOSED'}:s));setNotice('研究已结束，不再接受新作答；本人历史报告仍可按内容权限恢复。')})}>结束研究，停止新作答</button>}
  </>}
 </section>
}
