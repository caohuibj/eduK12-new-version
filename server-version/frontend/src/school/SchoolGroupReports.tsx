import { useEffect,useRef,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type GroupSource={
  runId:string;trackId:string;name:string
  resource:{family:string;key:string;version:string}
}
type GroupSpec={specId:string;title:string;version:number;metricIds:string[];
  privacy:{minimumCohortN?:number;minimumContributorN?:number}}
type Catalog={specs:GroupSpec[];sources:GroupSource[];truncated:boolean}
type GroupReport={
  artifactId:string;kind:'SCHOOL_GROUP';state:'READY'|'WITHHELD';
  metrics:Record<string,{mean:number}>;limitations:string[]
}
const reason=(error:unknown)=>error instanceof Error&&error.message
  ?error.message:'当前学校没有生成或读取此群体报告的权限'

/** Intentionally not a report publication surface. Values are held in memory;
 * only after current server authorization, never stored in a URL or browser.
 */
export function SchoolGroupReports({api,organizationId}:{
  api:SchoolApi;organizationId:string
}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [selection,setSelection]=useState('')
  const [specId,setSpecId]=useState('')
  const [report,setReport]=useState<GroupReport|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const current=useRef(0)
  const path='/reports/groups/catalog?organizationId='+encodeURIComponent(organizationId)
  useEffect(()=>{
    const token=++current.current
    setCatalog(null);setSelection('');setSpecId('');setReport(null);setError('');setNotice('')
    void api<Catalog>(path).then(data=>{
      if(token===current.current)setCatalog(data)
    }).catch(e=>{if(token===current.current)setError(reason(e))})
    return ()=>{current.current+=1}
  },[api,organizationId,path])
  const source=catalog?.sources.find(s=>s.runId+':'+s.trackId===selection)
  const selectedSpec=catalog?.specs.find(s=>s.specId===specId)
  const generate=async()=>{
    if(!source||!selectedSpec)return
    const token=++current.current
    setReport(null);setNotice('');setError('')
    if(!window.confirm('仅用于本校内部群体支持性研究。确认正式 Run 与活动已结束、科学方案已经独立审核，且本次请求不用于识别学生或评价教师个人？'))return
    setBusy(true)
    try{
      const result=await api<GroupReport>('/reports/groups','POST',{
        organizationId,runId:source.runId,trackId:source.trackId,specId:selectedSpec.specId,
      })
      if(token!==current.current)return
      setReport(result)
      setNotice(result.state==='READY'?'已生成受限的校内群体摘要；没有向教师、学生或家长发布。'
        :'已保持抑制：该群体还不符合完整贡献者披露条件。')
    }catch(e){if(token===current.current)setError(reason(e))}
    finally{if(token===current.current)setBusy(false)}
  }
  const reread=async()=>{
    if(!report)return
    const token=++current.current
    const id=report.artifactId
    setReport(null);setError('');setBusy(true)
    try{
      const result=await api<GroupReport>(
        '/reports/groups/'+encodeURIComponent(organizationId)+'/'+encodeURIComponent(id))
      if(token===current.current)setReport(result)
    }catch(e){if(token===current.current)setError(reason(e))}
    finally{if(token===current.current)setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>学校内部 · 受控群体报告</h2>
    <p>仅使用已发布的正式科学方案和整组学生自评 Run，须在活动与 Run 结束后经过释放等待期。
      学生人数、作答时间、成员名单和原始答案不会进入此页面；不会向被评价教师或家长自动发布。</p>
    <p>现阶段只供校内授权人员开展支持性分析。群体均值不能证明某种教育措施产生了因果效果，也不能用于个人诊断、排名或绩效考核。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {notice&&<p role="status" className="hs-message">{notice}</p>}
    {!catalog?<p>正在核查校园报告权限与已发布方案…</p>:<>
      <label className="hs-field"><span>选择正式校园测评来源</span>
        <select value={selection} onChange={e=>{setSelection(e.target.value);setReport(null)}}>
          <option value="">请选择已投放的学生自评测评</option>
          {catalog.sources.map(s=><option key={s.runId+':'+s.trackId} value={s.runId+':'+s.trackId}>
            {s.name} · {s.resource.family} {s.resource.key}（{s.resource.version}）
          </option>)}
        </select>
      </label>
      <label className="hs-field"><span>选择经过正式审核的群体分析方案</span>
        <select value={specId} onChange={e=>{setSpecId(e.target.value);setReport(null)}}>
          <option value="">请选择 GROUP 科学方案</option>
          {catalog.specs.map(s=><option key={s.specId} value={s.specId}>
            {s.title} · v{s.version}
          </option>)}
        </select>
      </label>
      {catalog.truncated&&<p>当前目录仅显示有限近期资源，未出现的项目需先由平台科学管理员核查，不应绕过审查自行分析。</p>}
      {catalog.specs.length===0&&<p>尚无达到校园技术人数下限的已发布方案。
        请在平台科学治理流程中独立审核方案，不要临时降低门槛。</p>}
      {catalog.sources.length===0&&<p>暂无可以纳入此校内工作台的正式学生自评来源。</p>}
      <button disabled={busy||!source||!selectedSpec} onClick={()=>void generate()}>
        通过二次验证生成受限群体摘要
      </button>
    </>}
    {report&&<div role="region" aria-label="校内群体受限投影" className="hs-task-detail">
      <h3>{report.state==='WITHHELD'?'数据暂不符合披露条件':'正式群体结果（受限）'}</h3>
      {report.state==='WITHHELD'?<p>样本或有效贡献不满足当前披露要求。
        系统不会展示人数、分数、差值或参与者清单，也不能通过换筛选方式反复尝试定位同学。</p>:
      <div className="hs-task-list">
        {Object.entries(report.metrics).map(([metric,v])=>
          <article className="hs-task-card" key={metric}>
            <h3>指标代码：{metric}</h3>
            <p>组内均值（仅保留一位小数）：{v.mean.toFixed(1)}</p>
            <p>没有当前工具的适龄审核文字，指标代码不构成心理解释。</p>
          </article>)}
      </div>}
      {report.limitations.map((s,i)=><p key={i}>{s}</p>)}
      <button disabled={busy} onClick={()=>void reread()}>按最新权限重新核对报告</button>
      <button onClick={()=>{current.current+=1;setReport(null)}}>关闭投影</button>
    </div>}
  </section>
}
