import { LEGACY_LABELS, LEGACY_EXPLANATIONS } from './legacy-v2-presentation'
import React from 'react'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportSection,
} from '../reporting/ReportPrimitives'
import type { CognitiveV2Report, CognitiveV2ReportMetricView } from './types'
import CognitiveReportReadingCard from './CognitiveReportReadingCard'
import CognitiveMagazineReport from './CognitiveMagazineReport'

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
  <ReportMetricGrid>
    {metrics.map((metric) => (
      <ReportMetric
        key={metric.key}
        label={participantMetricLabel(metric)}
        value={metric.formatted}
        description={metricExplanation(metric)}
      />
    ))}
  </ReportMetricGrid>
)

const CognitiveV2ReportCard: React.FC<{
  report: CognitiveV2Report
  references?: Array<Record<string, unknown>>
  attemptNo?: number
  finishedAt?: string | null
  anonymousCode?: string | null
}> = ({ report, references = [], attemptNo, finishedAt, anonymousCode }) => {
  if (report.schemaVersion === 2 && report.reading?.popular && report.reading?.professional) {
    return <CognitiveMagazineReport report={report} attemptNo={attemptNo} finishedAt={finishedAt} />
  }
  if (report.schemaVersion === 2 && report.reading?.schemaVersion === 2) {
    return <CognitiveReportReadingCard report={report} references={references} attemptNo={attemptNo} finishedAt={finishedAt} anonymousCode={anonymousCode} />
  }
  const activeQuality = report.quality.filter((item) => item.active)
  const reviewedProfileLabel = (report as CognitiveV2Report & { profileLabel?: string | null }).profileLabel
  const profileText = reviewedProfileLabel || profileLabel(report.method.profile)
  const qualityLabel = report.qualityState === 'interpretable'
    ? '数据质量：可解释'
    : report.qualityState === 'limited'
      ? '数据质量：受限解释'
      : '数据质量：无效，暂不解释'
  const referenceRows = report.qualityState === 'invalid' ? [] : references

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{report.title}</h1>
        <p className="text-sm text-gray-500">
          {attemptNo != null ? `尝试 #${attemptNo}（` : ''}
          {profileText || '认知任务'}
          {anonymousCode ? ` · 匿名编号 ${anonymousCode}` : ''}
          {finishedAt ? ` · ${new Date(finishedAt).toLocaleString('zh-CN')}` : ''}
          {attemptNo != null ? '）' : ''}
        </p>
      </header>

      {report.method.profile === 'experience' && (
        <ReportCoreSummary label="体验版 · 短程协议">
          <p className="text-sm font-normal">指标由正式评分器计算，但试次数较少，更适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。</p>
        </ReportCoreSummary>
      )}

      <ReportCoreSummary label="结果结论">
        <div>
          <p>{report.conclusion}</p>
          <p className="mt-2 text-sm font-medium">{qualityLabel}</p>
          {activeQuality.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs font-normal text-gray-600">
              {activeQuality.map((item) => <li key={item.key}>{item.label}</li>)}
            </ul>
          )}
        </div>
      </ReportCoreSummary>

      {report.headline.length > 0 && (
        <ReportSection title="核心指标" eyebrow="本次任务" description="指标保留后台冻结的原单位和解释，不在前端做跨单位标准化。">
          {report.headline.length === 1 ? (
            <ReportMetric
              emphasis
              label={participantMetricLabel(report.headline[0])}
              value={report.headline[0].formatted}
              description={metricExplanation(report.headline[0])}
            />
          ) : <MetricGrid metrics={report.headline} />}
        </ReportSection>
      )}

      {report.user.length > 0 && (
        <ReportSection title="任务表现" eyebrow="主要指标">
          <MetricGrid metrics={report.user} />
        </ReportSection>
      )}

      <ReportDetails title="详细指标、参考与方法">
        {report.detail.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">详细指标</h2>
            <MetricGrid metrics={report.detail} />
          </section>
        )}
        {referenceRows.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">参考信息</h2>
            <div className="space-y-3">
              {referenceRows.map((reference, index) => (
                <div key={`${String(reference.metricKey ?? reference.scoreKey ?? 'reference')}-${index}`} className="report-feedback">
                  <p className="font-medium text-gray-800">{typeof reference.label === 'string' ? reference.label : '参考暂不可用'}</p>
                  {reference.status === 'available' && typeof reference.disclaimer === 'string' && <p>{reference.disclaimer}</p>}
                  {reference.status !== 'available' && typeof reference.unavailableReason === 'string' && <p>当前未使用该参考：{reference.unavailableReason}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
        {report.practicalTips.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">阅读提示</h2>
            {report.practicalTips.map((tip) => <p key={tip}>{tip}</p>)}
          </section>
        )}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">方法说明（技术信息）</h2>
          <p>
            任务 {report.method.testType} · 引擎 {report.method.engineVersion} · 评分 {report.method.scoringVersion} · 配置 {report.method.configVersion}
            {profileText ? ` · ${profileText}` : ''}
          </p>
        </section>
      </ReportDetails>

      <ReportDisclaimer>{report.disclaimer}</ReportDisclaimer>
    </div>
  )
}

export default CognitiveV2ReportCard
