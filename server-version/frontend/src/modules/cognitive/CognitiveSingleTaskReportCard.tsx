import { LEGACY_LABELS, LEGACY_EXPLANATIONS } from './legacy-single-presentation'
import React from 'react'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportSection,
} from '../reporting/ReportPrimitives'
import type { CognitiveSingleTaskReport } from './types'

const profileLabelOf = (profile: CognitiveSingleTaskReport['profile'], explicit?: string | null) =>
  explicit || (profile === 'experience' ? '体验版' : profile === 'research' ? '科研版' : profile === 'standard' ? '正式版' : '')

const metricExplanation = (metric: CognitiveSingleTaskReport['primaryMetrics'][number]) => metric.presentationVersion !== undefined ? metric.explanation : LEGACY_EXPLANATIONS[metric.key]
const participantMetricLabel = (metric: CognitiveSingleTaskReport['primaryMetrics'][number]) =>
  metric.presentationVersion !== undefined ? metric.participantLabel ?? metric.label : LEGACY_LABELS[metric.key] ?? metric.label

const CognitiveSingleTaskReportCard: React.FC<{
  report: CognitiveSingleTaskReport
  attemptNo?: number
  finishedAt?: string | null
  anonymousCode?: string | null
  headingLevel?: 1 | 2 | 3
}> = ({ report, attemptNo, finishedAt, anonymousCode, headingLevel }) => {
  const interpretable = report.interpretable
  const qualityLabel = report.qualityState === 'limited' ? '本次数据存在质量限制，仅阅读可显示的指标。'
    : report.qualityState === 'invalid' ? '本次数据未通过质量要求，指标暂不解释。'
      : interpretable ? '数据质量：本次结果可作任务表现参考。' : '本次数据不足以稳定解释，建议在相近设备和环境下重新测量。'
  const method = report.method || {} as CognitiveSingleTaskReport['method']
  const comparison = report.reference?.comparison
  const activeFlags = report.qualityFlags.filter((flag) => flag.active)
  const profileText = profileLabelOf(report.profile, report.profileLabel)
  const resolvedHeadingLevel = headingLevel ?? (attemptNo != null ? 1 : 3)
  const TitleHeading = resolvedHeadingLevel === 1 ? 'h1' : resolvedHeadingLevel === 2 ? 'h2' : 'h3'
  const sectionHeadingLevel = resolvedHeadingLevel === 1 ? 2 : resolvedHeadingLevel === 2 ? 3 : 4

  const metricCard = (metric: CognitiveSingleTaskReport['primaryMetrics'][number]) => (
    <ReportMetric
      key={metric.key}
      label={participantMetricLabel(metric)}
      value={metric.formatted}
      description={metricExplanation(metric)}
    />
  )

  return (
    <div className="space-y-5">
      <header>
        <TitleHeading className="text-2xl font-bold text-gray-800 mb-2">{report.title}</TitleHeading>
        <p className="text-sm text-gray-500">
          {attemptNo != null ? `尝试 #${attemptNo}（` : ''}
          {profileText || '认知任务'}
          {anonymousCode ? ` · 匿名编号 ${anonymousCode}` : ''}
          {finishedAt ? ` · ${new Date(finishedAt).toLocaleString('zh-CN')}` : ''}
          {attemptNo != null ? '）' : ''}
        </p>
      </header>

      {report.profile === 'experience' && (
        <ReportCoreSummary label="体验版 · 短程协议">
          <p className="text-sm font-normal">本报告使用正式评分器计算，但试次数较少，更适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。</p>
        </ReportCoreSummary>
      )}

      <ReportSection title="数据质量" eyebrow="解释前提" headingLevel={sectionHeadingLevel}>
        <div className={`rounded-lg px-4 py-3 text-sm ${interpretable && report.qualityState !== 'limited' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
          {qualityLabel}
        </div>
        {activeFlags.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            <p>解释提示（不自动表示结果无效）</p>
            <ul className="mt-1 list-disc pl-5">
              {activeFlags.map((flag) => <li key={flag.key}>{flag.label}</li>)}
            </ul>
          </div>
        )}
      </ReportSection>

      {interpretable && report.interpretationSummary && (
        <ReportCoreSummary label="结果概览">
          <p className="text-sm font-normal">{report.interpretationSummary}</p>
        </ReportCoreSummary>
      )}

      {interpretable && report.headline && (
        <ReportSection title="核心指标" eyebrow="本次任务" headingLevel={sectionHeadingLevel}>
          <ReportMetric
            emphasis
            label={participantMetricLabel(report.headline)}
            value={report.headline.formatted}
            description={metricExplanation(report.headline)}
          />
        </ReportSection>
      )}

      {report.showProductIndex !== false && (
        <ReportSection title="综合指标" headingLevel={sectionHeadingLevel}>
          <ReportMetric
            label="任务表现指数"
            value={report.productIndex ? `${Math.round(report.productIndex.value)} / 100` : '暂不显示'}
            description="内部综合指数，用于汇总本次任务表现；不代表百分位、年龄等级、学校成绩或诊断结论。"
          />
        </ReportSection>
      )}

      {interpretable && report.primaryMetrics.length > 0 && (
        <ReportSection title="主要指标" eyebrow="任务表现" headingLevel={sectionHeadingLevel}>
          <ReportMetricGrid>{report.primaryMetrics.map(metricCard)}</ReportMetricGrid>
        </ReportSection>
      )}

      {interpretable && report.secondaryMetrics.length > 0 && (
        <ReportSection title="次级指标" eyebrow="补充信息" headingLevel={sectionHeadingLevel}>
          <ReportMetricGrid>{report.secondaryMetrics.map(metricCard)}</ReportMetricGrid>
        </ReportSection>
      )}

      {interpretable && report.reference && (
        <ReportSection title={report.reference.label} eyebrow="参考信息" headingLevel={sectionHeadingLevel}>
          {report.reference.available && comparison && (
            <>
              <p className="text-lg font-semibold text-gray-800">{comparison.rangeLabel}</p>
              <p className="mt-1 text-xs text-gray-500">
                观察值 {comparison.observed} · {comparison.meanLabel || '参考均值'} {comparison.referenceMean}
                {comparison.referenceSd ? `（SD ${comparison.referenceSd}）` : ''}
              </p>
            </>
          )}
          {report.reference.band && <p className="mt-1 text-xs text-gray-500">参考区间：{report.reference.band}</p>}
          <p className="mt-1 text-xs text-gray-500">{report.reference.disclaimer}</p>
        </ReportSection>
      )}

      {(report.caveats.length > 0 || report.practicalTips.length > 0) && (
        <ReportSection title="简要解释" eyebrow="阅读提示" headingLevel={sectionHeadingLevel}>
          {report.caveats.map((caveat) => <p key={caveat} className="text-sm text-amber-800">{caveat}</p>)}
          {report.practicalTips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
        </ReportSection>
      )}

      {(method.engineVersion || method.scoringVersion || method.configVersion) && (
        <ReportDetails title="方法说明（技术信息）">
          <p>
            任务 {method.testType || report.testType} · 引擎 {method.engineVersion} · 评分 {method.scoringVersion} · 配置 {method.configVersion}
            {profileText ? ` · ${profileText}` : ''}
          </p>
        </ReportDetails>
      )}

      {report.disclaimer && <ReportDisclaimer>{report.disclaimer}</ReportDisclaimer>}
    </div>
  )
}

export default CognitiveSingleTaskReportCard
