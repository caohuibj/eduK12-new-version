import React from 'react'

export interface SituationalReportMetric {
  key: string
  value: number | null
  unit?: string
  quality?: string
  label?: string | null
}

export interface SituationalReportView extends Record<string, unknown> {
  itemId: string
  type: 'SITUATIONAL'
  kind: 'situational'
  label: string | null
  instrumentKey?: string | null
  instrumentVersion?: string | null
  metrics: SituationalReportMetric[]
  qualityState?: string | null
  completedAt?: string | null
  totalTime?: number | null
  decryptError?: boolean
}

const formatMetric = (metric: SituationalReportMetric): string => {
  if (metric.value === null || !Number.isFinite(metric.value)) return '—'
  const value = Math.round(metric.value * 100) / 100
  return metric.unit ? `${value} ${metric.unit}` : String(value)
}

const SituationalReportCard: React.FC<{ report: SituationalReportView }> = ({ report }) => {
  if (report.decryptError) {
    return <p className="text-amber-700">该情境测评结果无法解密，指标未展示。</p>
  }

  const missingFrozenLabels = report.metrics.some((metric) => !metric.label)

  return (
    <div data-testid={`situational-report-${report.itemId}`} className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {report.instrumentKey && <span>工具：{report.instrumentKey}</span>}
        {report.instrumentVersion && <span>版本：{report.instrumentVersion}</span>}
        {report.qualityState && <span>数据质量：{report.qualityState}</span>}
        {report.completedAt && <span>完成时间：{new Date(report.completedAt).toLocaleString('zh-CN')}</span>}
      </div>

      <section aria-labelledby={`situational-metrics-${report.itemId}`}>
        <h3 id={`situational-metrics-${report.itemId}`} className="text-base font-semibold text-gray-800 mb-3">结果指标</h3>
        {report.metrics.length === 0 ? (
          <p className="text-sm text-gray-500">当前冻结报告没有可展示的情境测评指标。</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.metrics.map((metric) => (
              <div key={metric.key} className="rounded-lg bg-gray-50 px-4 py-3">
                <div className="text-lg font-semibold text-gray-800">{formatMetric(metric)}</div>
                <div className="text-xs text-gray-500">{metric.label || metric.key}</div>
                {metric.quality && <div className="mt-1 text-[11px] text-gray-400">{metric.quality}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {missingFrozenLabels && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800" data-testid="situational-frozen-projection-limitation">
          当前冻结投影没有提供部分指标的冻结标签或解释文本；本页只展示本次结果中已有的指标键和值，不从最新内容定义补齐历史解释。
        </p>
      )}
    </div>
  )
}

export default SituationalReportCard
