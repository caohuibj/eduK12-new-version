import { LEGACY_LABELS, LEGACY_EXPLANATIONS } from './legacy-v2-presentation'
import React from 'react'
import type { CognitiveV2Report, CognitiveV2ReportMetricView } from './types'

const profileLabel = (profile: CognitiveV2Report['method']['profile']): string => {
  if (profile === 'experience') return '体验版'
  if (profile === 'research') return '科研版'
  if (profile === 'standard') return '正式版'
  return ''
}

const participantMetricLabel = (metric: CognitiveV2ReportMetricView): string =>
  metric.presentationVersion !== undefined ? metric.participantLabel ?? metric.label : LEGACY_LABELS[metric.key] ?? metric.label

const metricExplanation = (metric: CognitiveV2ReportMetricView): string =>
  (metric.presentationVersion !== undefined ? metric.explanation : LEGACY_EXPLANATIONS[metric.key]) ?? '该指标用于描述本次任务中的一个具体表现维度，请结合任务说明与其他指标共同阅读。'

const MetricGrid = ({ metrics }: { metrics: CognitiveV2ReportMetricView[] }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {metrics.map((metric) => (
      <div key={metric.key} className="rounded-lg bg-gray-50 px-4 py-3">
        <div className="text-lg font-semibold text-gray-800">{metric.formatted}</div>
        <div className="text-xs font-medium text-gray-500">{participantMetricLabel(metric)}</div>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{metricExplanation(metric)}</p>
      </div>
    ))}
  </div>
)

const CognitiveV2ReportCard: React.FC<{
  report: CognitiveV2Report
  references?: Array<Record<string, unknown>>
  attemptNo?: number
  finishedAt?: string | null
  anonymousCode?: string | null
}> = ({ report, references = [], attemptNo, finishedAt, anonymousCode }) => {
  const activeQuality = report.quality.filter((item) => item.active)
  const reviewedProfileLabel = (report as CognitiveV2Report & { profileLabel?: string | null }).profileLabel
  const profileText = reviewedProfileLabel || profileLabel(report.method.profile)
  const qualityStyle = report.qualityState === 'interpretable'
    ? 'bg-green-50 text-green-700'
    : report.qualityState === 'limited'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-red-50 text-red-700'
  const qualityLabel = report.qualityState === 'interpretable'
    ? '数据质量：可解释'
    : report.qualityState === 'limited'
      ? '数据质量：受限解释'
      : '数据质量：无效，暂不解释'
  const referenceRows = report.qualityState === 'invalid' ? [] : references

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{report.title}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {attemptNo != null ? `尝试 #${attemptNo}（` : ''}
        {profileText || '认知任务'}
        {anonymousCode ? ` · 匿名编号 ${anonymousCode}` : ''}
        {finishedAt ? ` · ${new Date(finishedAt).toLocaleString('zh-CN')}` : ''}
        {attemptNo != null ? '）' : ''}
      </p>

      {report.method.profile === 'experience' ? (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm text-blue-800">
          <p className="font-medium">体验版 · 短程协议</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-700">指标由正式评分器计算，但试次数较少，更适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。</p>
        </div>
      ) : null}

      <section className="text-left mb-6">
        <h2 className="text-sm font-semibold text-gray-600 mb-2">结果结论</h2>
        <div className={`rounded-lg px-4 py-3 text-sm ${qualityStyle}`}>
          <p>{report.conclusion}</p>
          <p className="mt-1 font-medium">{qualityLabel}</p>
        </div>
        {activeQuality.length > 0 && (
          <ul className="mt-2 text-xs text-gray-500 list-disc list-inside">
            {activeQuality.map((item) => <li key={item.key}>{item.label}</li>)}
          </ul>
        )}
      </section>

      {report.headline.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-2 text-left">核心指标</h2>
          {report.headline.length === 1 ? (
            <div className="text-center py-2">
              <div className="text-4xl font-bold text-primary sm:text-5xl">{report.headline[0].formatted}</div>
              <div className="mt-1 text-sm font-medium text-gray-500">{participantMetricLabel(report.headline[0])}</div>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-400">
                {metricExplanation(report.headline[0])}
              </p>
            </div>
          ) : <MetricGrid metrics={report.headline} />}
        </section>
      )}

      {report.user.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-2 text-left">任务表现</h2>
          <MetricGrid metrics={report.user} />
        </section>
      )}

      <details className="text-left border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600">展开详情与方法</summary>
        <div className="mt-4">
          {report.detail.length > 0 && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">详细指标</h2>
              <MetricGrid metrics={report.detail} />
            </section>
          )}
          {referenceRows.length > 0 && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">参考信息</h2>
              {referenceRows.map((reference, index) => (
                <div key={`${String(reference.metricKey ?? reference.scoreKey ?? 'reference')}-${index}`} className="text-sm text-gray-600 mb-2">
                  <p className="font-medium">{typeof reference.label === 'string' ? reference.label : '参考暂不可用'}</p>
                  {reference.status === 'available' && typeof reference.disclaimer === 'string' && <p className="text-xs text-gray-400 mt-1">{reference.disclaimer}</p>}
                  {reference.status !== 'available' && typeof reference.unavailableReason === 'string' && <p className="text-xs text-gray-400 mt-1">当前未使用该参考：{reference.unavailableReason}</p>}
                </div>
              ))}
            </section>
          )}
          {report.practicalTips.length > 0 && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">阅读提示</h2>
              {report.practicalTips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
            </section>
          )}
          <section className="mb-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">方法说明（技术信息）</h2>
            <p className="text-xs text-gray-500">
              任务 {report.method.testType} · 引擎 {report.method.engineVersion} · 评分 {report.method.scoringVersion} · 配置 {report.method.configVersion}
              {profileText ? ` · ${profileText}` : ''}
            </p>
          </section>
        </div>
      </details>
      <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>
    </>
  )
}

export default CognitiveV2ReportCard