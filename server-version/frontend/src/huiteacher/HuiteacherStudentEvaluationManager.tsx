import {useCallback,useEffect,useState} from 'react'
import {HuiteacherStudentFeedbackView,type StudentFeedbackReport} from './HuiteacherStudentFeedbackView'
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
  teacherAssigned:boolean;readyForPrivacyProtectedFeedback:boolean;note:string
}
type Run={runId:string;status:string;version:number;trackCount?:number}
type Progress={runId:string;total:number;counts:Record<string,number>}
export function HuiteacherStudentEvaluationManager({organizationId,eventId,eventStatus,
  eventVersion,teacherName,forms,api,onChanged}:{
  organizationId:string;eventId:string;eventStatus:string;eventVersion:number;
  teacherName:string;forms:Form[];api:Api;onChanged?:()=>void
}){
  const base='/organizations/'+organizationId+'/evaluation-events/'+eventId+'/student-evaluation'
  const eventBase='/organizations/'+organizationId+'/evaluation-events/'+eventId
  const [appointments,setAppointments]=useState<Appointment[]>([])
  const [staffId,setStaffId]=useState('')
  const [formId,setFormId]=useState('')
  const [configured,setConfigured]=useState<Config|null>(null)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [assignedRun,setAssignedRun]=useState<Run|null>(null)
  const [progress,setProgress]=useState<Progress|null>(null)
  const [report,setReport]=useState<StudentFeedbackReport|null>(null)
  const [deadline,setDeadline]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const available=forms.filter(f=>f.status==='PUBLISHED')
  const loadRun=useCallback(async()=>{
    try{
      setAssignedRun(await api<Run>(eventBase+'/run'))
    }catch{setAssignedRun(null)}
  },[api,eventBase])
  useEffect(()=>{
    let current=true
    void api<Config>(base).then(value=>{if(current){setConfigured(value);void loadRun()}})
      .catch(()=>{if(current)setConfigured(null)})
    return ()=>{current=false}
  },[api,base,loadRun])
  const run=(job:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void job().catch(e=>setNotice(e instanceof Error?e.message:'评教操作未获授权或状态已更新'))
      .finally(()=>setBusy(false))
  }
  const load=()=>run(async()=>{
    if(eventStatus!=='DRAFT')throw new Error('只有草稿可以选择任教关系')
    const result=await api<{list:Appointment[];truncated:boolean}>(base+'/candidates')
    setAppointments(result.list)
    if(result.truncated)setNotice('候选任教记录超过显示上限，请先核实学校资料')
    try{setConfigured(await api<Config>(base));await loadRun()}
    catch{setConfigured(null)}
  })
  const configure=()=>run(async()=>{
    const appointment=appointments.find(c=>c.staffAssignmentId===staffId)
    if(!appointment||!formId)throw new Error('请先选择正式任教关系与发布版本')
    if(!window.confirm('本次评教教师、班级及表单版本将不可改写。确认冻结？'))return
    const result=await api<Config>(base,'POST',{
      staffAssignmentId:appointment.staffAssignmentId,
      classUnitId:appointment.classUnitId,formId,
    })
    setConfigured(result)
    setNotice('教师、班级及发布 Form 已冻结。请建立受控评教任务。')
  })
  const count=()=>run(async()=>{
    const result=await api<Preview>(base+'/eligibility')
    setPreview(result)
    setNotice('仅为当前资格预览；发布时会在事务内重新核查并冻结。')
  })
  const create=()=>run(async()=>{
    if(!configured)throw new Error('请先冻结评价配置')
    if(!window.confirm('确认在本校创建单个学生评教 Run？'))return
    const iso=deadline?new Date(deadline).toISOString():null
    await api(base+'/run','POST',{intakeDeadline:iso})
    await loadRun();onChanged?.()
    setNotice('已建立唯一受控 Run 草稿和 Form Track，尚未通知学生。')
  })
  const previewRun=()=>run(async()=>{
    if(!assignedRun)throw new Error('尚未建立 Run')
    await api(base+'/run/preview','POST',{expectedVersion:assignedRun.version})
    setNotice('已预览合法师生任务；发布仍会重新核查。')
  })
  const openEvent=()=>run(async()=>{
    if(!assignedRun)throw new Error('请先创建正式 Run 草稿')
    await api(eventBase+'/transition','POST',{action:'OPEN',expectedVersion:eventVersion})
    onChanged?.();setNotice('评价活动已开放；下一步确认并发布学生任务。')
  })
  const publish=()=>run(async()=>{
    if(!assignedRun||eventStatus!=='OPEN')throw new Error('活动必须先开放')
    if(!window.confirm('确认向冻结班级的合法学生发布本教师评教吗？'))return
    const result=await api<{executionCount:number}>(
      base+'/run/publish','POST',{expectedVersion:assignedRun.version})
    await loadRun();onChanged?.()
    setNotice('已冻结并发布 '+result.executionCount+' 份正式学生评教任务。')
  })
  const loadProgress=()=>run(async()=>{
    setProgress(await api<Progress>(eventBase+'/run/progress'))
  })
  const close=()=>run(async()=>{
    if(!window.confirm('关闭后不再接受新的学生 START 或 FINAL。确认关闭？'))return
    if(assignedRun?.status==='PUBLISHED')
      await api(eventBase+'/run/close','POST',{})
    await api(eventBase+'/transition','POST',{action:'CLOSE',expectedVersion:eventVersion})
    await loadRun();onChanged?.()
    setNotice('已关闭评价活动和 Run。未完成回答不会再形成新 FINAL。')
  })
  const readReport=()=>run(async()=>{
    setReport(await api<StudentFeedbackReport>(base+'/report'))
    setNotice('已读取符合该 Run 正式披露策略的群体报告。')
  })
  const releaseReport=()=>run(async()=>{
    if(!window.confirm('确认正式发布本次学生评教群体报告？该报告将固定快照供授权教师读取。'))return
    const released=await api<StudentFeedbackReport>(base+'/report/release','POST',{})
    setReport(released)
    setNotice('群体报告已正式发布并冻结；之后读取不会重新统计或修改披露策略。')
  })
  return <section className="ht-admin" aria-label="学生评教受控管理">
    <h4>学生评教 · 正式任务</h4>
    <p>被评价教师：{teacherName}。学生使用原有教育账号分别登录 Teacher，
      本功能不读取 School 心理资料或导出学生个人答案。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {eventStatus==='DRAFT'&&!configured&&<button disabled={busy} onClick={load}>
      选择学校核验的任教关系</button>}
    {!configured&&<p className="ht-muted">须先冻结本次评价的教师、任教班级和正式发布 Form。</p>}
    {!configured&&appointments.length>0&&<div className="ht-inline">
      <label className="ht-field"><span>本教师合法任教的班级</span>
        <select value={staffId} onChange={e=>setStaffId(e.target.value)}>
          <option value="">请选择</option>
          {appointments.map(a=><option key={a.staffAssignmentId} value={a.staffAssignmentId}>
            {a.className} · {a.staffRole==='HOMEROOM'?'班主任':'任课教师'}</option>)}
        </select>
      </label>
      <label className="ht-field"><span>已发布 Form V2（不计分）</span>
        <select value={formId} onChange={e=>setFormId(e.target.value)}>
          <option value="">请选择</option>
          {available.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}
        </select></label>
      <button disabled={busy||!staffId||!formId} onClick={configure}>冻结评教配置</button>
    </div>}
    {configured&&<div className="ht-field-evidence">
      <p>冻结班级：<code>{configured.classUnitId}</code>
        {' · '}发布 Form：<code>{configured.formId}</code></p>
      <p>问卷内容摘要：<code>{configured.definitionDigest.slice(0,16)}…</code></p>
      {eventStatus==='DRAFT'&&<button disabled={busy} onClick={count}>
        核验当前参与资格与隐私人数下限</button>}
      {preview&&<p>当前符合资格学生：{preview.eligibleStudentCount} 人，
        披露最低 {preview.privacyFloor} 份 FINAL。
        {preview.readyForPrivacyProtectedFeedback
          ?' 仅满足基本人数门槛，其他披露条件在关闭后核查。'
          :' 当前样本不足，不得向教师披露统计结果。'}</p>}
      {!assignedRun&&eventStatus==='DRAFT'&&<div className="ht-inline">
        <label className="ht-field"><span>截止时间（选填，本地时间）</span>
          <input type="datetime-local" value={deadline}
            onChange={e=>setDeadline(e.target.value)}/></label>
        <button disabled={busy} onClick={create}>建立评教任务草稿</button>
      </div>}
      {assignedRun&&<div className="ht-event">
        <p>标准 Run · {assignedRun.status} · {assignedRun.runId}</p>
        <div className="ht-inline">
          {eventStatus==='DRAFT'&&assignedRun.status==='DRAFT'&&<>
            <button disabled={busy} onClick={previewRun}>预览冻结资格</button>
            <button disabled={busy} onClick={openEvent}>开放评价活动</button>
          </>}
          {eventStatus==='OPEN'&&assignedRun.status==='DRAFT'&&
            <button disabled={busy} onClick={publish}>发布学生评教任务</button>}
          {assignedRun.status==='PUBLISHED'&&<>
            <button disabled={busy} onClick={loadProgress}>查看参与进度</button>
            {eventStatus==='OPEN'&&<button disabled={busy} onClick={close}>
              关闭任务并结束活动</button>}
          </>}
          {eventStatus==='OPEN'&&assignedRun.status==='CLOSED'&&
            <button disabled={busy} onClick={close}>完成活动关闭</button>}
          {eventStatus==='CLOSED'&&assignedRun.status==='CLOSED'&&<>
            {import.meta.env.VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'
              &&<button disabled={busy} onClick={releaseReport}>正式发布新版群体报告</button>}
            <button disabled={busy} onClick={readReport}>查看群体反馈</button>
          </>}
        </div>
        {progress&&<p>已完成 {progress.counts.COMPLETED??0} / {progress.total}
          {' · '}进行中 {progress.counts.STARTED??0}</p>}
      </div>}
      {report&&<HuiteacherStudentFeedbackView report={report}/>}
    </div>}
    <p className="ht-muted">新发布的评教任务自动沿用本校已保存的隐私偏好。
      旧任务继续执行原有规则。个人答案、身份映射、响应时间与开放文本始终不通过群体报告公开。</p>
  </section>
}
