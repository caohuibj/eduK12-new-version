import {useMemo} from 'react'
import {ReportTrendChart} from './ReportTrendChart'
import {toPersonalChangesTrend,type PersonalChangesMetric} from './longitudinalVisualization'

export type PersonalChangesResponse={status:'NOT_CONFIGURED'|'WAITING'|'AVAILABLE';reportId?:string;generatedAt?:string;
  metrics?:PersonalChangesMetric[];note?:string}
const signed=(n:number)=>n>0?'+'+n:String(n)
const missing:Record<string,string>={NOT_COMPLETED:'本轮未完成',NOT_EXECUTED:'本轮未呈现此工具',PENDING_RELEASE:'本轮指标尚未开放',NOT_DISCLOSED:'本轮暂不提供本人指标',NOT_COMPARABLE:'测量定义不可比',INVALID_OR_MISSING:'指标无效或缺失'}
function Metric({metric}:{metric:PersonalChangesMetric}){
  const model=useMemo(()=>toPersonalChangesTrend(metric),[metric])
  return <article className="min-w-0 space-y-3 rounded-xl border p-3">
    <ReportTrendChart model={model} title={metric.label} valueLabel="原始值" description={'单位：'+metric.unit}/>
    <table className="w-full text-sm"><caption>{metric.label}各轮记录</caption><thead><tr><th>轮次</th><th>实际完成时间</th><th>原始值</th></tr></thead><tbody>
      {metric.points.map(point=><tr key={point.ordinal}><th>T{point.ordinal}</th><td>{point.observedAt?new Date(point.observedAt).toLocaleString('zh-CN'):'—'}</td><td>{point.value===null?(missing[point.missingReason??'']??'暂无结果'):point.value}</td></tr>)}
    </tbody></table>
    {metric.adjacent.map(pair=><p key={'adjacent'+pair.toOrdinal}>T{pair.fromOrdinal} → T{pair.toOrdinal}：{pair.delta===null?'暂无相邻变化值':signed(pair.delta)+' '+metric.unit}</p>)}
    {metric.baseline.map(pair=><p key={'baseline'+pair.toOrdinal}>相对基线 T{pair.fromOrdinal} → T{pair.toOrdinal}：{pair.delta===null?'暂无基线变化值':signed(pair.delta)+' '+metric.unit}{pair.intermediateMissing?'（中间轮次缺失）':''}</p>)}
    <p>以上仅是数值变化，请结合各次作答时的实际情况理解。</p>
  </article>
}
export function PersonalChangesReport({report}:{report:PersonalChangesResponse}){
  return <section aria-label="我的变化" className="min-w-0 space-y-3"><h3 className="font-semibold">我的变化</h3>
    {report.status==='NOT_CONFIGURED'?<p>这项测评未配置纵向追踪。</p>:report.status==='WAITING'?<p>同一指标具备两轮有效、可比较且允许本人查看的结果后，即可查看变化。</p>:<>
      {report.metrics?.map(metric=><Metric key={metric.id} metric={metric}/>)}
      <p>{report.note}</p>
      {report.generatedAt&&<p className="text-xs">此份变化报告生成于 {new Date(report.generatedAt).toLocaleString('zh-CN')}</p>}
    </>}
  </section>
}
