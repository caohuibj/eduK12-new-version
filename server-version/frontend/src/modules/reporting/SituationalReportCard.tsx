import type { SituationalScientificContext } from '../situational/types'
import React from 'react'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportRangeTrack,
  ReportSection,
} from './ReportPrimitives'

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
  scientificContext?: SituationalScientificContext
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

const unique = (values: string[]) => [...new Set(values)]

const SituationalReportCard: React.FC<{ report: SituationalReportView }> = ({ report }) => {
  if (report.decryptError) {
    return <p className="text-amber-700">该情境测评结果无法解密，指标未展示。</p>
  }

  const metrics = orderedMetricsOf(report)
  const interpretations = new Map((report.interpretations || []).map((item) => [item.metricKey, item]))
  const missingFrozenLabels = metrics.some((metric) => !metric.label)
  const matrixReady = metrics.length > 0 && metrics.every((metric) => Boolean(metric.construct && metric.channelKey))
  const constructs = matrixReady ? unique(metrics.map((metric) => metric.construct!)) : []
  const channels = matrixReady ? unique(metrics.map((metric) => metric.channelKey!)) : []
  const showMatrix = constructs.length > 0 && channels.length > 1

  return (
    <div data-testid={`situational-report-${report.itemId}`} className="space-y-5">
      <ReportCoreSummary label="报告范围">
        <p className="text-sm font-normal">
          本报告按冻结的情境测评指标展示不同 construct 与 channel；各指标独立阅读，不由前端合成为新的总分。
        </p>
      </ReportCoreSummary>

      <ReportSection
        title="Construct × Channel"
        eyebrow="结果概览"
        description={showMatrix
          ? '矩阵只重排冻结报告中已有的 construct、channel 与值；颜色不编码好坏。'
          : '当前冻结报告未形成完整的 construct × channel 矩阵，改为逐项展示已有指标。'}
      >
        {metrics.length === 0 ? (
          <p className="text-sm text-gray-500">当前冻结报告没有可展示的情境测评指标。</p>
        ) : showMatrix ? (
          <div className="overflow-x-auto">
            <table className="min-w-[34rem] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3">Construct</th>
                  {channels.map((channel) => <th key={channel} className="px-3 py-2 text-center">{channel}</th>)}
                </tr>
              </thead>
              <tbody>
                {constructs.map((construct) => (
                  <tr key={construct} className="border-b border-gray-100 last:border-0">
                    <th className="py-3 pr-3 font-medium text-gray-800">{construct}</th>
                    {channels.map((channel) => {
                      const metric = metrics.find((item) => item.construct === construct && item.channelKey === channel)
                      return (
                        <td key={channel} className="px-3 py-3 text-center">
                          {metric ? <strong className="text-gray-900">{formatMetric(metric)}</strong> : <span className="text-gray-400">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ReportMetricGrid>
            {metrics.map((metric) => (
              metric.range ? (
                <ReportRangeTrack
                  key={metric.key}
                  label={metric.label || metric.key}
                  value={metric.value}
                  formattedValue={formatMetric(metric)}
                  range={metric.range}
                  status={metric.status || metric.quality || undefined}
                />
              ) : (
                <ReportMetric
                  key={metric.key}
                  label={metric.label || metric.key}
                  value={formatMetric(metric)}
                  description={[metric.construct, metric.channelKey].filter(Boolean).join(' × ') || undefined}
                  meta={metric.status || metric.quality || undefined}
                />
              )
            ))}
          </ReportMetricGrid>
        )}
      </ReportSection>

      {(report.interpretations || []).length > 0 && (
        <ReportSection title="如何理解这些结果" eyebrow="解释">
          <div className="report-feedback-list">
            {(report.interpretations || []).map((interpretation) => {
              const metric = metrics.find((item) => item.key === interpretation.metricKey)
              return (
                <article key={interpretation.metricKey} className="report-feedback">
                  <h4>{interpretation.headline}</h4>
                  {metric && <p className="text-xs text-gray-500">{metric.label || metric.key}{metric.construct || metric.channelKey ? ` · ${[metric.construct, metric.channelKey].filter(Boolean).join(' × ')}` : ''}</p>}
                  <p>{interpretation.summary}</p>
                </article>
              )
            })}
          </div>
        </ReportSection>
      )}

      {(report.qualityFlags || []).length > 0 && (
        <ReportSection title="数据质量提示" eyebrow="质量">
          <p className="text-sm text-gray-600">{report.qualityFlags!.join('、')}</p>
        </ReportSection>
      )}

      <ReportDetails title="科学依据与方法">
        <div className="space-y-2">
          <p>测评时科研等级：{report.scientificContext?.scientificMaturity ?? 'PILOT'}{!report.scientificContext || report.scientificContext.provenance === 'LEGACY_MISSING' ? '（历史科研快照缺失）' : ` · 治理修订 ${report.scientificContext.governanceRevision}`}</p>
          {report.instrumentKey && <p>工具：{report.instrumentKey}</p>}
          {report.instrumentVersion && <p>版本：{report.instrumentVersion}</p>}
          {report.scoringVersion && <p>评分：{report.scoringVersion}</p>}
          {report.qualityState && <p>数据质量：{report.qualityState}</p>}
          {report.completedAt && <p>完成时间：{new Date(report.completedAt).toLocaleString('zh-CN')}</p>}
          {report.scientificContext?.scope && <p>证据适用范围：{[report.scientificContext.scope.language, report.scientificContext.scope.population, report.scientificContext.scope.use, report.scientificContext.scope.claim].join(' · ')}</p>}
        </div>
      </ReportDetails>

      {missingFrozenLabels && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800" data-testid="situational-frozen-projection-limitation">
          当前冻结投影没有提供部分指标的冻结标签或解释文本；本页只展示本次结果中已有的指标键和值，不从最新内容定义补齐历史解释。
        </p>
      )}

      {report.disclaimer && <ReportDisclaimer testId="situational-report-disclaimer">{report.disclaimer}</ReportDisclaimer>}
    </div>
  )
}

export default SituationalReportCard
