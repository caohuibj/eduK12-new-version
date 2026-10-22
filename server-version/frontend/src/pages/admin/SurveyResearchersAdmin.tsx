import { productOrigins, surveyInvitationUrl } from '../../products/origins'
import { useEffect, useState } from 'react'
import { SurveyCatalogGrants } from './SurveyCatalogGrants'
import { ProductPage } from '../../components/product-ui'
import AdminStepUp from '../../admin/AdminStepUp'
import './survey-admin.css'
import { SurveyBrand } from '../../survey/SurveyBrand'
type Envelope<T>={code:number|string;message:string;data:T}
type Researcher={id:string;username:string;status:string;createdAt:string}
type Invitation={id:string;kind:'INVITE';createdBy:string;createdAt:string;expiresAt:string;
  status:'PENDING'|'EXPIRED'}
class PlatformRequestError extends Error {
  constructor(message:string,readonly outcome:'REJECTED'|'NOT_SENT'|'UNCONFIRMED'){super(message)}
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
    throw new PlatformRequestError(envelope.message||'服务器未确认操作',rejected?'REJECTED':'UNCONFIRMED')
  }
  if(!envelope.data||typeof envelope.data!=='object')
    throw new PlatformRequestError('成功回执缺少可确认的结果','UNCONFIRMED')
  return envelope.data
}
export default function SurveyResearchersAdmin(){
  const [list,setList]=useState<Researcher[]>([]),[pending,setPending]=useState<Invitation[]>([])
  const [researcherPage,setResearcherPage]=useState(1),[invitationPage,setInvitationPage]=useState(1)
  const [password,setPassword]=useState('')
  const [link,setLink]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true),[section,setSection]=useState<'researchers'|'invitations'|'tools'>('researchers')
  const [linkContext,setLinkContext]=useState('')
  const [unconfirmed,setUnconfirmed]=useState<string|null>(null)
  const origins=productOrigins()
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
    if(!password){setError('请输入当前系统管理员密码');return}
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
      else if(e instanceof PlatformRequestError&&e.outcome==='REJECTED')setError('操作已被拒绝：'+e.message)
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
    <header className="survey-admin-header"><div>{origins&&<SurveyBrand href={origins.survey+'/'}/>}<p className="survey-admin-kicker">HUISURVEY · 系统管理</p>
      <h1>研究者与工具授权</h1><p>管理研究者资格、一次性邀请与工具的精确授权版本，不自动授予科研原始答案访问权。</p></div>
      {origins&&<a className="survey-admin-return" href={origins.survey+'/'}>返回 Survey 入口</a>}
    </header>
    <section className="survey-admin-stepup" aria-labelledby="survey-admin-stepup-heading">
      <h2 id="survey-admin-stepup-heading">敏感操作身份验证</h2>
      <p>查看列表无需再次验证；提交邀请、资格或授权变更时，后台仍核对最近五分钟的双因素证明。</p>
      <AdminStepUp/>
    </section>
    <nav role="tablist" aria-label="Survey 管理分区" className="survey-admin-tabs">
      {sections.map(([key,title,description],index)=><button type="button" role="tab" key={key}
        id={'survey-admin-tab-'+key} aria-controls={'survey-admin-panel-'+key} aria-selected={section===key}
        tabIndex={section===key?0:-1} onClick={()=>setSection(key)} onKeyDown={event=>{
          const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null
          if(next===null)return;event.preventDefault();setSection(sections[next][0]);document.getElementById('survey-admin-tab-'+sections[next][0])?.focus()
        }}><strong>{title}</strong><span>{description}</span></button>)}
    </nav>
    <aside className="survey-admin-library" aria-label="公库与审批入口">
      <div><h2>公库与审批</h2><p>本页管理研究者与原版工具授权；公库收录、版本审核和使用分配在既有工作台按当前权限提供。</p></div>
      <a className="survey-admin-return" href="/admin/scale-library-governance?workspace=survey">查看公库与可用审批</a>
    </aside>
    {error&&<p role="alert" className="border-l-4 border-red-600 p-3">{error}</p>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 p-3">{notice}</p>}
    <div className="survey-admin-verification"><label>当前管理员密码（敏感操作再次验证）
      <input className="input" type="password" autoComplete="off" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/>
    </label><p>浏览列表无需再次输入密码；提交资格、邀请或授权变更时，后台仍会核对当前管理员身份与密码。分区切换会保留本页输入，离开页面不保存。</p>
      <button className="btn-secondary" type="button" disabled={busy||loading} onClick={()=>void refreshForReview()}>{unconfirmed?'核对当前列表与状态':'刷新管理列表'}</button>
    </div>
    {loading&&<p role="status">正在加载研究者与邀请列表…</p>}
    {link&&<div className="survey-admin-card"><p><strong>{linkContext}</strong> · 新签发的一次性链接：</p>
      <code className="block break-all my-3">{link}</code>
      <button className="btn-secondary" type="button" onClick={()=>void copyLink()}>复制链接</button>
      <p className="text-sm text-gray-500">邀请 7 天有效；不包含研究者密码。请勿存入公开日志或群聊。</p>
    </div>}
    <section role="tabpanel" id="survey-admin-panel-tools" aria-labelledby="survey-admin-tab-tools" hidden={section!=='tools'}>
      <SurveyCatalogGrants api={platformApi} password={password} researchers={list}/>
    </section>
    <section role="tabpanel" id="survey-admin-panel-invitations" aria-labelledby="survey-admin-tab-invitations" hidden={section!=='invitations'} className="survey-admin-panel">
    <div className="survey-admin-section-heading"><div><h2>研究者邀请</h2><p>签发开户邀请，或查看尚未领取的邀请元数据。</p></div>
      <button className="btn-primary" disabled={busy||loading||!password} onClick={()=>void act('/researcher-invitations','研究者开户邀请')}>生成研究者邀请</button></div>
    <h2 className="text-xl font-semibold">未领取的研究者邀请</h2>
    <p className="text-sm text-gray-600">仅显示安全元数据。已签发令牌不会再次回显；过期邀请须重新签发。</p>
    <div className="space-y-2">{pending.map(inv=><article className="survey-admin-card" key={inv.id}>
      <h3>研究者开户邀请</h3>
      <p className="text-sm">状态：{inv.status==='PENDING'?'待领取':'已过期'} ·
        签发于 {new Date(inv.createdAt).toLocaleString('zh-CN')} ·
        截止 {new Date(inv.expiresAt).toLocaleString('zh-CN')}</p>
      <details><summary>查看邀请编号与签发者</summary><p className="break-all">邀请编号：{inv.id}<br/>签发者编号：{inv.createdBy}</p></details>
      {inv.status==='PENDING'&&<button className="btn-secondary" type="button"
        disabled={busy||!password} onClick={()=>{
          if(window.confirm('确认撤销此尚未领取的研究者邀请？原链接将立即失效。邀请编号：'+inv.id))
            void act('/researcher-invitations/'+inv.id+'/revoke','撤销邀请 '+inv.id)
          else cancelled('撤销邀请 '+inv.id)
        }} aria-label={'撤销未领取邀请：'+inv.id}>撤销未领取邀请</button>}
    </article>)}</div>
    {!loading&&!error&&!pending.length&&<p className="survey-admin-empty">{invitationPage===1?'目前没有未领取的研究者邀请。':'本页没有未领取的研究者邀请，可返回上一页。'}</p>}
    <div className="flex items-center gap-3 text-sm">
      <button type="button" className="btn-secondary" disabled={busy||invitationPage<=1}
        onClick={()=>void refresh(researcherPage,invitationPage-1).catch(e=>setError(String(e)))}>邀请上一页</button>
      <span>邀请第 {invitationPage} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||pending.length<25}
        onClick={()=>void refresh(researcherPage,invitationPage+1).catch(e=>setError(String(e)))}>邀请下一页</button>
    </div>
    </section>
    <section role="tabpanel" id="survey-admin-panel-researchers" aria-labelledby="survey-admin-tab-researchers" hidden={section!=='researchers'} className="survey-admin-panel">
    <h2>研究者资格</h2><p>先确认研究者对象与当前状态，再选择资格或认证恢复操作。</p>
    <div className="grid gap-3">{list.map(person=><article className="survey-admin-card" key={person.id} aria-label={'研究者：'+person.username}>
      <h3>{person.username}</h3><p className="survey-admin-badge">{statusLabel(person.status)}</p>
      <details><summary>查看账户编号与状态代码</summary><p className="break-all">账户编号：{person.id} · 状态代码：{person.status}</p></details>
      <div className="flex flex-wrap gap-2 my-3">
        {['ACTIVE','PENDING_MFA'].includes(person.status)&&<button className="btn-secondary" disabled={busy||loading||!password} aria-label={'暂停资格：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/suspend','暂停资格：'+person.username)}>暂停资格</button>}
        {person.status==='SUSPENDED'&&<button className="btn-secondary" disabled={busy||loading||!password} aria-label={'恢复资格：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/restore','恢复资格：'+person.username)}>恢复资格</button>}
        <button className="btn-secondary" disabled={busy||loading||!password||!['ACTIVE','PENDING_MFA'].includes(person.status)} aria-label={'重置 TOTP：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/mfa-reset','重置 TOTP：'+person.username)}>重置 TOTP</button>
        {person.status!=='REVOKED'&&<button className="btn-secondary" disabled={busy||loading||!password||!['ACTIVE','PENDING_MFA','SUSPENDED'].includes(person.status)}
          aria-label={'永久撤销资格：'+person.username} onClick={()=>{if(window.confirm('永久撤销 '+person.username+' 的研究者资格？此操作不可恢复，历史研究数据不会删除。'))void act('/researchers/'+person.id+'/revoke','永久撤销资格：'+person.username);else cancelled('永久撤销资格：'+person.username)}}>
          永久撤销资格</button>}
        <button className="btn-secondary" disabled={busy||loading||!password||!['ACTIVE','PENDING_MFA'].includes(person.status)} aria-label={'密码重置邀请：'+person.username} onClick={()=>void act('/researchers/'+person.id+'/password-reset-invitations','密码重置邀请：'+person.username)}>密码重置邀请</button>
      </div>
      {!['ACTIVE','PENDING_MFA'].includes(person.status)&&<p className="text-sm">当前资格状态不能重置双因素认证或签发密码恢复邀请。资格恢复以后台现有规则为准。</p>}
    </article>)}</div>
    {!loading&&!error&&!list.length&&<p className="survey-admin-empty">{researcherPage===1?'暂无可见研究者。':'本页没有研究者，可返回上一页。'}</p>}
    <div className="flex items-center gap-3 text-sm">
      <button type="button" className="btn-secondary" disabled={busy||researcherPage<=1}
        onClick={()=>void refresh(researcherPage-1,invitationPage).catch(e=>setError(String(e)))}>研究者上一页</button>
      <span>研究者第 {researcherPage} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||list.length<25}
        onClick={()=>void refresh(researcherPage+1,invitationPage).catch(e=>setError(String(e)))}>研究者下一页</button>
    </div>
    </section>
  </div></ProductPage>
}
