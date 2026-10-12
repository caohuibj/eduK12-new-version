import {useState} from 'react'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Form={id:string;title:string;definitionDigest:string;status:'PUBLISHED'|'DRAFT'}
type Appointment={
  staffAssignmentId:string;classUnitId:string;className:string;
  staffRole:'HOMEROOM'|'TEACHING'
}
type Config={
  id:string;eventId:string;classUnitId:string;staffAssignmentId:string;
  formId:string;definitionDigest:string
}
type Preview={
  eventId:string;eligibleStudentCount:number;privacyFloor:number;
  teacherAssigned:boolean;readyForPrivacyProtectedFeedback:boolean;
  note:string
}
/** PR5 staged UI: this configuration is NOT a student task or release. */
export function HuiteacherStudentEvaluationManager({organizationId,eventId,eventStatus,
  teacherName,forms,api}:{
  organizationId:string;eventId:string;eventStatus:string;teacherName:string;
  forms:Form[];api:Api
}){
  const base='/organizations/'+organizationId+'/evaluation-events/'+eventId+'/student-evaluation'
  const [appointments,setAppointments]=useState<Appointment[]>([])
  const [staffId,setStaffId]=useState('')
  const [formId,setFormId]=useState('')
  const [configured,setConfigured]=useState<Config|null>(null)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const available=forms.filter(f=>f.status==='PUBLISHED')
  const run=(job:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void job().catch(e=>setNotice(e instanceof Error?e.message:'学生评教配置暂不可用'))
      .finally(()=>setBusy(false))
  }
  const load=()=>run(async()=>{
    if(eventStatus!=='DRAFT')throw new Error('学生评教配置仅能在活动草稿阶段冻结')
    const appointments=await api<{list:Appointment[];truncated:boolean}>(base+'/candidates')
    setAppointments(appointments.list)
    if(appointments.truncated)setNotice('符合资格的任教记录超过当前列表容量，请联系学校核实配置范围')
    try{
      setConfigured(await api<Config>(base))
    }catch{
      setConfigured(null)
    }
  })
  const configure=()=>run(async()=>{
    const appointment=appointments.find(c=>c.staffAssignmentId===staffId)
    if(!appointment||!formId)throw new Error('请先选择学校核实的任教关系和已发布 Form')
    if(!window.confirm('确认冻结本次学生评教的教师、班级与问卷版本吗？此操作不可改写。'))return
    const result=await api<Config>(base,'POST',{
      staffAssignmentId:appointment.staffAssignmentId,
      classUnitId:appointment.classUnitId,formId,
    })
    setConfigured(result)
    setNotice('已冻结教师目标、班级及问卷版本；学生任务尚未开放。')
  })
  const count=()=>run(async()=>{
    const result=await api<Preview>(base+'/eligibility')
    setPreview(result)
    setNotice('资格人数仅用于校验任务范围；不是正式学生评教结果。')
  })
  return <section className="ht-admin" aria-label="学生评教准备">
    <h4>学生评教 · 受控准备</h4>
    <p>评价对象：{teacherName}。学生使用原有教育账号，在 Teacher 域单独登录；
      这里只建立任务资格，不读取 Huischool 心理资料或学生成绩。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {eventStatus==='DRAFT'&&<button type="button" disabled={busy} onClick={load}>
      读取本教师的已核验任教关系
    </button>}
    {configured?<div className="ht-field-evidence">
      <p>已冻结评教配置 · 班级：<code>{configured.classUnitId}</code></p>
      <p>发布 Form：<code>{configured.formId}</code></p>
      <p>定义摘要：<code>{configured.definitionDigest.slice(0,16)}…</code></p>
      <button type="button" disabled={busy} onClick={count}>核验当前参与资格与隐私人数下限</button>
    </div>:eventStatus==='DRAFT'&&appointments.length>0?
    <div className="ht-inline">
      <label className="ht-field"><span>学校确认的任教班级</span>
        <select value={staffId} onChange={e=>setStaffId(e.target.value)}>
          <option value="">请选择</option>
          {appointments.map(x=><option key={x.staffAssignmentId} value={x.staffAssignmentId}>
            {x.className} · {x.staffRole==='HOMEROOM'?'班主任':'任课教师'}
          </option>)}
        </select>
      </label>
      <label className="ht-field"><span>已发布的学生评教 Form（不计分）</span>
        <select value={formId} onChange={e=>setFormId(e.target.value)}>
          <option value="">请选择</option>
          {available.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy||!staffId||!formId} onClick={configure}>
        冻结学生评教配置
      </button>
    </div>:null}
    {preview&&<p>基础参与资格：{preview.eligibleStudentCount} 名；隐私下限：
      {preview.privacyFloor} 名。{preview.readyForPrivacyProtectedFeedback
        ?'人数达到最低条件，但学生评教正式披露规则仍待完成。'
        :'当前条件不足，不得生成教师评教报告。'}</p>}
    <p className="ht-muted">PR5 开发阶段：尚未发布学生任务或开放 FINAL。
      需后续接入标准 Run、冻结班级—教师关系并通过数据保护审查。</p>
  </section>
}
