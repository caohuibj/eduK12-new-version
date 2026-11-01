import ApprovedScaleAxes from '../components/scale-governance/ApprovedScaleAxes'
import CatalogDiscoveryFilters from '../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import {EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,catalogQuery} from '../api/catalogDiscovery'
import {useCallback,useEffect,useRef,useState} from 'react'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import {eligibleGrantTeachers,materialGrantApi} from '../api/materialGrants'
import {standardConfigurationGrantsApi as api,validStandardConfigurationChoice,validStandardConfigurationUse,type StandardConfigurationChoice,type StandardConfigurationUse} from '../api/standardConfigurationGrants'
import type {User} from '../types'
import {useAuth} from '../contexts/AuthContext'
import {useTrainingStandardConfigurationIssue,trainingIssueOutcome} from './useTrainingStandardConfigurationIssue'

const errorMessage=(cause:unknown)=>cause instanceof Error?cause.message:'请求未完成，请重新读取实际状态。'
type Replacement={source:StandardConfigurationChoice;grant:StandardConfigurationUse;recipient:User}
function Versions({choice}:{choice:StandardConfigurationChoice}){
 return <dl className="training-configuration-versions"><div><dt>内容</dt><dd>{choice.versions.CONTENT}</dd></div>
  <div><dt>参数</dt><dd>{choice.versions.PARAMETERS==='none-v1'?'未配置阈值或常模':choice.versions.PARAMETERS}</dd></div>
  <div><dt>报告</dt><dd>{choice.versions.REPORT==='none-v1'?'不反馈':choice.versions.REPORT}</dd></div></dl>
}
function RecipientGrant({choice,onClose,issuer,replacement,reason,onReplace,onReplacementDone}:{choice:StandardConfigurationChoice;onClose:()=>void;issuer:ReturnType<typeof useTrainingStandardConfigurationIssue>;
 replacement:Replacement|null;reason:string;onReplace:(grant:StandardConfigurationUse,recipient:User)=>void;onReplacementDone:(notice:string)=>void}){
 const [teachers,setTeachers]=useState<User[]>([]),[userId,setUserId]=useState(replacement?.recipient.id??'')
 const [grant,setGrant]=useState<StandardConfigurationUse|null>(null),[loaded,setLoaded]=useState(false)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[uncertain,setUncertain]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState('')
 const [configurationName,setConfigurationName]=useState('')
 const epoch=useRef(0),alive=useRef(true),inFlight=useRef(false)
 const read=useCallback(async(target:string)=>{
  const current=++epoch.current;setLoaded(false);setGrant(null);setConfigurationName('');setError('');setLoading(true)
  try{
   const response=await api.grants(choice.id,{userId:target})
   if(!alive.current||current!==epoch.current)return
   if(response.code!==0||!response.data||response.data.hasMore!==false||!Array.isArray(response.data.list)||response.data.list.length>1
    ||response.data.list.some(row=>!validStandardConfigurationUse(row)||row.userId!==target||row.combinationHash!==choice.combinationHash))throw Error(response.message||'授权身份或列表不完整，请停止操作并核查')
   setGrant(response.data.list[0]??null);setConfigurationName(replacement?replacement.grant.configurationName??'':response.data.list[0]?.configurationName??'');setLoaded(true);setUncertain(false)
  }catch(cause){if(alive.current&&current===epoch.current)setError(errorMessage(cause))}
  finally{if(alive.current&&current===epoch.current)setLoading(false)}
 },[choice.id,choice.combinationHash,replacement])
 useEffect(()=>{alive.current=true;let active=true
  void materialGrantApi.listTeachers().then(async response=>{
   if(!active)return
   if(response.code!==0||!response.data||!Array.isArray(response.data.list)||response.data.total!==response.data.list.length)throw Error(response.message||'培训师名单不完整')
   const current=eligibleGrantTeachers(response.data.list);setTeachers(current)
   if(replacement){
    if(!current.some(row=>row.id===replacement.recipient.id))throw Error('原接收者不在当前合格培训师名单中，请先核对资格；不能改为另一人。')
    await read(replacement.recipient.id)
   }
  }).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false;alive.current=false;epoch.current++}
 },[read,replacement])
 const mutate=async(action:'issue'|'revoke')=>{
  if(inFlight.current||!loaded||!userId||uncertain)return
  inFlight.current=true;setBusy(true);setError('');setNotice('')
  try{
   if(action==='issue'){
    const response=await issuer.issue(choice,userId,configurationName,grant,replacement?{grantId:replacement.grant.id,expectedVersion:replacement.grant.version,reason}:undefined)
    if(!response)return
    if(replacement){onReplacementDone(trainingIssueOutcome(response)+' 原授权按替换操作撤销，旧草稿和历史定义保持原版。');return}
    if(response.revoked||response.currentVersion!==response.version){if(alive.current)setNotice(trainingIssueOutcome(response));await read(userId);return}
   }else{
    if(!grant?.canManage)throw Error('只能由原发行身份撤销此项授权')
    const response=await api.revoke(grant,'Training 管理员显式撤销该接收者的固定量表配置')
    if(response.code!==0)throw Error(response.message||'撤销结果未确认')
   }
   if(!alive.current)return
   setNotice(action==='issue'?'已保存此固定配置的使用权，未授予改编或其他入口权限。':'已撤销新增使用权，历史作答和报告保留。')
   await read(userId)
  }catch(cause){if(alive.current){setUncertain(true);setLoaded(false);setError(errorMessage(cause)+' 请先回读当前授权状态，勿重复提交。')}}
  finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 const recipient=teachers.find(row=>row.id===userId)
 const activeGrant=grant&&!grant.revokedAt
 return <ManagementDialog open title="分配固定量表配置" description={choice.title} onClose={()=>{if(!inFlight.current)onClose()}}
  closeDisabled={busy} className="training-accounts-dialog training-supervision-dialog training-configuration-dialog" width="compact"
  actions={<><button type="button" className="training-accounts-secondary" disabled={busy} onClick={onClose}>关闭</button><button type="button" className="training-accounts-primary"
   disabled={busy||loading||!loaded||!recipient||uncertain||Boolean(activeGrant)||!choice.assignable||!issuer.canIssue||!configurationName.trim()||Boolean(replacement&&(!reason.trim()||reason.trim().length>500))}
   onClick={()=>void mutate('issue')}>{replacement?'确认替换并授权':'授权此配置'}</button></>}>
  <p>管理员选择的内容、参数和报告随此授权固定；培训师不能在建任务时更换报告。</p>
  <Versions choice={choice}/>
  <label>接收培训师<select value={userId} disabled={busy||uncertain||Boolean(replacement)} onChange={event=>{
   const value=event.target.value;setUserId(value);setNotice('');setLoaded(false);setGrant(null);epoch.current++
   if(value)void read(value)
  }}><option value="">选择当前合格培训师</option>{teachers.map(row=><option key={row.id} value={row.id}>{row.nickname?row.nickname+'（'+row.username+'）':row.username}</option>)}</select></label>
  <label>授权配置名称<input maxLength={120} value={configurationName} disabled={busy||loading||Boolean(activeGrant)||Boolean(issuer.pending)} onChange={event=>setConfigurationName(event.target.value)}/></label>
  <p>用用途或报告样式命名，培训师直接使用此配置。已生效修订不原位改名；如需更新，先明确撤销再按新修订分配。</p>
  {loading&&<p role="status">正在读取名单或授权状态…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loaded&&recipient&&<p>{activeGrant?'该培训师已有此固定配置的使用权':grant?'此前授权已撤销，可明确重新分配':'尚未分配此固定配置'}</p>}
  {activeGrant&&!grant.canManage&&<p>此项由另一发行身份维护；不能覆盖或接管。</p>}
  {userId&&<button type="button" disabled={busy||loading} onClick={()=>void read(userId)}>回读当前授权状态</button>}
  {loaded&&activeGrant&&grant.canManage&&<button type="button" disabled={busy||loading||uncertain} onClick={()=>void mutate('revoke')}>撤销此配置使用权</button>}
  {loaded&&activeGrant&&grant.canManage&&grant.selectedBinding&&recipient&&!replacement&&<button type="button" disabled={busy||loading||uncertain||!issuer.canIssue} onClick={()=>onReplace(grant,recipient)}>以新配置替换此使用权</button>}
  {replacement&&activeGrant&&<p>新目标已有生效使用权，不能覆盖。请先明确处理该修订，再决定是否替换原配置。</p>}
  {!choice.assignable&&<p>{choice.unavailableReason||'此配置当前不能新增分配；仍可回读或撤销原授权。'}</p>}
 </ManagementDialog>
}

export default function TrainingStandardConfigurationGrants(){
 const {user}=useAuth()
 return user?<TrainingStandardConfigurationWorkspace key={user.id} actorId={user.id}/>:null
}
export function TrainingStandardConfigurationWorkspace({actorId}:{actorId?:string}={}){
 const [rows,setRows]=useState<StandardConfigurationChoice[]>([]),[page,setPage]=useState(1),[hasMore,setMore]=useState(false)
 const [filters,setFilters]=useState({...EMPTY_CATALOG_FILTERS}),[applied,setApplied]=useState({...EMPTY_CATALOG_FILTERS}),[facets,setFacets]=useState(EMPTY_CATALOG_FACETS)
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [choice,setChoice]=useState<StandardConfigurationChoice|null>(null)
 const [replacement,setReplacement]=useState<Replacement|null>(null),[replacementReason,setReplacementReason]=useState('')
 const issuer=useTrainingStandardConfigurationIssue(actorId),[operationNotice,setOperationNotice]=useState('')
 const visibleRows=rows.filter(row=>!replacement||row.toolKey===replacement.source.toolKey&&row.id!==replacement.source.id)
 function finishReplacement(notice:string){setReplacement(null);setReplacementReason('');setChoice(null);setOperationNotice(notice)}
 useEffect(()=>{let active=true;setLoading(true);setError('');setRows([])
  void api.catalog(page,applied).then(response=>{if(!active)return
   if(response.code!==0||!response.data||response.data.page!==page||typeof response.data.hasMore!=='boolean'
    ||!Array.isArray(response.data.list)||response.data.list.some(row=>!validStandardConfigurationChoice(row)))throw Error(response.message||'固定配置目录不完整')
   setRows(response.data.list);setMore(response.data.hasMore);setFacets(response.data.tagFacets??EMPTY_CATALOG_FACETS)
  }).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[page,revision,applied])
 return <section className="training-accounts training-resources-panel training-configuration-workspace" aria-label="固定量表配置授权">
  <header className="training-configuration-heading"><h2>固定量表配置授权</h2><button className="training-accounts-secondary" disabled={loading} onClick={()=>setRevision(v=>v+1)}>刷新固定配置</button></header>
  <p>只分配系统已批准用于 Training 的精确内容、参数和报告组合。工具审批与培训师使用权分别管理。</p>
  <CatalogDiscoveryFilters label="固定量表配置检索" filters={filters} facets={facets} onChange={setFilters} disabled={loading||issuer.busy} onApply={value=>{setChoice(null);setRows([]);setPage(1);setApplied({...value,keyword:value.keyword.trim()})}}/>
  {replacement&&<section aria-label="明确替换 Training 配置"><p>为 {replacement.recipient.nickname||replacement.recipient.username} 替换 {replacement.grant.configurationName??'原固定配置'}。请选择同一工具的另一份已批准组合；保存时撤销原使用权，旧草稿不会自动换版，已开始作答及历史定义保留。</p>
   <label>Training 配置替换原因<input maxLength={500} value={replacementReason} disabled={issuer.busy||Boolean(issuer.pending)} onChange={event=>setReplacementReason(event.target.value)}/></label>
   <button disabled={issuer.busy||Boolean(issuer.pending)} onClick={()=>{setReplacement(null);setReplacementReason('');setChoice(null)}}>取消替换 Training 配置</button>
   <p>原修订如已变化，请取消后重新读取原配置，再明确发起替换；不会自动推进原修订。</p>
  </section>}
  {issuer.error&&<p role="alert">{issuer.error}</p>}{operationNotice&&<p role="status">{operationNotice}</p>}
  {issuer.pending&&<section aria-label="Training 原固定配置请求"><p>{issuer.pending.title} · {issuer.pending.configurationName}；保留原接收者和修订。请求编号：<code>{issuer.pending.requestId}</code>。</p>
   {issuer.pending.replaces&&<p>此原请求包含明确替换：原授权 {issuer.pending.replaces.grantId}，修订 {issuer.pending.replaces.expectedVersion}；原因：{issuer.pending.replaces.reason}。</p>}
   <button disabled={issuer.busy} onClick={()=>{setOperationNotice('');void issuer.recover().then(result=>{if(result)finishReplacement(trainingIssueOutcome(result))})}}>核对原固定配置请求</button>
   {issuer.absent&&<><p role="status">尚未发现原请求，只能按原编号及原完整参数重试。</p><button disabled={issuer.busy} onClick={()=>{setOperationNotice('');void issuer.retry().then(result=>{if(result)finishReplacement(trainingIssueOutcome(result))}).catch(cause=>setOperationNotice(errorMessage(cause)))}}>按原固定配置请求重试</button></>}
  </section>}
  {loading&&<p role="status">正在读取已批准配置…</p>}{error&&<p role="alert">{error}</p>}
  {!loading&&!error&&!rows.length&&<p>{catalogQuery(1,applied)!=='page=1'?'没有匹配的固定量表配置，可调整条件或清除筛选。':'尚无已批准用于 Training 的固定量表配置。未装载、未审批或其他入口的内容不会自动成为可分配配置。'}</p>}
  {replacement&&!loading&&!visibleRows.length&&<p>本页没有同一工具的其他配置，可查看其他页或取消替换。</p>}
  <ApprovedScaleAxes choices={visibleRows.filter(row=>row.assignable)} disabled={loading||issuer.busy} scopeLabel="当前页已读取配置，可用分页查看其他版本" onSelect={id=>{const row=visibleRows.find(value=>value.id===id&&value.assignable);if(row)setChoice(row)}}/>
  <div className="training-configurations-grid">{visibleRows.map(row=><article key={row.id} className="training-configuration-card"><h3>{row.title}</h3><p>量表 · 题本版本 {row.instrumentVersion}</p><CatalogClassificationTags tags={row.classificationTags}/><Versions choice={row}/>
   <p>{row.assignable?'可分配':row.unavailableReason}</p><button type="button" className="training-accounts-secondary" onClick={()=>setChoice(row)}>管理此配置授权</button>
   <details><summary>配置身份详情</summary><p>{row.toolKey} · {row.instrumentVersion}</p><p className="break-all">{row.id} · {row.combinationHash}</p></details>
  </article>)}</div>
  <nav className="training-configuration-pagination" aria-label="固定量表配置分页"><button className="training-accounts-secondary" disabled={loading||page<=1} onClick={()=>setPage(v=>v-1)}>上一页配置</button><span>第 {page} 页</span>
   <button className="training-accounts-secondary" disabled={loading||!hasMore} onClick={()=>setPage(v=>v+1)}>下一页配置</button></nav>
  {choice&&<RecipientGrant key={choice.id+':'+(replacement?replacement.grant.id+':'+replacement.grant.version:'normal')} choice={choice} issuer={issuer} replacement={replacement} reason={replacementReason}
   onClose={()=>setChoice(null)} onReplace={(grant,recipient)=>{setReplacement({source:choice,grant,recipient});setReplacementReason('');setChoice(null);setOperationNotice('')}} onReplacementDone={finishReplacement}/>}
 </section>
}
