import { useEffect,useState } from 'react'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Target={id:string;name:string;kind:string;status:string;subjectUserId:string|null}
type Event={id:string;targetId:string;kind:string;title:string;status:string;version:number}
type Run={eventId:string;runId:string;status:string;version:number;name?:string}
type Form={id:string;title:string;definitionDigest:string;status:'PUBLISHED'|'DRAFT'}
type Progress={runId:string;total:number;counts:Record<string,number>}
const targetLabels:Record<string,string>={
  PERSON:'教师或学校人员',TEAM:'教研组／管理团队',ORGANIZATION:'学校',
  ACTIVITY:'其他活动',ARTIFACT:'教学成果或方案',PROJECT:'改进项目',
}
const eventLabels:Record<string,string>={
  ASSESSMENT:'专业评价',CLASSROOM:'课堂观察',MEETING:'学校会议',
  TEACHING_RESEARCH:'教研活动',FIELD_VISIT:'专家访校',OTHER:'其他活动',
}
export function HuiteacherEvaluationStudio({organizationId,api}:{
  organizationId:string;api:Api
}){
  const base='/organizations/'+organizationId
  const [targets,setTargets]=useState<Target[]>([])
  const [events,setEvents]=useState<Event[]>([])
  const [runMap,setRunMap]=useState<Record<string,Run>>({})
  const [releasedForms,setReleasedForms]=useState<Form[]>([])
  const [formChoice,setFormChoice]=useState<Record<string,string>>({})
  const [progress,setProgress]=useState<Record<string,Progress>>({})
  const [targetName,setTargetName]=useState('')
  const [targetKind,setTargetKind]=useState('PERSON')
  const [subjectUserId,setSubjectUserId]=useState('')
  const [eventTitle,setEventTitle]=useState('')
  const [eventKind,setEventKind]=useState('CLASSROOM')
  const [eventTargetId,setEventTargetId]=useState('')
  const [notice,setNotice]=useState('')
  const [working,setWorking]=useState(false)
  const refresh=async()=>{
    const [t,e]=await Promise.all([
      api<{list:Target[]}>(base+'/evaluation-targets'),
      api<{list:Event[]}>(base+'/evaluation-events'),
    ])
    setTargets(t.list);setEvents(e.list)
    setEventTargetId(previous=>t.list.some(x=>x.id===previous)?previous:(t.list[0]?.id??''))
  }
  useEffect(()=>{
    let alive=true
    setTargets([]);setEvents([]);setRunMap({});setReleasedForms([]);setNotice('')
    void Promise.all([
      api<{list:Target[]}>(base+'/evaluation-targets'),
      api<{list:Event[]}>(base+'/evaluation-events'),
      api<{list:Form[]}>(base+'/forms'),
    ]).then(([t,e,forms])=>{
      if(alive){setTargets(t.list);setEvents(e.list);setReleasedForms(forms.list.filter(x=>x.status==='PUBLISHED'));setEventTargetId(t.list[0]?.id??'')}
    }).catch(e=>{if(alive)setNotice(e instanceof Error?e.message:'评价对象列表不可用')})
    return ()=>{alive=false}
  },[base,api])
  const perform=(fn:()=>Promise<void>)=>{
    setWorking(true);setNotice('')
    void fn().catch(e=>setNotice(e instanceof Error?e.message:'操作失败'))
      .finally(()=>setWorking(false))
  }
  const addTarget=()=>perform(async()=>{
    const body={
      kind:targetKind,name:targetName.trim(),
      ...(targetKind==='PERSON'&&subjectUserId.trim()?{subjectUserId:subjectUserId.trim()}:{}),
    }
    await api(base+'/evaluation-targets','POST',body)
    setTargetName('');setSubjectUserId('');await refresh()
    setNotice('稳定评价对象已保存。与人员账号的关联必须使用已核验的 User ID。')
  })
  const addEvent=()=>perform(async()=>{
    await api(base+'/evaluation-events','POST',{
      title:eventTitle.trim(),kind:eventKind,targetId:eventTargetId,
    })
    setEventTitle('');await refresh();setNotice('活动草稿已创建，可关联正式 Assessment Run。')
  })
  const createRun=(event:Event)=>perform(async()=>{
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run','POST',{
      name:event.title,
    })
    setRunMap(old=>({...old,[event.id]:run}))
    setNotice('已原子建立活动专属 Assessment Run 草稿。请配置已发布 Form 的 Track。')
  })
  const inspectRun=(event:Event)=>perform(async()=>{
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
    setRunMap(old=>({...old,[event.id]:run}))
  })
  const fetchRun=async(event:Event)=>{
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
    setRunMap(old=>({...old,[event.id]:run}))
    return run
  }
  const attachForm=(event:Event)=>perform(async()=>{
    const form=releasedForms.find(f=>f.id===formChoice[event.id])
    if(!form)throw new Error('请先选择已经发布的 Teacher Form')
    const run=runMap[event.id]??await fetchRun(event)
    if(run.status!=='DRAFT')throw new Error('只有草稿 Run 可以添加工具')
    await api(base+'/evaluation-events/'+event.id+'/run/tracks','POST',{
      resource:{family:'FORM',key:'huiteacher-form:'+form.id,
        version:form.definitionDigest},
      subjectSelector:{kind:'ALL_CURRENT'},
      respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
        relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
        analysisMode:'COHORT_AGGREGATE',
        visibilityPolicyKey:'HUITEACHER_FORM_GROUP_V1',
        minimumRespondents:10,
      },
    })
    await fetchRun(event)
    setNotice('教师群体 Form 已加入标准 Run；完成后只公开达到隐私阈值的群体描述统计。')
  })
  const previewRun=(event:Event)=>perform(async()=>{
    const run=await fetchRun(event)
    await api(base+'/evaluation-events/'+event.id+'/run/preview','POST',
      {expectedVersion:run.version})
    setNotice('本次 Run 的参与资格、版本及内容策略已完成预览。')
  })
  const publishRun=(event:Event)=>perform(async()=>{
    const run=await fetchRun(event)
    if(event.status!=='OPEN')throw new Error('请先开放评价活动')
    if(!window.confirm('确认向本校当前符合资格的教师分配 Form 任务吗？'))return
    const publication=await api<{executionCount:number;version:number}>(
      base+'/evaluation-events/'+event.id+'/run/publish','POST',
      {expectedVersion:run.version})
    await fetchRun(event)
    setNotice('标准 Run 已发布；共冻结 '+publication.executionCount+' 个作答任务。')
  })
  const readProgress=(event:Event)=>perform(async()=>{
    const report=await api<Progress>(base+'/evaluation-events/'+event.id+'/run/progress')
    setProgress(old=>({...old,[event.id]:report}))
  })
  const transition=(event:Event,action:'OPEN'|'CLOSE'|'CANCEL')=>perform(async()=>{
    const result=await api<{status:string;version:number}>(
      base+'/evaluation-events/'+event.id+'/transition','POST',{
        action,expectedVersion:event.version,
      })
    await refresh()
    setNotice('活动已变更为 '+result.status+'。请确认任务与报告授权独立。')
  })
  return <section className="ht-panel" aria-label="Huiteacher 评价活动管理">
    <h2>评价对象与活动</h2>
    <p>对象标识和活动事件独立于个人登录账户；共享 School 的基础组织关系，不共享 School 的测评数据。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <h3>创建稳定评价对象</h3>
    <div className="ht-inline">
      <label className="ht-field"><span>对象类型</span><select value={targetKind}
        onChange={e=>setTargetKind(e.target.value)}>
        {Object.entries(targetLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="ht-field"><span>名称</span><input value={targetName}
        maxLength={200} onChange={e=>setTargetName(e.target.value)}/></label>
      {targetKind==='PERSON'&&<label className="ht-field"><span>已核验人员 User ID（选填）</span>
        <input value={subjectUserId} placeholder="不填写则为待关联档案"
          onChange={e=>setSubjectUserId(e.target.value)}/></label>}
      <button disabled={working||!targetName.trim()} onClick={addTarget}>新增评价对象</button>
    </div>
    <div className="ht-units">{targets.map(x=><span key={x.id} className="ht-tag">
      {targetLabels[x.kind]??x.kind} · {x.name}</span>)}</div>
    <h3>创建评价活动</h3>
    <div className="ht-inline">
      <label className="ht-field"><span>所属评价对象</span><select value={eventTargetId}
        onChange={e=>setEventTargetId(e.target.value)}>
        <option value="">选择对象</option>
        {targets.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
      </select></label>
      <label className="ht-field"><span>活动类型</span><select value={eventKind}
        onChange={e=>setEventKind(e.target.value)}>
        {Object.entries(eventLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="ht-field"><span>活动标题</span><input value={eventTitle}
        onChange={e=>setEventTitle(e.target.value)} maxLength={200}/></label>
      <button disabled={working||!eventTargetId||!eventTitle.trim()} onClick={addEvent}>创建活动草稿</button>
    </div>
    <h3>近期活动</h3>
    <div className="ht-event-list">{events.map(event=><article key={event.id} className="ht-event">
      <strong>{event.title}</strong>
      <span className="ht-tag">{eventLabels[event.kind]??event.kind} · {event.status}</span>
      <div className="ht-inline">
        <button onClick={()=>inspectRun(event)} disabled={working}>查看 Run 关联</button>
        {event.status==='DRAFT'&&<button onClick={()=>createRun(event)} disabled={working||!!runMap[event.id]}>创建标准 Run 草稿</button>}
        {event.status==='DRAFT'&&<button onClick={()=>transition(event,'OPEN')} disabled={working}>开放评价活动</button>}
        {event.status==='DRAFT'&&<button onClick={()=>transition(event,'CANCEL')} disabled={working}>取消草稿</button>}
        {event.status==='OPEN'&&<button onClick={()=>transition(event,'CLOSE')} disabled={working}>结束活动</button>}
      </div>
      {runMap[event.id]&&<div>
        <p>标准 Assessment Run：<code>{runMap[event.id].runId}</code> · {runMap[event.id].status}</p>
        {runMap[event.id].status==='DRAFT'&&<>
          <label className="ht-field"><span>向当前教师发布的 Form（不计分）</span>
            <select value={formChoice[event.id]??''}
              onChange={e=>setFormChoice(old=>({...old,[event.id]:e.target.value}))}>
              <option value="">请选择正式已发布 Form</option>
              {releasedForms.map(form=><option key={form.id} value={form.id}>
                {form.title}</option>)}
            </select>
          </label>
          <div className="ht-inline">
            <button onClick={()=>attachForm(event)} disabled={working||!formChoice[event.id]}>
              加入 Form Track
            </button>
            <button onClick={()=>previewRun(event)} disabled={working}>预览 Run</button>
            <button onClick={()=>publishRun(event)} disabled={working||event.status!=='OPEN'}>
              发布教师评价任务
            </button>
          </div>
        </>}
        {runMap[event.id].status==='PUBLISHED'&&
          <button onClick={()=>readProgress(event)} disabled={working}>查看正式完成进度</button>}
        {progress[event.id]&&<p>已完成 {progress[event.id].counts.COMPLETED??0} /
          {progress[event.id].total} · 进行中 {progress[event.id].counts.IN_PROGRESS??0}</p>}
      </div>}
    </article>)}</div>
<p className="ht-muted">Form-only 使用正式发布版本、标准 Run 和加密 FINAL；没有计分规则，不产生 Scale 得分。低于最小样本量的群体报告保持抑制。</p>
  </section>
}
