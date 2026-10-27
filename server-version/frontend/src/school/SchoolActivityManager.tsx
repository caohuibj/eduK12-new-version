import {SchoolActivityCollection} from './SchoolActivityCollection'
import './school-activity-collection.css'
import './school-activity-configuration.css'
import {SelectedToolOutline} from '../modules/assessment-core/composition/SelectedToolOutline'
import {EducationPrivateScalePicker} from '../components/education-tools/EducationPrivateScalePicker'
import {EducationAssessmentResourcePicker} from '../components/education-tools/EducationAssessmentResourcePicker'
import type {EducationAssessmentResourceAdapter} from '../api/educationAssessmentResources'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {SchoolTaskHelp} from './SchoolTaskHelp'
import type { SchoolApi } from './SchoolRecovery'
import { schoolActivityNextStep, schoolRunStatusText } from './school-activity-workflow'

const resourceFamilyText:Record<string,string>={FORM:'表单',SCALE:'量表',BUNDLE:'组合测评',SITUATIONAL:'情境测评',COGNITIVE:'认知测评'}

type ActivityInputs={taskTitle:string;taskContent:string;taskKind:'ASSIGNMENT'|'READING'|'CHECKIN';runTitle:string}
const emptyActivityInputs:ActivityInputs={taskTitle:'',taskContent:'',taskKind:'READING',runTitle:''}
function ActivityLayout({compact,className,children}:{compact:boolean;className:string;children:ReactNode}){return compact?<div className={className}>{children}</div>:<>{children}</>}
type ActivityPanel='participants'|'content'|'assessments'|'results'
const activityPanels:readonly {id:ActivityPanel;label:string}[]=[{id:'participants',label:'班级与参与者'},{id:'content',label:'阅读／练习／打卡'},{id:'assessments',label:'正式测评批次'},{id:'results',label:'进度与结果说明'}]
type ActivityState='DRAFT'|'SUBMITTED'|'OPEN'|'PAUSED'|'CLOSED'
type Activity={
  courseId:string;organizationId:string;title:string;purpose:string;status:ActivityState
  version:number;participantCount:number;runCount:number
}
type ActivityPage={list:Activity[];hasMore?:boolean;page?:number}
type RunTrackSummary={id:string;resourceFamily:string;resourceKey:string;resourceVersion:string}
type Run={id:string;name:string;status:string;version:number;tracks?:RunTrackSummary[]}
type RunDetail={run:Run;tracks?:RunTrackSummary[]}
type ActivityCapabilities={canSubmit:boolean;canOpen:boolean;canPause:boolean;canResume:boolean;canClose:boolean;canPublishRun:boolean;ownPsychologyPublisher:boolean}
type RunCapabilities={canPublish:boolean;canClose:boolean;canCancel:boolean}
type Detail=Activity&{capabilities?:ActivityCapabilities;runs:Array<{runId:string;name:string;status:string;capabilities?:RunCapabilities}>}
type Unit={id:string;unitKind:'CLASS'|'GRADE';name:string}
type CatalogResource={
  title:string;family:'SCALE'|'BUNDLE'|'FORM'|'SITUATIONAL'|'COGNITIVE'
  key:string;version:string;scientificMaturity:string
  subjectRoles:string[];respondentRoles:string[];relationshipKinds:string[]
  perspectives:string[];analysisMode:string;visibilityPolicyKey:string
  minimumRespondents:number|null;allowedTargetModes?:string[]
}
const selectableRelationships=(resource:CatalogResource)=>resource.key.startsWith('library-scale:')
  ?resource.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'):resource.relationshipKinds
const resourceIdentity=(resource:CatalogResource)=>resource.family+':'+resource.key+':'+resource.version
const mergeResources=(previous:CatalogResource[],next:CatalogResource[])=>
  Array.from(new Map([...previous,...next].map(resource=>[resourceIdentity(resource),resource])).values())
const administrationLabel=(resource:CatalogResource)=>{
  if(!resource.key.startsWith('library-scale:'))return ''
  const respondent=resource.respondentRoles[0]
  return respondent==='PARENT'?' · 家长评学生':respondent==='TEACHER'?' · 教师评学生':respondent==='STUDENT'?' · 学生自评':' · 按版本适用声明'
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

export function SchoolActivityManager({api,organizationId,isAdmin,classes,canAuthorPrivateTools=false,actorKey='',compact=false,assessmentResources}: {
  api:SchoolApi;organizationId:string;isAdmin:boolean;classes:Unit[];canAuthorPrivateTools?:boolean;actorKey?:string;compact?:boolean;assessmentResources?:EducationAssessmentResourceAdapter
}){
  const [list,setList]=useState<Activity[]>([])
  const [listLoading,setListLoading]=useState(true),[listError,setListError]=useState('')
  const [listPage,setListPage]=useState(1),[listHasMore,setListHasMore]=useState(false)
  const listRequest=useRef(0),listMore=useRef(false)
  const [selected,setSelected]=useState<Detail|null>(null)
  const [title,setTitle]=useState('')
  const [purpose,setPurpose]=useState<(typeof purposeOptions)[number][0]>('STUDENT_WELLBEING')
  const [classId,setClassId]=useState('')
  const [allocationClassIds,setAllocationClassIds]=useState<string[]>([])
  const [eligibleClasses,setEligibleClasses]=useState<Array<{id:string;name:string}>>([])
  const [classesLoading,setClassesLoading]=useState(false)
  const [classesError,setClassesError]=useState('')
  const [classesRetry,setClassesRetry]=useState(0)
  const detailRequest=useRef(0)
  const currentBase=useRef('')
  const [peersPerRespondent,setPeersPerRespondent]=useState(1)
  const [activityInputs,setActivityInputs]=useState<Record<string,ActivityInputs>>({})
  const [panel,setPanel]=useState<ActivityPanel>('participants')
  const createPanel=useRef<HTMLDetailsElement>(null)
  const inputKey=actorKey+':'+organizationId+':'+(selected?.courseId??'')
  const {taskTitle,taskContent,taskKind,runTitle}=activityInputs[inputKey]??emptyActivityInputs
  const setInput=<K extends keyof ActivityInputs,>(key:K,value:ActivityInputs[K])=>setActivityInputs(previous=>({...previous,[inputKey]:{...emptyActivityInputs,...previous[inputKey],[key]:value}}))
  const setTaskTitle=(value:string)=>setInput('taskTitle',value)
  const setTaskContent=(value:string)=>setInput('taskContent',value)
  const setTaskKind=(value:ActivityInputs['taskKind'])=>setInput('taskKind',value)
  const setRunTitle=(value:string)=>setInput('runTitle',value)
  const [resources,setResources]=useState<CatalogResource[]>([])
  const [resourceCursor,setResourceCursor]=useState<string|null>(null)
  const [resourceLoading,setResourceLoading]=useState(false)
  const [resourceError,setResourceError]=useState('')
  const [resourcesRead,setResourcesRead]=useState(false)
  const resourceRequest=useRef(0)
  const runRequest=useRef(0)
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
  currentBase.current=base
  const path=selected?`${base}/${selected.courseId}`:base
  const activityPath=useRef(path)
  activityPath.current=path
  const resourceScope=JSON.stringify([actorKey,path,activeRun?.id??'',activeRun?.version??null])
  const resourceContext=useRef({scope:resourceScope,api})
  resourceContext.current={scope:resourceScope,api}
  const nextStep=selected?schoolActivityNextStep(selected.status,selected.runs.map(run=>run.status),selected.capabilities?.ownPsychologyPublisher===true):null
  const canInspectRuns=!!selected&&['DRAFT','SUBMITTED','OPEN'].includes(selected.status)
  const resource=resources.find(r=>r.family+':'+r.key+':'+r.version===resourceId)
  const libraryTeacherReport=Boolean(resource?.key.startsWith('library-scale:')
    &&resource.subjectRoles.length===1&&resource.subjectRoles[0]==='STUDENT'
    &&resource.respondentRoles.length===1&&resource.respondentRoles[0]==='TEACHER'
    &&resource.perspectives.length===1&&resource.perspectives[0]==='TEACHER_REPORT')
  const homeroomOnly=libraryTeacherReport&&!isAdmin&&selected?.capabilities?.ownPsychologyPublisher===true
  const targetModes=(resource?.allowedTargetModes??[]).filter(mode=>mode!=='COURSE_TEACHER'
    &&(!libraryTeacherReport||['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS'].includes(mode))
    &&(!homeroomOnly||mode==='HOMEROOM_TEACHER'))
  useEffect(()=>{setTargetMode('')},[resourceId,isAdmin,selected?.capabilities?.ownPsychologyPublisher])
  const fetchList=useCallback(async()=>{
    const token=++listRequest.current
    listMore.current=false;setListLoading(true);setListError('')
    try{
      const result=await api<ActivityPage>(base+'?page=1&pageSize=50')
      if(token!==listRequest.current)return
      setList(result.list);setListPage(1);setListHasMore(result.hasMore===true)
    }catch(err){if(token!==listRequest.current)return;setListError(err instanceof Error?err.message:'校园活动加载失败');throw err}
    finally{if(token===listRequest.current)setListLoading(false)}
  },[api,base])
  const loadMoreActivities=async()=>{
    if(listLoading||listMore.current||!listHasMore)return
    const token=++listRequest.current,next=listPage+1
    listMore.current=true;setListLoading(true);setListError('')
    try{
      const result=await api<ActivityPage>(base+`?page=${next}&pageSize=50`)
      if(token!==listRequest.current)return
      setList(previous=>Array.from(new Map([...previous,...result.list].map(item=>[item.courseId,item])).values()))
      setListPage(next);setListHasMore(result.hasMore===true)
    }catch(err){if(token===listRequest.current)setListError(err instanceof Error?err.message:'更多活动读取失败，请重试')}
    finally{if(token===listRequest.current){listMore.current=false;setListLoading(false)}}
  }
  const fetchDetail=async(courseId:string)=>{
    const request=++detailRequest.current
    resourceRequest.current++;runRequest.current++
    setSelected(null);setClassId('');setAllocationClassIds([]);setEligibleClasses([])
    const data=await api<Detail>(base+'/'+courseId)
    if(request!==detailRequest.current||currentBase.current!==base)return
    setSelected(data)
    setClassesRetry(value=>value+1)
    setClassId('')
    setActiveRun(null);setResources([]);setPreview(null)
  }
  useEffect(()=>{
    ++detailRequest.current
    setSelected(null);setClassId('');setAllocationClassIds([]);setEligibleClasses([]);setList([]);setPanel('participants')
    setListPage(1);setListHasMore(false)
    void fetchList().catch(()=>{})
    return()=>{listRequest.current++;listMore.current=false;resourceRequest.current++;runRequest.current++}
  },[base,api,actorKey,fetchList])
  useEffect(()=>{
    resourceRequest.current++
    setResources([]);setResourceId('');setResourceCursor(null)
    setResourceLoading(false);setResourceError('');setResourcesRead(false)
  },[resourceScope,api])
  const editableCourseId=selected?.organizationId===organizationId&&selected.status==='DRAFT'
    ?selected.courseId:null
  useEffect(()=>{
    let live=true
    setEligibleClasses([]);setClassId('');setAllocationClassIds([]);setClassesError('')
    if(!editableCourseId){setClassesLoading(false);return}
    setClassesLoading(true)
    void api<{list:Array<{id:string;name:string}>}>(`${base}/${editableCourseId}/eligible-classes`)
      .then(result=>{if(live)setEligibleClasses(result.list)})
      .catch(err=>{if(live)setClassesError(err instanceof Error?err.message:'可选班级加载失败')})
      .finally(()=>{if(live)setClassesLoading(false)})
    return()=>{live=false}
  },[api,base,editableCourseId,classesRetry])
  async function execute(task:()=>Promise<void>){
    setBusy(true);setError('');setNotice('')
    try{await task()}catch(err){setError(err instanceof Error?err.message:'活动操作未完成')}
    finally{setBusy(false)}
  }
  const create=()=>void execute(async()=>{
    const r=await api<{id:string}> (base,'POST',{title,purpose})
    setTitle('');await fetchList();await fetchDetail(r.id);setPanel('participants')
    if(compact)createPanel.current?.removeAttribute('open')
    setNotice('活动草稿已建立，完成配置后由当前获授权人员开放。')
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
  const allocationReady=Boolean(editableCourseId&&!classesLoading&&!classesError&&allocationClassIds.length>0&&allocationClassIds.length<=40&&allocationClassIds.every(id=>eligibleClasses.some(unit=>unit.id===id)))
  const allocate=()=>void execute(async()=>{
    if(!selected||!allocationReady)return
    const result=await api<{selected:number}>(path+'/participants','POST',{
      classUnitIds:allocationClassIds,requestKey:'school-'+crypto.randomUUID(),
      expectedVersion:selected.version,
    })
    await fetchDetail(selected.courseId)
    setNotice('已按所选 '+allocationClassIds.length+' 个班级分配 '+result.selected+' 名学生。')
  })
  const addTask=()=>void execute(async()=>{
    if(!selected)return
    await api(path+'/tasks','POST',{kind:taskKind,title:taskTitle,content:taskContent})
    setTaskTitle('');setTaskContent('')
    setNotice(compact?`已加入「${selected.title}」的活动内容。发布活动前学生不可见。`:'已加入活动内容。发布活动前学生不可见。')
  })
  const newRun=()=>void execute(async()=>{
    if(!selected)return
    const run=await api<Run>(path+'/runs','POST',{name:runTitle})
    setRunTitle('')
    await fetchDetail(selected.courseId)
    setActiveRun({...run,tracks:[]})
    setNotice('已创建独立且未发布的测评批次。')
  })
  const showResources=async(cursor?:string)=>{
    if(!selected||!activeRun)return
    const request=++resourceRequest.current
    const current=()=>request===resourceRequest.current&&resourceContext.current.scope===resourceScope&&resourceContext.current.api===api
    setResourceLoading(true);setResourceError('')
    try{
      const result=await api<{list:CatalogResource[];nextCursor?:string|null}>(
        path+'/run-resources'+(cursor?'?cursor='+encodeURIComponent(cursor):'?page=1'))
      if(!current())return
      // Registered education deliveries use the scoped, authorized adapter below.
      // Do not accept an identity-only resource via the legacy catalog projection.
      const visibleResources=result.list.filter(resource=>!resource.key.startsWith('education-assessment:'))
      setResources(previous=>mergeResources(cursor?previous:[],visibleResources))
      setResourceCursor(result.nextCursor??null);setResourcesRead(true)
      if(!cursor)setResourceId(previous=>visibleResources.some(resource=>resourceIdentity(resource)===previous)?previous:'')
    }catch(error){
      if(current())setResourceError(error instanceof Error?error.message:'授权测评资源读取失败，请重试。')
    }finally{
      if(current())setResourceLoading(false)
    }
  }
  const selectResource=(id:string)=>{
    const r=resources.find(x=>x.family+':'+x.key+':'+x.version===id)
    setResourceId(id)
    if(r){
      setSubjectRole(r.subjectRoles[0]??'STUDENT')
      setRespondentRole(r.respondentRoles[0]??'STUDENT')
      setRelation(selectableRelationships(r)[0]??'')
      setPerspective(r.perspectives[0]??'SELF_REPORT')
      setTargetMode('')
    }
  }
  const addTrack=()=>void execute(async()=>{
    if(!selected||!activeRun||!resource)return
    if(resource.key.startsWith('library-scale:')&&(!selectableRelationships(resource).includes(relation)||targetMode==='COURSE_TEACHER'))
      throw new Error('课程师生施测关系暂未接通，请使用已声明的班级师生关系。')
    if(libraryTeacherReport&&!targetModes.includes(targetMode))
      throw new Error(homeroomOnly?'请明确选择已授权的班主任作答目标。':'请明确选择当前版本支持的教师作答目标。')
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
    const detail=await api<RunDetail>(path+'/runs/'+activeRun.id)
    setActiveRun({...detail.run,tracks:detail.tracks})
    setPreview(null)
    setNotice('已添加有版本和科学政策的测评项目；须预览并由获授权人员发布。')
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
    setActiveRun(null);setNotice('正式测评已发布。学生仍需以本人身份完成原有作答流程。')
  })

  const chooseActivity=(id:string)=>void execute(async()=>{
    setPanel('participants');if(compact)createPanel.current?.removeAttribute('open')
    if(id)await fetchDetail(id);else {++detailRequest.current;setSelected(null)}
  })
  const createFields=<><label className="hs-field"><span>新建活动名称</span>
        <input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200}/></label>
        <label className="hs-field"><span>活动主题</span>
          <select value={purpose} onChange={event=>setPurpose(event.target.value as typeof purpose)}>
            {purposeOptions.map(([value,text])=><option key={value} value={value}>{text}</option>)}
          </select></label>
        <button disabled={busy||!title.trim()} onClick={create}>创建活动草稿</button></>
  const lifecycleControls=selected?<>      {nextStep&&<section aria-label="活动下一步"><p>下一负责角色：{nextStep.owner}</p><p>{nextStep.text}</p></section>}
      <div className="hs-actions">
        {actions[selected.status].filter(a=>selected.capabilities?.[({SUBMIT:'canSubmit',OPEN:'canOpen',PAUSE:'canPause',RESUME:'canResume',CLOSE:'canClose'} as const)[a.key]]===true).map(a=>
          <button key={a.key} disabled={busy} onClick={()=>transition(a.key)}>{selected.capabilities?.ownPsychologyPublisher&&a.key==='SUBMIT'?'完成配置':selected.capabilities?.ownPsychologyPublisher&&a.key==='OPEN'?'开放本人活动':a.label}</button>)}
      </div>
</>:null
  return <section className={"hs-panel hs-activity-manager"+(compact?" hs-activity-manager--compact":"")}>

    <h2>校园心理健康活动</h2>
    {!compact&&<p>教师准备活动；学校管理员或获授权的心理教师控制其权限内活动的开放与暂停。只有已批准班级中的授权学生能看到活动和任务。</p>}
    {error&&error!==listError&&<p className="hs-alert" role="alert">{error}</p>}
    {!compact&&listError&&<p className="hs-alert" role="alert">{listError}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {compact?<SchoolActivityCollection key={actorKey+':'+organizationId} items={list} selectedId={selected?.courseId} selectedTitle={selected?.title} busy={busy} loading={listLoading} error={listError} hasMore={listHasMore} onRefresh={()=>void execute(fetchList)} onMore={()=>void loadMoreActivities()} onSelect={chooseActivity} helpControl={<SchoolTaskHelp label="活动与发布说明" buttonText="活动说明"><p>教师准备活动；学校管理员或获授权的心理教师控制其权限内活动的开放与暂停。只有已批准班级中的授权学生能看到活动和任务。</p></SchoolTaskHelp>} createControl={<details className="hs-activity-create" ref={createPanel}><summary>新建活动</summary><div className="hs-activity-create-fields">{createFields}</div></details>}/>:<div className="hs-grid hs-activity-entry-grid">
      {compact?<details className="hs-activity-create" ref={createPanel}><summary>新建活动</summary><div className="hs-activity-create-fields">{createFields}</div></details>:<div className="hs-activity-create"><h3>准备新活动</h3>{createFields}</div>}
      <div className="hs-activity-select"><h3>{compact?'选择要配置的活动':'继续已有活动'}</h3><label className="hs-field"><span>选择已有活动</span>
        <select value={selected?.courseId??''} onChange={event=>chooseActivity(event.target.value)}>
          <option value="">请选择活动</option>
          {list.map(a=><option key={a.courseId} value={a.courseId}>
            {a.title}（{stateText[a.status]}）</option>)}
        </select></label>
        <button disabled={busy} onClick={()=>void execute(fetchList)}>刷新活动列表</button></div>
    </div>}
    {selected&&<div className="hs-activity-detail">
      {!compact&&<h3>{selected.title}</h3>}
      <p className="hs-activity-summary">状态：{selected.status==='SUBMITTED'&&selected.capabilities?.ownPsychologyPublisher?'待开放':stateText[selected.status]} · 当前授权学生 {selected.participantCount} 人
        · 关联测评 {selected.runs.length} 项</p>
      {!compact&&lifecycleControls}
      {compact&&<nav className="hs-activity-config-tabs" aria-label="活动配置分区">{activityPanels.map(item=><button type="button" key={item.id} aria-pressed={panel===item.id} aria-controls={'hs-activity-panel-'+item.id} onClick={()=>setPanel(item.id)}>{item.label}</button>)}</nav>}
      <section className="hs-activity-config-panel" id="hs-activity-panel-participants" aria-label="班级与参与者" hidden={compact&&panel!=='participants'}>
        {compact&&selected.status!=='DRAFT'&&<p>当前活动已离开准备阶段，参与范围按现有班级分配保留。</p>}
        {selected.status==='DRAFT'&&<>
        {eligibleClasses.length>0&&<fieldset className="hs-activity-class-picker" disabled={busy||classesLoading||!!classesError}>
          <legend>选择获批班级（可多选）</legend>
          <div className="hs-activity-class-options">{eligibleClasses.map(unit=><label key={unit.id}><input type="checkbox" checked={allocationClassIds.includes(unit.id)} disabled={!allocationClassIds.includes(unit.id)&&allocationClassIds.length>=40} onChange={event=>{const checked=event.target.checked;setAllocationClassIds(previous=>checked?[...new Set([...previous,unit.id])].slice(0,40):previous.filter(id=>id!==unit.id))}}/><span>{unit.name}</span></label>)}</div>
          <div className="hs-activity-class-selection"><span role="status">已选 {allocationClassIds.length} / 40 个班级</span><button type="button" disabled={!allocationClassIds.length} onClick={()=>setAllocationClassIds([])}>清空选择</button></div>
          <p className="hs-activity-class-hint">勾选用于本次加入，取消勾选不会移除已加入的学生。</p>
        </fieldset>}
        {classesLoading&&<p role="status">正在加载可分配班级…</p>}
        {classesError&&<div><p role="alert">{classesError}</p>
          <button disabled={classesLoading} onClick={()=>setClassesRetry(value=>value+1)}>重试加载班级</button></div>}
        {!classesLoading&&!classesError&&eligibleClasses.length===0&&<p>当前没有可分配的获批班级。心理教师可选择本校获批班级，普通教师仅能选择本人有效任教指派的班级。</p>}
        <button disabled={busy||!allocationReady} onClick={allocate}>加入所选班级学生</button>
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
            ' 组非自评关系。任何测评作答仍需正式发布的测评批次及科学政策。')
        })}>按同意记录随机生成非自评配对</button>
      </section>}
      </section>
      <section className="hs-activity-config-panel" id="hs-activity-panel-content" aria-label="阅读、练习与打卡" hidden={compact&&panel!=='content'}>
        {selected.status==='DRAFT'&&<ActivityLayout compact={compact} className="hs-activity-content-create">{!compact&&<h3>添加活动内容</h3>}
        <label className="hs-field hs-activity-content-kind"><span>任务类型</span>
          <select value={taskKind} onChange={event=>setTaskKind(event.target.value as typeof taskKind)}>
            <option value="READING">阅读材料</option><option value="ASSIGNMENT">练习任务</option>
            <option value="CHECKIN">活动记录</option>
          </select></label>
        <label className="hs-field hs-activity-content-title"><span>任务名称</span>
          <input value={taskTitle} onChange={event=>setTaskTitle(event.target.value)}/></label>
        <label className="hs-field hs-activity-content-body"><span>内容</span>
          <textarea rows={4} value={taskContent} onChange={event=>setTaskContent(event.target.value)}/></label>
        <button disabled={busy||!taskTitle.trim()} onClick={addTask}>{compact?'加入当前活动草稿':'加入草稿'}</button>
</ActivityLayout>}
        {compact&&selected.status!=='DRAFT'&&<p>活动已离开准备阶段，当前不能在这里添加阅读、练习或记录。</p>}
      </section>
      <section className="hs-activity-config-panel" id="hs-activity-panel-assessments" aria-label="正式测评批次" hidden={compact&&panel!=='assessments'}>
        <ActivityLayout compact={compact} className="hs-activity-batch-toolbar">
        {selected.status==='DRAFT'&&<ActivityLayout compact={compact} className="hs-activity-run-create">{!compact&&<h3>准备测评批次</h3>}
        <label className="hs-field"><span>{compact?'测评批次名称':'测评活动名称'}</span>
          <input value={runTitle} onChange={event=>setRunTitle(event.target.value)}/></label>
        <button disabled={busy||!runTitle.trim()} onClick={newRun}>{compact?'创建测评批次草稿':'创建测评草稿'}</button>
      </ActivityLayout>}
      {compact&&<SchoolTaskHelp label="测评批次与发布说明" buttonText="发布说明"><p>活动开放与测评发布是两个步骤。只有获授权人员正式发布的测评批次才会产生可作答任务。</p></SchoolTaskHelp>}
      </ActivityLayout>
      {!compact&&<><h3>2. 发布 · 测评批次</h3><p>活动开放与测评发布是两个步骤。只有获授权人员正式发布的测评批次才会产生可作答任务。</p></>}
      {!canInspectRuns&&<p>当前活动状态不支持读取测评批次详情；以下仅展示活动关联状态。</p>}
      {selected.runs.length===0?<p>暂无测评。可先使用阅读与练习内容。</p>:
        <div className={compact?'hs-activity-run-list':'hs-actions'}>{selected.runs.map(r=><ActivityLayout key={r.runId} compact={compact} className="hs-activity-run-row">
          <button aria-pressed={compact?activeRun?.id===r.runId:undefined} disabled={busy||!canInspectRuns} key={r.runId} onClick={()=>void execute(async()=>{
            const request=++runRequest.current
            resourceRequest.current++;setActiveRun(null);setPreview(null)
            const d=await api<RunDetail>(path+'/runs/'+r.runId)
            if(request!==runRequest.current||activityPath.current!==path)return
            setActiveRun({...d.run,tracks:d.tracks})
          })}>{r.name} · {schoolRunStatusText(r.status)}</button>
          {(r.capabilities?.canClose||r.capabilities?.canCancel)?<div key={'lifecycle-'+r.runId} className="hs-actions">
        {r.capabilities.canClose&&<button aria-label={compact?`收尾 ${r.name}`:undefined} disabled={busy} onClick={()=>void execute(async()=>{
          if(!window.confirm('停止该批次的新作答；已开始的作答按原有规则继续。确认收尾？'))return
          await api(path+'/runs/'+r.runId+'/close','POST',{})
          await fetchDetail(selected.courseId)
        })}>{compact?"收尾":`收尾 ${r.name}`}</button>}
        {r.capabilities.canCancel&&<button aria-label={compact?`取消 ${r.name}`:undefined} disabled={busy} onClick={()=>void execute(async()=>{
          if(!window.confirm('取消该批次尚未开始的任务；存在进行中作答时系统会拒绝取消。确认？'))return
          await api(path+'/runs/'+r.runId+'/cancel','POST',{})
          await fetchDetail(selected.courseId)
        })}>{compact?"取消":`取消 ${r.name}`}</button>}
      </div>:null}
        </ActivityLayout>)}</div>}
      {activeRun&&<div className={compact?"hs-task-detail hs-activity-run-editor":"hs-task-detail"}>
        <h3 className={compact?'hs-visually-hidden':undefined}>测评批次：{activeRun.name}（{schoolRunStatusText(activeRun.status)}）</h3>
        <details><summary>技术详情</summary><p>Run ID：{activeRun.id} · 状态：{activeRun.status} · 版本：{activeRun.version}</p>{compact&&<ul className="hs-activity-track-identifiers">{activeRun.tracks?.map(track=><li key={track.id}>{track.resourceFamily} · {track.resourceKey} · 固定版本：{track.resourceVersion}</li>)}</ul>}</details>
        <SelectedToolOutline className="hs-selected-tool-outline" heading={compact?'已配置测评项目':'已选工具大纲'} items={activeRun.tracks?.map((track,index)=>({
          id:track.id,kind:compact?(resourceFamilyText[track.resourceFamily]??track.resourceFamily):track.resourceFamily,version:track.resourceVersion,
          title:resources.find(resource=>resource.family===track.resourceFamily&&resource.key===track.resourceKey
            &&resource.version===track.resourceVersion)?.title??(compact?`${resourceFamilyText[track.resourceFamily]??'测评项目'} ${index+1}`:track.resourceKey),
        }))}/>
        {selected.status==='DRAFT'&&activeRun.status==='DRAFT'&&<>
          <EducationAssessmentResourcePicker
            scope={{product:'SCHOOL',organizationId,actorKey,workflowId:selected.courseId,runId:activeRun.id,expectedVersion:activeRun.version}}
            adapter={!compact||panel==='assessments'?assessmentResources:undefined} disabled={busy} onBusy={setBusy}
            onRefresh={async()=>{
              const context=resourceContext.current
              const data=await api<RunDetail>(path+'/runs/'+activeRun.id)
              if(resourceContext.current.scope===context.scope&&resourceContext.current.api===context.api){setActiveRun({...data.run,tracks:data.tracks});setPreview(null)}
            }}/>
          <ActivityLayout compact={compact} className="hs-activity-private-pickers">
          {canAuthorPrivateTools&&actorKey&&<EducationPrivateScalePicker
            key={`private:${actorKey}:${organizationId}:${selected.courseId}:${activeRun.id}`}
            entry="SCHOOL" organizationId={organizationId} actorKey={actorKey} scopeKey={`${selected.courseId}:${activeRun.id}`}
            api={api} endpoint={path+'/runs/'+activeRun.id+'/tracks'} expectedVersion={activeRun.version}
            disabled={busy} homeroomOnly={!isAdmin&&selected.capabilities?.ownPsychologyPublisher===true}
            onBusy={setBusy} onRefresh={async()=>{
              const context=resourceContext.current
              const data=await api<RunDetail>(path+'/runs/'+activeRun.id)
              if(resourceContext.current.scope===context.scope&&resourceContext.current.api===context.api){setActiveRun({...data.run,tracks:data.tracks});setPreview(null)}
            }}/>}
          {canAuthorPrivateTools&&actorKey&&<EducationPrivateScalePicker kind="FORM"
            key={`private-form:${actorKey}:${organizationId}:${selected.courseId}:${activeRun.id}`}
            entry="SCHOOL" organizationId={organizationId} actorKey={actorKey} scopeKey={`${selected.courseId}:${activeRun.id}`}
            api={api} endpoint={path+'/runs/'+activeRun.id+'/tracks'} expectedVersion={activeRun.version}
            disabled={busy} homeroomOnly={!isAdmin&&selected.capabilities?.ownPsychologyPublisher===true}
            onBusy={setBusy} onRefresh={async()=>{
              const context=resourceContext.current
              const data=await api<RunDetail>(path+'/runs/'+activeRun.id)
              if(resourceContext.current.scope===context.scope&&resourceContext.current.api===context.api){setActiveRun({...data.run,tracks:data.tracks});setPreview(null)}
            }}/>}
          </ActivityLayout>
          <button disabled={busy||resourceLoading} onClick={()=>void showResources()}>查看已发布、受授权的测评资源</button>
          {resourceLoading&&<p role="status">正在读取授权测评资源…</p>}
          {resourceError&&<div><p role="alert">{resourceError} 已配置的测评项目不受影响。</p>
            <button disabled={busy||resourceLoading} onClick={()=>void showResources()}>重新读取测评目录</button></div>}
          {resourceCursor&&<button disabled={busy||resourceLoading}
            onClick={()=>void showResources(resourceCursor)}>继续加载测评资源</button>}
          {resourcesRead&&!resourceLoading&&!resourceError&&resources.length===0&&<p>
            {resourceCursor?'当前页暂无可选资源，仍可继续加载。':'当前目录没有可供本活动使用的测评资源。'}</p>}
          {resources.length>0&&<>
            <label className="hs-field"><span>测评资源 · 精确版本</span>
              <select value={resourceId} onChange={event=>selectResource(event.target.value)}>
                <option value="">请选择</option>
                {resources.map(r=><option key={r.family+':'+r.key+':'+r.version}
                  value={r.family+':'+r.key+':'+r.version}>
                  {r.title}{administrationLabel(r)} · {r.family} v{r.version} · {r.scientificMaturity}</option>)}
              </select></label>
            {resource?.key.startsWith('library-scale:')&&resource.relationshipKinds.some(kind=>['CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT'].includes(kind))&&
              <p>课程师生施测关系暂未接通，请使用班级师生关系；不会改动该版本的适用声明。</p>}
            {resource&&<div className="hs-grid">
              {([
                ['subject','受评对象',subjectRole,setSubjectRole,resource.subjectRoles],
                ['respondent','答题者',respondentRole,setRespondentRole,resource.respondentRoles],
                ['relation','关系',relation,setRelation,selectableRelationships(resource)],
                ['perspective','评价角度',perspective,setPerspective,resource.perspectives],
              ] as const).map(([key,label,value,setter,options])=>
                <label className="hs-field" key={key}><span>{label}</span>
                  <select value={value} onChange={event=>setter(event.target.value)}>
                    {options.map(option=><option key={option} value={option}>{option}</option>)}
                  </select></label>)}
              {(libraryTeacherReport||targetModes.length>0)&&
                <label className="hs-field"><span>{homeroomOnly?'班主任作答目标（需要明确选择）':'课程/教师目标（需要明确选择）'}</span>
                  <select value={targetMode} onChange={event=>setTargetMode(event.target.value)}>
                    <option value="">未指定</option>
                    {targetModes.map(mode=>
                      <option key={mode} value={mode}>{libraryTeacherReport?(mode==='HOMEROOM_TEACHER'?'班主任':'全部班级教师'):mode}</option>)}
                  </select></label>}
            </div>}
            {libraryTeacherReport&&<p>{homeroomOnly?'本人活动的教师他评仅支持班主任，请明确选择；不会增加个体报告读取权限。':'请明确选择班主任或全部班级教师；指定教师名单功能暂未开放。'}{targetModes.length===0?' 当前版本未提供可用的教师作答目标，请重新选择资源。':''}</p>}
            <button disabled={busy||resourceLoading||(homeroomOnly&&!targetModes.includes(targetMode))||!resource||(resource.key.startsWith('library-scale:')&&!selectableRelationships(resource).includes(relation))} onClick={addTrack}>添加当前版本的测评项目</button>
          </>}
        </>}
        {activeRun.status==='DRAFT'&&<button disabled={busy}
          onClick={previewRun}>预览合法参与者数量</button>}
        {preview&&<p role="status">预览：
          {preview.tracks.map((t,i)=><span key={i}> 项目 {i+1}（作答 {t.executionCount}，
            受评对象 {t.subjectCount}）</span>)}</p>}
        {selected.runs.find(r=>r.runId===activeRun.id)?.capabilities?.canPublish===true&&
          <button className="hs-primary" disabled={busy||!preview} onClick={publishRun}>
            {selected.capabilities?.ownPsychologyPublisher?'正式发布本人测评':'学校管理员正式发布测评'}</button>}
      </div>}
      </section>
      <section className="hs-activity-config-panel" id="hs-activity-panel-results" aria-label="活动进度与结果" hidden={compact&&panel!=='results'}>
        {compact&&lifecycleControls}
      <section aria-label="进度与结果说明">
        <h3>3. 进度 · 核对参与与作答</h3>
        <p>当前授权学生人数和批次发布状态不是完成率。本页不展示个体心理作答或报告。</p>
        <h3>4. 结果 · 按权限查看报告</h3>
        <p>请通过工作空间中已授权的报告入口查看。活动和测评批次的收尾、等待时间及隐私阈值分别校验，结束活动不会自动生成或公开报告。</p>
      </section>
      </section>
    </div>}
  </section>
}
