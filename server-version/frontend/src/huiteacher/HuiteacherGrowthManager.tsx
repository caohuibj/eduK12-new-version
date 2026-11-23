import {useEffect,useRef,useState} from 'react'
import {HuiteacherImprovementPanel,type ImprovementApi,type ImprovementTarget} from './HuiteacherImprovementPanel'
type Timeline={
  target:{id:string;name:string;kind:string};
  list:Array<{eventId:string;title:string;kind:string;status:string;
    createdAt:string;closedAt:string|null;sourceKind:string;
    instrumentVersions:Array<{family:string;key:string;version:string}>;
    comparisonEvidence?:{previousEventId:string|null;sourceMatch:boolean;
      reason:'NO_CLOSED_BASELINE'|'STUDENT_POPULATION_DIFFERENCING_BLOCKED'
        |'RESOURCE_SET_OR_VERSION_DIFFERENT'
        |'RATERS_CONTEXT_AND_MEASUREMENT_INVARIANCE_UNVERIFIED';
      numericTrendAllowed:false;evidenceGrade:'PROVENANCE_ONLY'}}>;
  nextCursor:string|null;note:string
}
const targetLabels:Record<string,string>={PERSON:'教师或学校人员',TEAM:'教研组／管理团队',ORGANIZATION:'学校',ACTIVITY:'其他活动',ARTIFACT:'教学成果或方案',PROJECT:'改进项目'}
const eventLabels:Record<string,string>={ASSESSMENT:'专业评价',CLASSROOM:'课堂观察',MEETING:'学校会议',TEACHING_RESEARCH:'教研活动',FIELD_VISIT:'专家访校',OTHER:'其他活动'}
const stateLabels:Record<string,string>={DRAFT:'草稿',OPEN:'已开放',CLOSED:'已关闭',CANCELLED:'已取消'}
const sourceLabels:Record<string,string>={STUDENT_FEEDBACK:'学生评教',ASSESSMENT_RUN:'正式测评任务',FIELD_ACTIVITY:'现场观察活动',UNLINKED_DRAFT:'尚未关联测评任务'}
const familyLabels:Record<string,string>={SCALE:'量表',FORM:'表单',BUNDLE:'组合测评',COGNITIVE:'认知测验',SITUATIONAL:'情境判断'}
export function HuiteacherGrowthManager({organizationId,targets,api}:{
  organizationId:string;targets:ImprovementTarget[];api:ImprovementApi
}){
  const [targetId,setTargetId]=useState('')
  const [timeline,setTimeline]=useState<{api:ImprovementApi;path:string;data:Timeline}|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [sourceEventId,setSourceEventId]=useState('')
  const selected=targets.find(t=>t.id===targetId)
  const path='/organizations/'+organizationId+'/evaluation-targets/'+targetId+'/timeline'
  const source=useRef({api,path,request:0})
  if(source.current.api!==api||source.current.path!==path)
    source.current={api,path,request:source.current.request+1}
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;source.current.request+=1}},[])
  useEffect(()=>{
    source.current.request+=1
    setTargetId(old=>targets.some(t=>t.id===old)?old:'')
    setTimeline(null);setSourceEventId('');setError('');setBusy(false)
  },[api,organizationId,targets])
  const changeTarget=(id:string)=>{
    source.current.request+=1
    setTargetId(id);setTimeline(null);setSourceEventId('');setError('');setBusy(false)
  }
  const read=(cursor?:string)=>{
    if(!targetId)return
    const request=++source.current.request
    const valid=()=>mounted.current&&source.current.api===api&&source.current.path===path&&source.current.request===request
    setBusy(true);setError('')
    if(!cursor)setSourceEventId('')
    void api<Timeline>(path+(cursor?'?cursor='+encodeURIComponent(cursor):''))
      .then(next=>{if(valid())setTimeline(old=>({api,path,data:cursor&&old?.api===api&&old.path===path?{
        ...old.data,list:[...old.data.list,...next.list],nextCursor:next.nextCursor,
      }:next}))})
      .catch(e=>{if(valid())setError(e instanceof Error?e.message:'纵向记录暂不可用')})
      .finally(()=>{if(valid())setBusy(false)})
  }
  const currentTimeline=timeline?.api===api&&timeline.path===path&&timeline.data.target.id===targetId?timeline.data:null
  const selectedSource=currentTimeline?.list.find(entry=>entry.eventId===sourceEventId)
  return <section className="ht-panel" aria-label="学校纵向评价与持续改进">
    <h2>纵向评价与持续改进</h2>
    <p>以稳定的教师、团队或学校对象追踪活动，版本、样本或方法不可比时，
      只并列展示正式来源，不计算未经审核的变化分数。</p>
    {error&&<p className="ht-notice" role="status">{error}</p>}
    <div className="ht-inline">
      <label className="ht-field"><span>改进对象</span>
        <select value={targetId} onChange={e=>changeTarget(e.target.value)}>
          <option value="">选择正式评价对象</option>
          {targets.map(target=><option key={target.id} value={target.id}>
            {targetLabels[target.kind]??'其他评价对象'} · {target.name}</option>)}
        </select></label>
      <button disabled={!targetId||busy} onClick={()=>read()}>查看正式活动时间线</button>
    </div>
    {currentTimeline&&<div className="ht-event-list">
      {currentTimeline.list.map(entry=><article className="ht-event" key={entry.eventId}>
        <strong>{entry.title}</strong> · <span className="ht-tag">{stateLabels[entry.status]??'其他状态'}</span>
        <p>{new Date(entry.createdAt).toLocaleDateString('zh-CN')} · {eventLabels[entry.kind]??'其他活动'}</p>
        <p className="ht-muted">已登记 {entry.instrumentVersions.length} 项固定工具；仅作为来源记录，不代表科学可比。</p>
        <details><summary>来源与工具版本详情</summary>
          <p className="ht-muted">来源：{sourceLabels[entry.sourceKind]??'其他来源'}（<code>{entry.sourceKind}</code>）</p>
          {entry.instrumentVersions.map((v,i)=><p key={i} className="ht-muted">
            {familyLabels[v.family]??'其他工具'} · 版本 <code>{v.version}</code></p>)}
        </details>
        <p className="ht-muted">纵向对照：{entry.comparisonEvidence?.reason==='NO_CLOSED_BASELINE'
          ?'当前没有同类型的上一轮正式来源。':
          entry.comparisonEvidence?.reason==='STUDENT_POPULATION_DIFFERENCING_BLOCKED'
          ?'学生评教存在跨轮差分风险；禁止数字趋势。':
          entry.comparisonEvidence?.reason==='RESOURCE_SET_OR_VERSION_DIFFERENT'
          ?'工具或版本不同，不建立数值比较。':
          entry.comparisonEvidence?.sourceMatch
          ?'工具与版本一致，但评价者、情境、量尺等值性未验证。':
          '尚未证明具有科学可比性。'}</p>
        {entry.status==='CLOSED'&&<button type="button"
          onClick={()=>setSourceEventId(entry.eventId)}>
          以本次评价建立改进行动</button>}
      </article>)}
      {currentTimeline.nextCursor&&<button disabled={busy} onClick={()=>read(currentTimeline.nextCursor!)}>更早的评价事件</button>}
      <p className="ht-muted">{currentTimeline.note}</p>
    </div>}
    {selectedSource&&<p className="ht-notice" role="status">行动依据：{selectedSource.title}。新行动将保留本次正式评价来源。<button type="button" disabled={busy} onClick={()=>setSourceEventId('')}>清除评价依据</button></p>}
    {selected&&import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'
      &&<HuiteacherImprovementPanel key={organizationId+':'+targetId}
        organizationId={organizationId} targetId={targetId}
        targetName={selected.name} api={api} audience="SCHOOL_SHARED"
        sourceEventId={sourceEventId||null}/>}
  </section>
}
