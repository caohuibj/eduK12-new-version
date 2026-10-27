import {useEffect,useRef,useState} from 'react'
import {ShieldCheck,RefreshCw,Pause,History} from 'lucide-react'
import {EducationRosterSource} from './EducationRosterSource'
import {jobRosterLimits,downloadRosterErrors,rosterLabels} from './preparation'
import {parseJobInput,jobParts,textRosterSource,type JobInput,type RosterJob,type RosterJobSummary,type RosterSource} from './job-client'
import type {EducationRosterApi,RosterKind,RosterUnit} from './types'
import './education-roster-jobs.css'
type Props={api:EducationRosterApi;organizationId:string;kind:RosterKind;units:RosterUnit[];disabled?:boolean;onBusy?:(busy:boolean)=>void;onChanged?:()=>void;onUnits?:(units:RosterUnit[])=>void}
type Failure=Error&{status?:number;code?:string;data?:{issues?:{line:number;message:string}[]};retryAfterSeconds?:number}
const jobLabels:Record<string,string>={PREVIEWING:'待完成校验',PREVIEW_ERROR:'需要修正',READY:'待确认',RUNNING:'待继续',PAUSED:'已暂停',COMPLETED:'已完成'}
export function EducationRosterJobImport(props:Props){return <JobSession key={props.organizationId+':'+props.kind} {...props}/>}
function JobSession({api,organizationId,kind,units,disabled,onBusy,onChanged,onUnits}:Props){
 const [text,setText]=useState(''),[gradeId,setGradeId]=useState(''),[source,setSource]=useState<RosterSource|null>(null)
 const [job,setJob]=useState<RosterJob|null>(null),[proof,setProof]=useState(''),[prepared,setPrepared]=useState<JobInput|null>(null)
 const [sourceBlocked,setSourceBlocked]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [issues,setIssues]=useState<{line:number;message:string}[]>([]),[verified,setVerified]=useState(false),[needsProgress,setNeedsProgress]=useState(false)
 const [mfa,setMfa]=useState(false),[code,setCode]=useState(''),[retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now())
 const [history,setHistory]=useState<RosterJobSummary[]>([]),[historyLoaded,setHistoryLoaded]=useState(false),[historyNext,setHistoryNext]=useState<string|null>(null)
 const lock=useRef(false),stop=useRef(false),alive=useRef(true),generation=useRef(0),requestId=useRef(''),callbacks=useRef({onBusy,onChanged,onUnits})
 callbacks.current={onBusy,onChanged,onUnits}
 const updateJob=(value:RosterJob|null)=>{setJob(value);if(value)setHistory(old=>old.some(item=>item.id===value.id)?old.map(item=>item.id===value.id?value:item):historyLoaded?[value,...old]:old)}
 const dateLabel=(value:string)=>new Date(value).toLocaleString(undefined,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
 const base=`/organizations/${organizationId}/roster-imports`
 useEffect(()=>{
  const scope=generation;scope.current++;alive.current=true;stop.current=false;lock.current=false;setBusy('');callbacks.current.onBusy?.(false)
  return()=>{alive.current=false;stop.current=true;scope.current++;callbacks.current.onBusy?.(false)}
 },[api])
 useEffect(()=>{if(!retryAt)return;const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer)},[retryAt])
 const valid=(g:number)=>alive.current&&g===generation.current
 const report=(cause:unknown,action:string)=>{
  const e=(cause instanceof Error?cause:Error('操作暂未完成。')) as Failure
  setError(e.message);setIssues(e.data?.issues??[])
  if(/敏感操作.*验证|重新验证.*动态|动态验证码.*重新验证/.test(e.message))setMfa(true)
  if(e.status===429){const seconds=Number.isFinite(e.retryAfterSeconds)?Math.max(1,e.retryAfterSeconds!):60;setRetryAt(Date.now()+seconds*1000);setClock(Date.now())}
  if(action==='save'){setNeedsProgress(true);setNotice('本次响应未确认。已保存的批次不会重复新增，请先核对服务器进度。')}
 }
 const run=async(action:string,fn:(g:number)=>Promise<void>)=>{
  if(lock.current||disabled)return
  const g=generation.current;lock.current=true;stop.current=false;setBusy(action);callbacks.current.onBusy?.(true);setError('');setNotice('');setIssues([])
  try{await fn(g)}catch(cause){if(valid(g))report(cause,action)}finally{if(valid(g)){lock.current=false;setBusy('');callbacks.current.onBusy?.(false)}}
 }
 const invalidate=()=>{setProof('');setPrepared(null);setVerified(false);requestId.current='';setError('');setNotice('');setIssues([])}
 const edit=(value:string)=>{setText(value);setSource(null);invalidate()}
 const useSource=(value:string,meta:RosterSource)=>{setText(value);setSource(meta);invalidate()}
 const sourceError=(cause:unknown)=>{if(cause instanceof Error&&/敏感操作.*验证|重新验证.*动态/.test(cause.message))setMfa(true)}
 const previewRemaining=async(current:RosterJob,input:JobInput,matchingProof:string,g:number)=>{
  const parts=jobParts(input)
  for(const part of current.parts){
   if(part.state!=='PLANNED')continue
   if(stop.current||!valid(g))break
   current=await api<RosterJob>(`${base}/${current.id}/parts/${part.index}/preview`,'POST',{proof:matchingProof,input:parts[part.index]})
   if(!valid(g))return
   updateJob(current)
  }
  if(valid(g))setNotice(stop.current?'校验已暂停，已完成的校验记录保留。':current.status==='PREVIEW_ERROR'?'整份名单存在错误，尚未开始保存。':'校验记录已更新，请核对后确认。')
 }
 const prepare=()=>run('preview',async g=>{
  if(sourceBlocked)return
  const input=parseJobInput(text,kind,gradeId),meta=source??await textRosterSource(text,kind,gradeId)
  if(!valid(g))return
  if(!requestId.current)requestId.current=crypto.randomUUID()
  const result=job?await api<RosterJob>(`${base}/${job.id}/match`,'POST',{input,source:meta}):await api<RosterJob>(base,'POST',{requestId:requestId.current,input,source:meta})
  if(!valid(g))return
  updateJob(result);setProof(result.proof??'');setPrepared(input);setNeedsProgress(false)
  if(!result.confirmed)await previewRemaining(result,input,result.proof!,g)
  else setNotice('原文件已匹配，服务器批次回执已核对。请明确继续未完成的部分。')
 })
 const refreshProgress=()=>run('read',async g=>{
  if(!job)return
  const result=await api<RosterJob>(`${base}/${job.id}`)
  if(valid(g)){updateJob(result);setNeedsProgress(false);setNotice(result.status==='COMPLETED'?'服务器已确认全部完成。':'服务器进度已核对；继续前会重新验证当前权限。')}
 })
 const recheck=()=>run('preview',async g=>{
  if(!job||!proof||!prepared)return
  const result=await api<RosterJob>(`${base}/${job.id}/recheck`,'POST',{proof})
  if(!valid(g))return
  updateJob(result);setVerified(false);setNeedsProgress(false);await previewRemaining(result,prepared,proof,g)
 })
 const save=()=>run('save',async g=>{
  if(!job||!proof||!prepared||needsProgress)return
  let current=await api<RosterJob>(`${base}/${job.id}/${job.confirmed?'resume':'confirm'}`,'POST',{proof,planToken:job.planToken,...(!job.confirmed?{verifiedOffline:verified}:{})})
  if(!valid(g))return
  updateJob(current)
  const runToken=current.runToken,parts=jobParts(prepared)
  for(const part of current.parts){
   if(part.state==='COMMITTED')continue
   if(stop.current||!valid(g))break
   current=await api<RosterJob>(`${base}/${current.id}/parts/${part.index}/commit`,'POST',{proof,runToken,input:parts[part.index]})
   if(!valid(g))return
   updateJob(current)
  }
  if(!valid(g))return
  if(stop.current&&current.status!=='COMPLETED'){
   current=await api<RosterJob>(`${base}/${current.id}/pause`,'POST',{proof});if(!valid(g))return;updateJob(current);setNotice('已暂停。当前批次已核对，未保存部分不会继续执行。')
  }else if(current.status==='COMPLETED'){
   setNotice(`已完成：新增 ${current.added} 条，跳过 ${current.skipped} 条。账号激活和班级审批仍须分别处理。`)
   callbacks.current.onChanged?.()
   if((kind==='GRADE'||kind==='CLASS')&&callbacks.current.onUnits){try{const result=await api<{list:RosterUnit[]}>(`/organizations/${organizationId}/units`);if(valid(g))callbacks.current.onUnits?.(result.list)}catch{if(valid(g))setError('导入已完成，学校结构刷新失败；请刷新学校信息，不必重复导入。')}}
  }
 })
 const verify=()=>run('mfa',async g=>{
  await api('/auth/mfa/step-up','POST',{code})
  if(valid(g)){setMfa(false);setCode('');setNotice('验证成功，文件和进度已保留。请先核对服务器进度或重新点击校验；不会自动保存。')}
 })
 const loadHistory=(more=false)=>run('history',async g=>{
  const result=await api<{list:RosterJobSummary[];next:string|null}>(base+(more&&historyNext?`?before=${encodeURIComponent(historyNext)}`:''))
  if(valid(g)){setHistory(old=>more?Array.from(new Map([...old,...result.list].map(j=>[j.id,j])).values()):result.list);setHistoryNext(result.next);setHistoryLoaded(true)}
 })
 const chooseHistory=(summary:RosterJobSummary)=>run('history-detail',async g=>{
  const value=await api<RosterJob>(`${base}/${summary.id}`)
  if(!valid(g))return
  updateJob(value);setProof('');setPrepared(null);setVerified(false);setNeedsProgress(false);setError('');setNotice(value.status==='COMPLETED'?'已读取完整回执，无需重新选择文件。':'请重新选择该任务的原文件、工作表和列映射，再核对继续。');setText('');setSource(null);requestId.current=''
 })
 const newImport=()=>{updateJob(null);setNeedsProgress(false);invalidate();setNotice('当前输入已保留，请重新校验建立新任务；已有人员仍只会跳过或提示冲突。')}
 const jobIssues=job?.parts.flatMap(p=>p.issues)??[],allIssues=[...issues,...jobIssues]
 const pending=job?.parts.filter(p=>p.state!=='COMMITTED')??[]
 const plannedAdd=pending.reduce((n,p)=>n+p.add,0),plannedSkip=pending.reduce((n,p)=>n+p.skip,0)
 const reviewed=!!job&&pending.every(p=>p.state==='PREVIEWED'&&!p.errors)
 const ready=!!job&&job.status!=='COMPLETED'&&!job.expired&&!!proof&&!!prepared&&reviewed&&!needsProgress&&!mfa
 const wait=Math.max(0,Math.ceil((retryAt-clock)/1000))
 const countReviewed=job?.parts.filter(p=>p.state!=='PLANNED').length??0
 return <section className="er-job" aria-label="整份名单分批导入" aria-busy={!!busy}>
  <div className="er-job-input" hidden={job?.status==='COMPLETED'}>
  {kind==='CLASS'&&<label className="hs-field"><span>单列班级的所属年级</span><select value={gradeId} disabled={!!busy||disabled} onChange={e=>{setGradeId(e.target.value);invalidate()}}><option value="">两列文件按行指定年级</option>{units.filter(u=>u.unitKind==='GRADE').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
  <EducationRosterSource api={api} organizationId={organizationId} kind={kind} text={text} limits={jobRosterLimits} disabled={!!busy||disabled} onText={edit} onPrepared={useSource} onBlocked={setSourceBlocked} onInvalidate={invalidate} onError={sourceError} fileLabel="CSV／Excel 文件（整份最多5000行）"/>
  <label className="hs-field"><span>{kind==='GRADE'||kind==='CLASS'?'粘贴年级／班级内容':'粘贴名单（含表头）'}</span><textarea value={text} rows={5} disabled={!!busy||disabled} onChange={e=>edit(e.target.value)} placeholder="选择文件并核对映射，或直接粘贴完整名单"/></label>
  <p className="er-job-message">大份名单可能需要分段完成：同一网络每15分钟最多保存40批，5000行需50批。触发保护后已保存进度保留，等待提示时间结束后点击继续；同一网络内其他操作也会占用额度。</p>
  <div className="er-job-prepare"><span>整份先校验，每100行一个事务。只新增，不覆盖。</span><button type="button" className="hs-primary" disabled={!!busy||disabled||sourceBlocked||!text.trim()||wait>0||job?.status==='COMPLETED'||job?.expired} onClick={()=>void prepare()}>{job?.status==='COMPLETED'?'已完成':busy==='preview'?`正在校验 ${countReviewed}/${job?.partCount??'…'} 批` :job?'核对原文件并继续':'整份校验预览'}</button></div>
  </div>
  {error&&<p className="er-job-message" role="alert">{error}</p>}{notice&&<p className="er-job-message" role="status">{notice}</p>}
  {wait>0&&<p className="er-job-message" role="status">触发原有频率保护，约 {wait} 秒后可明确重试；已保存进度保留。</p>}
  {mfa&&<form className="er-job-mfa" aria-label="导入身份验证" onSubmit={e=>{e.preventDefault();void verify()}}><strong><ShieldCheck size={16}/>验证后继续</strong><label className="hs-field"><span>6位动态验证码</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={!!busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><button className="hs-primary" disabled={!!busy||!/^\d{6}$/.test(code)}>验证身份</button></form>}
  {job&&<section className="er-job-progress" aria-label="导入任务进度">
   <div className="er-job-heading"><h3>{busy==='save'?'正在保存':jobLabels[job.status]??'导入任务'}</h3><span>{rosterLabels[job.kind]} · {dateLabel(job.createdAt)}</span></div>
   <div className="er-job-counts"><span><strong>{job.rows}</strong>整份记录</span><span><strong>{job.savedRows}</strong>已处理</span><span><strong>{allIssues.length}</strong>需修正</span></div>
   <progress max={job.rows} value={job.savedRows} aria-label="名单保存进度"/>
   <p>{!job.confirmed&&job.status!=='COMPLETED'?`校验 ${countReviewed}/${job.partCount} 批 · 预计新增 ${plannedAdd} · 预计跳过 ${plannedSkip}`:`已保存 ${job.parts.filter(p=>p.state==='COMMITTED').length}/${job.partCount} 批 · 已新增 ${job.added} · 已跳过 ${job.skipped}`}</p>
   {!proof&&job.status!=='COMPLETED'&&<p>重新打开后需核对原文件；服务器不保存原始整表。</p>}
   {job.expired&&<p>任务已过期；已保存记录保留，请用新任务重新校验未完成内容。</p>}
   {needsProgress&&<p>响应中断后先核对服务器回执，确认前不会继续下一批。</p>}
   {job.needsVerification&&!job.confirmed&&<label className="er-job-check"><input type="checkbox" checked={verified} disabled={!!busy} onChange={e=>setVerified(e.target.checked)}/>我已线下核实已有校园用户名属于对应本人；不修改密码或权限。</label>}
   <div className="er-actions">
    {!!busy&&(busy==='preview'||busy==='save')?<button type="button" onClick={()=>{stop.current=true;setNotice('已请求暂停，当前批次结束并核对后停止。')}}><Pause size={16}/>暂停</button>:<>
     <button type="button" disabled={!!busy||disabled} onClick={()=>void refreshProgress()}><RefreshCw size={16}/>核对服务器进度</button>
     {job.status!=='COMPLETED'&&<button type="button" disabled={!!busy||disabled||!proof||!prepared||job.expired||wait>0} onClick={()=>void recheck()}>重新核对剩余内容</button>}
     {job.status!=='COMPLETED'&&<button type="button" className="hs-primary" disabled={!!busy||disabled||!ready||wait>0||(!job.confirmed&&job.needsVerification&&!verified)} onClick={()=>void save()}>{job.confirmed?'继续保存剩余批次':'确认保存全部批次'}</button>}
     <button type="button" disabled={!!busy||disabled} onClick={newImport}>新建另一份导入</button>
    </>}
   </div>
  </section>}
  {allIssues.length>0&&<section className="er-job-issues" aria-label="整份名单错误"><div className="er-job-heading"><h3>{allIssues.length}处需要修正</h3><button type="button" onClick={()=>downloadRosterErrors(allIssues)}>下载全部问题</button></div><ol>{allIssues.slice(0,30).map((issue,i)=><li key={i}><span>第 {issue.line} 行</span>{issue.message}</li>)}</ol>{allIssues.length>30&&<p>仅显示前30处，完整内容请下载。</p>}</section>}
  <details className="er-job-history" onToggle={e=>{if(e.currentTarget.open&&!historyLoaded&&!lock.current)void loadHistory()}}><summary><History size={16}/>导入历史</summary><div className="er-actions"><button type="button" disabled={!!busy||disabled} onClick={()=>void loadHistory()}>刷新历史</button></div>{historyLoaded&&!history.length&&<p>当前学校和入口下尚无你的导入记录。</p>}<ul>{history.map(j=><li key={j.id}><div><strong>{rosterLabels[j.kind]}</strong><span>{dateLabel(j.createdAt)} · {jobLabels[j.status]??j.status}</span><span>{j.savedRows}/{j.rows}条 · 新增{j.added} · 跳过{j.skipped}</span></div><button type="button" disabled={!!busy||disabled||j.kind!==kind} onClick={()=>chooseHistory(j)}>{j.status==='COMPLETED'?'查看回执':'选择续办'}</button></li>)}</ul>{historyNext&&<button type="button" disabled={!!busy||disabled} onClick={()=>void loadHistory(true)}>加载更早记录</button>}<p>只展示本人在当前学校、当前入口的任务；续办需重新选择原文件。任务7天内可续办，已成功的批次回执保持不变。</p></details>
 </section>
}
