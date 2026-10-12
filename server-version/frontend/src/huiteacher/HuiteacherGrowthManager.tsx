import {useEffect,useState} from 'react'
import {HuiteacherImprovementPanel,type ImprovementApi,type ImprovementTarget} from './HuiteacherImprovementPanel'
type Timeline={
  target:{id:string;name:string;kind:string};
  list:Array<{eventId:string;title:string;kind:string;status:string;
    createdAt:string;closedAt:string|null;sourceKind:string;
    instrumentVersions:Array<{family:string;key:string;version:string}>}>;
  nextCursor:string|null;note:string
}
export function HuiteacherGrowthManager({organizationId,targets,api}:{
  organizationId:string;targets:ImprovementTarget[];api:ImprovementApi
}){
  const [targetId,setTargetId]=useState('')
  const [timeline,setTimeline]=useState<Timeline|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [sourceEventId,setSourceEventId]=useState('')
  const selected=targets.find(t=>t.id===targetId)
  const path='/organizations/'+organizationId+'/evaluation-targets/'+targetId+'/timeline'
  useEffect(()=>{
    setTargetId(old=>targets.some(t=>t.id===old)?old:'')
    setTimeline(null)
  },[organizationId,targets])
  const load=()=> {
    if(!targetId)return
    setBusy(true);setError('');setSourceEventId('')
    void api<Timeline>(path).then(setTimeline)
      .catch(e=>setError(e instanceof Error?e.message:'纵向记录暂不可用'))
      .finally(()=>setBusy(false))
  }
  const older=()=>{
    if(!timeline?.nextCursor)return
    setBusy(true);setError('')
    void api<Timeline>(path+'?cursor='+encodeURIComponent(timeline.nextCursor))
      .then(next=>setTimeline(old=>old?{
        ...old,list:[...old.list,...next.list],nextCursor:next.nextCursor,
      }:next))
      .catch(e=>setError(e instanceof Error?e.message:'历史记录加载失败'))
      .finally(()=>setBusy(false))
  }
  return <section className="ht-panel" aria-label="学校纵向评价与持续改进">
    <h2>纵向评价与持续改进</h2>
    <p>以稳定的教师、团队或学校对象追踪活动，版本、样本或方法不可比时，
      只并列展示正式来源，不计算未经审核的变化分数。</p>
    {error&&<p className="ht-notice" role="status">{error}</p>}
    <div className="ht-inline">
      <label className="ht-field"><span>改进对象</span>
        <select value={targetId} onChange={e=>{setTargetId(e.target.value);setTimeline(null)}}>
          <option value="">选择正式评价对象</option>
          {targets.map(target=><option key={target.id} value={target.id}>
            {target.kind} · {target.name}</option>)}
        </select></label>
      <button disabled={!targetId||busy} onClick={load}>查看正式活动时间线</button>
    </div>
    {timeline&&<div className="ht-event-list">
      {timeline.list.map(entry=><article className="ht-event" key={entry.eventId}>
        <strong>{entry.title}</strong> · <span className="ht-tag">{entry.status}</span>
        <p>{new Date(entry.createdAt).toLocaleDateString('zh-CN')} · {entry.kind}</p>
        <p className="ht-muted">来源：{entry.sourceKind}，
          工具版本 {entry.instrumentVersions.length} 项；不代表科学可比。</p>
        {entry.instrumentVersions.map((v,i)=><p key={i} className="ht-muted">
          {v.family} · {v.version}</p>)}
        {entry.status==='CLOSED'&&<button type="button"
          onClick={()=>setSourceEventId(entry.eventId)}>
          以本次评价建立改进行动</button>}
      </article>)}
      {timeline.nextCursor&&<button disabled={busy} onClick={older}>更早的评价事件</button>}
      <p className="ht-muted">{timeline.note}</p>
    </div>}
    {selected&&import.meta.env.VITE_HUITEACHER_IMPROVEMENT_ENABLED==='true'
      &&<HuiteacherImprovementPanel key={organizationId+':'+targetId}
        organizationId={organizationId} targetId={targetId}
        targetName={selected.name} api={api} audience="SCHOOL_SHARED"
        sourceEventId={sourceEventId||null}/>}
  </section>
}
