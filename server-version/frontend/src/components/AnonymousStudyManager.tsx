import { useCallback, useEffect, useRef, useState } from 'react'
import {TrainingParticipationSettings} from './TrainingParticipationSettings'
import LocalDateTimeInput, { parseLocalDateTime } from './LocalDateTimeInput'
import { anonymousStudyApi, type PublishResearchConsent, type ResearchConsentVersion, type ResearchDataCategory, type ResearchWithdrawal, type ReviewResearchWithdrawal, type Study, type WaveStatistics } from '../api/anonymousStudy'
import { sessionFetch } from '../api/client'
import { publicDeliveryAdapter, type PublicDeliveryLink } from '../api/publicDelivery'
import { useAuth } from '../contexts/AuthContext'
import { apiErrorMessage } from '../utils/apiErrorMessage'

function ResearchConsentEditor({studyId}:{studyId:string}) {
 const [version,setVersion]=useState<ResearchConsentVersion|null>(null),[body,setBody]=useState(''),[loaded,setLoaded]=useState(false)
 const [purpose,setPurpose]=useState(''),[categories,setCategories]=useState<ResearchDataCategory[]>([])
 const [pending,setPending]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0)
 const epoch=useRef(0),working=useRef(false),intent=useRef<PublishResearchConsent|null>(null)
 const invalidateResearchEpoch=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{
  const current=++epoch.current;working.current=true;intent.current=null
  setVersion(null);setBody('');setPurpose('');setCategories([]);setLoaded(false);setPending(true);setError('');setNotice('')
  void anonymousStudyApi.researchConsent(studyId).then(value=>{if(current===epoch.current){setVersion(value.version);setLoaded(true)}})
   .catch(e=>{if(current===epoch.current)setError(apiErrorMessage(e,'研究同意版本暂不可用'))})
   .finally(()=>{if(current===epoch.current){working.current=false;setPending(false)}})
  return invalidateResearchEpoch
 },[studyId,reload,invalidateResearchEpoch])
 const publish=async()=>{
  if(working.current || !loaded)return
  const text=body.trim()
  if(text.length<20 || text.length>20000){setError('研究同意正文须为 20–20000 个字符');return}
  const fixedScope=version ? {purpose:version.scope.purpose,dataCategories:version.scope.dataCategories} : {purpose:purpose.trim(),dataCategories:[...categories].sort()}
  if(fixedScope.purpose.length<2 || fixedScope.purpose.length>1000){setError('请填写 2–1000 个字符的固定研究目的');return}
  if(!fixedScope.dataCategories.length){setError('请至少选择一种研究数据类别');return}
  const expectedVersionId=version?.id ?? null
  if(intent.current?.body!==text || intent.current?.expectedVersionId!==expectedVersionId || JSON.stringify(intent.current?.scope)!==JSON.stringify(fixedScope))intent.current={requestId:crypto.randomUUID(),expectedVersionId,body:text,scope:fixedScope}
  const current=epoch.current,payload=intent.current;working.current=true;setPending(true);setError('');setNotice('')
  try {
   const published=await anonymousStudyApi.publishResearchConsent(studyId,payload)
   if(current!==epoch.current)return
   setVersion(published);setBody('');intent.current=null;setNotice(`第 ${published.version} 版研究同意正文已发布。已发布版本及已有同意记录保持不变。`)
  } catch(e) {if(current===epoch.current)setError(`${apiErrorMessage(e,'研究同意发布失败')}。发布结果尚未确认，可重试相同正文或刷新版本。`)}
  finally {if(current===epoch.current){working.current=false;setPending(false)}}
 }
 return <section className="space-y-3 rounded border p-3" aria-label="版本化研究同意">
  <h4 className="font-semibold">版本化研究同意</h4>
  <p>保存身份码不代表研究同意。每次发布生成不可变版本，新参与者需对当前正文独立明确同意，已有同意记录保持原版本；未同意、退出待审核和已排除的作答不纳入研究分析与研究导出。</p>
  {pending && <p role="status">正在确认同意版本…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}{notice && <p role="status">{notice}</p>}
  {loaded && (version ? <><h5>当前已发布：第 {version.version} 版</h5><p className="text-sm">发布时间：{new Date(version.publishedAt).toLocaleString()}</p><div className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3">{version.body}</div></> : <p>尚未发布版本化研究同意正文；研究导出不纳入未同意的作答。</p>)}
  {version ? <><p>固定研究目的：{version.scope.purpose}</p><p>固定数据类别：{version.scope.dataCategories.join('、')}</p></> : <>
   <label className="grid gap-2">固定研究目的<input className="input" disabled={!loaded || pending} value={purpose} maxLength={1000} onChange={e=>setPurpose(e.target.value)}/></label>
   <fieldset disabled={!loaded || pending} className="space-y-2"><legend>研究数据类别（首次发布后不可扩展）</legend>{(['FORM','SCALE','COGNITIVE','SJT'] as const).map(category=><label key={category} className="mr-4 inline-flex items-center gap-2"><input type="checkbox" checked={categories.includes(category)} onChange={e=>setCategories(old=>e.target.checked?[...old,category]:old.filter(value=>value!==category))}/>{category}</label>)}</fieldset>
  </>}
  <p>范围固定为本研究已有及后续波次。后续正文仅可补充说明，不能扩大目的或数据类别；需要变更范围时请另建研究。</p>
  <label className="grid gap-2">新版本研究同意正文<textarea className="input min-h-40" disabled={!loaded || pending} value={body} maxLength={20000} onChange={e=>setBody(e.target.value)}/></label>
  <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={!loaded || pending || !body.trim()} onClick={()=>void publish()}>发布不可变同意版本</button><button disabled={pending} onClick={()=>setReload(value=>value+1)}>刷新同意版本</button></div>
  <p className="text-sm">退出申请提交后立即从研究分析与研究导出中排除。审核不删除教育记录、已提交作答、完成状态或个人报告，也不自动停用身份码。已下载文件无法收回。</p>
 </section>
}

function ResearchWithdrawalReview({studyId}:{studyId:string}) {
 const [rows,setRows]=useState<ResearchWithdrawal[]|null>(null),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[reload,setReload]=useState(0)
 const [reasons,setReasons]=useState<Record<string,string>>({}),[pending,setPending]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const epoch=useRef(0),working=useRef(false),intents=useRef<Record<string,ReviewResearchWithdrawal>>({})
 const invalidateReviewEpoch=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{
  const current=++epoch.current;working.current=true;intents.current={}
  setRows(null);setReasons({});setPending(true);setError('');setNotice('')
  void anonymousStudyApi.researchWithdrawals(studyId,page).then(value=>{if(current===epoch.current){setRows(value.list);setPageSize(value.pageSize)}})
   .catch(e=>{if(current===epoch.current)setError(apiErrorMessage(e,'研究退出申请暂不可用'))})
   .finally(()=>{if(current===epoch.current){working.current=false;setPending(false)}})
  return invalidateReviewEpoch
 },[studyId,page,reload,invalidateReviewEpoch])
 const review=async(row:ResearchWithdrawal)=>{
  if(working.current || row.state!=='WITHDRAWAL_PENDING')return
  const reason=(reasons[row.participantId] || '').trim()
  if(reason.length<2 || reason.length>1000){setError('审核说明须为 2–1000 个字符');return}
  const prior=intents.current[row.participantId]
  const payload=prior?.expectedRevision===row.revision && prior.reason===reason ? prior : {requestId:crypto.randomUUID(),expectedRevision:row.revision,reason}
  intents.current[row.participantId]=payload
  const current=epoch.current;working.current=true;setPending(true);setError('');setNotice('')
  try {
   const result=await anonymousStudyApi.reviewResearchWithdrawal(studyId,row.participantId,payload)
   if(current!==epoch.current)return
   setRows(old=>old?.map(value=>value.participantId===row.participantId?{...value,...result}:value) ?? null)
   delete intents.current[row.participantId]
   setNotice(`${row.displayCode} 的退出申请已审核，保持研究排除；教育记录与个人报告保留。`)
  } catch(e) {if(current===epoch.current)setError(`${apiErrorMessage(e,'退出审核失败')}。审核结果尚未确认，可重试同一说明或刷新申请。`)}
  finally {if(current===epoch.current){working.current=false;setPending(false)}}
 }
 return <section aria-label="研究退出审核" className="space-y-3 rounded border p-3">
  <h4 className="font-semibold">研究退出审核</h4><p>申请提交即排除研究资格。审核只确认排除，不恢复研究资格，不删除教育记录或停用身份码。已下载文件无法收回。</p>
  {pending && <p role="status">正在确认退出申请…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}{notice && <p role="status">{notice}</p>}
  {rows?.length===0 && <p>本页暂无研究退出申请。</p>}
  {rows?.map(row=><article key={row.participantId} className="space-y-2 rounded border p-3"><h5>{row.displayCode}</h5><p>{row.state==='WITHDRAWAL_PENDING'?'待审核，已排除研究资格':'已审核，保持研究排除'}</p>{row.state==='WITHDRAWAL_PENDING' && <><label className="grid gap-2">审核说明（{row.displayCode}）<textarea className="input" disabled={pending} maxLength={1000} value={reasons[row.participantId] || ''} onChange={e=>setReasons(old=>({...old,[row.participantId]:e.target.value}))}/></label><button disabled={pending} onClick={()=>void review(row)}>确认 {row.displayCode} 的研究排除</button></>}</article>)}
  <div className="flex flex-wrap gap-3"><button disabled={pending} onClick={()=>setReload(value=>value+1)}>刷新退出申请</button><button disabled={pending || page<=1} onClick={()=>setPage(value=>value-1)}>上一页退出申请</button><span>第 {page} 页</span><button disabled={pending || !rows || rows.length<pageSize || page>=240} onClick={()=>setPage(value=>value+1)}>下一页退出申请</button></div>
 </section>
}

export function AnonymousStudyManager({compositeId,links,canCreate=true,maximumExpiry,onLinkCreated}:{compositeId:string;links:PublicDeliveryLink[];canCreate?:boolean;maximumExpiry?:string|null;onLinkCreated?:()=>Promise<void>}) {
 const {user}=useAuth(),epoch=useRef(0),scope=useRef(0)
 const invalidateEpoch=useCallback(()=>{epoch.current++},[])
 const invalidateScope=useCallback(()=>{scope.current++;epoch.current++},[])
 const [studies,setStudies]=useState<Study[]>([]),[selected,setSelected]=useState(''),[title,setTitle]=useState(''),[waveTitle,setWaveTitle]=useState('')
 const [waveExpiry,setWaveExpiry]=useState(''),[waveMaxUses,setWaveMaxUses]=useState('0')
 const expiryField=useRef<HTMLInputElement>(null)
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
 const act=async(work:()=>Promise<void>)=>{const current=epoch.current;setBusy(true);setError('');setNotice('');try{await work()}catch(e){if(current===epoch.current){setStats(null);setError(apiErrorMessage(e,'研究操作失败'))}}finally{if(current===epoch.current)setBusy(false)}}
 const create=()=>act(async()=>{const current=epoch.current,study=await anonymousStudyApi.create(title.trim());if(current===epoch.current){setStudies(old=>[study,...old]);setTitle('');setSelected(study.id)}})
 const copyEntry=async(waveId:string,tokenId:string)=>{
  const current=epoch.current
  const link=await publicDeliveryAdapter('COMPOSITE',compositeId).revealLink(tokenId)
  if(current!==epoch.current)return
  if(!link.token)throw new Error('研究入口不可恢复')
  await navigator.clipboard.writeText(`${window.location.origin}/public/studies/waves/${waveId}/${link.token}`)
 }
 const add=(link:PublicDeliveryLink)=>act(async()=>{
  const current=epoch.current;await anonymousStudyApi.addWave(selected,compositeId,link.id,waveTitle.trim())
  const rows=await anonymousStudyApi.statistics(selected)
  if(current===epoch.current){setStats(rows);setWaveTitle('');setNotice('波次已建立，使用“复制研究入口”邀请参与者选择单次访客或研究内身份。')}
 })
 const createWave=async()=>{
  if(busy || !canCreate)return
  const expiry=parseLocalDateTime(waveExpiry)?.getTime() ?? NaN,quota=Number(waveMaxUses)
  if(!waveTitle.trim()){setError('请填写本波次名称');return}
  if(!waveExpiry || !Number.isFinite(expiry) || expiry<=Date.now()){setError('请选择未来的波次有效期');expiryField.current?.focus();return}
  if(maximumExpiry && expiry>Date.parse(maximumExpiry)){setError('波次有效期不能晚于测评截止时间');expiryField.current?.focus();return}
  if(!waveMaxUses.trim() || !Number.isSafeInteger(quota) || quota<0 || quota>2147483647){setError('最大参与次数必须为有效的非负整数，0 表示不限');return}
  await act(async()=>{
   const current=epoch.current,payload={compositeId,title:waveTitle.trim(),expiresAt:new Date(expiry).toISOString(),maxUses:quota}
   const storageKey=`study-wave-create:${user?.id}:${selected}:${compositeId}`,fingerprint=JSON.stringify(payload)
   let previous:{fingerprint:string;id:string}|null=null
   try{previous=JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{ /* Discard malformed local intent metadata. */ }
   const requestId=previous?.fingerprint===fingerprint && /^[0-9a-f-]{36}$/.test(previous.id)?previous.id:crypto.randomUUID()
   sessionStorage.setItem(storageKey,JSON.stringify({fingerprint,id:requestId}))
   await anonymousStudyApi.createWave(selected,{...payload,requestId})
   if(current!==epoch.current)return
   sessionStorage.removeItem(storageKey);setWaveTitle('');setWaveExpiry('')
   setNotice('波次与公开链接已建立。请使用“复制研究入口”邀请参与者选择单次访客或研究内身份。')
   let refreshFailed=false
   try {
    const rows=await anonymousStudyApi.statistics(selected)
    if(current!==epoch.current)return
    setStats(rows)
   } catch {
    if(current!==epoch.current)return
    setStats(null);refreshFailed=true
   }
   try {await onLinkCreated?.()} catch {refreshFailed=true}
   if(current===epoch.current && refreshFailed)setError('波次已建立，但显示刷新失败。请刷新统计或页面，无需再次建立波次。')
  })
 }
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
   <TrainingParticipationSettings key={`participation:${user?.id}:${compositeId}:${selected}:${stats?.list.length ?? 0}:${studies.find(study=>study.id===selected)?.status}`} studyId={selected}/>
   <ResearchConsentEditor key={`${user?.id}:${compositeId}:${selected}`} studyId={selected}/>
   <ResearchWithdrawalReview key={`withdrawals:${user?.id}:${compositeId}:${selected}`} studyId={selected}/>
   <button disabled={busy} onClick={()=>void act(async()=>{setStats(null);const current=epoch.current,rows=await anonymousStudyApi.statistics(selected);if(current===epoch.current)setStats(rows)})}>刷新波次统计</button>
   {studies.find(s=>s.id===selected)?.status==='ACTIVE' && canCreate && <div className="space-y-3 rounded border p-3">
    <h4 className="font-semibold">建立新波次</h4><p className="text-sm">填写本波次设置后，一次建立波次和对应的公开链接，无需先生成链接。</p>
    <label className="grid gap-2">本波次名称<input className="input" disabled={busy} value={waveTitle} onChange={e=>setWaveTitle(e.target.value)} maxLength={120}/></label>
    <label className="grid gap-2">波次有效期<LocalDateTimeInput ref={expiryField} className="input" disabled={busy} value={waveExpiry} onChange={e=>setWaveExpiry(e.target.value)}/></label>
    <label className="grid gap-2">波次最大参与次数（0 表示不限）<input type="number" min="0" max="2147483647" step="1" className="input" disabled={busy} value={waveMaxUses} onChange={e=>setWaveMaxUses(e.target.value)}/></label>
    <button className="btn-primary" disabled={busy} onClick={()=>void createWave()}>{busy?'正在建立…':'建立波次并生成链接'}</button>
    <details><summary>使用已有未使用链接（高级）</summary>{links.filter(l=>l.isActive && l.usedCount===0 && Date.parse(l.expiresAt)>Date.now() && !stats?.list.some(w=>w.tokenId===l.id)).map(link=><button key={link.id} className="btn-secondary mr-2" disabled={busy || !waveTitle.trim()} onClick={()=>void add(link)}>用 {link.createdAt?new Date(link.createdAt).toLocaleString():'新'} 链接建立波次</button>)}</details>
   </div>}
   {stats?.list.map(w=><article key={w.id} className="space-y-2 rounded border p-3"><h4>第 {w.ordinal} 波：{w.title}</h4><p>参与人数 {w.participants} · 完成人数 {w.completedParticipants} · 作答次数 {w.attempts} · 已完成作答 {w.completedAttempts} · 已放弃 {w.abandonedAttempts}</p>{w.researchEligibleParticipants!==undefined && <p>研究有效同意人数 {w.researchEligibleParticipants} · 退出或排除人数 {w.researchWithdrawnParticipants ?? '未知'} · 同意未知人数 {w.researchUnknownParticipants ?? '未知'}</p>}<div className="flex flex-wrap gap-3">{links.some(l=>l.id===w.tokenId) && <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;await copyEntry(w.id,w.tokenId);if(current===epoch.current)setNotice('研究入口已复制')})}>复制研究入口</button>}<button disabled={busy} onClick={()=>void download(w)}>导出教育完成记录（非研究样本CSV）</button></div></article>)}
   {stats && <p className="text-sm text-gray-600">{stats.countMeaning} 教育完成统计保持原口径，教育 CSV 保留原授权教育记录，不作为研究样本；研究长宽表与字典请使用课程分析的原导出队列。导出继续遵循内容的字段权限；人数统计不提供群体心理指标。</p>}
   {studies.find(s=>s.id===selected)?.status==='ACTIVE' && <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;await anonymousStudyApi.close(selected);if(current!==epoch.current)return;setStudies(old=>old.map(s=>s.id===selected?{...s,status:'CLOSED'}:s));setNotice('研究已结束，不再接受新作答；本人历史报告仍可按内容权限恢复。');try{await onLinkCreated?.()}catch{if(current===epoch.current)setError('研究已结束，但链接显示刷新失败。请刷新页面。')}})}>结束研究，停止新作答</button>}
  </>}
 </section>
}
