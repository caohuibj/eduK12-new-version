import { useState } from 'react'
import { HuiteacherConsensusManager } from './HuiteacherConsensus'
type Api=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
type Role='EXPERT'|'PEER'
type Grant={id:string;observerUserId:string;role:Role;status:'INVITED'|'ACCEPTED'|'REVOKED';
  revision:number;expiresAt:string;acceptedAt:string|null}
type FormalNote={id:string;eventId:string;kind:'FACT'|'FORMAL_FEEDBACK';
  status:'SUBMITTED';submittedAt:string;content:string}
export function HuiteacherFieldManager({organizationId,eventId,eventStatus,api}:{
  organizationId:string;eventId:string;eventStatus:string;api:Api
}){
  const base='/organizations/'+organizationId+'/evaluation-events/'+eventId
  const [observerId,setObserverId]=useState('')
  const [expertInviteCode,setExpertInviteCode]=useState('')
  const [role,setRole]=useState<Role>('EXPERT')
  const [expiresAt,setExpiresAt]=useState('')
  const [formList,setFormList]=useState<Array<{id:string;title:string;status:string}>>([])
  const [fieldFormId,setFieldFormId]=useState('')
  const [boundForm,setBoundForm]=useState<{formId:string;title:string}|null>(null)
  const [grants,setGrants]=useState<Grant[]>([])
  const [formal,setFormal]=useState<FormalNote[]>([])
  const [showGrants,setShowGrants]=useState(false)
  const [showFormal,setShowFormal]=useState(false)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const run=(job:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void job().catch(e=>setNotice(e instanceof Error?e.message:'活动协作操作失败'))
      .finally(()=>setBusy(false))
  }
  const loadFormBinding=()=>run(async()=>{
    const [forms,binding]=await Promise.all([
      api<{list:Array<{id:string;title:string;status:string}>}>(
        '/organizations/'+organizationId+'/forms'),
      api<{formId:string;title:string}|null>(base+'/field-form'),
    ])
    setFormList(forms.list.filter(x=>x.status==='PUBLISHED'))
    setBoundForm(binding)
  })
  const bindForm=()=>run(async()=>{
    if(eventStatus!=='DRAFT'||!fieldFormId)throw Error('只能为草稿现场活动绑定已发布表单')
    const binding=await api<{formId:string;title:string}>(base+'/field-form','POST',{
      formId:fieldFormId,
    })
    setBoundForm(binding)
    setNotice('本次现场 Form V2 已冻结；正式专家反馈必须随附该表单的受控答案。')
  })
  const readGrants=async()=>{
    const result=await api<{list:Grant[]}>(base+'/observer-grants')
    setGrants(result.list);setShowGrants(true)
  }
  const invite=()=>run(async()=>{
    if(!/^[0-9a-f-]{36}$/i.test(observerId))throw new Error('请填写受邀者已核验的教育用户 ID')
    const timestamp=new Date(expiresAt)
    if(!expiresAt||Number.isNaN(timestamp.getTime()))
      throw new Error('请先设置明确的邀请到期时间')
    await api(base+'/observer-grants','POST',{
      observerUserId:observerId.trim(),role,expiresAt:timestamp.toISOString(),
    })
    setObserverId('');await readGrants()
    setNotice('观察者已收到限定活动的邀请。不授予任何心理健康或全校报告权限。')
  })
  const inviteNewExpert=()=>run(async()=>{
    if(!['DRAFT','OPEN'].includes(eventStatus))
      throw Error('已结束活动不接受新的专家注册')
    const token=await api<{inviteCode:string}>(
      base+'/expert-registration-invites','POST',{})
    setExpertInviteCode(token.inviteCode)
    setNotice('受限专家邀请码已生成。只通过可信渠道交付；邀请码不赋予学校或心理健康管理权限。')
  })
  const revoke=(grant:Grant)=>run(async()=>{
    if(!window.confirm('确认撤销该观察者在本次活动中的参与资格？'))return
    await api(base+'/observer-grants/'+grant.observerUserId+'/revoke','POST',{})
    await readGrants();setNotice('活动参与资格已撤销，不删除历史正式记录。')
  })
  const readFormal=()=>run(async()=>{
    const result=await api<{list:FormalNote[]}>(base+'/formal-notes')
    setFormal(result.list);setShowFormal(true)
  })
  return <section className="ht-field-manager" aria-label="受控现场观察管理">
    <h4>现场观察 · 专家／同行授权</h4>
    <p className="ht-muted">仅适用于这一次活动。邀请、撤销及查看正式反馈需要近期 Teacher MFA；私人反思永不在此显示。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <div className="ht-admin">
      <h5>现场 Form V2（不计分）</h5>
      <button disabled={busy} type="button" onClick={loadFormBinding}>
        查看本次表单绑定与可用目录
      </button>
      {boundForm?<p className="ht-tag">已绑定：{boundForm.title}（提交后不可改写）</p>
        :eventStatus==='DRAFT'&&formList.length>0?
          <div className="ht-inline">
            <label className="ht-field"><span>选择本校已发布 Form</span>
              <select value={fieldFormId} onChange={e=>setFieldFormId(e.target.value)}>
                <option value="">可不绑定，使用纯文字现场观察</option>
                {formList.map(form=><option key={form.id} value={form.id}>{form.title}</option>)}
              </select>
            </label>
            <button disabled={busy||!fieldFormId} type="button" onClick={bindForm}>
              冻结本活动的观察表单
            </button>
          </div>:<p className="ht-muted">未绑定结构化 Form 时，本次活动仅收集授权观察者的加密文字证据。</p>}
    </div>
    {['DRAFT','OPEN'].includes(eventStatus)&&<div className="ht-inline">
      <button type="button" onClick={inviteNewExpert} disabled={busy}>
        为尚无教育账号的外部专家生成受控邀请码
      </button>
      {expertInviteCode&&<p className="ht-secret">
        一次性专家邀请码（请安全交付）：<code className="ht-wrap">{expertInviteCode}</code>
      </p>}
    </div>}
    {['DRAFT','OPEN','CLOSED'].includes(eventStatus)&&<div className="ht-inline">
      <label className="ht-field"><span>观察者教育账号 ID</span>
        <input value={observerId} onChange={e=>setObserverId(e.target.value)}
          placeholder="已核验 User ID" autoComplete="off"/></label>
      <label className="ht-field"><span>本次角色</span>
        <select value={role} onChange={e=>setRole(e.target.value as Role)}>
          <option value="EXPERT">外部专家</option><option value="PEER">同行观察者</option>
        </select></label>
      <label className="ht-field"><span>授权到期</span>
        <input type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></label>
      <button type="button" disabled={busy||!observerId||!expiresAt} onClick={invite}>
        {eventStatus==='CLOSED'?'续期协商确认授权':'发送任务邀请'}
      </button>
      {eventStatus==='CLOSED'&&<p className="ht-muted">
        活动已关闭，仅允许延长既有专家的共识确认资格；不可新建现场观察或修改已提交的原稿。
      </p>}
    </div>}
    <div className="ht-inline">
      {['DRAFT','OPEN','CLOSED'].includes(eventStatus)&&
        <button type="button" disabled={busy} onClick={()=>run(readGrants)}>查看／管理邀请名单</button>}
      <button type="button" disabled={busy} onClick={readFormal}>查看已提交的正式观察反馈</button>
    </div>
    {showGrants&&<div className="ht-event-list">{grants.length?grants.map(grant=>
      <article className="ht-event" key={grant.id}>
        <p>账号：<code>{grant.observerUserId}</code> · {grant.role==='EXPERT'?'专家':'同行'}
          · {grant.status} · 到期 {new Date(grant.expiresAt).toLocaleString()}</p>
        {grant.status!=='REVOKED'&&
          <button type="button" disabled={busy} onClick={()=>revoke(grant)}>撤销本次授权</button>}
      </article>):<p>本次活动没有观察者邀请。</p>}</div>}
    {showFormal&&<div className="ht-event-list">{formal.length?formal.map(note=>
      <article key={note.id} className="ht-event">
        <strong>{note.kind==='FACT'?'事实观察记录':'正式专业反馈'}</strong>
        <span className="ht-tag">已提交 · {new Date(note.submittedAt).toLocaleString()}</span>
        <p className="ht-field-content">{note.content}</p>
      </article>):<p>尚无正式提交的观察反馈。私人反思不进入学校反馈。</p>}</div>}
    {eventStatus==='CLOSED'&&<HuiteacherConsensusManager
      organizationId={organizationId} eventId={eventId} api={api}/>}
  </section>
}
