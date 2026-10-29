import {useEffect,useRef,useState} from 'react'
import {educationConfigurationBase,educationConfigurationRequest as request,EducationConfigurationHttpError,isEducationPending,sameEducationOperation,
 type EducationManagerProduct,type EducationConfigurationChoice,type EducationManagedUse,type EducationPendingOperation,type EducationManagerOperation} from '../../api/educationStandardConfigurations'

type Props={actorId:string;organizationId:string;product:EducationManagerProduct}
type Recipient={userId:string;username:string;membershipId:string}
type Page<T>={page:number;hasMore:boolean;list:T[]}
type ReportPreview={title:string;report:{reportVersion?:string;audienceContract?:{audience?:string};interpretations?:Array<{headline?:string;summary?:string}>}}
function restored(key:string,props:Props){
 try{
  const text=sessionStorage.getItem(key);if(!text)return {pending:null,error:''}
  const value=JSON.parse(text)
  if(value.actorId!==props.actorId||value.organizationId!==props.organizationId||value.product!==props.product||!isEducationPending(value.pending))
   throw Error('Invalid retained request')
  return {pending:{...value.pending,unknown:true} as EducationPendingOperation,error:''}
 }catch{return {pending:null,error:'无法恢复待核对请求，请先按原请求编号核对；暂不签发新配置。'}}
}
const message=(reason:unknown)=>reason instanceof Error?reason.message:'本次读取未完成'
export default function EducationStandardConfigurations(props:Props){
 return <ConfigurationSession key={JSON.stringify(props)} {...props}/>
}
function ConfigurationSession(props:Props){
 const {actorId,organizationId,product}=props,base=educationConfigurationBase(organizationId,product)
 const storageKey='education-exact-configuration:'+JSON.stringify([actorId,product,organizationId])
 const [initial]=useState(()=>restored(storageKey,props)),[pending,setPending]=useState<EducationPendingOperation|null>(initial.pending)
 const [blocked,setBlocked]=useState(Boolean(initial.error)),[storageError,setStorageError]=useState(initial.error),[checkedAbsent,setCheckedAbsent]=useState(false)
 const [page,setPage]=useState(1),[more,setMore]=useState(false),[rows,setRows]=useState<EducationConfigurationChoice[]>([]),[loading,setLoading]=useState(false)
 const [combinationId,setCombinationId]=useState(initial.pending?.combinationId??''),[recipients,setRecipients]=useState<Recipient[]>([]),[recipientId,setRecipientId]=useState('')
 const [recipientPage,setRecipientPage]=useState(1),[recipientMore,setRecipientMore]=useState(false),[q,setQ]=useState(''),[search,setSearch]=useState('')
 const [authorityId,setAuthorityId]=useState(''),[name,setName]=useState(''),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[password,setPassword]=useState('')
 const [grants,setGrants]=useState<EducationManagedUse[]>([]),[grantPage,setGrantPage]=useState(1),[grantMore,setGrantMore]=useState(false)
 const [busy,setBusy]=useState(false),[detailsLoading,setDetailsLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [preview,setPreview]=useState<ReportPreview|null>(null)
 const inFlight=useRef(false),choice=rows.find(row=>row.id===combinationId),locked=busy||Boolean(pending)||blocked
 useEffect(()=>{
  let alive=true;setLoading(true)
  void request<Page<EducationConfigurationChoice>>(base+'?page='+page).then(value=>{
   if(alive){setRows(old=>page===1?value.list:[...old,...value.list]);setMore(value.hasMore)}
  }).catch(reason=>{if(alive)setError(message(reason))}).finally(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[base,page])
 useEffect(()=>{
  let alive=true;setRecipients([]);setRecipientId('');setPreview(null)
  if(!choice)return
  setDetailsLoading(true)
  const path=base+'/'+choice.id+'/recipients?combinationHash='+choice.combinationHash+'&page='+recipientPage+'&q='+encodeURIComponent(search)
  void (choice.assignable?request<Page<Recipient>>(path):Promise.resolve({page:1,hasMore:false,list:[]})).then(value=>{
   if(alive){setRecipients(value.list);setRecipientMore(value.hasMore)}
  }).catch(reason=>{if(alive)setError(message(reason))}).finally(()=>{if(alive)setDetailsLoading(false)})
  return()=>{alive=false}
 },[base,choice,recipientPage,search])
 useEffect(()=>{
  let alive=true;setGrants([])
  if(!combinationId)return
  void request<Page<EducationManagedUse>>(base+'/'+combinationId+'/use-grants?page='+grantPage).then(value=>{
   if(alive){setGrants(value.list);setGrantMore(value.hasMore)}
  }).catch(reason=>{if(alive)setError(message(reason))})
  return()=>{alive=false}
 },[base,combinationId,grantPage])
 useEffect(()=>{
  if(!pending)return
  const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)
 },[pending])
 function retain(value:EducationPendingOperation){
  setPending(value)
  try{sessionStorage.setItem(storageKey,JSON.stringify({...props,pending:value}));setStorageError('')}
  catch{setStorageError('浏览器无法保留请求；请在离开前完成原编号核对。')}
 }
 function clear(){
  try{sessionStorage.removeItem(storageKey);setPending(null);setCheckedAbsent(false);setStorageError('');setBlocked(false);return true}
  catch{setBlocked(true);setStorageError('结果已确认，但浏览器未清除旧请求；请先处理浏览器存储再签发新配置。');return false}
 }
 async function refreshGrants(id:string){
  try{const value=await request<Page<EducationManagedUse>>(base+'/'+id+'/use-grants?page=1');setGrants(value.list);setGrantMore(value.hasMore);setGrantPage(1)}
  catch(reason){setError('操作结果已确认，授权列表暂未更新：'+message(reason))}
 }
 async function send(value:EducationPendingOperation){
  if(inFlight.current||blocked||!password||value.unknown&&!checkedAbsent)return
  inFlight.current=true;setBusy(true);setError('');setNotice('');setCheckedAbsent(false)
  const secret=password;setPassword('');retain(value)
  try{
   const path=base+'/'+value.combinationId+'/use-grants'+(value.kind==='REVOKE'?'/'+value.grantId+'/revoke':'')
   const ack=await request<{id:string;version:number;revoked:boolean}>(path,'POST',{...value.body,currentPassword:secret})
   if(!ack||ack.id!==(value.kind==='ISSUE'?value.body.requestId:value.grantId)||!Number.isInteger(ack.version)||ack.version<1||typeof ack.revoked!=='boolean'
    ||value.kind==='REVOKE'&&(!ack.revoked||ack.version!==value.body.expectedVersion+1))
    throw Error('操作响应身份不完整，请核对原请求。')
   clear();setNotice(value.kind==='REVOKE'?'原配置授权已撤销。':ack.revoked?'原请求已经保存，该授权目前已撤销。':'固定配置授权已保存。')
   await refreshGrants(value.combinationId)
  }catch(reason){
   const rejected=reason instanceof EducationConfigurationHttpError&&reason.status>=400&&reason.status<500
   if(rejected&&!value.unknown)clear();else retain({...value,unknown:true})
   setError(message(reason)+(rejected&&!value.unknown?'':' 请先核对原请求，不要重新编制编号。'))
  }finally{inFlight.current=false;setBusy(false)}
 }
 function issue(){
  if(inFlight.current||locked||!choice?.assignable)return
  const recipient=recipients.find(row=>row.userId===recipientId),authority=choice.authorities.find(row=>row.id===authorityId)
  if(!recipient||!authority||!name.trim()||name.trim().length>120||!from||!until||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(until))
   ||Date.parse(until)<=Math.max(Date.parse(from),Date.now())||Date.parse(from)<Date.parse(authority.validFrom)||Date.parse(until)>Date.parse(authority.expiresAt)||!password){
   setError('请选择合法接收者和分发委托，填写配置名称、委托期限内的使用期限及本次密码。');return
  }
  void send({kind:'ISSUE',combinationId:choice.id,unknown:false,body:{requestId:crypto.randomUUID(),userId:recipient.userId,combinationHash:choice.combinationHash,
   authorityGrantId:authority.id,expectedAuthorityVersion:authority.version,configurationName:name.trim(),validFrom:new Date(from).toISOString(),expiresAt:new Date(until).toISOString()}})
 }
 async function recover(){
  if(!pending||inFlight.current)return
  inFlight.current=true;setBusy(true);setError('');setNotice('');setCheckedAbsent(false)
  try{
   const found=await request<EducationManagerOperation|null>(base+'/'+pending.combinationId+'/operations/'+pending.body.requestId)
   if(found){
    if(!sameEducationOperation(pending,found))throw Error('已找到的请求与原完整配置、接收者或权限依据不一致，请核对审计。')
    clear();setNotice(found.grant.revokedAt?'原请求已确认，该配置授权目前已撤销。':'原请求与固定配置已确认保存。');await refreshGrants(pending.combinationId)
   }else{setCheckedAbsent(true);setNotice('暂未发现原请求；可使用原编号和原参数重试。')}
  }catch(reason){setError(message(reason))}finally{inFlight.current=false;setBusy(false)}
 }
 async function showPreview(){
  if(!choice?.assignable||inFlight.current)return
  inFlight.current=true;setBusy(true);setError('')
  try{setPreview(await request<ReportPreview>(base+'/'+choice.id+'/preview?combinationHash='+choice.combinationHash))}
  catch(reason){setError(message(reason))}finally{inFlight.current=false;setBusy(false)}
 }
 function select(value:string){
  setCombinationId(value);setAuthorityId('');setRecipientPage(1);setGrantPage(1);setSearch('');setQ('');setError('');setNotice('')
 }
 return <section className="epg-panel epg-fixed-configurations" aria-label="固定量表配置授权"><h2>固定量表配置授权</h2>
  <p>为{product==='HUISCHOOL'?'本校心理教师':'本校 Teacher 产品管理员'}选定已批准配置。接收者直接使用此配置创建任务；修改配置应创建新授权，旧作答与报告保留原版。</p>
  {error&&<p role="alert">{error}</p>}{storageError&&<p role="alert">{storageError}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&<p role="status">正在读取本校可分发配置…</p>}
  {!loading&&!rows.length&&<p>当前没有可分发配置。请先完成原件装载、入口批准及本校精确分发委托。</p>}
  <label>已批准量表配置<select value={combinationId} disabled={locked} onChange={event=>select(event.target.value)}>
   <option value="">选择固定配置</option>{rows.map(row=><option key={row.id} value={row.id}>{row.title} · C {row.versions.CONTENT} / P {row.versions.PARAMETERS} / R {row.versions.REPORT}{row.assignable?'':' · 仅供回读'}</option>)}
  </select></label>{more&&<button disabled={locked||loading} onClick={()=>setPage(old=>old+1)}>读取更多配置</button>}
  {choice&&<><p>{choice.unavailableReason}</p><button disabled={locked||!choice.assignable} onClick={()=>void showPreview()}>查看报告说明</button>
   {preview&&<section aria-label="所选报告说明"><h3>{preview.title}</h3><p>报告版本：{preview.report.reportVersion??'已固定'}</p>
    <p>报告受众：{({student:'学生',teacher:'教师',parent:'家长'} as Record<string,string>)[preview.report.audienceContract?.audience??'']??'依原报告声明'}。请核对施测对象、解释参数和报告受众，管理员决定专业搭配。</p>
    {(preview.report.interpretations??[]).map((item,index)=><article key={index}><strong>{item.headline}</strong><p>{item.summary}</p></article>)}</section>}
   <label>精确分发委托<select value={authorityId} disabled={locked||!choice.assignable} onChange={event=>setAuthorityId(event.target.value)}><option value="">选择本校分发依据</option>
    {choice.authorities.map((authority,index)=><option key={authority.id} value={authority.id}>委托 {index+1} · 有效至 {new Date(authority.expiresAt).toLocaleString()}</option>)}
   </select></label>
   <details><summary>查看版本与分发依据</summary><p>配置摘要：<code>{choice.combinationHash}</code></p>
    {choice.authorities.map(authority=><p key={authority.id}>委托：<code>{authority.id}</code> · 修订 {authority.version}</p>)}</details>
   <form onSubmit={event=>{event.preventDefault();setRecipientPage(1);setSearch(q.trim())}}><label>搜索本校接收者<input disabled={locked||!choice.assignable} value={q} onChange={event=>setQ(event.target.value)}/></label><button disabled={locked||!choice.assignable}>查找</button></form>
   {detailsLoading&&<p role="status">正在读取当前接收者资格…</p>}
   {!detailsLoading&&choice.assignable&&!recipients.length&&<p>当前学校没有符合本入口资格的接收者。</p>}
   <label>配置接收者<select disabled={locked||detailsLoading||!choice.assignable} value={recipientId} onChange={event=>setRecipientId(event.target.value)}><option value="">选择接收者</option>{recipients.map(row=><option key={row.userId} value={row.userId}>{row.username}</option>)}</select></label>
   <div className="epg-actions">{recipientPage>1&&<button disabled={locked||detailsLoading} onClick={()=>setRecipientPage(old=>old-1)}>上一页接收者</button>}{recipientMore&&<button disabled={locked||detailsLoading} onClick={()=>setRecipientPage(old=>old+1)}>下一页接收者</button>}</div>
   <label>授权配置名称<input value={name} maxLength={120} disabled={locked||!choice.assignable} onChange={event=>setName(event.target.value)}/></label>
   <label>使用权生效时间<input type="datetime-local" value={from} disabled={locked||!choice.assignable} onChange={event=>setFrom(event.target.value)}/></label>
   <label>使用权截止时间<input type="datetime-local" value={until} disabled={locked||!choice.assignable} onChange={event=>setUntil(event.target.value)}/></label>
   <button disabled={locked||detailsLoading||!choice.assignable} onClick={issue}>保存固定配置并授权</button>
   <h3>本人已发行的本校配置</h3>{grants.map(grant=><article key={grant.id} className="epg-grant"><strong>{grant.username} · {grant.configurationName??'原固定配置'}</strong><span> · {grant.revokedAt?'已撤销':Date.parse(grant.expiresAt)<=Date.now()?'已过期':'已保存'} · 截止 {new Date(grant.expiresAt).toLocaleString()}</span>
    {!grant.revokedAt&&<button disabled={locked} onClick={()=>{if(!password){setError('请填写本次管理员密码');return}const reason=window.prompt('撤销此配置授权的原因');if(!reason?.trim())return;if(reason.trim().length>500){setError('撤销原因最多500字');return}void send({kind:'REVOKE',combinationId:choice.id,grantId:grant.id,unknown:false,body:{requestId:crypto.randomUUID(),expectedVersion:grant.version,reason:reason.trim()}})}}>撤销 {grant.username} 的此配置</button>}
   </article>)}<div className="epg-actions">{grantPage>1&&<button disabled={locked} onClick={()=>setGrantPage(old=>old-1)}>上一页授权</button>}{grantMore&&<button disabled={locked} onClick={()=>setGrantPage(old=>old+1)}>下一页授权</button>}</div>
  </>}
  <label>本次配置操作的管理员密码<input type="password" autoComplete="off" value={password} onChange={event=>setPassword(event.target.value)} disabled={busy||blocked}/></label>
  {pending&&<section aria-label="原配置请求核对"><p>请求编号：<code>{pending.body.requestId}</code>。核对期间保留原配置、接收者和分发依据。</p>
   <button disabled={busy} onClick={()=>void recover()}>核对原配置请求</button>{checkedAbsent&&<button disabled={busy||!password||blocked} onClick={()=>void send(pending)}>按原请求重试</button>}
  </section>}
 </section>
}
