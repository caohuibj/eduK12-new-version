import { useEffect,useState,type FormEvent } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type ParentLink={id:string;status:string;approvedAt:string|null}
type ParentLinks={list:ParentLink[];truncated:boolean;canApprove:boolean}
type Consent={version:string;text:string;reminder:string}
export function SchoolParentRegistration({api,onRegistered}:{
  api:SchoolApi;onRegistered:()=>void
}){
  const [inviteCode,setInviteCode]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [ack,setAck]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError('')
    try{
      await api('/parents/register','POST',{inviteCode,username,password,guardianAcknowledged:ack})
      setPassword('');setInviteCode('');onRegistered()
    }catch(e){setError(e instanceof Error?e.message:'校园家长注册未完成')}
    finally{setBusy(false)}
  }
  return <section className="hs-panel hs-narrow">
    <h1>家长校园账号注册</h1>
    <p>由孩子在校园平台生成单次邀请码。家长需创建独立的校园账号，
      不能沿用培训版账号。注册后还需要孩子确认，才会激活亲子关系。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    <form onSubmit={event=>void submit(event)}>
      <label className="hs-field"><span>一次性亲子邀请码（15 分钟内有效）</span>
        <input value={inviteCode} required onChange={e=>setInviteCode(e.target.value)} autoComplete="off"/></label>
      <label className="hs-field"><span>自选校园用户名</span>
        <input value={username} required onChange={e=>setUsername(e.target.value)} autoComplete="off"/></label>
      <label className="hs-field"><span>自选密码</span>
        <input type="password" value={password} required onChange={e=>setPassword(e.target.value)}
          autoComplete="new-password"/></label>
      <label className="hs-consent"><input type="checkbox" checked={ack}
        onChange={e=>setAck(e.target.checked)}/>
        <span>我确认以监护人身份提出关联申请，知晓须经孩子确认；
          亲子关系不代表获得孩子的个人心理报告。报告披露另需独立审批。</span></label>
      <button disabled={busy||!ack} className="hs-primary">创建独立校园家长账号</button>
    </form>
  </section>
}
export function SchoolParentLinks({api,role,organizationId}:{
  api:SchoolApi;role:'STUDENT'|'PARENT';organizationId?:string
}){
  const [links,setLinks]=useState<ParentLinks|null>(null)
  const [consent,setConsent]=useState<Consent|null>(null)
  const [invite,setInvite]=useState<string|null>(null)
  const [claim,setClaim]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const reload=async()=>setLinks(await api<ParentLinks>('/parent-links'))
  useEffect(()=>{
    let current=true
    void Promise.all([
      api<ParentLinks>('/parent-links'),
      api<Consent>('/parent-links/consent'),
    ]).then(([l,c])=>{if(current){setLinks(l);setConsent(c)}})
      .catch(e=>{if(current)setError(e instanceof Error?e.message:'无法读取亲子关系')})
    return()=>{current=false}
  },[api,role])
  async function execute(task:()=>Promise<void>){
    setBusy(true);setError('');setNotice('')
    try{await task()}catch(e){setError(e instanceof Error?e.message:'关联操作未完成')}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>我的家校关系</h2>
    <p>新关系需要学生明确确认；撤销立即停止新的关联测评授权。
      当前列表不包含任何个人量表分数、心理报告或其他学生的信息。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {role==='STUDENT'&&<div className="hs-actions">
      <button disabled={busy||!organizationId} onClick={()=>void execute(async()=>{
        const result=await api<{inviteCode:string;expiresAt:string}>('/parent-links/invitations','POST',{
          organizationId,
        })
        setInvite(result.inviteCode);setNotice('请把邀请码私下交给家长。该码仅显示一次。')
      })}>生成家长独立注册邀请码</button>
      {invite&&<div className="hs-secret"><code>{invite}</code>
        <button onClick={()=>setInvite(null)}>已发送，隐藏邀请码</button></div>}
    </div>}
    {role==='PARENT'&&<div className="hs-actions">
      <label className="hs-field"><span>已有校园账号，追加关联其他孩子</span>
        <input value={claim} onChange={e=>setClaim(e.target.value)} autoComplete="off"/></label>
      <button disabled={busy||claim.length!==24} onClick={()=>void execute(async()=>{
        await api('/parent-links/claims','POST',{inviteCode:claim})
        setClaim('');await reload();setNotice('关联申请已发送，等待孩子确认。')
      })}>申请关联</button>
    </div>}
    {!links?<p>正在读取…</p>:links.list.length===0?<p>目前没有亲子关联记录。</p>:
      <div>{links.list.map(link=><div className="hs-task-card" key={link.id}>
        <p>关联状态：{link.status==='PENDING'?'等待孩子确认':
          link.status==='ACTIVE'?'有效亲子关系':'关系已撤销'}</p>
        {role==='STUDENT'&&link.status==='PENDING'&&
          <button disabled={busy||!consent} onClick={()=>void execute(async()=>{
            if(!window.confirm('确认此邀请码确实交给你要关联的监护人，并知晓报告不自动公开？'))return
            await api('/parent-links/'+link.id+'/approve','POST',{
              consentVersion:consent!.version,
            })
            await reload();setNotice('已确认。个人报告仍受独立披露权限控制。')
          })}>确认监护人关系</button>}
        {link.status!=='REVOKED'&&
          <button disabled={busy} onClick={()=>void execute(async()=>{
            if(!window.confirm('撤销此亲子关系并停止新的关联授权？'))return
            await api('/parent-links/'+link.id+'/revoke','POST',{reason:'已由本人撤销校园亲子关联'})
            await reload();setNotice('关联已撤销。')
          })}>撤销关联</button>}
      </div>)}</div>}
    {consent&&<details><summary>查看关系确认说明</summary><p>{consent.text}</p><p>{consent.reminder}</p></details>}
  </section>
}
