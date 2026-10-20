import {useEffect,useState} from 'react'
import api,{type ApiClientError} from '../api/client'
const reportCapabilities=['report.edit','report.publish'] as const
const referenceCapabilities=['reference.analyze','reference.review','reference.publish'] as const
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Grant={subjectId:string;scope:{product:'SURVEY'|'TRAINING';scopeKind:'PROJECT'|'COURSE';scopeId:string;resourceKind:'reference'|'data'|'report';resourceKeys:string[]};capabilities:string[];delegableCapabilities:string[];remainingDelegationDepth:number;validFrom:string;expiresAt:string}
type Request={requestId:string;expectedVersion:0;reason:string;grant:Grant}
type Metadata=Grant&{grantId:string;version:number;parentGrantId:string|null;issuerId:string;revokedAt:string|null}
function restore(actorId:string){
  try{
    const raw=sessionStorage.getItem('admin-content-pending:'+actorId)
    if(!raw)return {request:null,error:'',hadUnknown:false}
    const stored=JSON.parse(raw)
    if(stored.actorId!==actorId||!uuid.test(stored.request?.requestId)||stored.request?.expectedVersion!==0||
      !Array.isArray(stored.request?.grant?.capabilities)||!Array.isArray(stored.request?.grant?.scope?.resourceKeys)||
      typeof stored.request?.grant?.subjectId!=='string'||typeof stored.request?.reason!=='string')
      return {request:null,error:'保存的请求无法恢复，请先按原授权编号核对；不要重复签发。'}
    return {request:stored.request as Request,error:'',hadUnknown:stored.hadUnknownOutcome!==false}
  }catch{return {request:null,error:'无法读取当前管理员的待核对请求，请先核对此前授权记录。'}}
}
export default function AdminContentPermissions({actorId}:{actorId:string}){
  const [restored]=useState(()=>restore(actorId))
  const [storageError,setStorageError]=useState(restored.error)
  const [hadUnknown,setHadUnknown]=useState(restored.hadUnknown??true)
  const [subject,setSubject]=useState(''),[project,setProject]=useState(''),[resources,setResources]=useState('')
  const [product,setProduct]=useState<'SURVEY'|'TRAINING'>('SURVEY')
  const [kind,setKind]=useState<'reference'|'data'>('reference'),[caps,setCaps]=useState<string[]>([]),[delegate,setDelegate]=useState(false)
  const [from,setFrom]=useState(''),[until,setUntil]=useState(''),[reason,setReason]=useState('')
  const [pending,setPending]=useState<Request|null>(restored.request),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[issued,setIssued]=useState(false)
  const [lookup,setLookup]=useState(restored.request?.requestId??''),[row,setRow]=useState<Metadata|null>(null),[revokeReason,setRevokeReason]=useState('')
  useEffect(()=>{
    if(!pending)return
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return ()=>window.removeEventListener('beforeunload',protect)
  },[pending])
  function retain(request:Request,unknown=hadUnknown){
    try{sessionStorage.setItem('admin-content-pending:'+actorId,JSON.stringify({actorId,request,hadUnknownOutcome:unknown}));setStorageError('')}
    catch{setStorageError('浏览器无法保存待核对请求。请勿离开或刷新此页；当前请求仍可重试，离开前必须保存请求编号并核对。')}
  }
  async function issue(){
    setError('');setNotice('')
    let request=pending
    if(!request){
      const keys=resources.split(/[\s,]+/).filter(Boolean),selected=product==='SURVEY'&&kind==='data'?['data.reinterpret']:caps
      if(!uuid.test(subject.trim())||!uuid.test(project.trim())||!keys.length||keys.length>128||keys.some(key=>!uuid.test(key))||new Set(keys).size!==keys.length||!selected.length||!reason.trim()||!from||!until||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from)||Date.parse(until)<=Date.now()){
        setError('请填写有效 UUID、至少一项能力、有效期限和原因；资源最多 128 项且不得重复。');return
      }
      request={requestId:crypto.randomUUID(),expectedVersion:0,reason:reason.trim(),grant:{subjectId:subject.trim(),scope:{product,scopeKind:product==='TRAINING'?'COURSE':'PROJECT',scopeId:project.trim(),resourceKind:product==='TRAINING'?'report':kind,resourceKeys:keys},capabilities:selected,delegableCapabilities:delegate?selected:[],remainingDelegationDepth:delegate?1:0,validFrom:new Date(from).toISOString(),expiresAt:new Date(until).toISOString()}}
    }
    if(!window.confirm(`确认向 ${request.grant.subjectId} 签发 ${request.grant.capabilities.join('、')}？${request.grant.scope.scopeKind==='COURSE'?'课程':'项目'} ${request.grant.scope.scopeId}，精确资源 ${request.grant.scope.resourceKeys.length} 项，到期 ${request.grant.expiresAt}。${request.grant.remainingDelegationDepth?'允许一层受限委派。':'不允许委派。'}`))return
    retain(request,true);setPending(request);setLookup(request.requestId);setRow(null);setBusy(true)
    try{const result=await api.post<{grantId:string;version:number}>('/admin/permissions/content-grants',request);setLookup(result.data!.grantId);setRow(null);setNotice(`已确认授权 ${result.data!.grantId}，版本 ${result.data!.version}。可读取核对后撤销。`);setPending(null);setIssued(true);try{sessionStorage.removeItem('admin-content-pending:'+actorId);setStorageError('')}catch{setStorageError('签发已成功，但浏览器未能清理已完成请求；恢复后请按原编号核对，勿重复编制。')}}
    catch(e){
      const failure=e as ApiClientError,message=typeof failure?.message==='string'?failure.message:'请求未完成'
      // Track unknown outcomes separately from a pending step-up request.
      // A denial after an unknown attempt cannot prove no prior commit.
      if(!hadUnknown&&(failure.status===400||failure.status===403)&&!/安全密钥|重新登录|会话/.test(message)){
        try{sessionStorage.removeItem('admin-content-pending:'+actorId);setPending(null);setError(message+'；本次请求明确未执行，可修改后重新签发。')}
        catch{setError(message+'；无法清理保存请求，请保留编号核对。')}
      }else {
        const unknown=hadUnknown||![400,401,403,409,429].includes(failure.status??0)
        setHadUnknown(unknown);retain(request!,unknown)
        setError(message+'；请求编号及内容已保留，可重新验证安全密钥后重试，或读取同编号元数据核对并结束请求。')
      }
    }
    finally{setBusy(false)}
  }
  async function read(){setRow(null);setError('');if(!uuid.test(lookup.trim())){setError('请填写有效授权 UUID');return}setBusy(true)
    try{const result=await api.get<Metadata>('/admin/permissions/content-grants/'+lookup.trim());setRow(result.data!)}catch(e){setError(e instanceof Error?e.message:'读取未完成')}finally{setBusy(false)}}
  function finishVerified(){
    if(!pending||!row||row.grantId!==pending.requestId)return
    if(!window.confirm(`已读取实际授权 ${row.grantId}，版本 ${row.version}，${row.revokedAt?'已撤销':'未撤销'}。确认归档此请求并结束重试？`))return
    try{
      sessionStorage.setItem('admin-content-last-verified:'+actorId,JSON.stringify({requestId:pending.requestId,grantId:row.grantId,version:row.version,revokedAt:row.revokedAt}))
      sessionStorage.removeItem('admin-content-pending:'+actorId);setPending(null);setIssued(true);setStorageError('');setError('');setNotice('已按真实授权元数据结束请求。需要新授权时请显式编制另一份。')
    }catch{setStorageError('无法归档当前请求，仍保留原编号，请勿重复签发。')}
  }
  async function revoke(){if(!row||!revokeReason.trim())return
    if(!window.confirm(`确认撤销授权 ${row.grantId}（版本 ${row.version}）？其后代授权将同时失效。`))return
    setBusy(true);setError('');try{await api.post('/admin/permissions/content-grants/'+row.grantId+'/revoke',{expectedVersion:row.version,reason:revokeReason.trim()});setRow(null);setNotice('撤销已确认，请重新读取当前状态。')}
    catch(e){setError(e instanceof Error?e.message:'撤销未确认，请重新读取核对版本')}
    finally{setBusy(false)}}
  return <section aria-labelledby="content-permissions-title"><h2 id="content-permissions-title">精确内容授权</h2>
    <p>Survey 支持项目参考操作与指定 FINAL 重新解释；Training 仅支持课程内指定综合测评的报告编辑/发布。后台复核当前研究者或已批准教师身份、真实所有权和资源归属，不自动授予科学能力或其他入口身份。</p>
    <p>签发、读取和撤销前，请使用上方安全密钥重新验证。资源栏只接受实际 UUID，不提供样本或报告浏览。</p>
    <fieldset disabled={busy||Boolean(pending)||issued}><legend>新根授权</legend>
      <label>产品授权范围<select value={product} onChange={e=>{setProduct(e.target.value as 'SURVEY'|'TRAINING');setProject('');setResources('');setCaps([]);setDelegate(false)}}><option value="SURVEY">Survey 项目</option><option value="TRAINING">Training 课程报告</option></select></label>
      <label>{product==='TRAINING'?'目标教师 UUID':'目标研究者 UUID'}<input className="input" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
      <label>{product==='TRAINING'?'课程 UUID':'项目 UUID'}<input className="input" value={project} onChange={e=>setProject(e.target.value)}/></label>
      {product==='SURVEY'?<label>资源类型<select value={kind} onChange={e=>{setKind(e.target.value as 'reference'|'data');setCaps([]);setResources('')}}><option value="reference">参考操作（测量 release UUID）</option><option value="data">重新解释（FINAL UUID）</option></select></label>:<p>固定资源：当前课程内真实 composite UUID；服务器核验教师所有权及课程关联，不接受量表、FINAL 或其他课程资源。</p>}
      <label>精确资源 UUID（逗号或换行分隔）<textarea value={resources} onChange={e=>setResources(e.target.value)}/></label>
      {product==='TRAINING'||kind==='reference'?(product==='TRAINING'?reportCapabilities:referenceCapabilities).map(cap=><label key={cap}><input type="checkbox" checked={caps.includes(cap)} onChange={e=>setCaps(e.target.checked?[...caps,cap]:caps.filter(c=>c!==cap))}/>{cap}</label>):<p>固定能力：data.reinterpret</p>}
      <label><input type="checkbox" checked={delegate} onChange={e=>setDelegate(e.target.checked)}/>允许上述能力一层受限委派</label>
      <label>生效时间（本地时间）<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>到期时间（本地时间）<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
      <label>内容授权原因<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
    </fieldset>
    {pending&&<p>待核对请求编号：{pending.requestId}。内容已锁定；请先重试或读取该编号核对，不要重复签发。{storageError?'当前保存状态异常，请勿离页。':'请求按当前管理员保存在本标签页，重进后可继续核对。'}</p>}
    <button className="btn-primary" disabled={busy||issued||Boolean(restored.error)} onClick={()=>void issue()}>{pending?'重试同一签发请求':'确认签发内容授权'}</button>
    {issued&&<button className="btn-secondary" disabled={busy} onClick={()=>{setIssued(false);setHadUnknown(false);setSubject('');setProject('');setResources('');setCaps([]);setDelegate(false);setFrom('');setUntil('');setReason('')}}>编制另一份授权</button>}
    <h3>读取与撤销</h3><label>授权 UUID<input value={lookup} disabled={busy} onChange={e=>{setLookup(e.target.value);setRow(null)}}/></label><button className="btn-secondary" disabled={busy} onClick={()=>void read()}>读取授权元数据</button>
    {row&&<div><p>授权 {row.grantId} · 版本 {row.version} · {row.revokedAt?'已撤销':'未撤销（实际使用仍检查期限与祖先）'}</p><p>目标 {row.subjectId} · {row.scope.scopeKind==='COURSE'?'课程':'项目'} {row.scope.scopeId} · {row.scope.resourceKind}</p><p>能力：{row.capabilities.join('、')}；可委派：{row.delegableCapabilities.join('、')||'无'}</p><p>期限：{row.validFrom} 至 {row.expiresAt}</p><p>父授权：{row.parentGrantId||'根授权'}；资源：{row.scope.resourceKeys.join('、')}</p>
      {pending&&row.grantId===pending.requestId&&<button className="btn-secondary" disabled={busy} onClick={finishVerified}>按已读记录结束待核对请求</button>}
      <label>撤销原因<input value={revokeReason} maxLength={500} onChange={e=>setRevokeReason(e.target.value)}/></label><button className="btn-secondary" disabled={busy||Boolean(row.revokedAt)||!revokeReason.trim()} onClick={()=>void revoke()}>确认撤销已读授权</button></div>}
    {storageError&&<p role="alert">{storageError}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
}
