import {useEffect,useRef,useState} from 'react'
import api from '../../api/client'
import {adminContentApi,type AdminContentGrantMetadata} from '../../api/adminContent'
import {contentUuid,localInputTime,requestFailure} from '../../admin/contentRequestRecovery'
import AdminStepUp from '../../admin/AdminStepUp'
import './standard-delegation.css'

type Product='SCHOOL'|'TEACHER'
type Scope='MEASUREMENT'|'COMBINATION'
type Choice={id:string;label:string;detail?:string}
type Combination={id:string;title:string;instrumentVersion:string;contentVersion:string;parametersVersion:string;reportVersion:string}
export type StandardDelegationTarget={combination:Combination;product:Product}
type Cover={measurementReleaseId:string;coverageDigest:string;assignable:boolean;combinations:Combination[];
 combinationResourceKey?:string;combinationCoverageDigest?:string|null}
type GrantRecord={id:string;version:number;product:Product;schoolName:string;adminName:string;startsAt:string;expiresAt:string;revokedAt:string|null;status:'SCHEDULED'|'ACTIVE'|'EXPIRED'|'REVOKED';reason?:string;scope?:Scope}
type Directory={cover:Cover;schools:Choice[];administrators:Choice[];records:GrantRecord[];moreSchools:boolean;moreAdministrators:boolean;moreRecords:boolean}
type Issue={product:Product;schoolId:string;adminId:string;startsAt:string;expiresAt:string;reason:string;requestId:string;coverageDigest:string;scope?:Scope}
type Pending=(
 {kind:'ISSUE';request:Issue;school:Choice;administrator:Choice;cover:Cover}|
 {kind:'REVOKE';grantId:string;request:{expectedVersion:number;reason:string};schoolName:string;adminName:string;expectedResourceKey?:string}
)&{hadUnknown:boolean}
type Props={actorId:string;combination:Combination;onClose:()=>void;initialProduct?:Product}
const labels={SCHOOL:'School',TEACHER:'Teacher'}
const states={SCHEDULED:'待生效',ACTIVE:'生效中',EXPIRED:'已到期',REVOKED:'已撤销'}
const futureScope='这是该测量版本在本入口当前可分发的组合；同一测量版本今后新获准组合也在这笔委托范围内，直到到期或撤销。'
const exactScope='本次委托只覆盖下方固定的题本、参数和报告组合。'
const scopes={MEASUREMENT:'该测量版本下的获准组合',COMBINATION:'仅当前组合'}
const scopedKey=(cover:Cover,scope?:Scope)=>scope==='COMBINATION'?cover.combinationResourceKey:cover.measurementReleaseId
const scopedDigest=(cover:Cover,scope:Scope)=>scope==='COMBINATION'?cover.combinationCoverageDigest:cover.coverageDigest
function combinationKeyMatches(value:string|undefined,releaseId:string){
 const prefix='education-source:STANDARD_SCALE:'+releaseId+':'
 return Boolean(value?.startsWith(prefix)&&/^[a-f0-9]{64}$/.test(value.slice(prefix.length)))
}
const versions=(row:Combination)=>`${row.title} · 题本 ${row.instrumentVersion} · C ${row.contentVersion} / P ${row.parametersVersion} / R ${row.reportVersion}`
const time=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
const statusOf=(row:AdminContentGrantMetadata)=>row.revokedAt?'REVOKED':Date.parse(row.expiresAt)<=Date.now()?'EXPIRED':Date.parse(row.validFrom)>Date.now()?'SCHEDULED':'ACTIVE'
function restore(key:string,actorId:string,releaseId:string,product:Product):{pending:Pending|null;error:string}{
 try{
  const raw=sessionStorage.getItem(key)
  if(!raw)return {pending:null,error:''}
  const value=JSON.parse(raw),pending=value.pending as Pending
  if(value.actorId!==actorId||value.releaseId!==releaseId||value.product!==product||!pending||!['ISSUE','REVOKE'].includes(pending.kind))throw Error('scope')
  if(pending.kind==='ISSUE'){
   const r=pending.request
   if(r.product!==product||![r.requestId,r.schoolId,r.adminId,pending.cover?.measurementReleaseId].every(id=>contentUuid.test(id))
    ||pending.school?.id!==r.schoolId||pending.administrator?.id!==r.adminId||typeof r.coverageDigest!=='string'||!r.coverageDigest
    ||!Number.isFinite(Date.parse(r.startsAt))||!Number.isFinite(Date.parse(r.expiresAt))||!r.reason?.trim()||!Array.isArray(pending.cover.combinations)
    ||r.scope!==undefined&&r.scope!=='MEASUREMENT'&&r.scope!=='COMBINATION'
    ||r.scope==='COMBINATION'&&(!combinationKeyMatches(pending.cover.combinationResourceKey,releaseId)
     ||r.coverageDigest!==pending.cover.combinationCoverageDigest))throw Error('issue')
  }else if(!contentUuid.test(pending.grantId)||!Number.isSafeInteger(pending.request?.expectedVersion)||pending.request.expectedVersion<1||!pending.request.reason?.trim())throw Error('revoke')
  // A restored request may have been in flight when the page closed.
  return {pending:{...pending,hadUnknown:true},error:''}
 }catch{return {pending:null,error:'无法恢复此管理员、组合和入口的待核对请求。请保留本标签页并核对原委托，勿重复签发。'}}
}
export default function StandardDelegationPanel(props:Props){
 const [product,setProduct]=useState<Product>(props.initialProduct??'SCHOOL'),[locked,setLocked]=useState(false),[dirty,setDirty]=useState(false)
 return <section className="standard-delegation" aria-label="组合分配权限">
  <header className="sys-section-heading"><div><h3>分配权限 · {props.combination.title}</h3><p>{versions(props.combination)}</p></div><button type="button" disabled={locked} onClick={()=>{if(!dirty||window.confirm('关闭当前分配面板？未提交的选择将清除。'))props.onClose()}}>关闭分配面板</button></header>
  <label className="system-field">分发入口<select value={product} disabled={locked} onChange={event=>{
   if(dirty&&!window.confirm('切换入口会清除未提交的选择，确认继续？'))return
   setDirty(false);setProduct(event.target.value as Product)
  }}><option value="SCHOOL">School</option><option value="TEACHER">Teacher</option></select></label>
  <DelegationSession key={props.actorId+':'+props.combination.id+':'+product} {...props} product={product} onLocked={setLocked} onDirty={setDirty}/>
 </section>
}
function DelegationSession({actorId,combination,product,onLocked,onDirty}:{actorId:string;combination:Combination;product:Product;onLocked:(value:boolean)=>void;onDirty:(value:boolean)=>void}){
 const releaseId=combination.id,base='/admin/permissions/standard-delegations/'+encodeURIComponent(releaseId)
 const storageKey='standard-delegation-pending:'+actorId+':'+releaseId+':'+product
 const [initial]=useState(()=>restore(storageKey,actorId,releaseId,product))
 const [pending,setPending]=useState<Pending|null>(initial.pending),[storageError,setStorageError]=useState(initial.error)
 const [scope,setScope]=useState<Scope>(initial.pending?.kind==='ISSUE'?initial.pending.request.scope??'MEASUREMENT':'MEASUREMENT')
 const [data,setData]=useState<Directory|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[reload,setReload]=useState(0)
 const [schoolInput,setSchoolInput]=useState(''),[schoolQuery,setSchoolQuery]=useState(''),[schoolPage,setSchoolPage]=useState(1),[school,setSchool]=useState<Choice|null>(null)
 const [adminInput,setAdminInput]=useState(''),[adminQuery,setAdminQuery]=useState(''),[adminPage,setAdminPage]=useState(1),[administrator,setAdministrator]=useState<Choice|null>(null)
 const [page,setPage]=useState(1),[startsAt,setStartsAt]=useState(localInputTime(new Date().toISOString())),[expiresAt,setExpiresAt]=useState(''),[reason,setReason]=useState('')
 const [revokeReasons,setRevokeReasons]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[issued,setIssued]=useState(false)
 const [verification,setVerification]=useState(false),[verified,setVerified]=useState<AdminContentGrantMetadata|null>(null)
 const request=useRef(0),inFlight=useRef(false),alive=useRef(true),heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{alive.current=true;heading.current?.focus();return()=>{alive.current=false}},[])
 const query=new URLSearchParams({product,schoolQuery,adminQuery,schoolPage:String(schoolPage),adminPage:String(adminPage),page:String(page)}).toString()
 useEffect(()=>{
  const generation=++request.current;let cancelled=false
  setLoading(true);setLoadError('');setData(null)
  void api.get<Directory>(base+'?'+query).then(result=>{
   if(cancelled||generation!==request.current)return
   const next=result.data
   if(!next?.cover||typeof next.cover.assignable!=='boolean'||!Array.isArray(next.cover.combinations)||!Array.isArray(next.schools)||!Array.isArray(next.administrators)||!Array.isArray(next.records))throw Error('分配范围或记录读取不完整，请刷新核对。')
   setData(next)
  }).catch(failure=>{if(!cancelled&&generation===request.current){setLoadError(requestFailure(failure).message);if([401,403].includes((failure as {status?:number})?.status??0))setVerification(true)}}).finally(()=>{if(!cancelled&&generation===request.current)setLoading(false)})
  return()=>{cancelled=true}
 },[base,query,reload])
 const locked=busy||Boolean(pending)||Boolean(storageError)
 const formLocked=locked||issued||loading||!data?.cover.assignable
 useEffect(()=>{onLocked(locked);return()=>onLocked(false)},[locked,onLocked])
 useEffect(()=>{onDirty(Boolean(school||administrator||reason));return()=>onDirty(false)},[school,administrator,reason,onDirty])
 useEffect(()=>{
  if(!pending)return
  const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)
 },[pending])
 function retain(value:Pending){
  try{sessionStorage.setItem(storageKey,JSON.stringify({actorId,releaseId,product,pending:value}));setStorageError('');return true}
  catch{setStorageError('无法保存待核对请求，已阻止新的变更。请保留本页并检查浏览器存储。');return false}
 }
 function clearPending(){sessionStorage.removeItem(storageKey);setPending(null);setVerified(null)}
 function clearDraft(){setSchool(null);setAdministrator(null);setReason('');setExpiresAt('')}
 function refresh(){setPage(1);setReload(old=>old+1)}
 async function operate(work:()=>Promise<void>){
  if(inFlight.current)return
  inFlight.current=true;setBusy(true);setError('');setNotice('')
  try{await work()}catch(failure){if(alive.current)setError(requestFailure(failure).message)}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 async function send(value:Pending){
  // Persist the in-flight uncertainty before sending; retries retain the intent.
  if(!retain({...value,hadUnknown:true}))return
  setPending(value);setVerified(null)
  try{
   const expectedId=value.kind==='ISSUE'?value.request.requestId:value.grantId
   const result=await api.post<{grantId:string;version:number}>(value.kind==='ISSUE'?base:base+'/'+encodeURIComponent(value.grantId)+'/revoke',value.request)
   if(result.data?.grantId!==expectedId||!Number.isSafeInteger(result.data.version)||result.data.version<1)throw Error('回执与原请求不一致，结果尚未确认。')
   sessionStorage.removeItem(storageKey)
   if(!alive.current)return
   setPending(null);setIssued(value.kind==='ISSUE');if(value.kind==='ISSUE')clearDraft();setNotice('请求已确认，请回读当前状态；签发记录不代表当前仍有效。');refresh()
  }catch(failure){
   if(!alive.current)return
   const info=requestFailure(failure),status=(failure as {status?:number})?.status
   const needsVerification=status===401||/双因素|动态码|验证码|Authenticator|安全密钥|重新验证|重新登录|会话/.test(info.message)
   if(!value.hadUnknown&&([400,409].includes(status??0)||status===403&&!needsVerification)){
    clearPending();if(status===403){setSchool(null);setAdministrator(null)}refresh();setError(info.message+'；本次变更明确未执行。请重新读取当前范围并确认，勿沿用旧覆盖清单。')
   }else{
    const retained={...value,hadUnknown:value.hadUnknown||info.unknown};retain(retained);setPending(retained)
    setError(info.message+'；原请求已锁定，请重试同一请求或读取原委托核对，勿重复新建。')
    if(needsVerification)setVerification(true)
   }
  }
 }
 const issue=()=>void operate(async()=>{
  if(pending){await send(pending);return}
  if(!data?.cover.assignable)throw Error('当前组合不可新增分配，仍可管理原委托。')
  if(!school||!administrator)throw Error('请从检索结果选择学校和对应正式入口管理员。')
  const from=new Date(startsAt),until=new Date(expiresAt)
  if(!Number.isFinite(from.getTime())||!Number.isFinite(until.getTime())||until<=from||until.getTime()<=Date.now())throw Error('请填写有效起止时间，到期须晚于生效时间和当前时间。')
  if(!reason.trim())throw Error('请填写此次分配权限的原因。')
  const digest=scopedDigest(data.cover,scope)
  const combinations=scope==='COMBINATION'?data.cover.combinations.filter(row=>row.id===releaseId):data.cover.combinations
  if(!digest||!combinations.length||scope==='COMBINATION'&&!combinationKeyMatches(data.cover.combinationResourceKey,releaseId))
   throw Error('当前没有完整可确认的组合范围，请刷新核对。')
  const intent:Issue={product,schoolId:school.id,adminId:administrator.id,startsAt:from.toISOString(),expiresAt:until.toISOString(),reason:reason.trim(),requestId:crypto.randomUUID(),coverageDigest:digest,
   ...(scope==='COMBINATION'?{scope}:{})}
  const confirmation=`确认给正式 ${labels[product]} 入口管理员 ${administrator.label} 分配 ${school.label} 的精确来源分发权限？\n${time(intent.startsAt)} 至 ${time(intent.expiresAt)}\n当前实际覆盖全部 ${combinations.length} 份组合：\n${combinations.map(versions).join('\n')}\n${scope==='COMBINATION'?exactScope:futureScope}\n不会授予校内人员资格、个人使用权或商业工具许可。\n原因：${intent.reason}`
  if(!window.confirm(confirmation))return
  await send({kind:'ISSUE',request:intent,school,administrator,cover:{...data.cover,combinations},hadUnknown:false})
 })
 const revoke=(row:GrantRecord)=>void operate(async()=>{
  const explanation=revokeReasons[row.id]?.trim()
  if(!explanation)throw Error('请填写这笔原委托的撤销原因。')
  if(!window.confirm(`确认撤销 ${row.adminName} 在 ${row.schoolName} 的 ${labels[product]} 原委托？将停止此委托支持的新分配，依赖它的新增使用按既有权限规则核验；已有作答和历史记录按原规则保留。\n原因：${explanation}`))return
  await send({kind:'REVOKE',grantId:row.id,request:{expectedVersion:row.version,reason:explanation},schoolName:row.schoolName,adminName:row.adminName,
   expectedResourceKey:data?scopedKey(data.cover,row.scope):undefined,hadUnknown:false})
 })
 const readPending=()=>void operate(async()=>{
  if(!pending)return
  const id=pending.kind==='ISSUE'?pending.request.requestId:pending.grantId
  const response=await adminContentApi.read(id),row=response.data
  if(!row||row.grantId!==id||row.parentGrantId!==null||row.scope.product!==product||row.scope.scopeKind!=='ORGANIZATION'||row.scope.resourceKind!=='material'
   ||row.capabilities.length!==1||row.capabilities[0]!=='material.distribute'||row.scope.resourceKeys.length!==1)throw Error('原委托元数据与当前分配范围不符，不能结束待核对。')
  if(pending.kind==='ISSUE'){
   const original=pending.request
   if(row.issuerId!==actorId||row.subjectId!==original.adminId||row.scope.scopeId!==original.schoolId||row.scope.resourceKeys[0]!==scopedKey(pending.cover,original.scope)
    ||Date.parse(row.validFrom)!==Date.parse(original.startsAt)||Date.parse(row.expiresAt)!==Date.parse(original.expiresAt))throw Error('原委托与签发意图不一致，请保留请求并核对。')
  }else if((pending.expectedResourceKey??data?.cover.measurementReleaseId)!==row.scope.resourceKeys[0])
   throw Error('原委托不属于当前组合或测量版本，请保留请求并核对。')
  setVerified(row);setNotice('已读取原委托，当前状态为'+states[statusOf(row)]+'；这不认定此前请求由谁完成。')
 })
 const finishVerified=()=>{
  if(!pending||!verified)return
  if(pending.kind==='REVOKE'&&(!verified.revokedAt||verified.version<=pending.request.expectedVersion))return
  if(!window.confirm('确认按已读的当前委托状态结束待核对？不会重复签发或撤销，也不认定此前请求由谁完成。'))return
  try{const kind=pending.kind;clearPending();setIssued(kind==='ISSUE');if(kind==='ISSUE')clearDraft();setNotice('原请求已核对，当前委托状态为'+states[statusOf(verified)]+'。');refresh()}catch{setStorageError('无法清理已核对请求，请保留原请求，不要重复签发。')}
 }
 const coverage=pending?.kind==='ISSUE'?pending.cover:data?.cover
 const actualCombinations=coverage?.combinations.filter(row=>scope==='MEASUREMENT'||row.id===releaseId)??[]
 return <>
  <h4 ref={heading} tabIndex={-1}>学校与正式入口管理员</h4>
  <p>选定的是平台正式 {labels[product]} 入口管理员，不是本校业务使用者。本操作仅分配精确来源权限，不创建商业工具许可或校内岗位资格。</p>
  <details className="standard-delegation-stepup" open={verification||undefined}><summary>管理员操作验证</summary><p>签发和撤销沿用已有管理员双因素验证，验证完成后再确认原操作。</p><AdminStepUp onVerified={()=>{setNotice('管理员验证已完成，正在刷新当前组合和入口；请核对后确认或重试原操作。');setVerification(false);setReload(old=>old+1)}}/></details>
  {loading&&<p role="status">正在读取本入口的完整组合范围及原委托…</p>}{loadError&&<p role="alert" className="sys-message sys-error">{loadError} 当前未展示旧列表。<button type="button" disabled={busy} onClick={()=>setReload(old=>old+1)}>重新读取分配范围</button></p>}
  {storageError&&<p role="alert" className="sys-message sys-error">{storageError}</p>}{error&&<p role="alert" className="sys-message sys-error">{error}</p>}{notice&&<p role="status" className="sys-message">{notice}</p>}
  {coverage&&<section className="standard-delegation-cover" aria-label="实际委托范围">
   <label className="system-field">委托范围<select value={scope} disabled={formLocked} onChange={event=>setScope(event.target.value as Scope)}>
    <option value="MEASUREMENT">{scopes.MEASUREMENT}</option><option value="COMBINATION"
      disabled={!coverage.combinationCoverageDigest||!combinationKeyMatches(coverage.combinationResourceKey,releaseId)}>{scopes.COMBINATION}</option>
   </select></label>
   <h4>当前实际覆盖全部 {actualCombinations.length} 份组合</h4><p>{scope==='COMBINATION'?exactScope:futureScope}</p>
   <ul>{actualCombinations.map(row=><li key={row.id}>{versions(row)}</li>)}</ul><details><summary>精确来源标识</summary><code>{scopedKey(coverage,scope)}</code></details>
  </section>}
  {data&&!data.cover.assignable&&<p className="sys-message">当前选中组合不可新增分配。历史委托仍可在下方查询、核对和撤销。</p>}
  {pending&&<section className="sys-message" aria-label="待核对分配请求"><h4>{pending.kind==='ISSUE'?'签发请求待核对':'撤销请求待核对'}</h4><p>{pending.kind==='ISSUE'?pending.school.label+' · '+pending.administrator.label:pending.schoolName+' · '+pending.adminName}。原入口、组合与请求已经锁定。</p><div className="system-actions"><button type="button" disabled={busy} onClick={()=>void operate(()=>send(pending))}>重试同一请求</button><button type="button" disabled={busy} onClick={readPending}>读取原委托当前状态</button>{verified&&(pending.kind==='ISSUE'||verified.revokedAt&&verified.version>pending.request.expectedVersion)&&<button type="button" disabled={busy} onClick={finishVerified}>按已读状态结束待核对</button>}</div><details><summary>原请求标识</summary><code>{pending.kind==='ISSUE'?pending.request.requestId:pending.grantId}</code></details></section>}
  <div className="standard-delegation-grid">
   <section aria-label="搜索学校"><h4>选择学校</h4><form className="sys-search" onSubmit={event=>{event.preventDefault();setSchool(null);setSchoolPage(1);setSchoolQuery(schoolInput.trim());setReload(old=>old+1)}}><label><span className="sr-only">学校名称</span><input type="search" disabled={formLocked} maxLength={120} value={schoolInput} onChange={event=>setSchoolInput(event.target.value)} placeholder="搜索学校名称"/></label><button disabled={formLocked}>搜索学校</button></form><ul>{data?.schools.map(row=><li key={row.id}><div><strong>{row.label}</strong>{row.detail&&<small>{row.detail}</small>}</div><button type="button" disabled={formLocked} aria-pressed={school?.id===row.id} onClick={()=>setSchool(row)}>{school?.id===row.id?'已选':'选择'}学校 {row.label}</button></li>)}</ul>{data&&!data.schools.length&&<p>没有匹配的可用学校。</p>}<nav aria-label="学校候选分页"><button type="button" disabled={formLocked||schoolPage===1} onClick={()=>setSchoolPage(old=>old-1)}>上一页学校</button><span>第 {schoolPage} 页</span><button type="button" disabled={formLocked||!data?.moreSchools} onClick={()=>setSchoolPage(old=>old+1)}>下一页学校</button></nav></section>
   <section aria-label="搜索正式入口管理员"><h4>选择正式 {labels[product]} 入口管理员</h4><form className="sys-search" onSubmit={event=>{event.preventDefault();setAdministrator(null);setAdminPage(1);setAdminQuery(adminInput.trim());setReload(old=>old+1)}}><label><span className="sr-only">管理员姓名或账号</span><input type="search" disabled={formLocked} maxLength={120} value={adminInput} onChange={event=>setAdminInput(event.target.value)} placeholder="搜索姓名或账号"/></label><button disabled={formLocked}>搜索管理员</button></form><ul>{data?.administrators.map(row=><li key={row.id}><div><strong>{row.label}</strong>{row.detail&&<small>{row.detail}</small>}</div><button type="button" disabled={formLocked} aria-pressed={administrator?.id===row.id} onClick={()=>setAdministrator(row)}>{administrator?.id===row.id?'已选':'选择'}管理员 {row.label}</button></li>)}</ul>{data&&!data.administrators.length&&<p>没有匹配的当前正式入口管理员。校内业务账号不在此名单内。</p>}<nav aria-label="管理员候选分页"><button type="button" disabled={formLocked||adminPage===1} onClick={()=>setAdminPage(old=>old-1)}>上一页管理员</button><span>第 {adminPage} 页</span><button type="button" disabled={formLocked||!data?.moreAdministrators} onClick={()=>setAdminPage(old=>old+1)}>下一页管理员</button></nav></section>
  </div>
  {(school||administrator)&&<p className="standard-delegation-choice">当前选择：{school?.label??'尚未选择学校'} · {administrator?.label??'尚未选择正式入口管理员'}</p>}
  <div className="standard-delegation-grid"><label className="system-field">委托生效时间（本地时间）<input type="datetime-local" disabled={formLocked} value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label><label className="system-field">委托到期时间（本地时间）<input type="datetime-local" disabled={formLocked} value={expiresAt} onChange={event=>setExpiresAt(event.target.value)}/></label></div>
  <label className="system-field">分配权限原因<textarea rows={3} maxLength={500} disabled={formLocked} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  <div className="system-actions"><button type="button" disabled={formLocked} onClick={issue}>确认分配权限</button>{issued&&<button type="button" disabled={locked} onClick={()=>{setIssued(false);setSchool(null);setAdministrator(null);setReason('');setExpiresAt('');setVerified(null);setNotice('')}}>编制另一笔委托</button>}</div>
  <section aria-label="此测量版本的原委托" className="standard-delegation-records"><div className="sys-section-heading"><div><h4>原委托记录</h4><p>以下为 {labels[product]} 入口的测量版本委托，以及当前组合的单独委托。到期或撤销后仍保留历史记录。</p></div><button type="button" disabled={busy||loading} onClick={()=>setReload(old=>old+1)}>刷新原委托记录</button></div>
   {data&&!data.records.length&&<p>当前页没有委托记录；这不代表其他页不存在，也不用于判断待核对请求是否失败。</p>}
   {data?.records.map(row=><article key={row.id} className="sys-standard-history"><h5>{row.schoolName} · {row.adminName}</h5><p>{scopes[row.scope??'MEASUREMENT']} · {states[row.status]??row.status} · {time(row.startsAt)} 至 {time(row.expiresAt)} · 修订 {row.version}</p>{row.reason&&<p>原因：{row.reason}</p>}{!row.revokedAt&&<><label className="system-field">撤销原因 · {row.schoolName} / {row.adminName}<input disabled={locked} maxLength={500} value={revokeReasons[row.id]??''} onChange={event=>setRevokeReasons(old=>({...old,[row.id]:event.target.value}))}/></label><button type="button" disabled={locked} onClick={()=>revoke(row)}>撤销此委托</button></>}<details><summary>委托标识</summary><code>{row.id}</code></details></article>)}
   <nav aria-label="原委托分页"><button type="button" disabled={locked||loading||page===1} onClick={()=>setPage(old=>old-1)}>上一页委托</button><span>第 {page} 页</span><button type="button" disabled={locked||loading||!data?.moreRecords} onClick={()=>setPage(old=>old+1)}>下一页委托</button></nav>
  </section>
 </>
}
