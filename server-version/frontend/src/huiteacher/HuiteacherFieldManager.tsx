import { useRef,useState } from 'react'
import { HuiteacherConsensusManager } from './HuiteacherConsensus'
import {EducationPrivateVersionChooser,type PrivateVersionChoice} from '../components/education-tools/EducationPrivateVersionChooser'
import {compositionAdministrationForEntry} from '../components/education-tools/educationCompositionAdministration'
type Api=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
type Role='EXPERT'|'PEER'
type Grant={id:string;observerUserId:string;role:Role;status:'INVITED'|'ACCEPTED'|'REVOKED';
  revision:number;expiresAt:string;acceptedAt:string|null}
type FormalNote={id:string;eventId:string;kind:'FACT'|'FORMAL_FEEDBACK';
  status:'SUBMITTED';submittedAt:string;content:string}
type Binding={title:string;assessmentRef:{origin:{versionId:string;contentHash:string;targetKind:string}}}
type Evidence={attemptId:string;attemptEpoch:number;finalHash:string;units:Array<
 {kind:'FORM';unitId:string;items:Array<{prompt:string;state:string;value:unknown;rowStates?:unknown;otherText?:unknown}>}|
 {kind:'SCALE';unitId:string;state:'WITHHELD'|'DESCRIPTIVE';metrics:Array<{key:string;label:string;value:number|null}>}>}
type Props={
  organizationId:string;eventId:string;eventStatus:string;api:Api
}
export function HuiteacherFieldManager(props:Props){
  const scope=useRef({api:props.api,organizationId:props.organizationId,eventId:props.eventId,epoch:0})
  if(scope.current.api!==props.api||scope.current.organizationId!==props.organizationId||scope.current.eventId!==props.eventId)
    scope.current={api:props.api,organizationId:props.organizationId,eventId:props.eventId,epoch:scope.current.epoch+1}
  return <FieldManagerSession key={scope.current.epoch} {...props}/>
}
function FieldManagerSession({organizationId,eventId,eventStatus,api}:Props){
  const base='/organizations/'+organizationId+'/evaluation-events/'+eventId
  const [observerId,setObserverId]=useState('')
  const [expertInviteCode,setExpertInviteCode]=useState('')
  const [role,setRole]=useState<Role>('EXPERT')
  const [expiresAt,setExpiresAt]=useState('')
  const [choice,setChoice]=useState<PrivateVersionChoice|null>(null)
  const [boundForm,setBoundForm]=useState<Binding|null>(null)
  const [bindingLoaded,setBindingLoaded]=useState(false)
  const [grants,setGrants]=useState<Grant[]>([])
  const [formal,setFormal]=useState<FormalNote[]>([])
  const [evidence,setEvidence]=useState<Record<string,Evidence>>({})
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
    const binding=await api<Binding|null>(base+'/field-form')
    setBoundForm(binding);setBindingLoaded(true)
  })
  const bindForm=()=>run(async()=>{
    const administration=compositionAdministrationForEntry(choice?.administration,'TEACHER')
    if(eventStatus!=='DRAFT'||!choice||administration?.responseMode!=='EXPERT_REPORT')throw Error('请选择明确声明专家观察及目标类型的固定普通问卷')
    const binding=await api<Binding>(base+'/field-form','POST',{
      privateComposition:{versionId:choice.id,contentHash:choice.contentHash},
    })
    setBoundForm(binding)
    setNotice('本活动已固定专家观察问卷；正式反馈须关联同一次问卷的完成证据。')
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
  const readFieldEvidence=(note:FormalNote)=>run(async()=>{
    if(note.kind!=='FORMAL_FEEDBACK')return
    const source=await api<Evidence>(
      base+'/field-notes/'+note.id+'/form-evidence')
    setEvidence(prev=>({...prev,[note.id]:source}))
    setNotice('已核验正式反馈关联的固定问卷证据。此次读取受 MFA 和审计保护。')
  })
  return <section className="ht-field-manager" aria-label="受控现场观察管理">
    <h4>现场观察 · 专家／同行授权</h4>
    <p className="ht-muted">仅适用于这一次活动。邀请、撤销及查看正式反馈需要近期 Teacher MFA；私人反思永不在此显示。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <div className="ht-admin">
      <h5>专家观察普通问卷 · 量表与表单</h5>
      <button disabled={busy} type="button" onClick={loadFormBinding}>
        查看本次固定问卷绑定
      </button>
      {boundForm?<p className="ht-tag">已绑定：{boundForm.title} · {boundForm.assessmentRef.origin.targetKind} · {boundForm.assessmentRef.origin.contentHash.slice(0,12)}…（固定后不可替换）</p>
        :bindingLoaded&&eventStatus==='DRAFT'?<>
          <EducationPrivateVersionChooser api={api} organizationId={organizationId} kind="COMPOSITION" disabled={busy} selectLabel="选作专家观察问卷" onSelect={value=>{
            const administration=compositionAdministrationForEntry(value.administration,'TEACHER')
            if(administration?.responseMode!=='EXPERT_REPORT'){setNotice('该固定版本没有专家观察声明，请在普通问卷编制页选择受邀专家观察并固定新版本。');return}
            setChoice(value);setNotice('')
          }}/>
          {choice&&<p>{choice.title} · 修订 {choice.sourceRevision} · {choice.contentHash.slice(0,12)}…</p>}
          <button disabled={busy||!choice} type="button" onClick={bindForm}>固定本活动的专家观察问卷</button>
          <p className="ht-muted">目标类型须与活动对象完全一致。非人员对象只使用表单；量表原固定版本须明确声明专家观察。</p>
        </>:bindingLoaded?<p className="ht-muted">本活动尚未配置专家观察问卷，请联系组织者。</p>:null}
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
        {note.kind==='FORMAL_FEEDBACK'&&<button type="button" disabled={busy}
          onClick={()=>readFieldEvidence(note)}>按授权核验结构化观察证据</button>}
        {evidence[note.id]&&<div className="ht-field-evidence">
          <strong>已提交的固定问卷证据</strong>
          {evidence[note.id].units.map(unit=><section key={unit.unitId}>{unit.kind==='FORM'?<><h5>表单观察记录（不计分）</h5><dl>{unit.items.map((item,index)=><div key={index}><dt>{item.prompt}</dt><dd>{item.state==='ANSWERED'?JSON.stringify(item.value):'未作答'}{item.rowStates!==undefined&&<span> · {JSON.stringify(item.rowStates)}</span>}{item.otherText!==undefined&&<span> · {JSON.stringify(item.otherText)}</span>}</dd></div>)}</dl></>:<><h5>量表描述结果</h5>{unit.state==='WITHHELD'?<p>此量表的固定报告设置未授权在正式证据中展示结果。</p>:<dl>{unit.metrics.map(metric=><div key={metric.key}><dt>{metric.label}</dt><dd>{metric.value===null?'无法计算':metric.value}</dd></div>)}</dl>}</>}</section>)}
        </div>}
      </article>):<p>尚无正式提交的观察反馈。私人反思不进入学校反馈。</p>}</div>}
    {eventStatus==='CLOSED'&&<HuiteacherConsensusManager
      organizationId={organizationId} eventId={eventId} api={api}/>}
  </section>
}
