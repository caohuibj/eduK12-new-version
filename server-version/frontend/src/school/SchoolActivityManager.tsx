import { useEffect, useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type ActivityState='DRAFT'|'SUBMITTED'|'OPEN'|'PAUSED'|'CLOSED'
type Activity={
  courseId:string;organizationId:string;title:string;purpose:string;status:ActivityState
  version:number;participantCount:number;runCount:number
}
type Run={id:string;name:string;status:string;version:number}
type Detail=Activity&{runs:Array<{runId:string;name:string;status:string}>}
type Unit={id:string;unitKind:'CLASS'|'GRADE';name:string}
type CatalogResource={
  title:string;family:'SCALE'|'BUNDLE'|'FORM'|'SITUATIONAL'|'COGNITIVE'
  key:string;version:string;scientificMaturity:string
  subjectRoles:string[];respondentRoles:string[];relationshipKinds:string[]
  perspectives:string[];analysisMode:string;visibilityPolicyKey:string
  minimumRespondents:number|null;allowedTargetModes?:string[]
}
const purposeOptions=[
  ['STUDENT_WELLBEING','学生心理健康'],
  ['LEARNING_ADAPTATION','学习适应'],
  ['SCHOOL_CLIMATE','学校氛围与关系'],
  ['FAMILY_SUPPORT','家庭与学校支持'],
] as const
const actions:Record<ActivityState,Array<{key:'SUBMIT'|'OPEN'|'PAUSE'|'RESUME'|'CLOSE';label:string;admin:boolean}>>={
  DRAFT:[{key:'SUBMIT',label:'提交学校审核',admin:false}],
  SUBMITTED:[{key:'OPEN',label:'学校管理员批准开放',admin:true},{key:'CLOSE',label:'关闭提议',admin:true}],
  OPEN:[{key:'PAUSE',label:'暂停活动',admin:true},{key:'CLOSE',label:'结束活动',admin:true}],
  PAUSED:[{key:'RESUME',label:'恢复开放',admin:true},{key:'CLOSE',label:'结束活动',admin:true}],
  CLOSED:[],
}
const stateText:Record<ActivityState,string>={
  DRAFT:'准备中',SUBMITTED:'学校审核中',OPEN:'已开放',PAUSED:'已暂停',CLOSED:'已结束',
}

export function SchoolActivityManager({api,organizationId,isAdmin,classes}: {
  api:SchoolApi;organizationId:string;isAdmin:boolean;classes:Unit[]
}){
  const [list,setList]=useState<Activity[]>([])
  const [selected,setSelected]=useState<Detail|null>(null)
  const [title,setTitle]=useState('')
  const [purpose,setPurpose]=useState<(typeof purposeOptions)[number][0]>('STUDENT_WELLBEING')
  const [classId,setClassId]=useState('')
  const [peersPerRespondent,setPeersPerRespondent]=useState(1)
  const [taskTitle,setTaskTitle]=useState('')
  const [taskContent,setTaskContent]=useState('')
  const [taskKind,setTaskKind]=useState<'ASSIGNMENT'|'READING'|'CHECKIN'>('READING')
  const [runTitle,setRunTitle]=useState('')
  const [resources,setResources]=useState<CatalogResource[]>([])
  const [activeRun,setActiveRun]=useState<Run|null>(null)
  const [resourceId,setResourceId]=useState('')
  const [subjectRole,setSubjectRole]=useState('STUDENT')
  const [respondentRole,setRespondentRole]=useState('STUDENT')
  const [relation,setRelation]=useState('SELF')
  const [perspective,setPerspective]=useState('SELF_REPORT')
  const [targetMode,setTargetMode]=useState('')
  const [preview,setPreview]=useState<null|{tracks:Array<{executionCount:number;subjectCount:number;respondentCount:number}>}>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const base=`/organizations/${organizationId}/activities`
  const path=selected?`${base}/${selected.courseId}`:base
  const resource=resources.find(r=>r.family+':'+r.key+':'+r.version===resourceId)
  const fetchList=async()=>{
    const result=await api<{list:Activity[]}>(base+'?page=1&pageSize=50')
    setList(result.list)
  }
  const fetchDetail=async(courseId:string)=>{
    const data=await api<Detail>(base+'/'+courseId)
    setSelected(data)
    setClassId('')
    setActiveRun(null);setResources([]);setPreview(null)
  }
  useEffect(()=>{
    let live=true
    void api<{list:Activity[]}>(base+'?page=1&pageSize=50')
      .then(result=>{if(live)setList(result.list)})
      .catch(err=>{if(live)setError(err instanceof Error?err.message:'校园活动加载失败')})
    return()=>{live=false}
  },[base,api])
  async function execute(task:()=>Promise<void>){
    setBusy(true);setError('');setNotice('')
    try{await task()}catch(err){setError(err instanceof Error?err.message:'活动操作未完成')}
    finally{setBusy(false)}
  }
  const create=()=>void execute(async()=>{
    const r=await api<{id:string}> (base,'POST',{title,purpose})
    setTitle('');await fetchList();await fetchDetail(r.id)
    setNotice('活动草稿已建立，正式开放需学校管理员审批。')
  })
  const transition=(action:'SUBMIT'|'OPEN'|'PAUSE'|'RESUME'|'CLOSE')=>void execute(async()=>{
    if(!selected)return
    const next=action==='SUBMIT'?await api<{version:number}>(path+'/submit','POST',{
      expectedVersion:selected.version,
    }):await api<{version:number}>(path+'/govern','POST',{
      action,expectedVersion:selected.version,
    })
    await fetchDetail(selected.courseId);await fetchList()
    setNotice('活动状态已更新，版本 '+next.version)
  })
  const allocate=()=>void execute(async()=>{
    if(!selected||!classId)return
    const result=await api<{selected:number}>(path+'/participants','POST',{
      classUnitIds:[classId],requestKey:'school-'+crypto.randomUUID(),
      expectedVersion:selected.version,
    })
    await fetchDetail(selected.courseId)
    setNotice('已按当前获批班级分配 '+result.selected+' 名学生，未关联培训学员。')
  })
  const addTask=()=>void execute(async()=>{
    if(!selected)return
    await api(path+'/tasks','POST',{kind:taskKind,title:taskTitle,content:taskContent})
    setTaskTitle('');setTaskContent('')
    setNotice('已加入活动内容。发布活动前学生不可见。')
  })
  const newRun=()=>void execute(async()=>{
    if(!selected)return
    const run=await api<Run>(path+'/runs','POST',{name:runTitle})
    setRunTitle('')
    await fetchDetail(selected.courseId)
    setActiveRun(run)
    setNotice('已创建独立且未发布的正式测评 Run。')
  })
  const showResources=()=>void execute(async()=>{
    const result=await api<{list:CatalogResource[]}>(path+'/run-resources?page=1')
    setResources(result.list.filter(r=>r.family!=='COGNITIVE'))
    setNotice(result.list.length?'仅显示拥有正式发布版本的测评资源。':'当前没有可供本 Activity 发布的测评资源。')
  })
  const selectResource=(id:string)=>{
    const r=resources.find(x=>x.family+':'+x.key+':'+x.version===id)
    setResourceId(id)
    if(r){
      setSubjectRole(r.subjectRoles[0]??'STUDENT')
      setRespondentRole(r.respondentRoles[0]??'STUDENT')
      setRelation(r.relationshipKinds[0]??'SELF')
      setPerspective(r.perspectives[0]??'SELF_REPORT')
      setTargetMode('')
    }
  }
  const addTrack=()=>void execute(async()=>{
    if(!selected||!activeRun||!resource)return
    const result=await api<unknown>(path+'/runs/'+activeRun.id+'/tracks','POST',{
      resource:{family:resource.family,key:resource.key,version:resource.version},
      subjectSelector:{kind:'ALL_CURRENT'},
      respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:[subjectRole],respondentRoles:[respondentRole],
        relationshipKinds:[relation],perspectives:[perspective],
        analysisMode:resource.analysisMode,
        visibilityPolicyKey:resource.visibilityPolicyKey,
        minimumRespondents:resource.minimumRespondents,
        ...(targetMode?{targetPolicy:{mode:targetMode}}:{}),
      },
    })
    const detail=await api<{run:Run}>(path+'/runs/'+activeRun.id)
    setActiveRun(detail.run)
    setPreview(null)
    setNotice('已添加有版本和科学政策的正式测评 Track；须预览并由学校管理员发布。')
    void result
  })
  const previewRun=()=>void execute(async()=>{
    if(!selected||!activeRun)return
    const r=await api<{tracks:Array<{executionCount:number;subjectCount:number;respondentCount:number}>}>(
      path+'/runs/'+activeRun.id+'/preview','POST',{expectedVersion:activeRun.version})
    setPreview(r)
    setNotice('仅展示人数预览，不展示任何个体心理报告或原始作答。')
  })
  const publishRun=()=>void execute(async()=>{
    if(!selected||!activeRun)return
    if(!window.confirm('确认测评资源、参与名单、许可与科学成熟度已经审核，正式向获批人员发布？'))return
    await api(path+'/runs/'+activeRun.id+'/publish','POST',{expectedVersion:activeRun.version})
    await fetchDetail(selected.courseId)
    setActiveRun(null);setNotice('正式测评已发布。学生仍需以本人身份完成原有 Runtime。')
  })

  return <section className="hs-panel">
    <h2>校园心理健康活动</h2>
    <p>教师准备活动，学校管理员控制开放与暂停。只有已批准班级中的授权学生能看到活动和任务。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    <div className="hs-grid">
      <div><label className="hs-field"><span>新建活动名称</span>
        <input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200}/></label>
        <label className="hs-field"><span>活动主题</span>
          <select value={purpose} onChange={event=>setPurpose(event.target.value as typeof purpose)}>
            {purposeOptions.map(([value,text])=><option key={value} value={value}>{text}</option>)}
          </select></label>
        <button disabled={busy||!title.trim()} onClick={create}>创建活动草稿</button></div>
      <div><label className="hs-field"><span>选择已有活动</span>
        <select value={selected?.courseId??''} onChange={event=>void execute(async()=>{
          const id=event.target.value
          if(id)await fetchDetail(id);else setSelected(null)
        })}>
          <option value="">请选择活动</option>
          {list.map(a=><option key={a.courseId} value={a.courseId}>
            {a.title}（{stateText[a.status]}）</option>)}
        </select></label>
        <button disabled={busy} onClick={()=>void execute(fetchList)}>刷新活动列表</button></div>
    </div>
    {selected&&<div className="hs-activity-detail">
      <h3>{selected.title}</h3>
      <p>状态：{stateText[selected.status]} · 当前授权学生 {selected.participantCount} 人
        · 关联测评 {selected.runs.length} 项</p>
      <div className="hs-actions">
        {actions[selected.status].filter(a=>a.admin===isAdmin||isAdmin).map(a=>
          <button key={a.key} disabled={busy} onClick={()=>transition(a.key)}>{a.label}</button>)}
      </div>
      {selected.status==='DRAFT'&&<>
        <h3>批量选择获批班级</h3>
        <label className="hs-field"><span>班级</span>
          <select value={classId} onChange={event=>setClassId(event.target.value)}>
            <option value="">请选择已审核班级</option>
            {classes.filter(item=>item.unitKind==='CLASS').map(unit=>
              <option value={unit.id} key={unit.id}>{unit.name}</option>)}
          </select></label>
        <button disabled={busy||!classId} onClick={allocate}>幂等分配当前班级学生</button>
        <h3>添加活动内容</h3>
        <label className="hs-field"><span>任务类型</span>
          <select value={taskKind} onChange={event=>setTaskKind(event.target.value as typeof taskKind)}>
            <option value="READING">阅读材料</option><option value="ASSIGNMENT">练习任务</option>
            <option value="CHECKIN">活动记录</option>
          </select></label>
        <label className="hs-field"><span>任务名称</span>
          <input value={taskTitle} onChange={event=>setTaskTitle(event.target.value)}/></label>
        <label className="hs-field"><span>内容</span>
          <textarea rows={4} value={taskContent} onChange={event=>setTaskContent(event.target.value)}/></label>
        <button disabled={busy||!taskTitle.trim()} onClick={addTask}>加入草稿</button>
        <h3>正式心理测评 Run（保持原评分与 FINAL）</h3>
        <label className="hs-field"><span>测评活动名称</span>
          <input value={runTitle} onChange={event=>setRunTitle(event.target.value)}/></label>
        <button disabled={busy||!runTitle.trim()} onClick={newRun}>创建 Run 草稿</button>
      </>}
      {isAdmin&&selected.status==='OPEN'&&<section className="hs-panel">
        <h3>自愿同伴互评 · 安全抽样</h3>
        <p>仅允许已批准的同班学生，并要求学生本人及其有效监护人分别完成知情同意。
          同学身份不自评，至少五人达到隐私阈值；测量资源必须支持群体汇总分析，个人结果不自动披露。</p>
        <label className="hs-field"><span>随机评价人数（每名参与者）</span>
          <select value={peersPerRespondent} onChange={e=>setPeersPerRespondent(Number(e.target.value))}>
            <option value="1">每人评价 1 位同学</option><option value="2">每人评价 2 位同学</option>
            <option value="3">每人评价 3 位同学</option>
          </select></label>
        <label className="hs-field"><span>本次互评分配班级</span>
          <select value={classId} onChange={event=>setClassId(event.target.value)}>
            <option value="">请选择本活动内已获批准的班级</option>
            {classes.filter(unit=>unit.unitKind==='CLASS').map(unit=>
              <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <p>请选定本活动内已获批、至少五名学生及其监护人自愿同意的班级。</p>
        <button disabled={busy||!classId} onClick={()=>void execute(async()=>{
          if(!window.confirm('确认同班、至少五名学生及监护人已自愿同意，并按群体研究使用？'))return
          const r=await api<{cohortSize:number;assignments:number}>(path+'/peer-allocations',
            'POST',{classUnitId:classId,peersPerRespondent})
          setNotice('已为 '+r.cohortSize+' 人生成 '+r.assignments+
            ' 组非自评关系。任何测评作答仍需正式 Run 及科学政策。')
        })}>按同意记录随机生成非自评配对</button>
      </section>}
      <h3>关联测评</h3>
      {selected.runs.length===0?<p>暂无测评。可先使用阅读与练习内容。</p>:
        <div className="hs-actions">{selected.runs.map(r=>
          <button disabled={busy} key={r.runId} onClick={()=>void execute(async()=>{
            const d=await api<{run:Run}>(path+'/runs/'+r.runId)
            setActiveRun(d.run);setPreview(null)
          })}>{r.name} · {r.status}</button>)}</div>}
      {activeRun&&<div className="hs-task-detail">
        <h3>测评 Run：{activeRun.name}（{activeRun.status}）</h3>
        {selected.status==='DRAFT'&&activeRun.status==='DRAFT'&&<>
          <button disabled={busy} onClick={showResources}>查看已发布、受授权的测评资源</button>
          {resources.length>0&&<>
            <label className="hs-field"><span>测评资源 · 精确版本</span>
              <select value={resourceId} onChange={event=>selectResource(event.target.value)}>
                <option value="">请选择</option>
                {resources.map(r=><option key={r.family+':'+r.key+':'+r.version}
                  value={r.family+':'+r.key+':'+r.version}>
                  {r.title} · {r.family} v{r.version} · {r.scientificMaturity}</option>)}
              </select></label>
            {resource&&<div className="hs-grid">
              {([
                ['subject','受评对象',subjectRole,setSubjectRole,resource.subjectRoles],
                ['respondent','答题者',respondentRole,setRespondentRole,resource.respondentRoles],
                ['relation','关系',relation,setRelation,resource.relationshipKinds],
                ['perspective','评价角度',perspective,setPerspective,resource.perspectives],
              ] as const).map(([key,label,value,setter,options])=>
                <label className="hs-field" key={key}><span>{label}</span>
                  <select value={value} onChange={event=>setter(event.target.value)}>
                    {options.map(option=><option key={option} value={option}>{option}</option>)}
                  </select></label>)}
              {resource.allowedTargetModes&&resource.allowedTargetModes.length>0&&
                <label className="hs-field"><span>课程/教师目标（需要明确选择）</span>
                  <select value={targetMode} onChange={event=>setTargetMode(event.target.value)}>
                    <option value="">未指定</option>
                    {resource.allowedTargetModes.filter(mode=>mode!=='COURSE_TEACHER').map(mode=>
                      <option key={mode} value={mode}>{mode}</option>)}
                  </select></label>}
            </div>}
            <button disabled={busy||!resource} onClick={addTrack}>以当前版本配置 Track</button>
          </>}
        </>}
        {activeRun.status==='DRAFT'&&<button disabled={busy}
          onClick={previewRun}>预览合法参与者数量</button>}
        {preview&&<p role="status">预览：
          {preview.tracks.map((t,i)=><span key={i}> Track {i+1}（作答 {t.executionCount}，
            受评对象 {t.subjectCount}）</span>)}</p>}
        {isAdmin&&selected.status==='OPEN'&&activeRun.status==='DRAFT'&&
          <button className="hs-primary" disabled={busy||!preview} onClick={publishRun}>
            学校管理员正式发布测评</button>}
      </div>}
    </div>}
  </section>
}
