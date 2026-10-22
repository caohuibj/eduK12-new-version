import {useEffect,useRef,useState} from 'react'
import {adminContentApi, type AdminContentGrant as Grant, type AdminContentRootRequest as Request, type AdminContentGrantMetadata as Metadata, type ContentCapability} from '../api/adminContent'
import {contentUuid as uuid, isContentRequest, isContentMetadata, localInputTime, requestFailure, sameContentGrant} from './contentRequestRecovery'
import AdminStaticSjtPublication from './AdminStaticSjtPublication'
const reportCapabilities=['report.edit','report.publish'] as const
const referenceCapabilities=['reference.analyze','reference.review','reference.publish'] as const
type TrainingPurpose='report'|'reference'|'data'|'reference-governance'|'static-sjt'|'library-review'|'library-distribute'
const formalCapabilities=['reference.review','reference.publish'] as const
function restoredPurpose(grant?:Grant):TrainingPurpose {
  if(grant?.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='scale-library-governance')return grant.scope.resourceKind==='catalog'?'library-review':'library-distribute'
  if(grant?.scope.scopeKind==='PLATFORM')return grant.scope.scopeId==='situational-registry'?'static-sjt':'reference-governance'
  return grant?.scope.resourceKind==='reference'?'reference':grant?.scope.resourceKind==='data'?'data':'report'
}
const scopeLabel=(kind:Grant['scope']['scopeKind'])=>kind==='PLATFORM'?'平台固定范围':kind==='COURSE'?'课程':'项目'
function restore(actorId:string){
  try{
    const raw=sessionStorage.getItem('admin-content-pending:'+actorId)
    if(!raw)return {request:null,error:'',hadUnknown:false}
    const stored=JSON.parse(raw)
    if(stored.actorId!==actorId||!isContentRequest(stored.request))
      return {request:null,error:'保存的请求无法恢复，请先按原授权编号核对；不要重复签发。'}
    return {request:stored.request as Request,error:'',hadUnknown:stored.hadUnknownOutcome!==false}
  }catch{return {request:null,error:'无法读取当前管理员的待核对请求，请先核对此前授权记录。'}}
}
type Revocation={grantId:string;request:{expectedVersion:number;reason:string};hadUnknown:boolean}
function restoreRevocation(actorId:string):{pending:Revocation|null;error:string}{
  try{
    const raw=sessionStorage.getItem('admin-content-revoke:'+actorId)
    if(!raw)return {pending:null,error:''}
    const saved=JSON.parse(raw),pending=saved.pending
    if(saved.actorId!==actorId||!pending||!uuid.test(pending.grantId)||!Number.isInteger(pending.request?.expectedVersion)||pending.request.expectedVersion<1||typeof pending.request.reason!=='string'||!pending.request.reason.trim()||typeof pending.hadUnknown!=='boolean')throw new Error('Invalid revocation')
    return {pending,error:''}
  }catch{return {pending:null,error:'无法恢复当前管理员的撤销请求，请按原授权编号读取核对；不要重新编制撤销。'}}
}
export default function AdminContentPermissions({actorId}:{actorId:string}){
  return <ContentPermissions key={actorId} actorId={actorId}/>
}
function ContentPermissions({actorId}:{actorId:string}){
  const [restored]=useState(()=>restore(actorId))
  const [restoredRevocation]=useState(()=>restoreRevocation(actorId))
  const [revocation,setRevocation]=useState<Revocation|null>(restoredRevocation.pending)
  const recoveryBlocked=Boolean(restored.error||restoredRevocation.error)
  const [storageError,setStorageError]=useState(restored.error||restoredRevocation.error)
  const [hadUnknown,setHadUnknown]=useState(restored.hadUnknown??true)
  const initial=restored.request?.grant
  const [subject,setSubject]=useState(initial?.subjectId??''),[project,setProject]=useState(initial?.scope.scopeKind==='PLATFORM'?'':initial?.scope.scopeId??''),[resources,setResources]=useState(initial?.scope.resourceKeys.join('\n')??'')
  const [product,setProduct]=useState<'SURVEY'|'TRAINING'>(initial?.scope.product??'SURVEY')
  const [purpose,setPurpose]=useState<TrainingPurpose>(restoredPurpose(initial))
  const [kind,setKind]=useState<'reference'|'data'>(initial?.scope.resourceKind==='data'?'data':'reference'),[caps,setCaps]=useState<ContentCapability[]>(initial?.capabilities??[]),[delegate,setDelegate]=useState(Boolean(initial?.remainingDelegationDepth))
  const [from,setFrom]=useState(localInputTime(initial?.validFrom)),[until,setUntil]=useState(localInputTime(initial?.expiresAt)),[reason,setReason]=useState(restored.request?.reason??'')
  const [pending,setPending]=useState<Request|null>(restored.request),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[issued,setIssued]=useState(false)
  const [lookup,setLookup]=useState(restoredRevocation.pending?.grantId??restored.request?.requestId??''),[row,setRow]=useState<Metadata|null>(null),[revokeReason,setRevokeReason]=useState(restoredRevocation.pending?.request.reason??'')
  const [sjtGrant,setSjtGrant]=useState<{mappingId:string;grantId:string}|null>(null)
  const inFlight=useRef(false)
  const library=purpose==='library-review'||purpose==='library-distribute'
  const platform=library||product==='TRAINING'&&(purpose==='reference-governance'||purpose==='static-sjt')
  const resourceKind:Grant['scope']['resourceKind']=purpose==='library-review'?'catalog':purpose==='library-distribute'?'material':product==='SURVEY'?kind:purpose==='static-sjt'?'measurement':purpose==='reference-governance'?'reference':purpose
  const fixedScope=library?'scale-library-governance':purpose==='static-sjt'?'situational-registry':'reference-governance'
  const availableCapabilities=product==='TRAINING'&&purpose==='report'?reportCapabilities:product==='TRAINING'&&purpose==='reference-governance'?formalCapabilities:referenceCapabilities
  useEffect(()=>{
    if(!pending&&!revocation)return
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return ()=>window.removeEventListener('beforeunload',protect)
  },[pending,revocation])
  function retain(request:Request,unknown=hadUnknown){
    try{sessionStorage.setItem('admin-content-pending:'+actorId,JSON.stringify({actorId,request,hadUnknownOutcome:unknown}));setStorageError('')}
    catch{setStorageError('浏览器无法保存待核对请求。请勿离开或刷新此页；当前请求仍可重试，离开前必须保存请求编号并核对。')}
  }
  async function issue(){
    if(inFlight.current||issued||recoveryBlocked||revocation)return
    setError('');setNotice('')
    let request=pending
    if(!request){
      const keys=resources.split(/[\s,]+/).filter(Boolean),selected:ContentCapability[]=resourceKind==='catalog'?['catalog.manage']:resourceKind==='material'?['material.distribute']:resourceKind==='data'?['data.reinterpret']:resourceKind==='measurement'?['measurement.publish']:caps
      if(!uuid.test(subject.trim())||(!platform&&!uuid.test(project.trim()))||!keys.length||keys.length>128||keys.some(key=>!uuid.test(key))||new Set(keys).size!==keys.length||!selected.length||!reason.trim()||!from||!until||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from)||Date.parse(until)<=Date.now()){
        setError('请填写有效 UUID、至少一项能力、有效期限和原因；资源最多 128 项且不得重复。');return
      }
      request={requestId:crypto.randomUUID(),expectedVersion:0,reason:reason.trim(),grant:{subjectId:subject.trim(),scope:{product,scopeKind:platform?'PLATFORM':product==='TRAINING'?'COURSE':'PROJECT',scopeId:platform?fixedScope:project.trim(),resourceKind,resourceKeys:keys},capabilities:selected,delegableCapabilities:delegate?selected:[],remainingDelegationDepth:delegate?1:0,validFrom:new Date(from).toISOString(),expiresAt:new Date(until).toISOString()}}
    }
    if(!window.confirm(`确认向 ${request.grant.subjectId} 签发 ${request.grant.capabilities.join('、')}？${scopeLabel(request.grant.scope.scopeKind)} ${request.grant.scope.scopeId}，精确资源 ${request.grant.scope.resourceKeys.length} 项，到期 ${request.grant.expiresAt}。${request.grant.remainingDelegationDepth?'允许一层受限委派。':'不允许委派。'}`))return
    inFlight.current=true;retain(request,true);setPending(request);setLookup(request.requestId);setRow(null);setBusy(true)
    try{
      const result=await adminContentApi.issue(request)
      if(!result.data||result.data.grantId!==request.requestId||!Number.isInteger(result.data.version)||result.data.version<1)throw new Error('授权响应与原请求不一致，结果尚未确认')
      setLookup(result.data.grantId);setRow(null);setNotice(`已确认授权 ${result.data.grantId}，版本 ${result.data.version}。可读取核对后撤销。`);setPending(null);setIssued(true)
      recordSjtGrant(request.grant,result.data.grantId)
      try{sessionStorage.removeItem('admin-content-pending:'+actorId);setStorageError('')}catch{setStorageError('签发已成功，但浏览器未能清理已完成请求；恢复后请按原编号核对，勿重复编制。')}
    }catch(e){
      const failure=requestFailure(e),message=failure.message
      // A later denial cannot prove that an earlier response-lost attempt did not commit.
      if(!hadUnknown&&failure.definiteRejection){
        try{sessionStorage.removeItem('admin-content-pending:'+actorId);setPending(null);setError(message+'；本次请求明确未执行，可修改后重新签发。')}
        catch{setError(message+'；无法清理保存请求，请保留编号核对。')}
      }else {
        const unknown=hadUnknown||failure.unknown
        setHadUnknown(unknown);retain(request!,unknown)
        setError(message+'；请求编号及内容已保留，可重新验证安全密钥后重试，或读取同编号元数据核对并结束请求。')
      }
    }finally{inFlight.current=false;setBusy(false)}
  }
  function recordSjtGrant(grant:Grant,grantId:string){
    if(grant.subjectId===actorId&&grant.scope.product==='TRAINING'&&grant.scope.scopeKind==='PLATFORM'&&grant.scope.scopeId==='situational-registry'&&grant.scope.resourceKind==='measurement'&&grant.scope.resourceKeys.length===1&&grant.capabilities.length===1&&grant.capabilities[0]==='measurement.publish')
      setSjtGrant({mappingId:grant.scope.resourceKeys[0],grantId})
  }
  function prepareSjtGrant(mappingId:string){
    if(busy||pending||issued||recoveryBlocked||revocation)return
    setProduct('TRAINING');setPurpose('static-sjt');setSubject(actorId);setProject('');setResources(mappingId);setCaps([]);setDelegate(false);setFrom('');setUntil('');setReason('');setError('');setNotice('已填入精确 SJT 映射。请补充期限和原因，明确确认签发；准备来源本身不授予能力。')
  }
  async function read(){setRow(null);setError('');if(!uuid.test(lookup.trim())){setError('请填写有效授权 UUID');return}setBusy(true)
    try{const result=await adminContentApi.read(lookup.trim());if(!isContentMetadata(result.data)||result.data.grantId!==lookup.trim())throw new Error('授权元数据不完整或与查询不符');setRow(result.data)}catch(e){setError(requestFailure(e).message)}finally{setBusy(false)}}
  function finishVerified(){
    if(!pending||!row||row.grantId!==pending.requestId||row.issuerId!==actorId||row.parentGrantId!==null||!sameContentGrant(row,pending.grant))return
    if(!window.confirm(`已读取实际授权 ${row.grantId}，版本 ${row.version}，${row.revokedAt?'已撤销':'未撤销'}。确认归档此请求并结束重试？`))return
    try{
      sessionStorage.setItem('admin-content-last-verified:'+actorId,JSON.stringify({requestId:pending.requestId,grantId:row.grantId,version:row.version,revokedAt:row.revokedAt}))
      sessionStorage.removeItem('admin-content-pending:'+actorId);setPending(null);setIssued(true);setStorageError('');setError('');setNotice('已按真实授权元数据结束请求。需要新授权时请显式编制另一份。');if(!row.revokedAt)recordSjtGrant(row,row.grantId)
    }catch{setStorageError('无法归档当前请求，仍保留原编号，请勿重复签发。')}
  }
  function retainRevocation(next:Revocation){
    setRevocation(next)
    try{sessionStorage.setItem('admin-content-revoke:'+actorId,JSON.stringify({actorId,pending:next}));setStorageError('')}
    catch{setStorageError('浏览器无法保存待核对撤销。请勿离开或刷新；保留原授权 UUID、版本和原因。')}
  }
  async function revoke(){
    if(inFlight.current||recoveryBlocked||!revocation&&(!row||!revokeReason.trim()))return
    const request=revocation??{grantId:row!.grantId,request:{expectedVersion:row!.version,reason:revokeReason.trim()},hadUnknown:false}
    if(!window.confirm(`确认撤销授权 ${request.grantId}（版本 ${request.request.expectedVersion}）？其后代授权将同时失效。原因：${request.request.reason}`))return
    inFlight.current=true;setBusy(true);setError('');setLookup(request.grantId);retainRevocation({...request,hadUnknown:true})
    try{
      const result=await adminContentApi.revoke(request.grantId,request.request)
      if(!result.data||result.data.grantId!==request.grantId||result.data.version!==request.request.expectedVersion+1)throw new Error('撤销响应与原请求不一致')
      sessionStorage.removeItem('admin-content-revoke:'+actorId);setRevocation(null);setRow(null);setNotice('撤销已确认，请重新读取当前状态。');setStorageError('')
    }catch(e){
      const failure=requestFailure(e)
      if(!request.hadUnknown&&failure.definiteRejection){
        try{sessionStorage.removeItem('admin-content-revoke:'+actorId);setRevocation(null);setError(failure.message+'；本次撤销明确未执行，请重新读取当前授权。');setRow(null)}
        catch{retainRevocation(request);setError('无法清理撤销记录，请保留原请求核对。')}
      }else{retainRevocation({...request,hadUnknown:request.hadUnknown||failure.unknown});setError(failure.message+'；撤销尚未确认，原授权 UUID、版本和原因已锁定。可重新验证安全密钥后重试同一撤销，或读取已撤销状态核对。')}
    }finally{inFlight.current=false;setBusy(false)}
  }
  function finishRevoked(){
    if(!revocation||!row||row.grantId!==revocation.grantId||!row.revokedAt||row.version<=revocation.request.expectedVersion)return
    if(!window.confirm(`已读取授权 ${row.grantId}，当前已撤销（版本 ${row.version}）。确认按当前状态结束待核对撤销？这不认定此前请求由谁完成。`))return
    try{sessionStorage.removeItem('admin-content-revoke:'+actorId);setRevocation(null);setStorageError('');setError('');setNotice('已核对当前授权处于撤销状态，结束待核对撤销。')}
    catch{setStorageError('无法清理待核对撤销，请保留原请求。')}
  }
  return <section aria-labelledby="content-permissions-title" style={{overflowWrap:'anywhere'}}><h2 id="content-permissions-title">精确内容授权</h2>
    <p>Survey 支持项目参考与指定 FINAL 重新解释；Training 支持课程报告、参考、指定已完成作答重新解释，以及独立平台参考治理与已安装 SJT 发布。后台复核当前身份、资格、真实所有权和资源归属；管理身份不自动授予科学能力或其他入口身份。</p>
    <p>签发、读取和撤销前，请使用上方安全密钥重新验证。资源栏只接受实际 UUID，不提供样本或报告浏览。</p>
    <AdminStaticSjtPublication actorId={actorId} onPrepareGrant={prepareSjtGrant} grantReceipt={sjtGrant} grantLocked={busy||Boolean(pending)||Boolean(revocation)||issued||recoveryBlocked}/>
    <fieldset disabled={busy||Boolean(pending)||Boolean(revocation)||issued||recoveryBlocked}><legend>新根授权</legend>
      <label>产品授权范围<select value={product} onChange={e=>{setProduct(e.target.value as 'SURVEY'|'TRAINING');setProject('');setResources('');setCaps([]);setDelegate(false);setPurpose('report')}}><option value="SURVEY">Survey 项目与共用库分发</option><option value="TRAINING">Training 课程与平台内容</option></select></label>
      {product==='TRAINING'&&<label>Training 授权用途<select value={purpose} onChange={e=>{setPurpose(e.target.value as TrainingPurpose);setProject('');setResources('');setCaps([]);setDelegate(false)}}><option value="report">课程报告编辑/发布</option><option value="reference">课程参考分析/复核/发布</option><option value="data">课程指定作答重新解释</option><option value="reference-governance">平台正式参考独立复核/发布</option><option value="static-sjt">已安装 SJT 测量发布</option><option value="library-review">共用量表系统级审核委托</option><option value="library-distribute">共用量表入口分发委托</option></select></label>}
      {product==='SURVEY'&&<label>Survey 授权用途<select value={library?'library-distribute':'report'} onChange={e=>{setPurpose(e.target.value as TrainingPurpose);setProject('');setResources('');setCaps([]);setDelegate(false)}}><option value="report">项目内容授权</option><option value="library-distribute">共用量表入口分发委托</option></select></label>}
      <label>{library?(purpose==='library-review'?'目标审核账号 UUID':'目标入口管理员 UUID'):product==='TRAINING'?(purpose==='static-sjt'?'目标系统管理员 UUID':'目标教师 UUID'):'目标研究者 UUID'}<input className="input" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
      {platform?<p>固定平台范围：{fixedScope}（不可改为课程、项目或其他平台范围）。</p>:<label>{product==='TRAINING'?'课程 UUID':'项目 UUID'}<input className="input" value={project} onChange={e=>setProject(e.target.value)}/></label>}
      {library?<p>固定共用库范围：仅所列精确 measurement release UUID。审核委托不授予入口分发；分发委托不授予审核、改编或其他入口权限。{purpose==='library-review'?'系统级审核委托不要求额外领取 Training 入口管理员身份。':'分发仍需目标账号具备对应入口管理资格。'}</p>:product==='SURVEY'?<label>资源类型<select value={kind} onChange={e=>{setKind(e.target.value as 'reference'|'data');setCaps([]);setResources('')}}><option value="reference">参考操作（测量 release UUID）</option><option value="data">重新解释（FINAL UUID）</option></select></label>:<p>{purpose==='static-sjt'?'固定资源：上方准备返回的精确 mapping UUID；仅 measurement.publish，不创建来源许可。':purpose==='reference-governance'?'固定资源：精确 measurement release UUID；仅 reference.review / reference.publish，不含 analyze。目标须为当前已批准教师，原因须记录资格与用途，计算者不得自审。':purpose==='data'?'固定资源：当前课程内已完成 compositeAttempt UUID；仅 data.reinterpret，不授予原始数据浏览或导出。':'固定资源：当前课程内真实 composite UUID；服务器核验教师所有权及课程关联，不接受量表、FINAL 或其他课程资源。'}</p>}
      <label>精确资源 UUID（逗号或换行分隔）<textarea value={resources} onChange={e=>setResources(e.target.value)}/></label>
      {resourceKind==='reference'||resourceKind==='report'?availableCapabilities.map(cap=><label key={cap}><input type="checkbox" checked={caps.includes(cap)} onChange={e=>setCaps(e.target.checked?[...caps,cap]:caps.filter(c=>c!==cap))}/>{cap}</label>):<p>固定能力：{resourceKind==='catalog'?'catalog.manage':resourceKind==='material'?'material.distribute':resourceKind==='measurement'?'measurement.publish':'data.reinterpret'}</p>}
      <label><input type="checkbox" checked={delegate} onChange={e=>setDelegate(e.target.checked)}/>允许上述能力一层受限委派</label>
      <label>生效时间（本地时间）<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>到期时间（本地时间）<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
      <label>内容授权原因<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
    </fieldset>
    {pending&&<p>待核对请求编号：{pending.requestId}。内容已锁定；请先重试或读取该编号核对，不要重复签发。{storageError?'当前保存状态异常，请勿离页。':'请求按当前管理员保存在本标签页，重进后可继续核对。'}</p>}
    <button className="btn-primary" disabled={busy||issued||Boolean(revocation)||recoveryBlocked} onClick={()=>void issue()}>{pending?'重试同一签发请求':'确认签发内容授权'}</button>
    {issued&&<button className="btn-secondary" disabled={busy} onClick={()=>{setIssued(false);setHadUnknown(false);setSubject('');setProject('');setResources('');setCaps([]);setDelegate(false);setFrom('');setUntil('');setReason('')}}>编制另一份授权</button>}
    <h3>读取与撤销</h3><label>授权 UUID<input value={lookup} disabled={busy||Boolean(revocation)} onChange={e=>{setLookup(e.target.value);setRow(null)}}/></label><button className="btn-secondary" disabled={busy} onClick={()=>void read()}>读取授权元数据</button>
    {row&&<div><p>授权 {row.grantId} · 版本 {row.version} · {row.revokedAt?'已撤销':'未撤销（实际使用仍检查期限与祖先）'}</p><p>目标 {row.subjectId} · {scopeLabel(row.scope.scopeKind)} {row.scope.scopeId} · {row.scope.resourceKind}</p><p>能力：{row.capabilities.join('、')}；可委派：{row.delegableCapabilities.join('、')||'无'}</p><p>期限：{row.validFrom} 至 {row.expiresAt}</p><p>父授权：{row.parentGrantId||'根授权'}；资源：{row.scope.resourceKeys.join('、')}</p>
      {pending&&row.grantId===pending.requestId&&row.issuerId===actorId&&row.parentGrantId===null&&sameContentGrant(row,pending.grant)&&<button className="btn-secondary" disabled={busy} onClick={finishVerified}>按已读记录结束待核对请求</button>}
      <label>撤销原因<input disabled={Boolean(revocation)} value={revokeReason} maxLength={500} onChange={e=>setRevokeReason(e.target.value)}/></label><button className="btn-secondary" disabled={busy||Boolean(row.revokedAt)||Boolean(revocation)||recoveryBlocked||!revokeReason.trim()} onClick={()=>void revoke()}>确认撤销已读授权</button></div>}
    {revocation&&<div><p>待核对撤销：{revocation.grantId}；原版本 {revocation.request.expectedVersion}；原因 {revocation.request.reason}。请按同一请求重试或核对实际撤销状态。</p><button className="btn-secondary" disabled={busy||recoveryBlocked} onClick={()=>void revoke()}>重试同一撤销请求</button>{row?.grantId===revocation.grantId&&row.revokedAt&&row.version>revocation.request.expectedVersion&&<button className="btn-secondary" disabled={busy} onClick={finishRevoked}>按已读撤销状态结束请求</button>}</div>}
    {storageError&&<p role="alert">{storageError}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
}
