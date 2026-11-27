import {useEffect,useRef,useState} from 'react'
import api from '../api/client'

type Status='ACTIVE'|'SCHEDULED'|'EXPIRED'|'REVOKED'
type Grant={id:string;version:number;product:'SCHOOL'|'TEACHER';schoolName:string;title:string;exact:boolean;status:Status;expiresAt:string}
type Candidate={id:string;label:string;detail:string;grantId:string|null}
type Detail={
 grant:Grant
 combinations:{id:string;title:string;contentVersion:string;parametersVersion:string;reportVersion:string}[]
 affected:{count:number;digest:string;hasMore:boolean;list:{id:string;label:string;title:string;expiresAt:string}[]}
 candidates:Candidate[]
 moreCandidates:boolean
}
type GrantPage={list:Grant[];hasMore:boolean}
type Issue={requestId:string;successorId:string;expectedVersion:number;reason:string}
const statusLabel:Record<Status,string>={ACTIVE:'有效',SCHEDULED:'待生效',EXPIRED:'已到期',REVOKED:'已撤销'}
const scopeLabel=(grant:Grant)=>grant.exact?'单一题本、参数和报告组合':'同一测量版本的获准组合'
const date=(value:string)=>new Date(value).toLocaleString('zh-CN')

export function StandardDelegationReviewPanel(props:{accountId:string;accountLabel:string}){
 return <Review key={props.accountId} {...props}/>
}

function Review({accountId,accountLabel}:{accountId:string;accountLabel:string}){
 const base='/admin/permissions/standard-delegation-review/accounts/'+encodeURIComponent(accountId)
 const [grants,setGrants]=useState<GrantPage|null>(null),[listPage,setListPage]=useState(1)
 const [detail,setDetail]=useState<Detail|null>(null),[impactPage,setImpactPage]=useState(1),[candidatePage,setCandidatePage]=useState(1)
 const [search,setSearch]=useState(''),[candidate,setCandidate]=useState<Candidate|null>(null)
 const [reason,setReason]=useState(''),[pending,setPending]=useState<Issue|null>(null)
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('')
 const active=useRef(true),running=useRef(false)
 useEffect(()=>{active.current=true;return ()=>{active.current=false}},[])
 const action=(work:()=>Promise<unknown>)=>{
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  void work().catch(cause=>{if(active.current)setError(cause instanceof Error?cause.message:'委托操作失败，请重新核对')})
    .finally(()=>{running.current=false;if(active.current)setBusy(false)})
 }
 const readList=async(page:number)=>{
  const response=await api.get<GrantPage>(base+'?page='+page)
  if(active.current){setGrants(response.data!);setListPage(page)}
 }
 const readGrant=async(id:string,query:string,nextCandidatePage:number,nextImpactPage:number)=>{
  const parameters=new URLSearchParams({candidateQuery:query,candidatePage:String(nextCandidatePage),impactPage:String(nextImpactPage)})
  const response=await api.get<Detail>(base+'/grants/'+id+'?'+parameters.toString())
  if(active.current){
   setDetail(response.data!);setCandidatePage(nextCandidatePage);setImpactPage(nextImpactPage)
  }
  return response.data!
 }
 const openGrant=(id:string)=>action(async()=>{
  setDetail(null);setCandidate(null);setReason('');setSearch('');setNotice('')
  await readGrant(id,'',1,1)
 })
 const copy=()=>action(async()=>{
  if(!detail||!candidate||candidate.grantId||!reason.trim())throw new Error('请选择接任人并填写变更原因')
  if(!pending&&!window.confirm('确认给 '+candidate.label+' 签发同一学校、入口及版本范围的分发委托？原委托到期时间保持 '+date(detail.grant.expiresAt)+'，请随后核对需要重新签发的固定配置。'))return
  const issue=pending??{requestId:crypto.randomUUID(),successorId:candidate.id,expectedVersion:detail.grant.version,reason:reason.trim()}
  setPending(issue)
  try{
   const response=await api.post<{grantId:string}>(base+'/grants/'+detail.grant.id+'/successor',issue)
   if(!active.current)return
   setCandidate({...candidate,grantId:response.data!.grantId});setPending(null)
   setNotice('接任委托已签发。请核对下游固定配置，再决定何时撤销原委托。')
  }catch(cause){
   const status=(cause as {status?:number})?.status
   if(active.current&&!pending&&typeof status==='number'&&status>=400&&status<500&&status!==408)setPending(null)
   throw cause
  }
 })
 const reconcile=()=>action(async()=>{
  if(!detail||!pending||!candidate)return
  const refreshed=await readGrant(detail.grant.id,candidate.label,1,impactPage)
  if(!active.current)return
  setSearch(candidate.label)
  const confirmed=refreshed.candidates.find(option=>option.id===candidate.id&&option.grantId)
  if(!confirmed){setNotice('尚未查到接任人的同范围有效委托，可以重试同一笔签发。');return}
  setCandidate(confirmed);setPending(null);setNotice('已核对接任人当前持有同范围委托。')
 })
 const withdraw=(handoff:boolean)=>action(async()=>{
  if(!detail||!reason.trim()||pending)throw new Error('请填写变更原因并核对待办签发')
  const successorGrantId=handoff?candidate?.grantId:undefined
  if(handoff&&!successorGrantId)throw new Error('请先选择已持有同一范围有效委托的接任人')
  const affected=detail.affected.count
  const target=handoff?'完成交接并撤销原委托':'终止原委托'
  if(!window.confirm(target+'？当前有 '+affected+' 份固定配置引用该委托。撤销会停止这些配置的新发布，已入场作答仍可完成。仍需使用的固定配置应由接任人重新签发。'))return
  await api.post(base+'/grants/'+detail.grant.id+'/revoke',{
   expectedVersion:detail.grant.version,reason:reason.trim(),impactDigest:detail.affected.digest,
   ...(successorGrantId?{successorGrantId}:{}),
  })
  if(!active.current)return
  setDetail(null);setCandidate(null);setReason('');setNotice('原分发委托已撤销。')
  await readList(listPage)
 })

 return <section className="sys-grant" aria-label={accountLabel+'的量表分发委托'}>
  <button type="button" disabled={busy} className="sys-text-button"
    onClick={()=>action(()=>readList(listPage))}>查看量表分发与交接</button>
  {error&&<p className="sys-message sys-error" role="alert">{error}</p>}
  {notice&&<p className="sys-message" role="status">{notice}</p>}
  {grants&&!grants.list.length&&<p>此账号暂无标准量表分发委托。</p>}
  {grants&&grants.list.length>0&&<>
   <ul>{grants.list.map(grant=><li key={grant.id}>
    <button type="button" disabled={busy||Boolean(pending)} aria-pressed={detail?.grant.id===grant.id}
      onClick={()=>openGrant(grant.id)}>{grant.title} · {grant.schoolName} · {grant.product==='SCHOOL'?'School':'Teacher'} · {statusLabel[grant.status]}</button>
   </li>)}</ul>
   {(listPage>1||grants.hasMore)&&<div className="system-actions">
    <button type="button" disabled={busy||listPage===1||Boolean(pending)} onClick={()=>action(()=>readList(listPage-1))}>上一页委托</button>
    <button type="button" disabled={busy||!grants.hasMore||Boolean(pending)} onClick={()=>action(()=>readList(listPage+1))}>下一页委托</button>
   </div>}
  </>}
  {detail&&<section aria-label="委托范围与下游影响" className="sys-record-body">
   <h4>{detail.grant.title} · {detail.grant.schoolName}</h4>
   <p>{scopeLabel(detail.grant)} · {statusLabel[detail.grant.status]} · 到期 {date(detail.grant.expiresAt)}</p>
   {!!detail.combinations.length&&<ul>{detail.combinations.map(combination=><li key={combination.id}>
    {combination.title} · 题本 {combination.contentVersion} · 参数 {combination.parametersVersion} · 报告 {combination.reportVersion}
   </li>)}</ul>}
   <p>有 {detail.affected.count} 份有效期内或待生效的固定配置引用此委托。</p>
   {!!detail.affected.list.length&&<ul>{detail.affected.list.map(item=><li key={item.id}>{item.label} · {item.title} · 到期 {date(item.expiresAt)}</li>)}</ul>}
   {(impactPage>1||detail.affected.hasMore)&&<div className="system-actions">
    <button type="button" disabled={busy||impactPage===1||Boolean(pending)}
      onClick={()=>action(()=>readGrant(detail.grant.id,search,candidatePage,impactPage-1))}>上一页受影响配置</button>
    <button type="button" disabled={busy||!detail.affected.hasMore||Boolean(pending)}
      onClick={()=>action(()=>readGrant(detail.grant.id,search,candidatePage,impactPage+1))}>下一页受影响配置</button>
   </div>}
   {detail.grant.status==='ACTIVE'&&<>
    <form className="sys-search" onSubmit={event=>{event.preventDefault();action(()=>readGrant(detail.grant.id,search,1,impactPage))}}>
     <label className="system-field">查找接任管理员<input disabled={busy||Boolean(pending)} value={search} onChange={event=>setSearch(event.target.value)}/></label>
     <button disabled={busy||Boolean(pending)} type="submit">搜索接任人</button>
    </form>
    <ul>{detail.candidates.map(option=><li key={option.id}><button type="button" disabled={busy||Boolean(pending)}
      aria-pressed={candidate?.id===option.id} onClick={()=>setCandidate(option)}>{option.label} · {option.detail}{option.grantId?' · 已有同范围委托':''}</button></li>)}</ul>
    {(candidatePage>1||detail.moreCandidates)&&<div className="system-actions">
     <button type="button" disabled={busy||candidatePage===1||Boolean(pending)}
       onClick={()=>action(()=>readGrant(detail.grant.id,search,candidatePage-1,impactPage))}>上一页接任人</button>
     <button type="button" disabled={busy||!detail.moreCandidates||Boolean(pending)}
       onClick={()=>action(()=>readGrant(detail.grant.id,search,candidatePage+1,impactPage))}>下一页接任人</button>
    </div>}
    {candidate&&<p>接任人 {candidate.label} · {candidate.grantId?'同范围委托已就绪':'待签发'}</p>}
   </>}
   {detail.grant.status!=='REVOKED'&&<>
    {pending&&<div><p>签发结果待确认。可以重新核对接任委托或重试同一笔签发。</p>
      <button type="button" disabled={busy} onClick={reconcile}>核对接任委托</button></div>}
    <label className="system-field">分发委托变更原因<textarea disabled={busy||Boolean(pending)} maxLength={400}
      value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <div className="system-actions">
     {detail.grant.status==='ACTIVE'&&<>
      <button type="button" disabled={busy||!candidate||Boolean(candidate.grantId)||!reason.trim()} onClick={copy}>{pending?'重试同一笔签发':'签发接任委托'}</button>
      <button type="button" disabled={busy||Boolean(pending)||!candidate?.grantId||!reason.trim()} onClick={()=>withdraw(true)}>完成交接并撤销原委托</button>
     </>}
     <button type="button" disabled={busy||Boolean(pending)||!reason.trim()} onClick={()=>withdraw(false)}>终止原委托</button>
    </div>
   </>}
  </section>}
 </section>
}
