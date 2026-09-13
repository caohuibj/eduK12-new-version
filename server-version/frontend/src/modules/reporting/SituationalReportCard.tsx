import React from 'react'

export interface SituationalReportMetric {
  key: string
  value: number | null
  unit?: string
  quality?: string
  label?: string | null
  construct?: string | null
  channelKey?: string | null
  displayPrecision?: number
  range?: { min: number; max: number } | null
  status?: string | null
}

export interface SituationalReportInterpretationView {
  metricKey: string
  headline: string
  summary: string
}

export interface SituationalReportView extends Record<string, unknown> {
  itemId: string
  type: 'SITUATIONAL'
  kind: 'situational'
  label: string | null
  instrumentKey?: string | null
  instrumentVersion?: string | null
  scoringVersion?: string | null
  metrics: SituationalReportMetric[]
  metricOrder?: string[]
  interpretations?: SituationalReportInterpretationView[]
  disclaimer?: string | null
  qualityState?: string | null
  qualityFlags?: string[]
  completedAt?: string | null
  totalTime?: number | null
  decryptError?: boolean
}

const formatMetric = (metric: SituationalReportMetric): string => {
  if (metric.value === null || !Number.isFinite(metric.value)) return '—'
  const precision = Math.max(0, metric.displayPrecision ?? 2)
  const value = metric.value.toFixed(precision)
  return metric.unit ? `${value} ${metric.unit}` : value
}

const orderedMetricsOf = (report: SituationalReportView): SituationalReportMetric[] => {
  if (!report.metricOrder?.length) return report.metrics
  const byKey = new Map(report.metrics.map((metric) => [metric.key, metric]))
  const ordered = report.metricOrder.map((key) => byKey.get(key)).filter((metric): metric is SituationalReportMetric => Boolean(metric))
  const used = new Set(ordered.map((metric) => metric.key))
  return [...ordered, ...report.metrics.filter((metric) => !used.has(metric.key))]
}

const SituationalReportCard: React.FC<{ report: SituationalReportView }> = ({ report }) => {
  if (report.decryptError) {
    return <p className="text-amber-700">该情境测评结果无法解密，指标未展示。</p>
  }

  const metrics = orderedMetricsOf(report)
  const interpretations = new Map((report.interpretations || []).map((item) => [item.metricKey, item]))
  const missingFrozenLabels = metrics.some((metric) => !metric.label)

  return (
    <div data-testid={`situational-report-${report.itemId}`} className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {report.instrumentKey && <span>工具：{report.instrumentKey}</span>}
        {report.instrumentVersion && <span>版本：{report.instrumentVersion}</span>}
        {report.scoringVersion && <span>评分：{report.scoringVersion}</span>}
        {report.qualityState && <span>数据质量：{report.qualityState}</span>}
        {report.completedAt && <span>完成时间：{new Date(report.completedAt).toLocaleString('zh-CN')}</span>}
      </div>

      {report.disclaimer && (
        <p className="rounded-lg bg-indigo-50 p-4 text-sm leading-6 text-indigo-900/80" data-testid="situational-report-disclaimer">
          {report.disclaimer}
        </p>
      )}

      <section aria-labelledby={`situational-metrics-${report.itemId}`}>
        <h3 id={`situational-metrics-${report.itemId}`} className="text-base font-semibold text-gray-800 mb-3">Construct × Channel</h3>
        {metrics.length === 0 ? (
          <p className="text-sm text-gray-500">当前冻结报告没有可展示的情境测评指标。</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {metrics.map((metric) => {
              const interpretation = interpretations.get(metric.key)
              return (
                <article key={metric.key} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-800 break-words">{metric.label || metric.key}</h4>
                      {(metric.construct || metric.channelKey) && <p className="mt-1 text-xs text-gray-500">{[metric.construct, metric.channelKey].filter(Boolean).join(' × ')}</p>}
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-lg font-semibold text-gray-900">{formatMetric(metric)}</span>
                  </div>
                  {interpretation && <><p className="mt-4 text-sm font-medium text-gray-800">{interpretation.headline}</p><p className="mt-1 text-sm leading-6 text-gray-600">{interpretation.summary}</p></>}
                  {(metric.status || metric.range || metric.quality) && (
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                      {metric.status && <span>状态：{metric.status}</span>}
                      {metric.range && <span>范围：{metric.range.min}–{metric.range.max}</span>}
                      {metric.quality && <span>质量：{metric.quality}</span>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {(report.qualityFlags || []).length > 0 && <p className="text-sm text-gray-600">质量标记：{report.qualityFlags!.join('、')}</p>}

      {missingFrozenLabels && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800" data-testid="situational-frozen-projection-limitation">
          当前冻结投影没有提供部分指标的冻结标签或解释文本；本页只展示本次结果中已有的指标键和值，不从最新内容定义补齐历史解释。
        </p>
      )}
    </div>
  )
}

export default SituationalReportCard
