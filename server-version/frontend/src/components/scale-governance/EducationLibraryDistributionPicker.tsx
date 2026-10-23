import { useEffect, useRef, useState } from 'react'
import type { governanceApi, EducationDistributionProduct, EducationGrantRequest, EducationRecipientPage, GovernanceEntry, GovernanceUseGrant } from '../../api/scaleLibraryGovernance'

const distributionReasons:Record<string,string>={
  EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY:'此版本的适用方式暂未接通当前入口，不能向该入口分配。',
  EDUCATION_LIBRARY_ADAPTER_NOT_READY:'学校与教师入口的完整流程尚在验收，暂不开放使用分配。',
  EDUCATION_LIBRARY_APPLICABILITY_REQUIRED:'此固定版本未声明学校／教师适用方式；需通过新版本申请补充。',
  EDUCATION_APPLICABILITY_FROZEN_CONTRACT_MISMATCH:'此版本的适用声明与冻结记录不一致，请联系管理员核查。',
  EDUCATION_LIBRARY_APPROVAL_REQUIRED:'此固定版本尚未完成入库审批，不能向学校或教师分配。',
  EDUCATION_LIBRARY_DEPENDENCY_ADAPTER_NOT_READY:'此版本包含尚未接通的依赖或常模适配，暂不能向学校或教师分配。',
}
export const educationDistributionReason=(reason?:string|null)=>distributionReasons[reason??'']??reason??'学校与教师入口的分发暂未开放。'

type Recipient=EducationRecipientPage['list'][number]
type Api=Pick<ReturnType<typeof governanceApi>,'educationRecipients'|'educationGrant'>
const merge=(previous:Recipient[],next:Recipient[])=>Array.from(new Map([...previous,...next].map(row=>[row.id,row])).values())

/** This picker distributes an already approved exact version, never authoring,
 * publication or personal-report privileges. The server rechecks every target. */
export function EducationLibraryDistributionPicker({entry,product,grantId,grants,api,disabled,run,onGranted}:{
  entry:GovernanceEntry;product:EducationDistributionProduct;grantId?:string;grants:GovernanceUseGrant[];
  api:Api;disabled:boolean;run:(work:()=>Promise<unknown>,message:string)=>Promise<void>;
  onGranted:()=>Promise<void>
}){
  const [scopeKind,setScopeKind]=useState<'ORGANIZATION'|'USER'>('USER')
  const [organizations,setOrganizations]=useState<Recipient[]>([]),[users,setUsers]=useState<Recipient[]>([])
  const [organizationId,setOrganizationId]=useState(''),[userId,setUserId]=useState('')
  const [organizationKeyword,setOrganizationKeyword]=useState(''),[userKeyword,setUserKeyword]=useState('')
  const [organizationCursor,setOrganizationCursor]=useState<string|null>(null),[userCursor,setUserCursor]=useState<string|null>(null)
  const [lookupBusy,setLookupBusy]=useState(false),[error,setError]=useState('')
  const generation=useRef(0),live=useRef(true)
  const pending=useRef<{key:string;requestId:string}|null>(null)
  const readiness=entry.educationDistribution?.products?.[product]
  const ready=entry.status==='ACTIVE'&&readiness?.status==='READY'
    &&readiness.canDistribute&&readiness.contentCompatible
    &&entry.supportedEntrypoints.includes(product)&&Boolean(entry.contentHash)
  useEffect(()=>{
    live.current=true;generation.current++
    setOrganizations([]);setUsers([]);setOrganizationId('');setUserId('')
    setOrganizationCursor(null);setUserCursor(null);setLookupBusy(false);setError('')
    return()=>{live.current=false;generation.current++}
  },[entry.id,entry.releaseId,entry.contentHash,product,grantId,ready])
  const invalidate=()=>{generation.current++;setLookupBusy(false);setError('')}
  const resetUsers=()=>{setUsers([]);setUserId('');setUserCursor(null);setUserKeyword('')}
  const changeScope=(value:'ORGANIZATION'|'USER')=>{
    invalidate();setScopeKind(value);setOrganizations([]);setOrganizationId('');setOrganizationCursor(null);resetUsers()
  }
  const readRecipients=async(kind:'ORGANIZATION'|'USER',cursor?:string)=>{
    if(disabled||!ready||!entry.contentHash||(kind==='USER'&&!organizationId))return
    const current=++generation.current
    setLookupBusy(true);setError('')
    try{
      const base={product,releaseId:entry.releaseId,contentHash:entry.contentHash,
        keyword:(kind==='ORGANIZATION'?organizationKeyword:userKeyword).trim(),...(cursor?{cursor}:{}),...(grantId?{grantId}:{})}
      const response=await api.educationRecipients(entry.id,kind==='USER'
        ?{...base,scopeKind:'USER',organizationId}:{...base,scopeKind:'ORGANIZATION'})
      if(!live.current||current!==generation.current)return
      if(response.product!==product||response.scopeKind!==kind||(kind==='USER'&&response.organizationId!==organizationId))
        throw new Error('授权对象范围已变化，请重新读取。')
      const rows=response.list.filter(row=>typeof row.id==='string'&&Boolean(row.id)
        &&typeof (kind==='ORGANIZATION'?row.name:row.username)==='string')
      if(kind==='ORGANIZATION'){
        setOrganizations(previous=>merge(cursor?previous:[],rows));setOrganizationCursor(response.nextCursor)
        if(!cursor){setOrganizationId('');resetUsers()}
      }else{
        setUsers(previous=>merge(cursor?previous:[],rows));setUserCursor(response.nextCursor)
        if(!cursor)setUserId('')
      }
    }catch(failure){
      if(live.current&&current===generation.current)setError(failure instanceof Error?failure.message:'授权对象读取失败，请重试。')
    }finally{if(live.current&&current===generation.current)setLookupBusy(false)}
  }
  const organization=organizations.find(row=>row.id===organizationId)
  const user=users.find(row=>row.id===userId)
  const assign=async()=>{
    if(disabled||!ready||!entry.contentHash||!organization||(scopeKind==='USER'&&!user))return
    const target=scopeKind==='ORGANIZATION'?`${organization.name}（组织范围）`:`${organization.name} / ${user!.name||user!.username}（${user!.username}）`
    if(!window.confirm(`将 ${entry.metadata.title} 的固定版本 ${entry.releaseId}\n内容指纹 ${entry.contentHash}\n授予 ${product} 入口：${target}。\n仅授予该版本使用范围，不授予编制、发布活动或读取个人报告的权限。确认分配？`))return
    const existing=grants.find(row=>row.product===product&&row.scopeKind===scopeKind
      &&row.organizationId===organizationId&&row.userId===(scopeKind==='USER'?userId:null))
    const key=JSON.stringify([entry.id,entry.releaseId,entry.contentHash,product,scopeKind,organizationId,
      scopeKind==='USER'?userId:null,grantId??null,existing?.version??null])
    if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID()}
    const base={product,releaseId:entry.releaseId,contentHash:entry.contentHash,organizationId,
      requestId:pending.current.requestId,...(grantId?{grantId}:{}),...(existing?{expectedGrantVersion:existing.version}:{})}
    const request:EducationGrantRequest=scopeKind==='USER'?{...base,scopeKind,userId}:{...base,scopeKind,userId:null}
    await run(async()=>{
      await api.educationGrant(entry.id,request)
      pending.current=null
      await onGranted()
    },'已分配该学校范围内的精确版本使用授权，不增加发布或个人报告权限。')
  }
  if(!ready)return <p>{educationDistributionReason(readiness?.reason)}</p>
  return <fieldset disabled={disabled} aria-label="学校与教师精确版本授权对象">
    <p>使用范围与编制、活动发布、个体报告读取权限分别校验。请先选择学校，再选择本校账号或组织范围。</p>
    <label>授权范围<select className="input block" value={scopeKind} onChange={event=>changeScope(event.target.value as 'ORGANIZATION'|'USER')}>
      <option value="USER">指定学校内的使用者</option><option value="ORGANIZATION">指定学校组织</option>
    </select></label>
    <label>查找学校<input className="input block" value={organizationKeyword} onChange={event=>{
      invalidate();setOrganizationKeyword(event.target.value);setOrganizations([]);setOrganizationId('');setOrganizationCursor(null);resetUsers()
    }}/></label>
    <button type="button" className="hui-button hui-button--secondary" disabled={lookupBusy} onClick={()=>void readRecipients('ORGANIZATION')}>读取可见学校</button>
    <label>授权学校<select className="input block" value={organizationId} onChange={event=>{invalidate();setOrganizationId(event.target.value);resetUsers()}}>
      <option value="">请选择已核对的学校</option>{organizations.map(row=><option key={row.id} value={row.id}>{row.name} · {row.id}</option>)}
    </select></label>
    {organizationCursor&&<button type="button" disabled={lookupBusy} onClick={()=>void readRecipients('ORGANIZATION',organizationCursor)}>继续读取学校</button>}
    {scopeKind==='USER'&&<>
      <label>查找本校账号<input className="input block" disabled={!organizationId} value={userKeyword} onChange={event=>{
        invalidate();setUserKeyword(event.target.value);setUsers([]);setUserId('');setUserCursor(null)
      }}/></label>
      <button type="button" className="hui-button hui-button--secondary" disabled={lookupBusy||!organizationId} onClick={()=>void readRecipients('USER')}>读取本校可见账号</button>
      <label>本校授权账号<select className="input block" disabled={!organizationId} value={userId} onChange={event=>setUserId(event.target.value)}>
        <option value="">请选择已核对的本校账号</option>{users.map(row=><option key={row.id} value={row.id}>{row.name||row.username} · {row.username} · {row.id}</option>)}
      </select></label>
      {userCursor&&<button type="button" disabled={lookupBusy} onClick={()=>void readRecipients('USER',userCursor)}>继续读取本校账号</button>}
    </>}
    {lookupBusy&&<p role="status">正在读取当前可见的授权对象…</p>}
    {error&&<p role="alert">{error} 未自动重试，可重新读取对象；已有授权不会因此改变。</p>}
    <p className="break-all">固定版本：{entry.releaseId} · 内容指纹：{entry.contentHash}</p>
    <button type="button" className="hui-button hui-button--primary" disabled={lookupBusy||!organization||(scopeKind==='USER'&&!user)} onClick={()=>void assign()}>
      确认并授予精确版本使用权限
    </button>
  </fieldset>
}
