import React, { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, History, Loader2, TriangleAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { situationalApi } from '../api'
import { downloadSituationalExport } from '../export'
import { situationalErrorMessage } from '../draft'
import type { SituationalAttemptResponse, SituationalMetric } from '../types'

const formatMetricValue = (metric: SituationalMetric): string => (
  metric.value === null ? '暂不可计算' : metric.value.toFixed(metric.displayPrecision)
)

const SituationalResult: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<SituationalAttemptResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!attemptId) {
      setError('测评记录标识缺失')
      setLoading(false)
      return
    }
    void situationalApi.result(attemptId)
      .then((response) => {
        if (response.code !== 0) throw Object.assign(new Error(response.message), { code: response.code })
        if (!response.data.result) {
          navigate(`/student/situational/${encodeURIComponent(response.data.attempt.instrumentKey)}`, { replace: true })
          return
        }
        if (!cancelled) setData(response.data)
      })
      .catch((reason) => {
        if (!cancelled) setError(situationalErrorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [attemptId, navigate])

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载权威结果…</div>
  if (error || !data || !data.result) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700"><TriangleAlert className="mx-auto mb-3 h-8 w-8" /><p role="alert">{error || '结果暂时无法读取'}</p><button type="button" onClick={() => navigate('/student/situational/history')} className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm">查看历史</button></div>

  const result = data.result
  const orderedMetrics = data.instrument.report.metricOrder
    .map((key) => result.metrics.find((metric) => metric.key === key))
    .filter((metric): metric is SituationalMetric => Boolean(metric))
  const interpretations = new Map(data.instrument.report.interpretations.map((item) => [item.metricKey, item]))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /><span className="text-sm font-medium">测评已完成</span></div><h1 className="mt-2 text-2xl font-bold text-gray-900">情境化测评结果</h1><p className="mt-2 text-sm text-gray-500">{data.attempt.instrumentKey} · v{data.attempt.instrumentVersion} · {data.attempt.scoringVersion}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => downloadSituationalExport(data, 'json')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />JSON</button><button type="button" onClick={() => downloadSituationalExport(data, 'csv')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />CSV</button></div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5"><div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">试点阶段结果</div><p className="mt-2 text-sm leading-6 text-indigo-900/80">{data.instrument.report.disclaimer}</p><p className="mt-2 text-xs leading-5 text-indigo-900/70">本页面只展示服务器保存的 Construct × Channel 指标。没有百分位、常模或参考分布；不同通道不应简单合成为单一人格结论。</p></div>

      <section aria-labelledby="situational-metrics-title"><div className="mb-3 flex items-center justify-between"><h2 id="situational-metrics-title" className="text-lg font-semibold text-gray-900">Construct × Channel</h2><span className={`rounded-full px-3 py-1 text-xs font-medium ${result.quality.status === 'interpretable' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>质量：{result.quality.status}</span></div><div className="grid gap-4 md:grid-cols-2">{orderedMetrics.map((metric) => { const interpretation = interpretations.get(metric.key); return <article key={metric.key} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{metric.label}</h3><p className="mt-1 text-xs text-gray-500">{metric.construct} × {metric.channelKey}</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-semibold text-slate-900">{formatMetricValue(metric)}</span></div>{interpretation && <><p className="mt-4 text-sm font-medium text-gray-800">{interpretation.headline}</p><p className="mt-1 text-sm leading-6 text-gray-600">{interpretation.summary}</p></> }<div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500"><span>状态：{metric.status}</span>{metric.range && <span>范围：{metric.range.min}–{metric.range.max}</span>}</div></article> })}</div></section>

      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-base font-semibold text-gray-900">质量与限制</h2><p className="mt-2 text-sm text-gray-600">服务器质量状态：{result.quality.status}</p>{result.quality.flags.length > 0 && <p className="mt-1 text-sm text-gray-600">质量标记：{result.quality.flags.join('、')}</p>}<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">{data.instrument.report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>

      <div className="flex flex-wrap gap-3"><Link to="/student/situational/history" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><History className="h-4 w-4" />测评历史</Link><Link to="/student/situational" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><ArrowLeft className="h-4 w-4" />返回题包</Link></div>
    </div>
  )
}

export default SituationalResult

