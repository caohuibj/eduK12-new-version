import {SurveyReinterpretationStudio} from './SurveyReinterpretationStudio'
import {useEffect,useRef,useState} from 'react'
type Pointer={releaseId:string;contentHash:string}
type List={list:{finalId:string;attemptCode:string;completedAt:string;reports:{instrumentKey:string;measurementRelease:Pointer;reportRelease:Pointer|null;status:string}[]}[];nextAfterId:string|null}
export type DeclaredReport={title:string|null;blocks:unknown[];limitations:string[];disclaimer:string|null}
type View={accessAudience:'researcher';intendedAudience:string;sourceFinalHash:string;contentBindingHash:string;reportRelease:Pointer;
  interpretationSemantics:string;lifecycleNotices:{layer:string;releaseId:string;status:string}[];report:DeclaredReport}
const text=(value:unknown)=>typeof value==='string'?value:''
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const valueText=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?String(value):'不可用'
function Block({value}:{value:unknown}){
  const block=record(value)
  if(block.type==='TEXT')return <p className="whitespace-pre-wrap">{text(block.text)}</p>
  if(block.type==='REFERENCE_BAND')return <section><p className="whitespace-pre-wrap">{text(block.text)}</p>
    {Array.isArray(block.guidance)&&block.guidance.map((line,index)=><p key={index}>{text(line)}</p>)}</section>
  if(block.type==='METRIC')return <p>{text(block.label)||text(block.metricKey)}：{valueText(block.value)} {text(block.unit)}
    {Array.isArray(block.referenceStatus)&&block.referenceStatus.map((ref,index)=>{const r=record(ref);return <span key={index}> · {text(r.referenceKind)}：{text(r.status)}</span>})}</p>
  if(block.type==='CHART')return <figure><figcaption>{text(block.caption)||'冻结指标表'}</figcaption><table className="w-full text-sm"><thead><tr><th>指标</th><th>值</th><th>单位</th></tr></thead>
    <tbody>{Array.isArray(block.metrics)&&block.metrics.map((entry,index)=>{const metric=record(entry);return <tr key={index}><th>{text(metric.metricKey)}</th><td>{valueText(metric.value)}</td><td>{text(metric.unit)}</td></tr>})}</tbody></table></figure>
  if(block.type==='ASSET')return <p>附件：{text(block.alt)}（未取得独立附件访问链接，不加载资源）</p>
  return null
}
export function SurveyDeclaredReport({report}:{report:DeclaredReport}){return <>
  <h4 className="font-semibold">{report.title??'版本报告'}</h4>
  {report.blocks.map((block,index)=><Block key={index} value={block}/>)}
  {report.limitations.map((line,index)=><p key={index}>{line}</p>)}<p>{report.disclaimer}</p>
</>}
/** Data-only report view: React text escaping, no HTML/script or guessed asset URL. */
export function SurveyStoredReportReader({actorId,projectId,waveId,request}:{actorId?:string;projectId:string;waveId:string;request:<T>(path:string,method?:string,body?:unknown)=>Promise<T>}){
  const [list,setList]=useState<List|null>(null),[view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [selected,setSelected]=useState<{finalId:string;instrumentKey:string}|null>(null)
  const epoch=useRef(0)
  useEffect(()=>{epoch.current++;setSelected(null);setList(null);setView(null);setError('');setBusy(false);return()=>{epoch.current++}},[projectId,waveId])
  const base='/projects/'+encodeURIComponent(projectId)+'/analytics/waves/'+encodeURIComponent(waveId)
  const run=async(work:()=>Promise<void>)=>{const current=++epoch.current;setBusy(true);setError('');setView(null)
    try{await work()}catch(e){if(current===epoch.current){setSelected(null);setList(null);setView(null);setError(e instanceof Error?e.message:'报告读取失败')}}
    finally{if(current===epoch.current)setBusy(false)}}
  const load=(afterId?:string)=>void run(async()=>{
    const current=epoch.current
    const result=await request<List>(base+'/reports'+(afterId?'?afterId='+encodeURIComponent(afterId):''))
    if(current===epoch.current)setList(result)
  })
  const read=(finalId:string,instrumentKey:string)=>void run(async()=>{
    const current=epoch.current
    const result=await request<View>(base+'/finals/'+encodeURIComponent(finalId)+'/reports/'+encodeURIComponent(instrumentKey))
    if(current===epoch.current)setView(result)
  })
  return <section className="border rounded-xl p-4 space-y-3" aria-label="已保存版本报告">
    <h3 className="font-semibold">研究者查看版本报告</h3>
    <p className="text-sm">当前项目数据权限与近期 MFA 生效后读取。列表只含已保存指针；点击才加载精确 FINAL 的报告。不重算分数或重新选择参考，不扩大被试披露。</p>
    <button type="button" className="btn-secondary" disabled={busy||!waveId} onClick={()=>load()}>读取报告列表</button>
    {error&&<p role="alert">{error}</p>}
    {list&&<div className="space-y-2">{list.list.length===0&&<p>本页没有可访问的 FINAL。</p>}
      {list.list.map(row=><article key={row.finalId} className="border-b py-2"><p>{row.attemptCode} · {new Date(row.completedAt).toLocaleString('zh-CN')}</p>
        {!row.reports.length&&<p>此 FINAL 未保存三层报告绑定。</p>}
        {row.reports.map(report=><div key={report.instrumentKey} className="space-x-2"><span>{report.instrumentKey} · {report.status}</span>
          {report.reportRelease&&<span className="text-xs">报告版本 {report.reportRelease.releaseId}</span>}
          <button type="button" className="btn-secondary" disabled={busy||report.status!=='READY'||!report.reportRelease}
            onClick={()=>read(row.finalId,report.instrumentKey)}>查看 {report.instrumentKey} 报告</button>
          {actorId&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>setSelected({finalId:row.finalId,instrumentKey:report.instrumentKey})}>为 {report.instrumentKey} 创建新解释</button>}</div>)}
      </article>)}
      <button type="button" className="btn-secondary" disabled={busy||!list.nextAfterId} onClick={()=>load(list.nextAfterId!)}>下一页报告记录</button>
    </div>}
    {selected&&actorId&&<SurveyReinterpretationStudio key={actorId+':'+projectId+':'+waveId+':'+selected.finalId+':'+selected.instrumentKey}
      actorId={actorId} projectId={projectId} waveId={waveId} {...selected} request={request}/>}
    {view&&<article aria-label="精确 FINAL 报告" className="border rounded p-3 space-y-3">
      <h4 className="font-semibold">{view.report.title??'版本报告'}</h4>
      <p className="text-xs">研究者访问 · 模板受众 {view.intendedAudience} · 报告版本 {view.reportRelease.releaseId}</p>
      <p className="text-xs break-all">FINAL 摘要 {view.sourceFinalHash} · 绑定摘要 {view.contentBindingHash}</p>
      {view.lifecycleNotices.map(notice=><p key={notice.layer+notice.releaseId} role="status">当前版本状态：{notice.layer} {notice.releaseId} · {notice.status}。保留已保存解释，不重新选择。</p>)}
      {view.report.blocks.map((block,index)=><Block key={index} value={block}/>)}
      {view.report.limitations.map((line,index)=><p key={index}>{line}</p>)}<p>{view.report.disclaimer}</p>
    </article>}
  </section>
}
