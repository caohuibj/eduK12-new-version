import { useCallback,useEffect,useState } from 'react'
import { TaskForm } from '../survey/SurveyPublicApp'
import { sanitizeFormAnswers,visibleFormKeys } from '../survey/form-visibility'
import type {FormDraft} from '../survey/builder.types'
import type {ProfessionalAnswer} from '../survey/ProfessionalFormAnswer'
type Api=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
type Invite={invitationId:string;organizationId:string;eventId:string;title:string;
  kind:string;role:'EXPERT'|'PEER';expiresAt:string;status:'INVITED'|'ACCEPTED'}
type Note={id:string;eventId:string;kind:'FACT'|'FORMAL_FEEDBACK'|'PRIVATE_REFLECTION';
  status:'DRAFT'|'SUBMITTED';revision:number;content:string;createdAt:string;submittedAt:string|null}
type Kind=Note['kind']
type FieldForm={formId:string;title:string;definitionDigest:string;pages:FormDraft['pages']}
const labels:Record<Kind,string>={
  FACT:'事实观察依据',FORMAL_FEEDBACK:'正式专业反馈',PRIVATE_REFLECTION:'私人反思日志',
}
export function HuiteacherFieldWorkspace({api}:{api:Api}){
  const [invitations,setInvitations]=useState<Invite[]>([])
  const [notes,setNotes]=useState<Note[]>([])
  const [text,setText]=useState<Record<string,string>>({})
  const [fieldForms,setFieldForms]=useState<Record<string,FieldForm|null>>({})
  const [formAnswers,setFormAnswers]=useState<Record<string,Record<string,ProfessionalAnswer>>>({})
  const [formPages,setFormPages]=useState<Record<string,number>>({})
  const [newEvent,setNewEvent]=useState('')
  const [kind,setKind]=useState<Kind>('FACT')
  const [content,setContent]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const refresh=useCallback(async()=>{
    const [inv,note]=await Promise.all([
      api<{list:Invite[]}>('/my-field-invitations'),
      api<{list:Note[]}>('/my-field-notes'),
    ])
    setInvitations(inv.list);setNotes(note.list)
    setText(old=>{
      const merged={...old}
      for(const row of note.list)if(!(row.id in merged))merged[row.id]=row.content
      return merged
    })
  },[api])
  useEffect(()=>{
    let mounted=true
    void Promise.all([
      api<{list:Invite[]}>('/my-field-invitations'),
      api<{list:Note[]}>('/my-field-notes'),
    ]).then(([inv,note])=>{
      if(!mounted)return
      setInvitations(inv.list);setNotes(note.list)
      setText(Object.fromEntries(note.list.map(x=>[x.id,x.content])))
    }).catch(e=>{if(mounted)setNotice(e instanceof Error?e.message:'受邀观察记录读取失败')})
    return()=>{mounted=false}
  },[api])
  useEffect(()=>{
    let active=true
    void Promise.all(invitations.filter(i=>i.status==='ACCEPTED').map(async invite=>{
      const form=await api<FieldForm|null>(
        '/field-invitations/'+invite.invitationId+'/form')
      return [invite.eventId,form] as const
    })).then(entries=>{
      if(active)setFieldForms(Object.fromEntries(entries))
    }).catch(e=>{
      if(active)setNotice(e instanceof Error?e.message:'现场表单资格读取失败')
    })
    return()=>{active=false}
  },[invitations,api])
  const action=(fn:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void fn().catch(e=>setNotice(e instanceof Error?e.message:'现场观察操作失败'))
      .finally(()=>setBusy(false))
  }
  const accept=(inv:Invite)=>action(async()=>{
    await api('/field-invitations/'+inv.invitationId+'/accept','POST',{})
    await refresh()
    setNotice('已领取本次任务。只能在活动开放期间保存观察记录。')
  })
  const create=()=>action(async()=>{
    const inv=invitations.find(x=>x.invitationId===newEvent)
    if(!inv||inv.status!=='ACCEPTED'||!content.trim())
      throw new Error('请选择已领取的现场观察活动，并填写内容')
    await api('/organizations/'+inv.organizationId+'/evaluation-events/'+inv.eventId+
      '/field-notes','POST',{kind,content:content.trim()})
    setContent('');await refresh()
    setNotice(kind==='PRIVATE_REFLECTION'?
      '私人反思草稿已加密保存，仅你本人可以读取。':
      '观察草稿已加密保存。正式提交后才会交付给学校。')
  })
  const save=(note:Note)=>action(async()=>{
    const current=text[note.id]??note.content
    if(!current.trim())throw new Error('记录内容不能为空')
    await api('/field-notes/'+note.id,'PUT',{
      expectedRevision:note.revision,content:current.trim(),
    })
    await refresh();setNotice('草稿已保存。正式提交前仍可修订。')
  })
  const submit=(note:Note)=>action(async()=>{
    if(!window.confirm(note.kind==='PRIVATE_REFLECTION'
      ?'确认归档此私人反思吗？归档后不可修改，仍仅你本人可见。'
      :'确认将本记录作为正式观察材料提交吗？提交后不可修改。'))return
    if((text[note.id]??note.content)!==note.content)
      throw new Error('请先保存当前修改，再正式提交。')
    const bound=fieldForms[note.eventId]
    const input:Record<string,unknown>={expectedRevision:note.revision}
    if(note.kind==='FORMAL_FEEDBACK'&&bound){
      const answers=formAnswers[note.id]??{}
      input.fieldFormId=bound.formId
      input.answers=sanitizeFormAnswers(bound.pages.flatMap(p=>p.questions),answers)
    }
    await api('/field-notes/'+note.id+'/submit','POST',input)
    await refresh();setNotice(note.kind==='PRIVATE_REFLECTION'?
      '私人反思已归档，未向学校披露。':'正式观察记录已提交，原稿将保持不可改写。')
  })
  const active=invitations.filter(i=>i.status==='ACCEPTED')
  return <section className="ht-panel" aria-label="我的现场观察与专家反思">
    <h2>我的现场观察与专家反思</h2>
    <p>课堂、会议和教研观察使用限定活动授权。私人反思与正式提交给学校的专业意见严格分离。</p>
    {notice&&<p className="ht-notice" role="status">{notice}</p>}
    <h3>受邀任务</h3>
    {!invitations.length?<p className="ht-empty">尚未收到现场评价邀请。</p>:
      <div className="ht-event-list">{invitations.map(inv=><article key={inv.invitationId}
        className="ht-event"><strong>{inv.title}</strong> · <span className="ht-tag">
          {inv.role==='EXPERT'?'外部专家':'同行观察者'} / {inv.status}</span>
        <p className="ht-muted">到期：{new Date(inv.expiresAt).toLocaleString()}</p>
        {inv.status==='INVITED'&&<button disabled={busy} onClick={()=>accept(inv)}>接受本次邀请</button>}
      </article>)}</div>}
    <h3>新的现场记录</h3>
    <div className="ht-inline">
      <label className="ht-field"><span>本次活动</span><select
        value={newEvent} onChange={e=>setNewEvent(e.target.value)}>
        <option value="">请选择已领取的观察任务</option>
        {active.map(inv=><option key={inv.invitationId} value={inv.invitationId}>
          {inv.title} · {inv.role==='EXPERT'?'专家':'同行'}</option>)}
      </select></label>
      <label className="ht-field"><span>记录类型</span><select value={kind}
        onChange={e=>setKind(e.target.value as Kind)}>
        {Object.entries(labels).map(([value,label])=><option key={value} value={value}>
          {label}</option>)}
      </select></label>
    </div>
    <label className="ht-field"><span>{labels[kind]}（草稿加密保存）</span>
      <textarea maxLength={12000} rows={5} value={content}
        onChange={e=>setContent(e.target.value)} aria-label="观察记录草稿"/></label>
    <button disabled={busy||!newEvent||!content.trim()} onClick={create}>保存加密草稿</button>
    <h3>我的记录</h3>
    {!notes.length?<p className="ht-empty">尚未创建现场记录。</p>:
      <div className="ht-event-list">{notes.map(note=><article key={note.id} className="ht-event">
        <strong>{labels[note.kind]}</strong> · <span className="ht-tag">
          {note.status==='SUBMITTED'?'不可修改':'草稿'}</span>
        {note.kind==='PRIVATE_REFLECTION'&&
          <p className="ht-muted">只有本人能读取这份私人反思；学校管理者不可访问。</p>}
        {note.status==='DRAFT'?<>
          <label className="ht-field"><span>记录正文</span><textarea
            value={text[note.id]??note.content} rows={5} maxLength={12000}
            onChange={e=>setText(old=>({...old,[note.id]:e.target.value}))}/></label>
          {note.kind==='FORMAL_FEEDBACK'&&fieldForms[note.eventId]&&
            <div className="ht-task">
              <h4>本次课堂／教研结构化 Form</h4>
              <p className="ht-muted">不计分。正式提交时与专业意见一起加密冻结，不能将表单视为诊断量表。</p>
              <TaskForm purpose="HUITEACHER"
                unit={{kind:'FORM',instrumentKey:fieldForms[note.eventId]!.formId,
                  title:fieldForms[note.eventId]!.title,pages:fieldForms[note.eventId]!.pages}}
                answer={formAnswers[note.id]??{}}
                onChange={(key,value)=>setFormAnswers(old=>({
                  ...old,[note.id]:{...(old[note.id]??{}),[key]:value},
                }))}
                pageIndex={formPages[note.id]??0}
                onPageChange={next=>setFormPages(old=>({...old,[note.id]:next}))}/>
            </div>}
          <div className="ht-inline">
            <button disabled={busy||!(text[note.id]??note.content).trim()}
              onClick={()=>save(note)}>保存修订</button>
            <button disabled={busy||(
              note.kind==='FORMAL_FEEDBACK'&&!!fieldForms[note.eventId]&&
              (formPages[note.id]??0)<
              fieldForms[note.eventId]!.pages.filter(page=>
                page.questions.some(q=>visibleFormKeys(
                  fieldForms[note.eventId]!.pages.flatMap(p=>p.questions),
                  formAnswers[note.id]??{},
                ).has(q.itemKey)),
              ).length-1
            )} onClick={()=>submit(note)}>
              {note.kind==='PRIVATE_REFLECTION'?'归档私人反思':'正式提交'}
            </button>
          </div>
        </>:<p className="ht-field-content">{note.content}</p>}
      </article>)}</div>}
    <p className="ht-muted">正式提交后的记录禁止覆盖。本阶段尚未完成多人协商共识与独立评价的全部流程。</p>
  </section>
}
