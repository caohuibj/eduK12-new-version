import {TeacherFormGroupVersions} from './TeacherFormGroupVersions'
import {TeacherFormGroupReport,type TeacherFormGroupProjection} from './TeacherFormGroupReport'
import {TeacherTrackingPublish,TeacherTrackingNext} from './TeacherPersonalTracking'
import {SchoolTaskHelp as ManagementHelp} from '../school/SchoolTaskHelp'
import {SelectedToolOutline} from '../modules/assessment-core/composition/SelectedToolOutline'
import {EducationPrivateScalePicker} from '../components/education-tools/EducationPrivateScalePicker'
import {EducationCompositionRunPicker} from '../components/education-tools/EducationCompositionRunPicker'
import {EducationAssessmentResourcePicker} from '../components/education-tools/EducationAssessmentResourcePicker'
import type {EducationAssessmentResourceAdapter} from '../api/educationAssessmentResources'
import {HuiteacherGrowthManager} from './HuiteacherGrowthManager'
import { useCallback,useEffect,useRef,useState } from 'react'
import { HuiteacherFieldManager } from './HuiteacherFieldManager'
import { HuiteacherStudentEvaluationManager } from './HuiteacherStudentEvaluationManager'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Page<T>={list:T[];nextCursor?:string|null}
const mergeRows=<T extends {id:string}>(old:T[],next:T[])=>Array.from(new Map([...old,...next].map(item=>[item.id,item])).values())
type Target={id:string;name:string;kind:string;status:string;subjectUserId:string|null}
type Event={id:string;targetId:string;kind:string;title:string;status:string;version:number}
type RunTrackSummary={id:string;resourceFamily:string;resourceKey:string;resourceVersion:string;title?:string|null;sourceRevision?:number|null}
type Run={tracks?:RunTrackSummary[];eventId:string;runId:string;status:string;version:number;name?:string;trackCount?:number}
type RunPreview={runId:string;version:number;tracks:Array<{trackId:string;executionCount:number;subjectCount:number;respondentCount:number;resourcePolicy:unknown}>}
type PreviewSnapshot={data:RunPreview;base:string;api:Api;actorKey:string;eventVersion:number;eventStatus:string}
type Form={id:string;title:string;definitionDigest:string;status:'PUBLISHED'|'DRAFT'}
type TeacherScale={id:string;key:string;version:string;title:string;hash:string;
  visibilityPolicyKey?:string;personalReportAvailable?:boolean}
type Progress={runId:string;total:number;counts:Record<string,number>}
const targetLabels:Record<string,string>={
  PERSON:'教师或学校人员',TEAM:'教研组／管理团队',ORGANIZATION:'学校',
  ACTIVITY:'其他活动',ARTIFACT:'教学成果或方案',PROJECT:'改进项目',
}
const eventLabels:Record<string,string>={
  ASSESSMENT:'专业评价',CLASSROOM:'课堂观察',MEETING:'学校会议',
  TEACHING_RESEARCH:'教研活动',FIELD_VISIT:'专家访校',OTHER:'其他活动',
}
const stateLabels:Record<string,string>={DRAFT:'草稿',OPEN:'已开放',PUBLISHED:'已发布',CLOSED:'已关闭',CANCELLED:'已取消'}
const statusLabel=(status:string)=>stateLabels[status]??status
function nextAction(event:Event,run?:Run){
  if(event.status==='CANCELLED')return '活动已取消，请查看历史配置。'
  if(!run)return ['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind)
    ?'现场观察可独立进行；草稿阶段先确认专家／同行接受邀请。已有测评任务可查看配置。'
    :'查看已有任务配置；如尚未创建，在活动草稿中建立评价任务。'
  if(run.status==='CANCELLED')return '评价任务已取消，活动状态仍独立保留。'
  if(run.status==='DRAFT')return (run.trackCount??0)<1
    ?'加入已发布表单或本校、本入口获授权的固定工具版本，再预览任务配置。'
    :event.status==='DRAFT'?'预览配置并开放活动，然后单独发布评价任务。'
    :event.status==='OPEN'?'活动已开放，但任务尚未发布；先预览配置，再发布任务。'
    :'查看任务配置与活动状态。'
  if(run.status==='PUBLISHED')return '查看完成进度；结束前核对剩余任务，任务与活动需分别关闭。'
  if(run.status==='CLOSED')return event.status==='OPEN'
    ?'核对剩余任务后结束活动；群体报告仍需满足各自隐私与发布条件。'
    :'查看任务配置；群体报告是否可用由原有权限与隐私条件决定。'
  return '查看任务配置与当前活动状态。'
}
export function HuiteacherEvaluationStudio({organizationId,api,canAuthorPrivateTools=false,actorKey='',assessmentResources}:{
  organizationId:string;api:Api;canAuthorPrivateTools?:boolean;actorKey?:string;assessmentResources?:EducationAssessmentResourceAdapter
}){
  const base='/organizations/'+organizationId
  const scaleScope=useRef({base,api})
  scaleScope.current={base,api}
  const [targets,setTargets]=useState<Target[]>([])
  const [events,setEvents]=useState<Event[]>([])
  const [runMap,setRunMap]=useState<Record<string,Run>>({})
  const [previews,setPreviews]=useState<Record<string,PreviewSnapshot>>({})
  const previewEpoch=useRef(0)
  const previewContext=useRef({base,api,actorKey,events,runMap})
  previewContext.current={base,api,actorKey,events,runMap}
  const invalidatePreviews=()=>{previewEpoch.current++;setPreviews({})}
  const privateBusy=(value:boolean)=>{if(value)invalidatePreviews();setWorking(value)}
  const [releasedForms,setReleasedForms]=useState<Form[]>([])
  const [releasedScales,setReleasedScales]=useState<Record<string,TeacherScale[]>>({})
  const [scaleCursor,setScaleCursor]=useState<Record<string,string|null>>({})
  const [scaleLoading,setScaleLoading]=useState<Record<string,boolean>>({})
  const [scaleError,setScaleError]=useState<Record<string,string>>({})
  const scaleRequest=useRef<Record<string,number>>({})
  const [scaleChoice,setScaleChoice]=useState<Record<string,string>>({})
  const [formChoice,setFormChoice]=useState<Record<string,string>>({})
  const [progress,setProgress]=useState<Record<string,Progress>>({})
  const [reports,setReports]=useState<Record<string,{report:TeacherFormGroupProjection;activityTitle:string;formTitle:string}>>({})
  const [targetName,setTargetName]=useState('')
  const [targetKind,setTargetKind]=useState('PERSON')
  const [subjectUserId,setSubjectUserId]=useState('')
  const [eventTitle,setEventTitle]=useState('')
  const [eventKind,setEventKind]=useState('CLASSROOM')
  const [eventTargetId,setEventTargetId]=useState('')
  const [notice,setNotice]=useState('')
  const [working,setWorking]=useState(false)
  const [targetCursor,setTargetCursor]=useState<string|null>(null)
  const [eventCursor,setEventCursor]=useState<string|null>(null)
  const [targetLoading,setTargetLoading]=useState(true)
  const [eventLoading,setEventLoading]=useState(true)
  const [targetError,setTargetError]=useState('')
  const [eventError,setEventError]=useState('')
  const [formsError,setFormsError]=useState('')
  const scopeGeneration=useRef(0)
  const targetRequest=useRef(0)
  const eventRequest=useRef(0)
  const loadTargets=useCallback(async(cursor?:string)=>{
    const generation=scopeGeneration.current,request=++targetRequest.current
    setTargetLoading(true);setTargetError('')
    try{
      const data=await api<Page<Target>>(base+'/evaluation-targets'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
      if(generation!==scopeGeneration.current||request!==targetRequest.current)return
      setTargets(old=>cursor?mergeRows(old,data.list):data.list)
      setTargetCursor(data.nextCursor??null)
      if(!cursor)setEventTargetId(previous=>data.list.some(x=>x.id===previous)?previous:(data.list[0]?.id??''))
    }catch(error){
      if(generation===scopeGeneration.current&&request===targetRequest.current)setTargetError(error instanceof Error?error.message:'评价对象读取失败')
    }finally{
      if(generation===scopeGeneration.current&&request===targetRequest.current)setTargetLoading(false)
    }
  },[api,base])
  const loadEvents=useCallback(async(cursor?:string)=>{
    const generation=scopeGeneration.current,request=++eventRequest.current
    setEventLoading(true);setEventError('')
    try{
      const data=await api<Page<Event>>(base+'/evaluation-events'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
      if(generation!==scopeGeneration.current||request!==eventRequest.current)return
      setEvents(old=>cursor?mergeRows(old,data.list):data.list)
      setEventCursor(data.nextCursor??null)
    }catch(error){
      if(generation===scopeGeneration.current&&request===eventRequest.current)setEventError(error instanceof Error?error.message:'评价活动读取失败')
    }finally{
      if(generation===scopeGeneration.current&&request===eventRequest.current)setEventLoading(false)
    }
  },[api,base])
  const refresh=async()=>{await Promise.all([loadTargets(),loadEvents()])}
  useEffect(()=>{
    const generation=++scopeGeneration.current
    setTargets([]);setEvents([]);setTargetCursor(null);setEventCursor(null)
    previewEpoch.current++;setPreviews({})
    setRunMap({});setProgress({});setReports({});setReleasedForms([]);setReleasedScales({})
    setScaleChoice({});setScaleCursor({});setScaleLoading({});setScaleError({});scaleRequest.current={}
    setFormChoice({});setEventTargetId('');setNotice('');setFormsError('')
    void loadTargets();void loadEvents()
    void api<{list:Form[]}>(base+'/forms').then(forms=>{
      if(generation===scopeGeneration.current)setReleasedForms(forms.list.filter(x=>x.status==='PUBLISHED'))
    }).catch(error=>{
      if(generation===scopeGeneration.current)setFormsError(error instanceof Error?error.message:'已发布表单读取失败')
    })
    return ()=>{scopeGeneration.current++}
  },[base,api,actorKey,loadTargets,loadEvents])
  useEffect(()=>{previewEpoch.current++;setPreviews({})},[actorKey])
  const actionPending=useRef(false)
  const perform=(fn:()=>Promise<void>)=>{
    if(actionPending.current)return
    actionPending.current=true
    invalidatePreviews()
    setWorking(true);setNotice('')
    void fn().catch(e=>setNotice(e instanceof Error?e.message:'操作失败'))
      .finally(()=>{actionPending.current=false;setWorking(false)})
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
    setEventTitle('');await refresh();setNotice('活动草稿已创建，可配置正式评价任务。')
  })
  const createRun=(event:Event)=>perform(async()=>{
    await api(base+'/evaluation-events/'+event.id+'/run','POST',{name:event.title})
    await fetchRun(event)
    setNotice('已建立活动专属评价任务草稿，请加入已发布表单或获授权量表。')
  })
  const inspectRun=(event:Event)=>perform(async()=>{
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
    setRunMap(old=>({...old,[event.id]:run}))
  })
  const reloadReleasedForms=()=>perform(async()=>{
    const data=await api<{list:Form[]}>(base+'/forms')
    setReleasedForms(data.list.filter(x=>x.status==='PUBLISHED'))
    setFormsError('');setNotice('已刷新本校已发布表单；未完成授权的资源不会进入正式任务。')
  })
  const fetchRun=async(event:Event)=>{
    const generation=scopeGeneration.current
    const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
    if(generation===scopeGeneration.current&&previewContext.current.base===base&&previewContext.current.api===api) setRunMap(old=>({...old,[event.id]:run}))
    return run
  }
  const reloadScales=async(event:Event,cursor?:string)=>{
    const generation=scopeGeneration.current,request=(scaleRequest.current[event.id]??0)+1
    scaleRequest.current[event.id]=request
    const current=()=>generation===scopeGeneration.current&&request===scaleRequest.current[event.id]
      &&scaleScope.current.base===base&&scaleScope.current.api===api
    setScaleLoading(previous=>({...previous,[event.id]:true}))
    setScaleError(previous=>({...previous,[event.id]:''}))
    try{
      const licensed=await api<Page<TeacherScale>>(
        base+'/evaluation-events/'+event.id+'/run/released-scales'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
      if(!current())return
      setReleasedScales(previous=>({...previous,[event.id]:mergeRows(cursor?previous[event.id]??[]:[],licensed.list)}))
      setScaleCursor(previous=>({...previous,[event.id]:licensed.nextCursor??null}))
      if(!cursor)setScaleChoice(previous=>({...previous,[event.id]:licensed.list.some(item=>item.id===previous[event.id])?previous[event.id]:''}))
    }catch(error){
      if(current())
        setScaleError(previous=>({...previous,[event.id]:error instanceof Error?error.message:'授权量表目录读取失败，请重试。'}))
    }finally{
      if(current())
        setScaleLoading(previous=>({...previous,[event.id]:false}))
    }
  }
  const attachScale=(event:Event)=>perform(async()=>{
    const selected=(releasedScales[event.id]??[]).find(
      scale=>scale.id===scaleChoice[event.id])
    if(!selected)throw new Error('请选择拥有学校授权的正式教师自评 Scale')
    const library=selected.key.startsWith('library-scale:')
    const visibilityPolicyKey=selected.visibilityPolicyKey??(library?null:'HUITEACHER_ADULT_SELF_PILOT_V1')
    if(visibilityPolicyKey!==(library?'EDUCATION_LIBRARY_APPROVED_CONTENT_V1':'HUITEACHER_ADULT_SELF_PILOT_V1'))
      throw new Error('量表报告策略缺失或不受支持，请重新读取授权目录。')
    const run=runMap[event.id]??await fetchRun(event)
    if(run.status!=='DRAFT')throw new Error('只允许对草稿任务增配 Scale')
    await api(base+'/evaluation-events/'+event.id+'/run/tracks','POST',{
      resource:{family:'SCALE',key:selected.key,version:selected.version},
      subjectSelector:{kind:'ALL_CURRENT'},
      respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
        relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
        analysisMode:'INDIVIDUAL_ONLY',
        visibilityPolicyKey,
        minimumRespondents:null,
      },
    })
    await fetchRun(event)
    setNotice('已加入本校获授权的固定版本。是否提供本人反馈仍取决于该版本内容和实际报告权限，学校不能代查个人分数。')
  })
  const attachForm=(event:Event)=>perform(async()=>{
    const form=releasedForms.find(f=>f.id===formChoice[event.id])
    if(!form)throw new Error('请先选择已经发布的 Teacher Form')
    const run=runMap[event.id]??await fetchRun(event)
    if(run.status!=='DRAFT')throw new Error('只有草稿任务可以添加工具')
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
    setNotice('教师群体表单已加入评价任务；完成后只公开达到隐私阈值的群体描述统计。')
  })
  const previewRun=(event:Event)=>perform(async()=>{
    const token=previewEpoch.current
    const current=()=>{const context=previewContext.current;const latest=context.events.find(row=>row.id===event.id)
      return token===previewEpoch.current&&context.base===base&&context.api===api&&context.actorKey===actorKey&&latest?.version===event.version&&latest.status===event.status}
    const run=await fetchRun(event)
    if(!current())return
    const data=await api<RunPreview>(base+'/evaluation-events/'+event.id+'/run/preview','POST',
      {expectedVersion:run.version}).catch(error=>{if(current())throw error;return null})
    if(!current()||!data)return
    const latest=previewContext.current.runMap[event.id]
    if(latest?.runId!==run.runId||latest.version!==run.version||latest.status!=='DRAFT')return
    if(data.runId!==run.runId||data.version!==run.version||!Array.isArray(data.tracks)||data.tracks.some(track=>
      !track.trackId||[track.executionCount,track.subjectCount,track.respondentCount].some(count=>!Number.isSafeInteger(count)||count<0)))throw new Error('预览版本或人数响应无效，请重新预览任务配置。')
    setPreviews(old=>({...old,[event.id]:{data,base,api,actorKey,eventVersion:event.version,eventStatus:event.status}}))
    setNotice('预览已生成，人数以对应工具为单位；发布时仍会重新校验当前资格。')
  })
  const publishRun=(event:Event,tracking?:unknown)=>perform(async()=>{
    const run=await fetchRun(event)
    if(event.status!=='OPEN')throw new Error('请先开放评价活动')
    if(!window.confirm('确认按当前固定版本配置，向本校符合资格的教师分配测评任务吗？发布时将重新校验参与资格。'))return
    const publication=await api<{executionCount:number;version:number}>(
      base+'/evaluation-events/'+event.id+'/run/publish','POST',
      {expectedVersion:run.version,...(tracking===undefined?{}:{tracking})})
    await fetchRun(event)
    setNotice('评价任务已发布；共冻结 '+publication.executionCount+' 个作答任务。')
  })
  const readProgress=(event:Event)=>perform(async()=>{
    const report=await api<Progress>(base+'/evaluation-events/'+event.id+'/run/progress')
    setProgress(old=>({...old,[event.id]:report}))
  })
  const closeRun=(event:Event)=>perform(async()=>{
    if(event.status!=='OPEN')throw new Error('必须在活动开放时结束已发布任务')
    await api(base+'/evaluation-events/'+event.id+'/run/close','POST',{})
    await fetchRun(event);setNotice('已关闭评价任务；完成中的任务可能继续提交，请等待剩余任务结束。')
  })
  const cancelRun=(event:Event)=>perform(async()=>{
    if(!window.confirm('取消已发布任务 会停止未开始的任务。确认取消？'))return
    await api(base+'/evaluation-events/'+event.id+'/run/cancel','POST',{})
    await fetchRun(event);setNotice('评价任务已取消。')
  })
  const readGroup=(event:Event,historical=false)=>perform(async()=>{
    const formId=formChoice[event.id]||releasedForms[0]?.id
    if(!formId)throw new Error('请先选择报告对应的发布表单')
    // New immutable releases are read-only without fresh TOTP; legacy GET
    // may write the first disclosure ledger, so it retains its own step-up.
    const releasedOnly=import.meta.env.VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'
      &&!historical
    const report=await api<TeacherFormGroupProjection>(
      base+'/evaluation-events/'+event.id+'/forms/'+formId
        +'/group-report'+(releasedOnly?'/released':''))
    if(previewContext.current.base!==base||previewContext.current.api!==api||previewContext.current.actorKey!==actorKey)return
    setReports({[event.id]:{report,activityTitle:event.title,formTitle:releasedForms.find(form=>form.id===formId)?.title??formId}})
  })
  const transition=(event:Event,action:'OPEN'|'CLOSE'|'CANCEL')=>perform(async()=>{
    const result=await api<{status:string;version:number}>(
      base+'/evaluation-events/'+event.id+'/transition','POST',{
        action,expectedVersion:event.version,
      })
    await refresh()
    setNotice('活动已变更为 '+result.status+'。请确认任务与报告授权独立。')
  })
  return <section className="ht-panel ht-admin-panel ht-evaluation-workbench" aria-label="Huiteacher 评价活动管理">
    <header className="ht-section-heading"><h2>评价对象与活动</h2><ManagementHelp label="学校评价活动说明" buttonText=""><p>对象标识和活动事件独立于个人登录账户；共享 School 的基础组织关系，不共享 School 的测评数据。</p><p>活动和作答任务分别发布；结果仍按原有授权与隐私规则开放。</p></ManagementHelp></header>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <details className="ht-admin-action"><summary>创建稳定评价对象</summary>
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
    </details>
    <div className="ht-units">{targets.map(x=><span key={x.id} className="ht-tag">
      {targetLabels[x.kind]??x.kind} · {x.name}</span>)}</div>
    {targetLoading&&<p role="status">正在读取评价对象…</p>}
    {targetError&&<p role="alert">{targetError} <button disabled={targetLoading} onClick={()=>void loadTargets(targetCursor??undefined)}>重试评价对象</button></p>}
    {!targetLoading&&!targetError&&targets.length===0&&<p className="ht-empty">尚无评价对象，请先新增。</p>}
    {targetCursor&&<button disabled={targetLoading||working} onClick={()=>void loadTargets(targetCursor)}>加载更多评价对象</button>}
    <details className="ht-admin-action"><summary>创建评价活动</summary>
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
    </details>
    <div className="ht-admin-list-heading"><h3>近期活动</h3>
      <button type="button" disabled={working} onClick={reloadReleasedForms}>
        刷新已发布表单
      </button>
    </div>
    {formsError&&<p role="alert">已发布表单暂不可用：{formsError}。可使用上方刷新按钮重试。</p>}
    {eventLoading&&<p role="status">正在读取评价活动…</p>}
    {eventError&&<p role="alert">{eventError} <button disabled={eventLoading} onClick={()=>void loadEvents(eventCursor??undefined)}>重试评价活动</button></p>}
    {!eventLoading&&!eventError&&events.length===0&&<p className="ht-empty">尚无评价活动，可以先创建草稿。</p>}
    <div className="ht-event-list">{events.map(event=><article key={event.id} className="ht-event">
      <strong>{event.title}</strong>
      <span className="ht-tag">{eventLabels[event.kind]??event.kind} · 活动：{statusLabel(event.status)}</span>
      <p className="ht-muted">下一步：{nextAction(event,runMap[event.id])}</p>
      <div className="ht-inline">
        <button onClick={()=>inspectRun(event)} disabled={working}>查看任务配置</button>
        {event.status==='DRAFT'&&<button onClick={()=>createRun(event)} disabled={working||!!runMap[event.id]}>创建评价任务草稿</button>}
        {event.status==='DRAFT'&&<button onClick={()=>transition(event,'OPEN')}
          disabled={working||(
            runMap[event.id]
              ?runMap[event.id].status!=='DRAFT'||(runMap[event.id].trackCount??0)<1
              :!['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind)
          )}>
          开放评价活动
        </button>}
        {event.status==='DRAFT'&&!runMap[event.id]
          &&['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind)
          &&<p className="ht-muted">纯现场观察无需创建测评任务；需先邀请至少一位专家／同行并由其接受，再开放活动。</p>}
        {event.status==='DRAFT'&&<button onClick={()=>transition(event,'CANCEL')} disabled={working}>取消草稿</button>}
        {event.status==='OPEN'&&<button onClick={()=>transition(event,'CLOSE')}
          disabled={working||(runMap[event.id]&&runMap[event.id].status!=='CLOSED')}>
          结束活动
        </button>}
      </div>
      {runMap[event.id]&&<div>
        <p>任务状态：{statusLabel(runMap[event.id].status)} · 已配置工具 {runMap[event.id].trackCount??0} 项</p>
        <SelectedToolOutline disabled={working} onRemove={event.status==='DRAFT'&&runMap[event.id].status==='DRAFT'?trackId=>perform(async()=>{
          if(!window.confirm('从本轮草稿移除此投放？追踪工具缺失或定义变化将阻止发布；请加入保留冻结指标的新问卷版本。'))return
          await api(base+'/evaluation-events/'+event.id+'/run/tracks/'+encodeURIComponent(trackId),'DELETE',{expectedVersion:runMap[event.id].version})
          await fetchRun(event)
        }):undefined} className="ht-selected-tool-outline" items={runMap[event.id].tracks?.map((track,index)=>({
          id:track.id,title:track.title??((track.resourceKey.startsWith('education-composition:')?'普通问卷':
            ({SCALE:'量表',FORM:'表单',BUNDLE:'正式整包',COGNITIVE:'认知测验',SITUATIONAL:'情境判断'} as Record<string,string>)[track.resourceFamily]??'测评工具')+' '+(index+1)),
          kind:track.resourceKey.startsWith('education-composition:')?'普通问卷':({SCALE:'量表',FORM:'表单',BUNDLE:'正式整包',COGNITIVE:'认知测验',SITUATIONAL:'情境判断'} as Record<string,string>)[track.resourceFamily]??'测评工具',
          version:track.sourceRevision?'修订 '+track.sourceRevision:track.resourceVersion,
        }))}/>
        {(()=>{const snapshot=previews[event.id],run=runMap[event.id]
          if(!snapshot||snapshot.base!==base||snapshot.api!==api||snapshot.actorKey!==actorKey||snapshot.eventVersion!==event.version||snapshot.eventStatus!==event.status||snapshot.data.runId!==run.runId||snapshot.data.version!==run.version||run.status!=='DRAFT')return null
          return <section className="ht-panel" aria-label="任务配置预览"><h4>任务配置预览 · 版本 {snapshot.data.version}</h4>
            <p>预计作答任务：{snapshot.data.tracks.reduce((total,track)=>total+track.executionCount,0)} 个</p>
            <p className="ht-muted">人数仅在各工具内去重，同一教师可能参与多个工具；不将各工具人数相加视为独立人数。发布时仍会重新校验资格。</p>
            <ul>{snapshot.data.tracks.map((track,index)=><li key={track.trackId}>工具 {index+1}：被测者 {track.subjectCount} 人 · 作答者 {track.respondentCount} 人 · 作答任务 {track.executionCount} 个</li>)}</ul>
          </section>
        })()}
        <details><summary>任务技术详情</summary><p>Assessment Run：<code>{runMap[event.id].runId}</code> · {runMap[event.id].status} · Track 数量：{runMap[event.id].trackCount??0}</p></details>
        {runMap[event.id].status==='DRAFT'&&<>
          <EducationAssessmentResourcePicker
            scope={{product:'TEACHER',organizationId,actorKey,workflowId:event.id,runId:runMap[event.id].runId,expectedVersion:runMap[event.id].version}}
            adapter={assessmentResources} disabled={working} onBusy={privateBusy}
            onRefresh={async()=>{await fetchRun(event)}}/>
          {canAuthorPrivateTools&&actorKey&&<EducationPrivateScalePicker
            key={`private:${actorKey}:${organizationId}:${event.id}:${runMap[event.id].runId}`}
            entry="TEACHER" organizationId={organizationId} actorKey={actorKey} scopeKey={`${event.id}:${runMap[event.id].runId}`}
            api={api} endpoint={base+'/evaluation-events/'+event.id+'/run/tracks'} expectedVersion={runMap[event.id].version}
            disabled={working} onBusy={privateBusy} onRefresh={async()=>{
              const generation=scopeGeneration.current
              const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
              if(generation===scopeGeneration.current&&scaleScope.current.base===base&&scaleScope.current.api===api)setRunMap(old=>({...old,[event.id]:run}))
            }}/>}
          {canAuthorPrivateTools&&actorKey&&<EducationPrivateScalePicker kind="FORM"
            key={`private-form:${actorKey}:${organizationId}:${event.id}:${runMap[event.id].runId}`}
            entry="TEACHER" organizationId={organizationId} actorKey={actorKey} scopeKey={`${event.id}:${runMap[event.id].runId}`}
            api={api} endpoint={base+'/evaluation-events/'+event.id+'/run/tracks'} expectedVersion={runMap[event.id].version}
            disabled={working} onBusy={privateBusy} onRefresh={async()=>{
              const generation=scopeGeneration.current
              const run=await api<Run>(base+'/evaluation-events/'+event.id+'/run')
              if(generation===scopeGeneration.current&&scaleScope.current.base===base&&scaleScope.current.api===api)setRunMap(old=>({...old,[event.id]:run}))
            }}/>}
          {canAuthorPrivateTools&&actorKey&&<EducationCompositionRunPicker
            key={`composition:${actorKey}:${organizationId}:${event.id}:${runMap[event.id].runId}`} api={api} entry="TEACHER"
            organizationId={organizationId} actorKey={actorKey} endpoint={base+'/evaluation-events/'+event.id+'/run/tracks'}
            expectedVersion={runMap[event.id].version} disabled={working} onBusy={privateBusy} onRefresh={async()=>{await fetchRun(event)}}/>}
          <div className="ht-inline"><button disabled={working||scaleLoading[event.id]} onClick={()=>void reloadScales(event)}>
            查询本校授权的教师自评 Scale
          </button></div>
          {scaleLoading[event.id]&&<p role="status">正在读取授权量表…</p>}
          {scaleError[event.id]&&<div><p role="alert">{scaleError[event.id]} 已配置的测评项目不受影响。</p>
            <button disabled={working||scaleLoading[event.id]} onClick={()=>void reloadScales(event)}>重新查询授权量表</button></div>}
          {scaleCursor[event.id]&&<button disabled={working||scaleLoading[event.id]}
            onClick={()=>void reloadScales(event,scaleCursor[event.id]!)}>继续加载授权量表</button>}
          {releasedScales[event.id]?.length===0&&!scaleLoading[event.id]&&!scaleError[event.id]&&<p>
            {scaleCursor[event.id]?'当前页暂无可选量表，仍可继续加载。':'当前目录没有可选的教师自评量表。'}</p>}
          {(releasedScales[event.id]?.length??0)>0&&<div className="ht-inline">
            <label className="ht-field"><span>正式教师自评量表 · 固定版本</span>
              <select value={scaleChoice[event.id]??''}
                onChange={e=>setScaleChoice(old=>({...old,[event.id]:e.target.value}))}>
                <option value="">选择已获学校授权的教师自评资源</option>
                {(releasedScales[event.id]??[]).map(item=>
                  <option key={item.id} value={item.id}>{item.title}（{item.version}） · {item.key.startsWith('library-scale:')?'共用量表库':'原专用库'}</option>)}
              </select>
            </label>
            <button disabled={working||scaleLoading[event.id]||!scaleChoice[event.id]} onClick={()=>attachScale(event)}>
              加入教师自评量表
            </button>
          </div>}
          {scaleChoice[event.id]&&<p className="ht-muted">
            {(releasedScales[event.id]??[]).find(item=>item.id===scaleChoice[event.id])?.personalReportAvailable===true
              ?'本版本配置包含本人反馈能力，实际展示仍须满足报告授权与可用条件。'
              :'本版本未声明可展示本人反馈，不会因配置任务自动开放报告。'}</p>}
          <p className="ht-muted">这里只使用本校获授权的教师自评固定版本：原专用库保留独立审核，共用量表库沿用入库审批。
            学校可以发布任务，但不能读取被试个人分数；学生评教师仍走专用流程。</p>
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
              加入表单
            </button>
            <button onClick={()=>previewRun(event)} disabled={working}>预览任务配置</button>
            <TeacherTrackingPublish key={event.id+':'+runMap[event.id].version+':'+actorKey} api={api} path={base+'/evaluation-events/'+event.id+'/run'} disabled={working||event.status!=='OPEN'} publish={tracking=>publishRun(event,tracking)}/>
          </div>
        </>}
        {['PUBLISHED','CLOSED'].includes(runMap[event.id].status)&&<TeacherTrackingNext key={event.id+':'+actorKey} api={api} path={base+'/evaluation-events/'+event.id+'/run'} disabled={working} create={()=>perform(async()=>{await api(base+'/evaluation-events/'+event.id+'/run/next-wave','POST',{requestId:crypto.randomUUID()});await refresh();setNotice('下一轮活动草稿已创建，继承固定追踪来源；请查看配置并开放、发布。')})}/>}
        {runMap[event.id].status==='PUBLISHED'&&<>
          <button onClick={()=>readProgress(event)} disabled={working}>查看正式完成进度</button>
          <button onClick={()=>closeRun(event)} disabled={working||event.status!=='OPEN'}>关闭评价任务</button>
          <button onClick={()=>cancelRun(event)} disabled={working||event.status!=='OPEN'}>取消评价任务</button>
        </>}
        {event.status==='CLOSED'&&runMap[event.id].status==='CLOSED'&&
          <div className="ht-inline">
            <label className="ht-field"><span>报告对应 Form</span><select
              value={formChoice[event.id]??''}
              onChange={e=>setFormChoice(old=>({...old,[event.id]:e.target.value}))}>
              <option value="">选择已发布表单</option>
              {releasedForms.map(form=><option key={form.id} value={form.id}>{form.title}</option>)}
            </select></label>
            {import.meta.env.VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'
              ?formChoice[event.id]&&<TeacherFormGroupVersions key={event.id+':'+formChoice[event.id]}
                api={api} endpoint={base+'/evaluation-events/'+event.id+'/forms/'+formChoice[event.id]+'/group-report'}
                onReport={report=>setReports(report?{[event.id]:{report,activityTitle:event.title,formTitle:releasedForms.find(form=>form.id===formChoice[event.id])?.title??formChoice[event.id]}}:{})}/>
              :<button onClick={()=>readGroup(event)} disabled={working||!formChoice[event.id]}>查看学校群体报告</button>}
            {import.meta.env.VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED==='true'&&
              <button onClick={()=>readGroup(event,true)} disabled={working||!formChoice[event.id]}>
                查看历史规则报告（首次读取需近期验证）
              </button>}
          </div>}
        {progress[event.id]&&<p>已完成 {progress[event.id].counts.COMPLETED??0} /
          {progress[event.id].total} · 进行中 {progress[event.id].counts.IN_PROGRESS??0}</p>}
      </div>}
      {import.meta.env.VITE_HUITEACHER_STUDENT_FEEDBACK_ENABLED==='true'
        &&event.kind==='ASSESSMENT'
        &&targets.some(x=>x.id===event.targetId&&x.kind==='PERSON'&&x.subjectUserId)
        &&<HuiteacherStudentEvaluationManager
          key={'student-feedback:'+event.id} organizationId={organizationId}
          eventId={event.id} eventStatus={event.status}
          eventVersion={event.version} onChanged={()=>{void refresh()}}
          teacherName={targets.find(x=>x.id===event.targetId)?.name??'已核验教师'}
          forms={releasedForms} api={api}/>}
      {['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind)&&
        <HuiteacherFieldManager key={'field:'+event.id}
          organizationId={organizationId} eventId={event.id}
          eventStatus={event.status} api={api}/>}
      {reports[event.id]&&<TeacherFormGroupReport {...reports[event.id]}/>}

    </article>)}</div>
    {eventCursor&&<button disabled={eventLoading||working} onClick={()=>void loadEvents(eventCursor)}>加载更多评价活动</button>}
{import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'
  &&<HuiteacherGrowthManager api={api} organizationId={organizationId} targets={targets}/>}
<p className="ht-muted">Form-only 使用正式发布版本、正式评价任务和加密最终提交；没有计分规则，不产生 Scale 得分。低于最小样本量的群体报告保持抑制。</p>
  </section>
}
