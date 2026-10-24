import { ChevronDown, UserRound, ShieldCheck, RefreshCw, UsersRound, Mail, MailPlus } from 'lucide-react'
import { productOrigins, surveyInvitationUrl } from '../../products/origins'
import { useEffect, useId, useRef, useState } from 'react'
import { SurveyCatalogGrants } from './SurveyCatalogGrants'
import { ProductPage } from '../../components/product-ui'
import AdminStepUp from '../../admin/AdminStepUp'
import './survey-admin.css'
type Envelope<T>={code:number|string;message:string;data:T}
type Researcher={id:string;username:string;status:string;createdAt:string}
type Invitation={id:string;kind:'INVITE';createdBy:string;createdAt:string;expiresAt:string;
  status:'PENDING'|'EXPIRED'}
class PlatformRequestError extends Error {
  constructor(message:string,readonly outcome:'REJECTED'|'NOT_SENT'|'UNCONFIRMED',readonly code?:number|string){super(message)}
}
const cookie=(key:string)=>document.cookie.split('; ').find(v=>v.startsWith(key+'='))?.split('=').slice(1).join('=')||''
async function platformApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    try{
    let csrf=cookie('ptool_csrf')
    if(!csrf){
      const response=await fetch('/api/auth/csrf',{credentials:'same-origin'})
      if(!response.ok)throw new Error('管理员安全令牌不可用')
      const env=await response.json() as Envelope<{csrfToken:string}>
      csrf=env.data?.csrfToken
    }
    if(!csrf)throw new Error('管理员安全令牌不可用')
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
    }catch(e){throw new PlatformRequestError(e instanceof Error?e.message:'管理员安全令牌不可用','NOT_SENT')}
  }
  let response:Response,envelope:Envelope<T>
  try{
    response=await fetch('/api/platform/survey'+path,{method,headers,credentials:'same-origin',
      ...(body===undefined?{}:{body:JSON.stringify(body)})})
    envelope=await response.json() as Envelope<T>
  }catch{throw new PlatformRequestError('未收到可解析的服务器回执','UNCONFIRMED')}
  if(!envelope||!['number','string'].includes(typeof envelope.code))
    throw new PlatformRequestError('服务器回执格式无法确认','UNCONFIRMED')
  if(!response.ok||envelope.code!==0){
    const rejected=envelope.code!==0&&(response.ok||(response.status>=400&&response.status<500))
    throw new PlatformRequestError(envelope.message||'服务器未确认操作',rejected?'REJECTED':'UNCONFIRMED',envelope.code)
  }
  if(!envelope.data||typeof envelope.data!=='object')
    throw new PlatformRequestError('成功回执缺少可确认的结果','UNCONFIRMED')
  return envelope.data
}
export default function SurveyResearchersAdmin(){
  const [list,setList]=useState<Researcher[]>([]),[pending,setPending]=useState<Invitation[]>([])
  const [researcherPage,setResearcherPage]=useState(1),[invitationPage,setInvitationPage]=useState(1)
  const [password,setPassword]=useState('')
  // The login session's proof timestamp is not exposed to this page. Unknown
  // timing stays server-checked; only a successful reauthentication starts this
  // conservative local countdown (request start, allowing for second precision).
  const [verifiedUntil,setVerifiedUntil]=useState<number|null>(null),[now,setNow]=useState(Date.now)
  const [verificationPrompt,setVerificationPrompt]=useState(''),[tooltipDismissed,setTooltipDismissed]=useState(false)
  const verification=useRef<HTMLDetailsElement>(null),passwordInput=useRef<HTMLInputElement>(null),helpId=useId()
  const remaining=verifiedUntil===null?null:Math.max(0,Math.floor((verifiedUntil-now)/1000))
  useEffect(()=>{
    if(verifiedUntil===null||verifiedUntil<=Date.now())return
    const timer=window.setInterval(()=>{setNow(Date.now());if(Date.now()>=verifiedUntil)window.clearInterval(timer)},1000)
    return ()=>window.clearInterval(timer)
  },[verifiedUntil])
  const requestVerification=(context:string,reason:'password'|'expired',rejected=false)=>{
    setVerificationPrompt(context+'需要操作验证，'+(rejected?'服务器已拒绝本次变更。':'尚未提交。')+(reason==='password'?'请填写当前管理员密码；双因素验证须在最近五分钟内完成。':'双因素验证已到期，请用 Authenticator 动态码或已绑定的硬件安全密钥重新验证。')+'验证有效期为五分钟，不随操作延长；完成后请再次点击原操作。')
    if(verification.current){
      verification.current.open=true
      const target=reason==='password'?passwordInput.current:verification.current.querySelector<HTMLInputElement>('input[inputmode="numeric"]')||verification.current.querySelector<HTMLSelectElement>('select')
      target?.focus()
    }
  }
  const ensureVerification=(context:string)=>{
    if(!password){requestVerification(context,'password');return false}
    if(verifiedUntil!==null&&Date.now()>=verifiedUntil){setNow(Date.now());requestVerification(context,'expired');return false}
    return true
  }
  const explainVerificationRejection=(e:unknown,context:string)=>{
    if(!(e instanceof PlatformRequestError)||e.outcome!=='REJECTED')return
    if(e.code==='ADMIN_KEY_STEP_UP_REQUIRED'){setVerifiedUntil(0);setNow(Date.now());requestVerification(context,'expired',true)}
    else if(e.message==='需要系统管理员当前密码重新验证'||e.message==='当前管理员密码校验失败')requestVerification(context,'password',true)
  }
  async function catalogApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
    try{return await platformApi<T>(path,method,body)}catch(e){if(method!=='GET')explainVerificationRejection(e,'工具授权变更');throw e}
  }
  const [link,setLink]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true),[section,setSection]=useState<'researchers'|'invitations'|'tools'>('researchers')
  const [linkContext,setLinkContext]=useState('')
  const [unconfirmed,setUnconfirmed]=useState<string|null>(null)
  const sections=[['researchers','研究者','资格、认证与恢复'],['invitations','邀请','签发与未领取状态'],['tools','工具授权','对象与精确版本']] as const
  const statusLabel=(status:string)=>(({ACTIVE:'已激活',PENDING_MFA:'待绑定双因素认证',SUSPENDED:'已暂停',REVOKED:'已永久撤销',UNAVAILABLE:'资格不可用'} as Record<string,string>)[status]||'状态待核对')
  const refresh=async(researcher=researcherPage,invitation=invitationPage)=>{
    setLoading(true)
    try{
    const [researchers,invitations]=await Promise.all([
      platformApi<{list:Researcher[]}>('/researchers?page='+researcher),
      platformApi<{list:Invitation[]}>('/researcher-invitations?page='+invitation),
    ])
    setList(researchers.list);setPending(invitations.list)
    setResearcherPage(researcher);setInvitationPage(invitation)
    }finally{setLoading(false)}
  }
  useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'研究者列表暂不可用'))},[])
  const act=async(path:string,context:string)=>{
    if(!productOrigins()){setError('当前地址不支持生成 Survey 链接');return}
    if(!ensureVerification(context))return
    setBusy(true);setError('');setNotice('');setLink('');setUnconfirmed(null)
    let acknowledged=false
    const invitation=path==='/researcher-invitations'||path.endsWith('/password-reset-invitations')
    try{
      const result=await platformApi<{id?:string;token?:string;kind?:string}>(path,'POST',{currentPassword:password})
      if(invitation&&(!result.token||result.kind!==(path==='/researcher-invitations'?'INVITE':'PASSWORD_RESET')))
        throw new PlatformRequestError('邀请回执缺少一次性链接或类型','UNCONFIRMED')
      acknowledged=true
      if(result.token){
        const endpoint=result.kind==='PASSWORD_RESET'?'reset-password':'claim'
        const url=surveyInvitationUrl(endpoint,result.token)
        if(!url)throw new Error('当前地址不支持生成 Survey 链接')
        setLink(url)
        setLinkContext(context)
        setNotice(context+'已签发。一次性链接仅在本次操作显示，请通过受控渠道交付。')
      }else setNotice(context+'已完成。')
      await refresh(1,1)
    }catch(e){
      if(acknowledged)setError('操作已完成，但列表刷新失败；请仅重试刷新列表。'+(e instanceof Error?e.message:''))
      else if(e instanceof PlatformRequestError&&e.outcome==='REJECTED'){setError('操作已被拒绝：'+e.message);explainVerificationRejection(e,context)}
      else if(e instanceof PlatformRequestError&&e.outcome==='NOT_SENT')setError('操作未提交：'+e.message)
      else{
        setUnconfirmed(context)
        setError(context+'：操作结果未确认，不能判断服务器是否已执行。请先核对当前列表与状态，不要直接重复提交。'
          +(invitation?'一次性邀请链接不会再次回显，刷新列表不能重新取得已丢失的链接；请勿直接再次签发。':''))
      }
    }finally{setBusy(false)}
  }
  const refreshForReview=async()=>{
    if(!unconfirmed)setError('')
    try{await refresh();if(unconfirmed)setNotice(unconfirmed+'：列表已更新，请核对当前状态；本次核对未重发操作，原操作结果仍需人工确认。')}
    catch(e){setError((unconfirmed?'核对列表失败，原操作结果仍未确认：':'列表刷新失败：')+(e instanceof Error?e.message:''))}
  }
  const cancelled=(context:string)=>{setError('');setNotice('已取消'+context+'，未提交变更。')}
  const copyLink=async()=>{try{await navigator.clipboard.writeText(link);setError('');setNotice(linkContext+'链接已复制到剪贴板。')}
    catch{setError('未能写入剪贴板，请手动选择复制此链接。')}}
  return <ProductPage width="management"><div className="survey-admin">
    <header className="survey-admin-header">
      <div><p className="survey-admin-kicker">RESEARCH · 管理工作台</p><h1>研究者与授权</h1><p>让每一份研究，拥有清晰的使用边界。</p></div>
      <button className="btn-secondary survey-admin-refresh" type="button" aria-label={unconfirmed?'核对当前列表与状态':'刷新管理列表'} disabled={busy||loading} onClick={()=>void refreshForReview()}><RefreshCw size={16} aria-hidden="true"/>{unconfirmed?'核对状态':'刷新列表'}</button>
    </header>
    <div className="survey-admin-workbench">
      <aside className="survey-admin-sidebar" aria-label="管理辅助">
        <section className="survey-admin-sidecard survey-admin-security-card">
          <div className="survey-admin-sidecard-title"><ShieldCheck size={18} aria-hidden="true"/><h2>安全操作</h2></div>
          <p>浏览无需验证。变更账号或授权前，请先确认管理员身份。</p>
        <div className="survey-admin-security-anchor" onMouseEnter={()=>setTooltipDismissed(false)} onFocus={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setTooltipDismissed(false)}}>
    <details className="survey-admin-security" ref={verification} onToggle={()=>setTooltipDismissed(true)} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();setTooltipDismissed(true);if(verification.current){verification.current.open=false;verification.current.querySelector('summary')?.focus()}}
    }}>
      <summary aria-describedby={helpId}><strong>操作验证</strong><span>{!password?'待填密码':remaining===null?'密码已填':remaining>0?`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} 内有效`:'验证已到期'}</span></summary>
      <div className="survey-admin-security-content">
        <div className="survey-admin-verification-explanation">
          {verificationPrompt&&<p role="note" aria-live="polite">{verificationPrompt}</p>}
          <p>保护账号与授权，避免他人借用已登录的页面变更权限。仅浏览和刷新列表无需验证。</p>
          <p>填写当前密码，再用 Authenticator 六位动态码或已绑定的硬件安全密钥验证身份。双因素验证五分钟内有效；每次变更仍会校验密码。</p>
          <p>{remaining===null?'登录时的双因素验证若仍在五分钟内，可直接提交，由服务器确认时效。':remaining>0?'本页倒计时用于提示，实际有效期以服务器校验为准。':'双因素验证已到期，请重新验证；验证完成不会自动提交操作。'} 密码仅保留在本页，刷新后需重新填写。</p>
        </div>
        <div className="survey-admin-verification"><label>当前管理员密码（敏感操作再次验证）
          <input ref={passwordInput} className="input" type="password" autoComplete="off" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/>
        </label></div>
        <div className="survey-admin-stepup"><AdminStepUp onVerified={requestedAt=>{
          setVerifiedUntil(requestedAt+299000);setNow(Date.now());setVerificationPrompt('')
          const current=Date.now()<requestedAt+299000
          setNotice(current?'双因素验证已完成，有效期五分钟，每次操作仍需当前密码。请再次点击原操作提交。':'本次验证已超出五分钟，请重新验证；未提交变更。')
          if(current&&password&&verification.current)verification.current.open=false
        }}/></div>
      </div>
    </details>
    <div id={helpId} role="tooltip" className="survey-admin-security-help" hidden={tooltipDismissed}>
      <strong>为什么验证？</strong><p>保护研究者账号与工具授权，避免他人借用已登录页面操作。</p>
      <strong>如何验证？</strong><p>点击展开，填写当前密码，并用 Authenticator 动态码或已绑定的硬件安全密钥验证。</p>
      <strong>哪些操作需要？</strong><p>签发或撤销邀请、修改资格、重置验证器、签发密码恢复邀请，以及工具授权或撤销。浏览与刷新无需验证。</p>
      <p>双因素验证五分钟内有效，不随操作延长；每次变更仍会校验密码。</p>
    </div>
        </div>
        </section>
        <section className="survey-admin-sidecard survey-admin-overview" aria-label="本页概览">
          <h2>本页概览</h2>
          <dl><div><dt><UsersRound size={16} aria-hidden="true"/>研究者</dt><dd>{loading?'—':list.length}<span> 位</span></dd></div>
          <div><dt><Mail size={16} aria-hidden="true"/>待领取邀请</dt><dd>{loading?'—':pending.filter(inv=>inv.status==='PENDING').length}<span> 份</span></dd></div></dl>
          <p>仅统计当前已加载的分页。</p>
        </section>

      </aside>
      <div className="survey-admin-content">

    <nav role="tablist" aria-label="Survey 管理分区" className="survey-admin-tabs">
      {sections.map(([key,title,description],index)=><button type="button" role="tab" key={key}
        id={'survey-admin-tab-'+key} aria-controls={'survey-admin-panel-'+key} aria-selected={section===key}
        tabIndex={section===key?0:-1} onClick={()=>setSection(key)} onKeyDown={event=>{
          const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null
          if(next===null)return;event.preventDefault();setSection(sections[next][0]);document.getElementById('survey-admin-tab-'+sections[next][0])?.focus()
        }}><strong>{title}</strong><span>{description}</span></button>)}
    </nav>
    {error&&<p role="alert" className="border-l-4 border-red-600 p-3">{error}</p>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 p-3">{notice}</p>}
    {loading&&<p role="status">正在加载研究者与邀请列表…</p>}
    {link&&<div className="survey-admin-card"><p><strong>{linkContext}</strong> · 新签发的一次性链接：</p>
      <code className="block break-all my-3">{link}</code>
      <button className="btn-secondary" type="button" onClick={()=>void copyLink()}>复制链接</button>
      <p className="text-sm text-gray-500">邀请 7 天有效；不包含研究者密码。请勿存入公开日志或群聊。</p>
    </div>}
    <section role="tabpanel" id="survey-admin-panel-tools" aria-labelledby="survey-admin-tab-tools" hidden={section!=='tools'}>
      <SurveyCatalogGrants api={catalogApi} password={password} researchers={list} ensureVerification={ensureVerification}/>
    </section>
    <section role="tabpanel" id="survey-admin-panel-invitations" aria-labelledby="survey-admin-tab-invitations" hidden={section!=='invitations'} className="survey-admin-panel survey-admin-invitations">
    <div className="survey-admin-section-heading"><div className="survey-admin-panel-heading"><span className="survey-admin-avatar"><MailPlus size={22} aria-hidden="true"/></span><div><h2>研究者邀请</h2><p>签发开户邀请，或查看尚未领取的邀请元数据。</p></div></div>
      <button className="btn-primary" disabled={busy||loading} onClick={()=>void act('/researcher-invitations','研究者开户邀请')}><MailPlus size={16} aria-hidden="true"/>生成研究者邀请</button></div>
    <p className="survey-admin-inline-note"><ShieldCheck size={15} aria-hidden="true"/><span>链接仅在签发时显示一次；这里查看领取状态和有效期。</span></p>
    <div className="survey-admin-invitation-list">{pending.map(inv=><article className="survey-admin-card survey-admin-invitation-card" key={inv.id}>
      <details className="survey-admin-invitation-disclosure"><summary aria-label={'查看邀请：'+inv.id}>
        <span className="survey-admin-avatar"><Mail size={21} aria-hidden="true"/></span>
        <span className="survey-admin-card-name"><h3>研究者开户邀请</h3><span>签发于 {new Date(inv.createdAt).toLocaleDateString('zh-CN')}</span></span>
        <span className="survey-admin-badge" data-status={inv.status}>{inv.status==='PENDING'?'待领取':'已过期'}</span>
        <ChevronDown className="survey-admin-disclosure-chevron" size={18} aria-hidden="true"/>
      </summary><div className="survey-admin-invitation-body">
      <p className="text-sm">状态：{inv.status==='PENDING'?'待领取':'已过期'} ·
        签发于 {new Date(inv.createdAt).toLocaleString('zh-CN')} ·
        截止 {new Date(inv.expiresAt).toLocaleString('zh-CN')}</p>
      <details><summary>查看邀请编号与签发者</summary><p className="break-all">邀请编号：{inv.id}<br/>签发者编号：{inv.createdBy}</p></details>
      <div className="survey-admin-invitation-actions">
      {inv.status==='PENDING'&&<button className="btn-secondary" type="button"
        disabled={busy} onClick={()=>{
          if(!ensureVerification('撤销研究者邀请'))return
          if(window.confirm('确认撤销此尚未领取的研究者邀请？原链接将立即失效。邀请编号：'+inv.id))
            void act('/researcher-invitations/'+inv.id+'/revoke','撤销邀请 '+inv.id)
          else cancelled('撤销邀请 '+inv.id)
        }} aria-label={'撤销未领取邀请：'+inv.id}>撤销未领取邀请</button>}
      {inv.status==='EXPIRED'&&<p className="survey-admin-muted">邀请已过期，无需撤销。</p>}
      </div></div></details>
    </article>)}</div>
    {!loading&&!error&&!pending.length&&<div className="survey-admin-empty-state"><span className="survey-admin-empty-icon"><MailPlus size={28} aria-hidden="true"/></span><p>{invitationPage===1?'目前没有未领取的研究者邀请。':'本页没有未领取的研究者邀请，可返回上一页。'}</p><span>邀请领取后，账号将在“研究者”中管理。</span></div>}
    <div className="survey-admin-pagination">
      <button type="button" className="btn-secondary" disabled={busy||invitationPage<=1}
        onClick={()=>void refresh(researcherPage,invitationPage-1).catch(e=>setError(String(e)))}>邀请上一页</button>
      <span>邀请第 {invitationPage} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||pending.length<25}
        onClick={()=>void refresh(researcherPage,invitationPage+1).catch(e=>setError(String(e)))}>邀请下一页</button>
    </div>
    </section>
    <section role="tabpanel" id="survey-admin-panel-researchers" aria-labelledby="survey-admin-tab-researchers" hidden={section!=='researchers'} className="survey-admin-panel">
    <div className="survey-admin-section-heading"><h2>研究者</h2><span className="survey-admin-muted">当前页 {list.length} 位</span></div>
    <div className="survey-admin-people">{list.map(person=><article className="survey-admin-card survey-admin-person" key={person.id} aria-label={'研究者：'+person.username}>
      <details className="survey-admin-person-disclosure">
        <summary aria-label={'管理研究者：'+person.username}>
          <span className="survey-admin-avatar"><UserRound size={22} aria-hidden="true"/></span>
          <span className="survey-admin-person-name"><h3>{person.username}</h3><span>{person.createdAt?'加入于 '+new Date(person.createdAt).toLocaleDateString('zh-CN'):'研究者账号'}</span></span>
          <span className="survey-admin-badge" data-status={person.status}>{statusLabel(person.status)}</span>
          <ChevronDown className="survey-admin-disclosure-chevron" size={18} aria-hidden="true"/>
        </summary>
        <div className="survey-admin-person-body">
      <details><summary>查看账户编号与状态代码</summary><p className="break-all">账户编号：{person.id} · 状态代码：{person.status}</p></details>
      <div className="survey-admin-person-actions">
        {['ACTIVE','PENDING_MFA'].includes(person.status)&&<button className="btn-secondary" disabled={busy||loading} aria-label={'暂停资格：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/suspend','暂停资格：'+person.username)}>暂停资格</button>}
        {person.status==='SUSPENDED'&&<button className="btn-secondary" disabled={busy||loading} aria-label={'恢复资格：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/restore','恢复资格：'+person.username)}>恢复资格</button>}
        <button className="btn-secondary" disabled={busy||loading||!['ACTIVE','PENDING_MFA'].includes(person.status)} aria-label={'重置 TOTP：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/mfa-reset','重置 TOTP：'+person.username)}>重置验证器</button>
        {person.status!=='REVOKED'&&<button className="btn-secondary" disabled={busy||loading||!['ACTIVE','PENDING_MFA','SUSPENDED'].includes(person.status)}
          aria-label={'永久撤销资格：'+person.username} onClick={()=>{if(!ensureVerification('永久撤销研究者资格'))return;if(window.confirm('永久撤销 '+person.username+' 的研究者资格？此操作不可恢复，历史研究数据不会删除。'))void act('/researchers/'+person.id+'/revoke','永久撤销资格：'+person.username);else cancelled('永久撤销资格：'+person.username)}}>
          永久撤销资格</button>}
        <button className="btn-secondary" disabled={busy||loading||!['ACTIVE','PENDING_MFA'].includes(person.status)} aria-label={'密码重置邀请：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/password-reset-invitations','密码重置邀请：'+person.username)}>密码重置邀请</button>
      </div>
      {!['ACTIVE','PENDING_MFA'].includes(person.status)&&<p className="text-sm">当前资格状态不能重置双因素认证或签发密码恢复邀请。资格恢复以后台现有规则为准。</p>}
        </div>
      </details>
    </article>)}</div>
    {!loading&&!error&&!list.length&&<p className="survey-admin-empty">{researcherPage===1?'暂无可见研究者。':'本页没有研究者，可返回上一页。'}</p>}
    <div className="survey-admin-pagination">
      <button type="button" className="btn-secondary" disabled={busy||researcherPage<=1}
        onClick={()=>void refresh(researcherPage-1,invitationPage).catch(e=>setError(String(e)))}>研究者上一页</button>
      <span>研究者第 {researcherPage} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||list.length<25}
        onClick={()=>void refresh(researcherPage+1,invitationPage).catch(e=>setError(String(e)))}>研究者下一页</button>
    </div>
    </section>
        <details className="survey-admin-scope"><summary>管理范围说明</summary><p>此处管理研究者资格与工具的精确版本授权，不授予研究原始答案访问权。公库收录、版本审核和使用分配在“工具公库与审批”中按现有权限提供。</p></details>
    </div>
    </div>
  </div></ProductPage>
}
