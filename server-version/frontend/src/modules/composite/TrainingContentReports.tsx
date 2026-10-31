import type { CompositeReportAudience, TrainingContentReport } from './types'
import { ReportSection } from '../reporting/ReportPrimitives'

const text=(value:unknown)=>typeof value==='string'?value:''
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
const statuses:Record<string,string>={READY:'可读取',REVOKED:'已撤销',NOT_SELECTED:'未选择报告版本',UNAVAILABLE:'暂不可用',RETIRED:'已退役',PUBLISHED:'已发布'}
function Metric({value}:{value:Record<string,unknown>}){
  const available=value.status==='INTERPRETABLE'&&value.display!=='REFERENCE_RESULT'&&typeof value.value==='number'&&Number.isFinite(value.value)
  return <><span>{available?String(value.value):'不可用'}</span>{text(value.unit)&&<span> {text(value.unit)}</span>}{value.status==='INVALID'&&<span>（质量无效）</span>}</>
}
function DeclaredBlock({value,showMetricKeys=true}:{value:unknown;showMetricKeys?:boolean}){
  const block=object(value)
  if(!block)return null
  switch(block.type){
    case 'TEXT':return <p className="whitespace-pre-wrap">{text(block.text)}</p>
    case 'METRIC':return <p>{text(block.label)||(showMetricKeys?text(block.metricKey):'测评指标')}：<Metric value={block}/></p>
    case 'REFERENCE_BAND':return <div><p>{text(block.text)}</p>{Array.isArray(block.guidance)&&<ul>{block.guidance.filter(line=>typeof line==='string').map((line,index)=><li key={index}>{line}</li>)}</ul>}</div>
    // No asset URL is authorized by this DTO. Never render a URL, image or media element.
    case 'ASSET':return <p>图片替代文本：{text(block.alt)||'未提供说明'}（未提供授权资源链接）</p>
    case 'CHART':{
      const metrics=Array.isArray(block.metrics)?block.metrics.map(object).filter((metric):metric is Record<string,unknown>=>!!metric):[]
      return <div>{text(block.caption)&&<p>{text(block.caption)}</p>}<table className="w-full text-left"><caption>{showMetricKeys?'冻结指标数据':'获准的测评结果'}</caption><thead><tr><th scope="col">指标</th><th scope="col">结果与单位</th></tr></thead><tbody>{metrics.map((metric,index)=><tr key={index}><th scope="row">{text(metric.label)||(showMetricKeys?text(metric.metricKey):'测评指标')}</th><td><Metric value={metric}/></td></tr>)}</tbody></table></div>
    }
    default:return null
  }
}
/** Data-only rendering shared by entry-specific authorized projections. This
 * accepts no transport and grants no participant access to Training reports. */
export function DeclaredReportContent({report,showMetricKeys=true}:{report:NonNullable<TrainingContentReport['rendered']>;showMetricKeys?:boolean}){
  return <>
    {Array.isArray(report.blocks)&&report.blocks.map((block,i)=><DeclaredBlock key={i} value={block} showMetricKeys={showMetricKeys}/>)}
    {Array.isArray(report.limitations)&&report.limitations.length>0&&<div><h4>局限说明</h4><ul>{report.limitations.filter(line=>typeof line==='string').map((line,i)=><li key={i}>{line}</li>)}</ul></div>}
    {typeof report.disclaimer==='string'&&report.disclaimer&&<p>{report.disclaimer}</p>}
  </>
}
/** Presentation only: consume the server's exact saved-fact projection, never infer metrics or interpret references. */
export function TrainingContentReports({reports,audience,partial=false}:{reports?:TrainingContentReport[];audience:CompositeReportAudience;partial?:boolean}){
  if(partial||!['teacher','researcher'].includes(audience)||!Array.isArray(reports)||!reports.length)return null
  return <ReportSection title="冻结版本私有报告" description="依据本次作答冻结的报告版本和已保存结果展示。版本状态变化单独标示，不重新计分。">
    <div className="space-y-5">{reports.map((report,index)=><article key={report.itemId+':'+index} className="rounded border p-4 space-y-3" aria-label={'私有报告 '+report.itemId}>
      <h3 className="font-semibold">{report.status==='READY'?report.rendered?.title||'私有报告':'私有报告'} · 单元 {report.itemId}</h3>
      <p>报告状态：{statuses[report.status]||'暂不可用'}</p>
      {report.reportRelease&&<dl className="break-all"><dt>精确报告版本 ID</dt><dd>{report.reportRelease.releaseId}</dd><dt>内容校验值</dt><dd>{report.reportRelease.contentHash}</dd></dl>}
      {report.lifecycleNotices?.map((notice,i)=><p key={i} role="status">版本状态变更：{notice.layer} · {notice.releaseId} · {statuses[notice.status]||notice.status}</p>)}
      {report.status==='REVOKED'&&<p>测量或报告版本已撤销，停止展示报告内容；原始已保存计分事实未被改写。</p>}
      {report.status==='READY'&&report.rendered?.generatorVersion==='DECLARATIVE_REPORT_V1'&&<>
        <DeclaredReportContent report={report.rendered}/>
      </>}
      {report.status==='READY'&&report.rendered?.generatorVersion!=='DECLARATIVE_REPORT_V1'&&<p>报告格式暂不支持，未展示内容。</p>}
    </article>)}</div>
  </ReportSection>
}
