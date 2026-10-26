import {ClipboardList,Compass,NotebookPen} from 'lucide-react'
import {SchoolTaskHelp as PracticeHelp} from '../school/SchoolTaskHelp'
import {TeacherAssessmentPage} from './TeacherAssessmentPage'
import { useCallback,useEffect,useRef,useState } from 'react'
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
export function HuiteacherFieldWorkspace({api,onDraftStateChange}:{api:Api;onDraftStateChange?:(state:{dirty:boolean;writing:boolean})=>void}){
  const [invitations,setInvitations]=useState<Invite[]>([])
  const [notes,setNotes]=useState<Note[]>([])
  const [text,setText]=useState<Record<string,string>>({})
  const [fieldForms,setFieldForms]=useState<Record<string,FieldForm|null>>({})
  const [formAnswers,setFormAnswers]=useState<Record<string,Record<string,ProfessionalAnswer>>>({})
  const [formPages,setFormPages]=useState<Record<string,number>>({})
  const [newEvent,setNewEvent]=useState('')
  const [expertInviteCode,setExpertInviteCode]=useState('')
  const [kind,setKind]=useState<Kind>('FACT')
  const [opened,setOpened]=useState(false)
  const [activeNoteId,setActiveNoteId]=useState('')
  const [formErrors,setFormErrors]=useState<Record<string,string>>({})
  const [formReload,setFormReload]=useState(0)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const pending=useRef(false)
  const dirty=Object.entries(text).some(([key,value])=>key.startsWith('new:')?!!value.trim():notes.some(note=>note.id===key&&note.status==='DRAFT'&&value!==note.content))
    ||Object.entries(formAnswers).some(([key,values])=>Object.keys(values).length>0&&(key.startsWith('new:')||notes.some(note=>note.id===key&&note.status==='DRAFT')))
  useEffect(()=>{onDraftStateChange?.({dirty,writing:busy})},[dirty,busy,onDraftStateChange])
  useEffect(()=>()=>onDraftStateChange?.({dirty:false,writing:false}),[onDraftStateChange])
  useEffect(()=>{
    if(!dirty&&!busy)return
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return()=>window.removeEventListener('beforeunload',protect)
  },[dirty,busy])
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
    setFieldForms({});setFormErrors({})
    for(const invite of invitations.filter(i=>i.status==='ACCEPTED')){
      void api<FieldForm|null>('/field-invitations/'+invite.invitationId+'/form')
        .then(form=>{if(active)setFieldForms(old=>({...old,[invite.eventId]:form}))})
        .catch(error=>{if(active)setFormErrors(old=>({...old,[invite.eventId]:error instanceof Error?error.message:'实践表单读取失败'}))})
    }
    return()=>{active=false}
  },[invitations,api,formReload])
  const currentNote=notes.find(note=>note.id===activeNoteId)
  const currentInvite=invitations.find(invite=>currentNote?invite.eventId===currentNote.eventId:invite.invitationId===newEvent)
  const currentKind=currentNote?.kind??kind
  const recordKey=currentNote?.id??('new:'+newEvent+':'+kind)
  const content=text[recordKey]??currentNote?.content??''
  const eventId=currentNote?.eventId??currentInvite?.eventId??''
  const bound=fieldForms[eventId]
  const answers=formAnswers[recordKey]??{}
  const formError=formErrors[eventId]
  const formLoaded=Object.prototype.hasOwnProperty.call(fieldForms,eventId)
  const editable=currentNote?.status!=='SUBMITTED'&&currentInvite?.status==='ACCEPTED'
  const formal=currentKind==='FORMAL_FEEDBACK'
  const ready=editable&&(!formal||!!bound)
  const openActivity=(invite:Invite)=>{
    const draft=notes.find(note=>note.eventId===invite.eventId&&note.kind==='FORMAL_FEEDBACK'&&note.status==='DRAFT')
    setNewEvent(invite.invitationId);setKind('FORMAL_FEEDBACK');setActiveNoteId(draft?.id??'');setOpened(true);setNotice('')
  }
  const openNote=(note:Note)=>{setActiveNoteId(note.id);setOpened(true);setNotice('')}
  const action=(fn:()=>Promise<void>)=>{
    if(pending.current)return
    pending.current=true;setBusy(true);setNotice('')
    void fn().catch(e=>setNotice(e instanceof Error?e.message:'现场观察操作失败'))
      .finally(()=>{pending.current=false;setBusy(false)})
  }
  const joinExpert=()=>action(async()=>{
    await api('/education/join-expert','POST',{inviteCode:expertInviteCode.trim()})
    setExpertInviteCode('');await refresh()
    setNotice('已使用当前统一教育账号领取外部专家活动授权；未增加学校成员或心理业务权限。')
  })
  const accept=(inv:Invite)=>action(async()=>{
    await api('/field-invitations/'+inv.invitationId+'/accept','POST',{})
    await refresh()
    setNotice('已领取本次任务。只能在活动开放期间保存观察记录。')
  })
  const create=()=>action(async()=>{
    const inv=invitations.find(x=>x.invitationId===newEvent)
    if(!inv||inv.status!=='ACCEPTED'||!content.trim())
      throw new Error('请选择已领取的实践活动，并填写专业意见或记录内容')
    if(kind==='FORMAL_FEEDBACK'&&!fieldForms[inv.eventId])throw new Error('本活动尚无可填写的预制表单，请联系组织者配置。')
    const created=await api<Pick<Note,'id'>>('/organizations/'+inv.organizationId+'/evaluation-events/'+inv.eventId+
      '/field-notes','POST',{kind,content:content.trim()})
    setText(old=>{const next={...old,[created.id]:content.trim()};delete next[recordKey];return next})
    setFormAnswers(old=>{const next={...old,[created.id]:old[recordKey]??{}};delete next[recordKey];return next})
    setFormPages(old=>{const next={...old,[created.id]:old[recordKey]??0};delete next[recordKey];return next})
    await refresh();setActiveNoteId(created.id)
    setNotice(kind==='PRIVATE_REFLECTION'?
      '私人反思草稿已加密保存，仅你本人可以读取。':
      '专业意见草稿已加密保存；表单答案仍在本页暂存，正式提交时一并保存。')
  })
  const save=(note:Note)=>action(async()=>{
    const current=text[note.id]??note.content
    if(!current.trim())throw new Error('记录内容不能为空')
    await api('/field-notes/'+note.id,'PUT',{
      expectedRevision:note.revision,content:current.trim(),
    })
    setText(old=>({...old,[note.id]:current.trim()}))
    await refresh();setNotice('意见正文已加密保存。表单答案在正式提交时一并保存。')
  })
  const submit=(note:Note)=>action(async()=>{
    if(!window.confirm(note.kind==='PRIVATE_REFLECTION'
      ?'确认归档此私人反思吗？归档后不可修改，仍仅你本人可见。'
      :'确认将本记录作为正式观察材料提交吗？提交后不可修改。'))return
    if((text[note.id]??note.content)!==note.content)
      throw new Error('请先保存当前修改，再正式提交。')
    const bound=fieldForms[note.eventId]
    if(note.kind==='FORMAL_FEEDBACK'&&!bound)throw new Error('本活动尚无可填写的预制表单，请联系组织者配置。')
    const input:Record<string,unknown>={expectedRevision:note.revision}
    if(note.kind==='FORMAL_FEEDBACK'&&bound){
      const answers=formAnswers[note.id]??{}
      input.fieldFormId=bound.formId
      input.answers=sanitizeFormAnswers(bound.pages.flatMap(p=>p.questions),answers)
    }
    await api('/field-notes/'+note.id+'/submit','POST',input)
    setFormAnswers(old=>{const next={...old};delete next[note.id];return next})
    await refresh();setNotice(note.kind==='PRIVATE_REFLECTION'?
      '私人反思已归档，未向学校披露。':'正式观察记录已提交，原稿将保持不可改写。')
  })
  const active=invitations.filter(i=>i.status==='ACCEPTED')
  const onLastFormPage=!bound||(formPages[recordKey]??0)>=Math.max(0,bound.pages.filter(page=>
    page.questions.some(q=>visibleFormKeys(bound.pages.flatMap(p=>p.questions),answers).has(q.itemKey)),
  ).length-1)
  return <section className="ht-panel ht-practice-workbench" aria-label="我的专业实践">
    <header className="ht-section-heading"><h2>我的专业实践</h2><PracticeHelp label="专业实践与记录说明" buttonText=""><p>从受邀活动进入，填写组织者配置的实践表单。私人反思仅本人可见，与提交给学校的专业意见分别保存。</p></PracticeHelp></header>
    <p className="ht-muted">参与受邀活动，留下观察与专业反馈。</p>
    {notice&&!opened&&<p className="ht-notice" role="status">{notice}</p>}
    <h3 className="ht-practice-section-title">实践活动</h3>
    {!invitations.length?<p className="ht-empty">尚未收到实践活动邀请。</p>:<div className="ht-event-list">{invitations.map(inv=><article key={inv.invitationId} className="ht-event ht-practice-card">
      <span className="ht-practice-card-icon" aria-hidden="true"><Compass size={20}/></span>
      <div className="ht-practice-card-copy"><h4>{inv.title}</h4><div className="ht-practice-card-meta"><span>{inv.role==='EXPERT'?'外部专家':'同行观察者'}</span><span className="ht-tag">{inv.status==='ACCEPTED'?'已领取':'待接受'}</span><span>到期：{new Date(inv.expiresAt).toLocaleString('zh-CN')}</span></div></div>
      {inv.status==='INVITED'?<button disabled={busy} onClick={()=>accept(inv)}>接受本次邀请</button>:<button disabled={busy} onClick={()=>openActivity(inv)}>填写实践表单</button>}
    </article>)}</div>}
    <h3 className="ht-practice-section-title">我的记录</h3>
    {!notes.length?<p className="ht-empty">尚未创建实践记录。</p>:<div className="ht-event-list">{notes.map(note=><article key={note.id} className="ht-event ht-practice-card">
      <span className="ht-practice-card-icon" aria-hidden="true">{note.kind==='PRIVATE_REFLECTION'?<NotebookPen size={20}/>:<ClipboardList size={20}/>}</span>
      <div className="ht-practice-card-copy"><h4>{invitations.find(inv=>inv.eventId===note.eventId)?.title??labels[note.kind]}</h4><div className="ht-practice-card-meta"><span>{labels[note.kind]}</span><span className="ht-tag">{note.status==='SUBMITTED'?'已提交':'草稿'}</span></div>
      <p className="ht-muted">{note.kind==='PRIVATE_REFLECTION'?'仅本人可见':note.status==='SUBMITTED'?'已提交的原稿不可改写':'尚未正式提交给学校'}</p></div>
      <button disabled={busy} onClick={()=>openNote(note)}>{note.status==='SUBMITTED'?'查看记录':'继续填写'}</button>
    </article>)}</div>}
    {active.length>0&&<details className="ht-practice-disclosure"><summary>新建辅助记录或私人反思</summary>
      <div className="ht-inline"><label className="ht-field"><span>本次活动</span><select value={newEvent} onChange={e=>setNewEvent(e.target.value)}>
        <option value="">请选择已领取的实践活动</option>{active.map(inv=><option key={inv.invitationId} value={inv.invitationId}>{inv.title}</option>)}
      </select></label><label className="ht-field"><span>记录类型</span><select value={kind==='FORMAL_FEEDBACK'?'FACT':kind} onChange={e=>setKind(e.target.value as Kind)}>
        <option value="FACT">事实观察依据</option><option value="PRIVATE_REFLECTION">私人反思日志</option>
      </select></label></div>
      <button disabled={busy||!newEvent} onClick={()=>{if(kind==='FORMAL_FEEDBACK')setKind('FACT');setActiveNoteId('');setOpened(true);setNotice('')}}>打开辅助记录页面</button>
    </details>}
    <details className="ht-practice-disclosure"><summary>使用活动邀请码</summary>
      <div className="ht-inline"><label className="ht-field"><span>外部专家活动邀请码（已有教育账号）</span>
        <input value={expertInviteCode} maxLength={60} onChange={e=>setExpertInviteCode(e.target.value)} placeholder="受控邀请码，勿公开分享" autoComplete="off"/>
      </label><button disabled={busy||!/^[A-Za-z0-9_-]{43}$/.test(expertInviteCode.trim())} onClick={joinExpert}>使用当前账号领取专家任务</button></div>
    </details>
    {opened&&<TeacherAssessmentPage kind="practice" scope="ht-professional-practice" title={currentInvite?.title??labels[currentKind]} busy={busy} onBack={()=>setOpened(false)}>
      <div className="ht-practice-page">
        {notice&&<p className="ht-notice" role="status">{notice}</p>}
        {currentNote?.status==='SUBMITTED'?<>
          <p className="ht-tag">{labels[currentKind]} · 已提交</p>
          <p className="ht-muted">{currentKind==='PRIVATE_REFLECTION'?'私人反思仅本人可见，未向学校披露。':'原稿已冻结。本页展示获准读取的专业意见正文。'}</p>
          <p className="ht-field-content">{currentNote.content}</p>
        </>:<>
          {!editable&&<p role="alert" className="ht-notice">当前活动授权不可用，不能保存或提交新内容。</p>}
          {formal&&<section className="ht-task ht-practice-form ht-form-surface" aria-label="活动预制表单">
            {!currentInvite?<p className="ht-empty">无法读取此活动的预制表单，请联系组织者核实活动授权。</p>:formError?<div role="alert" className="ht-notice"><p>实践表单暂时无法读取：{formError}</p><button disabled={busy} onClick={()=>setFormReload(value=>value+1)}>重试实践表单</button></div>:!formLoaded?<p role="status">正在读取本活动的预制表单…</p>:!bound?<p className="ht-empty">本活动尚未配置预制表单，请联系组织者绑定已发布的实践表单。</p>:<>
              <p className="ht-muted">按表单逐页填写，最后一页由你确认正式提交。本表单不计分。</p>
              <TaskForm purpose="HUITEACHER" readOnly={busy||!editable}
                unit={{kind:'FORM',instrumentKey:bound.formId,title:bound.title,pages:bound.pages}}
                answer={answers} onChange={(key,value)=>setFormAnswers(old=>({...old,[recordKey]:{...(old[recordKey]??{}),[key]:value}}))}
                pageIndex={formPages[recordKey]??0} onPageChange={next=>setFormPages(old=>({...old,[recordKey]:next}))}/>
            </>}
          </section>}
          {(!formal||bound)&&<>
            <label className="ht-field"><span>{formal?'专业意见与补充说明（必填）':labels[currentKind]}</span><textarea aria-label={formal?'专业意见与补充说明':'记录正文'} disabled={busy||!editable} maxLength={12000} rows={4} value={content} onChange={e=>setText(old=>({...old,[recordKey]:e.target.value}))}/></label>
            <p className="ht-muted">{formal?'保存意见草稿仅保存文字正文。表单答案在本页暂存，返回列表不会丢失；正式提交时一并加密保存，请勿刷新或关闭页面。':currentKind==='PRIVATE_REFLECTION'?'私人反思加密保存，仅本人可见；归档后不可修改。':'事实观察依据单独保存，不替代活动的正式实践表单。'}</p>
            <div className="ht-inline"><button disabled={busy||!ready||!content.trim()} onClick={()=>currentNote?save(currentNote):create()}>{formal?'保存专业意见草稿':'保存加密草稿'}</button>
              <button disabled={busy||!ready||!currentNote||!onLastFormPage||content!==currentNote.content} onClick={()=>currentNote&&submit(currentNote)}>{currentKind==='PRIVATE_REFLECTION'?'归档私人反思':'正式提交'}</button>
            </div>
            {!currentNote&&<p className="ht-muted">请先保存正文草稿，再确认正式提交。</p>}
          </>}
        </>}
      </div>
    </TeacherAssessmentPage>}
  </section>
}
