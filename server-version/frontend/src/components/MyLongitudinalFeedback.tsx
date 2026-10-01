import { useRef, useState, useEffect } from 'react'
import apiClient from '../api/client'
import { ProductButton, ProductStatus } from './product-ui'

interface OwnProjection {
  kind: 'MY_LONGITUDINAL'
  referenceTrajectories?:{metrics:Record<string,{unified:boolean;points:Array<{ordinal:number;value:number|null;bandLabel:string|null;referenceVersion:string|null}>}>}
  waves: Array<{ ordinal: number; evidenceLevel: string; metrics: Record<string, { state: string; value?: number }> }>
  comparisons: Array<{ fromOrdinal: number; toOrdinal: number; metrics: Record<string, { comparability: string; delta?: number }> }>
  limitations: string[]
}
export function MyLongitudinalFeedback() {
  const [reports, setReports] = useState<Array<{ id: string; generatedAt: string; projection: OwnProjection }> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  useEffect(() => () => { epoch.current++ }, [])
  async function load() {
    const request = ++epoch.current
    setReports(null); setError(''); setBusy(true)
    try {
      const response = await apiClient.get<{ list: NonNullable<typeof reports> }>('/my-assessments/longitudinal')
      if (response.code !== 0 || !response.data) throw new Error(response.message || '暂时无法读取多次测评反馈')
      if (request === epoch.current) setReports(response.data.list)
    } catch (err) { if (request === epoch.current) setError(err instanceof Error ? err.message : '暂时无法读取多次测评反馈') }
    finally { if (request === epoch.current) setBusy(false) }
  }
  return <section className="mt-6 min-w-0 space-y-3">
    <h2 className="font-semibold">我的多次测评反馈</h2>
    <p>同一测评多次完成后，若内容允许且已有报告，可在这里查看自己的变化记录。</p>
    <ProductButton disabled={busy} onClick={() => void load()}>{busy ? '正在读取…' : '查看我的多次反馈'}</ProductButton>
    {error && <ProductStatus kind="error" title="反馈暂不可用">{error}</ProductStatus>}
    {reports?.length === 0 && <p>暂时没有可提供的多次测评反馈。</p>}
    {reports?.map((report, reportIndex) => {
      const metrics = [...new Set(report.projection.waves.flatMap(w => Object.keys(w.metrics)))]
      return <article key={report.id} className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
        <h3>多次测评反馈 {reportIndex + 1}</h3><p>报告生成于 {new Date(report.generatedAt).toLocaleDateString()}</p>
        {report.projection.waves.some(w => w.evidenceLevel === 'PILOT') && <p>部分测评处于试点阶段，请结合单次反馈谨慎理解。</p>}
        {metrics.map((metric, index) => <div key={metric} className="space-y-1"><p className="font-medium">指标 {index + 1}</p>
          {report.projection.referenceTrajectories?.metrics[metric] && <div><p>{report.projection.referenceTrajectories.metrics[metric].unified?'这几次按同一个参考范围说明，方便看自己的变化。':'这几次按各自适用的参考范围说明，区间名称不能直接当成进步或退步。'}</p>{report.projection.referenceTrajectories.metrics[metric].points.map(p=><p key={p.ordinal}>第 {p.ordinal} 次的位置：{p.bandLabel??'暂无匹配参考'}</p>)}</div>}
          {report.projection.waves.map(w => <p key={w.ordinal}>第 {w.ordinal} 次：{w.metrics[metric]?.state === 'present' ? w.metrics[metric].value : '暂无可用结果'}</p>)}
          {report.projection.comparisons.map(pair => <p key={`${pair.fromOrdinal}-${pair.toOrdinal}`}>第 {pair.fromOrdinal} 次 → 第 {pair.toOrdinal} 次：{pair.metrics[metric]?.delta !== undefined ? `变化 ${pair.metrics[metric].delta}` : '不展示变化值，请结合单次反馈理解。'}</p>)}
        </div>)}
        {report.projection.limitations.map(text => <p key={text}>{text}</p>)}
      </article>
    })}
  </section>
}
