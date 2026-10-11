import { useEffect,useState } from 'react'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Target={id:string;name:string;kind:string;status:string;subjectUserId:string|null}
type Event={id:string;targetId:string;kind:string;title:string;status:string;version:number}
type Run={eventId:string;runId:string;status:string;version:number;name?:string}
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
    setTargets([]);setEvents([]);setRunMap({});setNotice('')
    void Promise.all([
      api<{list:Target[]}>(base+'/evaluation-targets'),
      api<{list:Event[]}>(base+'/evaluation-events'),
    ]).then(([t,e])=>{
      if(alive){setTargets(t.list);setEvents(e.list);setEventTargetId(t.list[0]?.id??'')}
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
    setNotice('已原子建立此活动专属 Assessment Run 草稿；发布和真实 FINAL 尚未开放。')
  })
  const inspectRun=(event:Event)=>perform(async()=>{
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
    setRunMap(old=>({...old,[event.id]:run}))
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
        {event.status==='DRAFT'&&<button onClick={()=>transition(event,'CANCEL')} disabled={working}>取消草稿</button>}
        {event.status==='OPEN'&&<button onClick={()=>transition(event,'CLOSE')} disabled={working}>结束活动</button>}
      </div>
      {runMap[event.id]&&<p>标准 Assessment Run：<code>{runMap[event.id].runId}</code> · {runMap[event.id].status}</p>}
    </article>)}</div>
    <p className="ht-muted">本阶段为对象／活动与原子 Run 草稿管理。正式工具授权、任务分配、作答 FINAL、群体报告将在后续受控链路完成前保持关闭。</p>
  </section>
}
