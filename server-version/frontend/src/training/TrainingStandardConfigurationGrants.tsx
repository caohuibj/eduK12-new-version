import {useEffect,useRef,useState} from 'react'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import {eligibleGrantTeachers,materialGrantApi} from '../api/materialGrants'
import {standardConfigurationGrantsApi as api,validStandardConfigurationChoice,validStandardConfigurationUse,type StandardConfigurationChoice,type StandardConfigurationUse} from '../api/standardConfigurationGrants'
import type {User} from '../types'

const errorMessage=(cause:unknown)=>cause instanceof Error?cause.message:'请求未完成，请重新读取实际状态。'
function Versions({choice}:{choice:StandardConfigurationChoice}){
 return <dl><dt>内容</dt><dd>{choice.versions.CONTENT}</dd><dt>参数</dt><dd>{choice.versions.PARAMETERS==='none-v1'?'未配置阈值或常模':choice.versions.PARAMETERS}</dd>
  <dt>报告</dt><dd>{choice.versions.REPORT==='none-v1'?'不反馈':choice.versions.REPORT}</dd></dl>
}
function RecipientGrant({choice,onClose}:{choice:StandardConfigurationChoice;onClose:()=>void}){
 const [teachers,setTeachers]=useState<User[]>([]),[userId,setUserId]=useState('')
 const [grant,setGrant]=useState<StandardConfigurationUse|null>(null),[loaded,setLoaded]=useState(false)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[uncertain,setUncertain]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState('')
 const epoch=useRef(0),alive=useRef(true),inFlight=useRef(false)
 useEffect(()=>{alive.current=true;let active=true
  void materialGrantApi.listTeachers().then(response=>{
   if(!active)return
   if(response.code!==0||!response.data||!Array.isArray(response.data.list)||response.data.total!==response.data.list.length)throw Error(response.message||'培训师名单不完整')
   setTeachers(eligibleGrantTeachers(response.data.list))
  }).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false;alive.current=false;epoch.current++}
 },[])
 const read=async(target:string)=>{
  const current=++epoch.current;setLoaded(false);setGrant(null);setError('');setLoading(true)
  try{
   const response=await api.grants(choice.id,{userId:target})
   if(!alive.current||current!==epoch.current)return
   if(response.code!==0||!response.data||response.data.hasMore!==false||!Array.isArray(response.data.list)||response.data.list.length>1
    ||response.data.list.some(row=>!validStandardConfigurationUse(row)||row.userId!==target||row.combinationHash!==choice.combinationHash))throw Error(response.message||'授权身份或列表不完整，请停止操作并核查')
   setGrant(response.data.list[0]??null);setLoaded(true);setUncertain(false)
  }catch(cause){if(alive.current&&current===epoch.current)setError(errorMessage(cause))}
  finally{if(alive.current&&current===epoch.current)setLoading(false)}
 }
 const mutate=async(action:'issue'|'revoke')=>{
  if(inFlight.current||!loaded||!userId||uncertain)return
  inFlight.current=true;setBusy(true);setError('');setNotice('')
  try{
   if(action==='issue'){
    const response=await api.issue(choice,{requestId:crypto.randomUUID(),userId,...(grant?{expectedUseVersion:grant.version}:{})})
    if(response.code!==0||!response.data)throw Error(response.message||'授权结果未确认')
    if(response.data.revoked)throw Error('该请求已有历史结果，当前使用权已撤销；请回读核对')
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
  closeDisabled={busy} className="training-accounts-dialog training-supervision-dialog" width="compact"
  actions={<><button type="button" disabled={busy} onClick={onClose}>关闭</button><button type="button"
   disabled={busy||loading||!loaded||!recipient||uncertain||Boolean(activeGrant)||!choice.assignable}
   onClick={()=>void mutate('issue')}>授权此配置</button></>}>
  <p>管理员选择的内容、参数和报告随此授权固定；培训师不能在建任务时更换报告。</p>
  <Versions choice={choice}/>
  <label>接收培训师<select value={userId} disabled={busy||uncertain} onChange={event=>{
   const value=event.target.value;setUserId(value);setNotice('');setLoaded(false);setGrant(null);epoch.current++
   if(value)void read(value)
  }}><option value="">选择当前合格培训师</option>{teachers.map(row=><option key={row.id} value={row.id}>{row.nickname?row.nickname+'（'+row.username+'）':row.username}</option>)}</select></label>
  {loading&&<p role="status">正在读取名单或授权状态…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loaded&&recipient&&<p>{activeGrant?'该培训师已有此固定配置的使用权':grant?'此前授权已撤销，可明确重新分配':'尚未分配此固定配置'}</p>}
  {activeGrant&&!grant.canManage&&<p>此项由另一发行身份维护；不能覆盖或接管。</p>}
  {userId&&<button type="button" disabled={busy||loading} onClick={()=>void read(userId)}>回读当前授权状态</button>}
  {loaded&&activeGrant&&grant.canManage&&<button type="button" disabled={busy||loading||uncertain} onClick={()=>void mutate('revoke')}>撤销此配置使用权</button>}
  {!choice.assignable&&<p>{choice.unavailableReason||'此配置当前不能新增分配；仍可回读或撤销原授权。'}</p>}
 </ManagementDialog>
}

export default function TrainingStandardConfigurationGrants(){
 const [rows,setRows]=useState<StandardConfigurationChoice[]>([]),[page,setPage]=useState(1),[hasMore,setMore]=useState(false)
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [choice,setChoice]=useState<StandardConfigurationChoice|null>(null)
 useEffect(()=>{let active=true;setLoading(true);setError('');setRows([])
  void api.catalog(page).then(response=>{if(!active)return
   if(response.code!==0||!response.data||response.data.page!==page||typeof response.data.hasMore!=='boolean'
    ||!Array.isArray(response.data.list)||response.data.list.some(row=>!validStandardConfigurationChoice(row)))throw Error(response.message||'固定配置目录不完整')
   setRows(response.data.list);setMore(response.data.hasMore)
  }).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[page,revision])
 return <section className="training-accounts training-resources-panel" aria-label="固定量表配置授权">
  <header className="training-management-page-heading"><h2>固定量表配置授权</h2><button disabled={loading} onClick={()=>setRevision(v=>v+1)}>刷新固定配置</button></header>
  <p>只分配系统已批准用于 Training 的精确内容、参数和报告组合。工具审批与培训师使用权分别管理。</p>
  {loading&&<p role="status">正在读取已批准配置…</p>}{error&&<p role="alert">{error}</p>}
  {!loading&&!error&&!rows.length&&<p>尚无已批准用于 Training 的固定量表配置。未装载、未审批或其他入口的内容不会自动成为可分配配置。</p>}
  {rows.map(row=><article key={row.id} className="training-accounts-empty"><h3>{row.title}</h3><Versions choice={row}/>
   <p>{row.assignable?'可分配':row.unavailableReason}</p><button type="button" onClick={()=>setChoice(row)}>管理此配置授权</button>
   <details><summary>配置身份详情</summary><p>{row.toolKey} · {row.instrumentVersion}</p><p className="break-all">{row.id} · {row.combinationHash}</p></details>
  </article>)}
  <nav aria-label="固定量表配置分页"><button disabled={loading||page<=1} onClick={()=>setPage(v=>v-1)}>上一页配置</button><span>第 {page} 页</span>
   <button disabled={loading||!hasMore} onClick={()=>setPage(v=>v+1)}>下一页配置</button></nav>
  {choice&&<RecipientGrant key={choice.id} choice={choice} onClose={()=>setChoice(null)}/>}
 </section>
}
