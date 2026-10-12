import {useEffect,useRef,useState} from 'react'
import type {SchoolApi} from './SchoolRecovery'

type Source={runId:string;trackId:string;name:string;
  resource:{family:string;key:string;version:string}}
type Spec={specId:string;title:string;version:number;
  privacy:{minimumCohortN?:number;minimumContributorN?:number}}
type Catalog={sources:Source[];specs:Spec[];truncated:boolean;note:string}
export type SchoolGeneralGroupV2Report={
  artifactId:string;kind:'SCHOOL_GENERAL_GROUP';state:'READY'|'WITHHELD';
  participantN:number|null;completedN:number|null;
  metrics:Record<string,{mean:number;validN?:number;missingN?:number;
    median?:number;sdPopulation?:number;sdSample?:number}>;
  limitations:string[];
}
const message=(err:unknown)=>err instanceof Error?err.message:'当前报告尚未正式发布或授权不满足条件'
export function SchoolGeneralGroupV2({api,organizationId}:{api:SchoolApi;organizationId:string}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [selectedSource,setSelectedSource]=useState('')
  const [selectedSpec,setSelectedSpec]=useState('')
  const [report,setReport]=useState<SchoolGeneralGroupV2Report|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const seq=useRef(0)
  const catalogPath='/reports/groups/general-v2/catalog?organizationId='
    +encodeURIComponent(organizationId)
  useEffect(()=>{
    const token=++seq.current
    setCatalog(null);setSelectedSource('');setSelectedSpec('')
    setReport(null);setError('');setNotice('')
    void api<Catalog>(catalogPath).then(data=>{
      if(token===seq.current)setCatalog(data)
    }).catch(e=>{if(token===seq.current)setError(message(e))})
    return ()=>{seq.current+=1}
  },[api,catalogPath])
  const source=catalog?.sources.find(x=>x.runId+':'+x.trackId===selectedSource)
  const spec=catalog?.specs.find(x=>x.specId===selectedSpec)
  const readPath=source&&spec
    ?'/reports/groups/general-v2/'+encodeURIComponent(organizationId)
      +'/'+encodeURIComponent(source.runId)+'/'+encodeURIComponent(source.trackId)
      +'/'+encodeURIComponent(spec.specId)
    :null
  const perform=(operation:'read'|'publish')=>{
    if(!source||!spec||!readPath)return
    if(operation==='publish'&&!window.confirm(
      '仅发布已独立审核、属于一般教育活动的群体报告。系统会固定本次披露结果，且不公开学生个人答案、心理个案或身份。确认发布？'))return
    const token=++seq.current
    setError('');setNotice('');setBusy(true);setReport(null)
    const call=operation==='publish'
      ?api<SchoolGeneralGroupV2Report>('/reports/groups/general-v2/release','POST',{
        organizationId,runId:source.runId,trackId:source.trackId,specId:spec.specId,
      })
      :api<SchoolGeneralGroupV2Report>(readPath)
    void call.then(value=>{
      if(token!==seq.current)return
      setReport(value)
      setNotice(operation==='publish'
        ?'受控群体报告已正式发布并固定快照。后续读取只返回已发布结果。'
        :'已按当前权限重新读取正式发布的群体报告。')
    }).catch(e=>{if(token===seq.current)setError(message(e))})
      .finally(()=>{if(token===seq.current)setBusy(false)})
  }
  return <section aria-label="学校一般教育调查群体报告" className="hs-panel">
    <h3>一般教育调查 · 群体反馈</h3>
    <p>只接受平台独立审核的非敏感资源、已经结束的正式学校活动和科学方案。
      默认沿用保存的隐私偏好，不需要每次重新配置。历史与心理健康报告仍按原规则。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {notice&&<p role="status" className="hs-message">{notice}</p>}
    {!catalog?<p>正在核验科学方案与非敏感资源的报告资格…</p>:<>
      <p className="hs-muted">{catalog.note}</p>
      <label className="hs-field"><span>一般教育活动的正式 Run</span>
        <select value={selectedSource} onChange={e=>{
          setSelectedSource(e.target.value);setReport(null)
        }}><option value="">选择经审核的 Run</option>
          {catalog.sources.map(x=><option key={x.runId+':'+x.trackId}
            value={x.runId+':'+x.trackId}>
            {x.name} · {x.resource.family} {x.resource.key} ({x.resource.version})
          </option>)}
        </select>
      </label>
      <label className="hs-field"><span>已发布的 GROUP 科学分析方案</span>
        <select value={selectedSpec} onChange={e=>{
          setSelectedSpec(e.target.value);setReport(null)
        }}><option value="">选择经过独立审查的方案</option>
          {catalog.specs.map(x=><option value={x.specId} key={x.specId}>
            {x.title} · v{x.version}
          </option>)}
        </select>
      </label>
      {catalog.truncated&&<p>目录只显示有限近期来源，无法通过临时筛选绕过科学方案审核。</p>}
      <div className="hs-actions">
        <button disabled={busy||!source||!spec}
          onClick={()=>perform('publish')}>正式发布一次群体报告</button>
        <button disabled={busy||!source||!spec}
          onClick={()=>perform('read')}>读取已发布结果</button>
      </div>
    </>}
    {report&&<div className="hs-task-detail" role="region"
      aria-label="已发布的一般教育群体统计">
      <h4>{report.state==='READY'?'正式群体报告':'群体报告被抑制'}</h4>
      {report.state==='READY'&&<>
        <p>参与人数：{report.participantN??'受限'} · 有效人数：{report.completedN??'受限'}</p>
        <div className="hs-task-list">
          {Object.entries(report.metrics).map(([key,metric])=>
            <article key={key} className="hs-task-card">
              <h4>指标：{key}</h4>
              <p>均值：{metric.mean}</p>
              {metric.validN!==undefined&&<p>有效：{metric.validN} · 缺失：{metric.missingN}</p>}
              {metric.median!==undefined&&<p>中位数：{metric.median}</p>}
              {metric.sdPopulation!==undefined&&<p>总体标准差：{metric.sdPopulation}</p>}
              {metric.sdSample!==undefined&&<p>样本标准差：{metric.sdSample}</p>}
            </article>)}
        </div>
      </>}
      {report.limitations.map((line,i)=><p key={i}>{line}</p>)}
      <button type="button" onClick={()=>{seq.current++;setReport(null)}}>关闭报告</button>
    </div>}
  </section>
}
