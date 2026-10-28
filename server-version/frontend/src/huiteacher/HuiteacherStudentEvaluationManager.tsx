import {useCallback,useEffect,useRef,useState} from 'react'
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
type Props={
  organizationId:string;eventId:string;eventStatus:string;eventVersion:number;
  teacherName:string;forms:Form[];api:Api;onChanged?:()=>void
}
// Match teacherApi's Error.status, rather than its application-level code.
const notFound=(error:unknown)=>error instanceof Error&&'status' in error&&error.status===404
export function HuiteacherStudentEvaluationManager(props:Props){
  const scope=useRef({api:props.api,organizationId:props.organizationId,eventId:props.eventId,epoch:0})
  if(scope.current.api!==props.api||scope.current.organizationId!==props.organizationId||scope.current.eventId!==props.eventId)
    scope.current={api:props.api,organizationId:props.organizationId,eventId:props.eventId,epoch:scope.current.epoch+1}
  return <StudentEvaluationSession key={scope.current.epoch} {...props}/>
}
function StudentEvaluationSession({organizationId,eventId,eventStatus,
  eventVersion,teacherName,forms,api:hostApi,onChanged}:Props){
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
  const [readState,setReadState]=useState<'LOADING'|'READY'|'ERROR'>('LOADING')
  const [readError,setReadError]=useState('')
  const alive=useRef(true),pending=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  // A response from an abandoned event/account must not continue a multi-step
  // action, including a later POST after its first request has returned.
  const api:Api=useCallback(async <T,>(path:string,method='GET',data?:unknown):Promise<T>=>{
    if(!alive.current)throw new Error('评价页面已切换')
    try{
      const result=await hostApi<T>(path,method,data)
      if(!alive.current)throw new Error('评价页面已切换')
      return result
    }catch(error){
      if(alive.current&&method!=='GET'){
        setReadState('ERROR');setReadError('操作结果需要重新核对，请重新读取评价配置与任务。')
      }
      throw error
    }
  },[hostApi])
  const available=forms.filter(f=>f.status==='PUBLISHED')
  const loadRun=useCallback(async()=>{
    try{
      const current=await api<Run>(eventBase+'/run')
      setAssignedRun(current)
      return current
    }catch(error){
      if(!alive.current)throw error
      if(notFound(error)){setAssignedRun(null);return null}
      setReadState('ERROR')
      setReadError(error instanceof Error?error.message:'评价任务读取失败')
      throw error
    }
  },[api,eventBase])
  const readCurrent=useCallback(async()=>{
    setReadState('LOADING');setReadError('')
    try{
      let config:Config|null
      try{config=await api<Config>(base)}
      catch(error){if(!notFound(error))throw error;config=null}
      if(!alive.current)return
      setConfigured(config)
      if(config)await loadRun()
      else{setAssignedRun(null);setPreview(null);setProgress(null);setReport(null)}
      if(alive.current)setReadState('READY')
    }catch(error){
      if(alive.current){setReadState('ERROR');setReadError(error instanceof Error?error.message:'评价配置读取失败')}
    }
  },[api,base,loadRun])
  useEffect(()=>{void readCurrent()},[readCurrent])
  const run=(job:()=>Promise<void>,retry=false)=>{
    if(pending.current||!alive.current||!retry&&readState!=='READY')return
    pending.current=true
    setBusy(true);setNotice('')
    void job().catch(e=>{if(alive.current)setNotice(e instanceof Error?e.message:'评教操作未获授权或状态已更新')})
      .finally(()=>{pending.current=false;if(alive.current)setBusy(false)})
  }
  const blocked=busy||readState!=='READY'
  const load=()=>run(async()=>{
    if(eventStatus!=='DRAFT')throw new Error('只有草稿可以选择任教关系')
    const result=await api<{list:Appointment[];truncated:boolean}>(base+'/candidates')
    setAppointments(result.list)
    if(result.truncated)setNotice('候选任教记录超过显示上限，请先核实学校资料')
    await readCurrent()
  })
  const configure=()=>run(async()=>{
    const appointment=appointments.find(c=>c.staffAssignmentId===staffId)
    if(!appointment||!formId)throw new Error('请先选择正式任教关系与发布版本')
    const result=await api<Config>(base,'POST',{
      staffAssignmentId:appointment.staffAssignmentId,
      classUnitId:appointment.classUnitId,formId,
    })
    setConfigured(result)
    // Configuration and Run remain independent immutable services. If the
    // second request fails, the resume button continues the saved draft.
    const draft=await api<Run>(base+'/run','POST',{
      intakeDeadline:deadline?new Date(deadline).toISOString():null,
    })
    setAssignedRun(draft)
    setPreview(await api<Preview>(base+'/eligibility'))
    onChanged?.()
    setNotice('评价与任务草稿已准备好。核对参与资格后即可直接发布。')
  })
  const count=()=>run(async()=>{
    const result=await api<Preview>(base+'/eligibility')
    setPreview(result)
    setNotice('仅为当前资格预览；发布时会在事务内重新核查并冻结。')
  })
  const create=()=>run(async()=>{
    if(!configured)throw new Error('请先冻结评价配置')
    const iso=deadline?new Date(deadline).toISOString():null
    const draft=await api<Run>(base+'/run','POST',{intakeDeadline:iso})
    setAssignedRun(draft);onChanged?.()
    setNotice('已恢复评教任务草稿；尚未通知学生。')
  })
  const publish=()=>run(async()=>{
    if(!assignedRun||assignedRun.status!=='DRAFT'
      ||!['DRAFT','OPEN'].includes(eventStatus))throw new Error('当前没有待发布的评价草稿')
    if(!window.confirm('确认向本校核验的班级发布学生评教？发布后会冻结教师、问卷与参与资格。'))return
    const eligibility=await api<Preview>(base+'/eligibility')
    setPreview(eligibility)
    if(!eligibility.teacherAssigned)throw new Error('教师任教关系已变化，请先核实')
    if(eligibility.eligibleStudentCount<eligibility.privacyFloor)
      throw new Error('当前符合资格学生 '+eligibility.eligibleStudentCount+' 人，少于发布要求的 '+eligibility.privacyFloor+' 人。请先补齐学校核验的学生班级关系，再发布。')
    // Two existing audited transitions are composed into one user action.
    // After an interrupted OPEN, the same button resumes publishing the Run.
    if(eventStatus==='DRAFT'){
      await api(eventBase+'/transition','POST',{action:'OPEN',expectedVersion:eventVersion})
      onChanged?.()
    }
    const result=await api<{executionCount:number}>(
      base+'/run/publish','POST',{expectedVersion:assignedRun.version})
    await loadRun();onChanged?.()
    setNotice('评价已发布，已分配 '+result.executionCount+' 份正式任务。')
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
    <h4>学生评教 · 配置 → 发布 → 结束</h4>
    <p>被评价教师：{teacherName}。学生使用原有教育账号分别登录 Teacher，
      本功能不读取 School 心理资料或导出学生个人答案。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {readState==='LOADING'&&<p role="status">正在核对评价配置与任务…</p>}
    {readState==='ERROR'&&<div><p role="alert">{readError}</p>
      <button disabled={busy} onClick={()=>run(readCurrent,true)}>重试读取评价配置与任务</button></div>}
    {readState==='READY'&&eventStatus==='DRAFT'&&!configured&&<button disabled={blocked} onClick={load}>
      选择学校核验的任教关系</button>}
    {readState==='READY'&&!configured&&<p className="ht-muted">须先冻结本次评价的教师、任教班级和正式发布 Form。</p>}
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
      <label className="ht-field"><span>截止时间（选填，本地时间）</span>
        <input type="datetime-local" value={deadline}
          onChange={e=>setDeadline(e.target.value)}/></label>
      <button disabled={blocked||!staffId||!formId} onClick={configure}>准备评价草稿</button>
    </div>}
    {configured&&<div className="ht-field-evidence">
      <p>冻结班级：<code>{configured.classUnitId}</code>
        {' · '}发布 Form：<code>{configured.formId}</code></p>
      <p>问卷内容摘要：<code>{configured.definitionDigest.slice(0,16)}…</code></p>
      {eventStatus==='DRAFT'&&<button disabled={blocked} onClick={count}>
        核验当前参与资格与隐私人数下限</button>}
      {preview&&<p>当前符合资格学生：{preview.eligibleStudentCount} 人，
        披露最低 {preview.privacyFloor} 份 FINAL。
        {preview.readyForPrivacyProtectedFeedback
          ?' 仅满足基本人数门槛，其他披露条件在关闭后核查。'
          :' 当前样本不足，不得向教师披露统计结果。'}</p>}
      {readState==='READY'&&!assignedRun&&eventStatus==='DRAFT'&&<div className="ht-inline">
        <label className="ht-field"><span>截止时间（选填，本地时间）</span>
          <input type="datetime-local" value={deadline}
            onChange={e=>setDeadline(e.target.value)}/></label>
        <button disabled={blocked} onClick={create}>继续准备已保存的评价</button>
      </div>}
      {assignedRun&&<div className="ht-event">
        <p>标准 Run · {assignedRun.status} · {assignedRun.runId}</p>
        <div className="ht-inline">
          {['DRAFT','OPEN'].includes(eventStatus)&&assignedRun.status==='DRAFT'&&
            <button disabled={blocked} onClick={publish}>发布评价</button>}
          {assignedRun.status==='PUBLISHED'&&<>
            <button disabled={blocked} onClick={loadProgress}>查看参与进度</button>
            {eventStatus==='OPEN'&&<button disabled={blocked} onClick={close}>
              结束评价并准备群体反馈</button>}
          </>}
          {eventStatus==='OPEN'&&assignedRun.status==='CLOSED'&&
            <button disabled={blocked} onClick={close}>完成活动关闭</button>}
          {eventStatus==='CLOSED'&&assignedRun.status==='CLOSED'&&<>
            {import.meta.env.VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'
              &&<button disabled={blocked} onClick={releaseReport}>正式发布新版群体报告</button>}
            <button disabled={blocked} onClick={readReport}>查看群体反馈</button>
          </>}
        </div>
        {progress&&<p>已完成 {progress.counts.COMPLETED??0} / {progress.total}
          {' · '}进行中 {progress.counts.STARTED??0}</p>}
      </div>}
      {report&&<HuiteacherStudentFeedbackView report={report}/>}
    </div>}
    <p className="ht-muted">新发布的评教任务自动沿用本校已保存的隐私偏好。
      旧任务继续执行原有规则。结束评价不会自动向教师披露：首次群体报告仍须按授权正式发布。
      个人答案、身份映射、响应时间与开放文本始终不通过群体报告公开。</p>
  </section>
}
