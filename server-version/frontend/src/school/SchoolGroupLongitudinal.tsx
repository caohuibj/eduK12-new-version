import { useEffect,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'
type Source={runId:string;trackId:string;runName:string;publishedAt:string|null;
  resource:{family:string;key:string;version:string}}
type Spec={specId:string;title:string;version:number;
  analysisKind:'REPEATED_COHORT'|'MATCHED_LONGITUDINAL'}
type Catalog={sources:Source[];specs:Spec[];truncated:boolean}
type Report={artifactId:string;kind:'SCHOOL_LONGITUDINAL';state:'READY'|'WITHHELD';
  metrics:Record<string,Array<{wave:number;mean:number}>>;limitations:string[]}
const id=(s:Source)=>s.runId+':'+s.trackId

export function SchoolGroupLongitudinal({api,organizationId}:{
  api:SchoolApi;organizationId:string
}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [selected,setSelected]=useState<string[]>([])
  const [specId,setSpecId]=useState('')
  const [report,setReport]=useState<Report|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setCatalog(null);setSelected([]);setSpecId('');setReport(null);setError('')
    void api<Catalog>('/reports/groups/longitudinal/catalog?organizationId='+encodeURIComponent(organizationId))
      .then(data=>{if(active)setCatalog(data)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'报告目录不可用')})
    return ()=>{active=false}
  },[api,organizationId])
  const picked=catalog?.sources.filter(s=>selected.includes(id(s)))??[]
  const groups=new Set(picked.map(s=>s.resource.family+':'+s.resource.key))
  const chosen=catalog?.specs.find(s=>s.specId===specId)
  const ready=picked.length>=2&&picked.length<=4&&groups.size===1
    &&new Set(picked.map(s=>s.runId)).size===picked.length&&!!chosen
  const submit=async()=>{
    if(!ready||!chosen||busy)return
    if(!window.confirm('仅对完全相同的冻结学生集合进行校内支持性时间比较。确认每一版本与每个指标有独立可比性科学证据，且不得据此评价学生个人或教师绩效？'))return
    setBusy(true);setError('');setReport(null)
    try{
      setReport(await api<Report>('/reports/groups/longitudinal','POST',{
        organizationId,specId,analysisKind:chosen.analysisKind,
        sources:picked.map(x=>({runId:x.runId,trackId:x.trackId})),
      }))
    }catch(e){setError(e instanceof Error?e.message:'不满足相同参与者及科学可比性条件')}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>学校内部 · 固定群体纵向分析</h2>
    <p>只允许同一学生集合在同一工具上的两至四次正式测量。
      所有 Run 与活动均须结束，且每次至少有十名不同学生；任一波次人数不同、个体不一致或可比性证据缺失都会拒绝。</p>
    <p>这不是教师绩效报告，不支持学生对教师的个人评价发布，不对学生或家长自动开放。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {!catalog?<p>正在核对当前学校的正式波次与科学方案…</p>:<>
      <label className="hs-field"><span>纵向分析科学方案</span>
        <select value={specId} disabled={busy} onChange={e=>{setSpecId(e.target.value);setReport(null)}}>
          <option value="">选择独立审核的正式方案</option>
          {catalog.specs.map(s=><option key={s.specId} value={s.specId}>
            {s.title} · v{s.version}（{s.analysisKind==='MATCHED_LONGITUDINAL'?'匹配群体':'重复群体'}）
          </option>)}
        </select>
      </label>
      <fieldset className="hs-task-list">
        <legend>选择 2–4 个不同的校园 Run（必须为同一工具）</legend>
        {catalog.sources.map(source=><label className="hs-task-card" key={id(source)}>
          <input type="checkbox" checked={selected.includes(id(source))} disabled={busy}
            onChange={e=>{
              setReport(null)
              setSelected(old=>e.target.checked?[...old,id(source)]
                :old.filter(k=>k!==id(source)))
            }}/>
          <span>{source.runName} · {source.resource.family} {source.resource.key}
            （{source.resource.version}）</span>
        </label>)}
      </fieldset>
      {picked.length>1&&groups.size!==1&&<p role="alert">所选测量工具不一致，无法比较。</p>}
      {catalog.specs.length===0&&<p>没有满足当前学校最低人数要求的已审核纵向方案。</p>}
      {catalog.truncated&&<p>仅显示部分近期 Run；不得通过私有名单筛选绕过匿名门槛。</p>}
      <button disabled={busy||!ready} onClick={()=>void submit()}>
        经近期动态验证码核对后生成固定群体分析
      </button>
    </>}
    {report&&<section role="region" aria-label="固定群体纵向投影" className="hs-task-detail">
      <h3>{report.state==='READY'?'受限的描述性群体比较':'未达到披露要求'}</h3>
      {report.state==='READY'&&Object.entries(report.metrics).map(([metric,points])=>
        <article key={metric} className="hs-task-card">
          <h3>指标代码：{metric}</h3>
          {points.map(x=><p key={x.wave}>第 {x.wave} 次群体均值（保留一位小数）：{x.mean.toFixed(1)}</p>)}
        </article>)}
      {report.limitations.map((line,i)=><p key={i}>{line}</p>)}
      <button onClick={()=>setReport(null)}>关闭当前报告</button>
    </section>}
  </section>
}
