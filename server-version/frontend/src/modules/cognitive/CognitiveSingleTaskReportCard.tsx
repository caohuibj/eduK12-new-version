import React from 'react'
import type { CognitiveSingleTaskReport } from './types'
import { resolveCognitiveFrontendParticipantPresentation } from './participant-presentation'

const profileLabelOf = (profile: CognitiveSingleTaskReport['profile'], explicit?: string | null) =>
  explicit || (profile === 'experience' ? '体验版' : profile === 'research' ? '科研版' : profile === 'standard' ? '正式版' : '')

const metricCopy = (testType: string, key: string) =>
  resolveCognitiveFrontendParticipantPresentation(testType)?.metricCopy?.[key]

const metricExplanation = (testType: string, key: string) => metricCopy(testType, key)?.explanation
const participantMetricLabel = (
  testType: string,
  metric: CognitiveSingleTaskReport['primaryMetrics'][number],
) => metricCopy(testType, metric.key)?.label ?? metric.label

const CognitiveSingleTaskReportCard: React.FC<{
  report: CognitiveSingleTaskReport
  attemptNo?: number
  finishedAt?: string | null
  anonymousCode?: string | null
  headingLevel?: 1 | 2 | 3
}> = ({ report, attemptNo, finishedAt, anonymousCode, headingLevel }) => {
  const interpretable = report.interpretable
  const method = report.method || {} as CognitiveSingleTaskReport['method']
  const comparison = report.reference?.comparison
  const activeFlags = report.qualityFlags.filter((flag) => flag.active)
  const profileText = profileLabelOf(report.profile, report.profileLabel)
  const resolvedHeadingLevel = headingLevel ?? (attemptNo != null ? 1 : 3)
  const TitleHeading = resolvedHeadingLevel === 1 ? 'h1' : resolvedHeadingLevel === 2 ? 'h2' : 'h3'
  const SectionHeading = resolvedHeadingLevel === 1 ? 'h2' : resolvedHeadingLevel === 2 ? 'h3' : 'h4'

  const renderMetric = (metric: CognitiveSingleTaskReport['primaryMetrics'][number]) => (
    <div key={metric.key} className="rounded-lg bg-gray-50 px-4 py-3">
      <div className="text-lg font-semibold text-gray-800">{metric.formatted}</div>
      <div className="text-xs font-medium text-gray-500">{participantMetricLabel(report.testType, metric)}</div>
      {metricExplanation(report.testType, metric.key) ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{metricExplanation(report.testType, metric.key)}</p>
      ) : null}
    </div>
  )

  return (
    <>
      <TitleHeading className="text-2xl font-bold text-gray-800 mb-2">{report.title}</TitleHeading>
      <p className="text-sm text-gray-500 mb-4">
        {attemptNo != null ? `尝试 #${attemptNo}（` : ''}
        {profileText || '认知任务'}
        {anonymousCode ? ` · 匿名编号 ${anonymousCode}` : ''}
        {finishedAt ? ` · ${new Date(finishedAt).toLocaleString('zh-CN')}` : ''}
        {attemptNo != null ? '）' : ''}
      </p>

      {report.profile === 'experience' ? (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm text-blue-800">
          <p className="font-medium">体验版 · 短程协议</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-700">本报告使用正式评分器计算，但试次数较少，更适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。</p>
        </div>
      ) : null}

      <section className="text-left mb-6">
        <SectionHeading className="text-sm font-semibold text-gray-600 mb-2">数据质量</SectionHeading>
        <div className={`rounded-lg px-4 py-3 text-sm ${interpretable ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
          {interpretable ? '数据质量：本次结果可作任务表现参考。' : '本次数据不足以稳定解释，建议在相近设备和环境下重新测量。'}
        </div>
        {activeFlags.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500">解释提示（不自动表示结果无效）</p>
            <ul className="mt-1 text-xs text-gray-500 list-disc list-inside">
              {activeFlags.map((flag) => <li key={flag.key}>{flag.label}</li>)}
            </ul>
          </div>
        )}
      </section>

      {interpretable && report.interpretationSummary ? (
        <section className="mb-6 text-left">
          <SectionHeading className="mb-2 text-sm font-semibold text-gray-600">结果概览</SectionHeading>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-700">
            {report.interpretationSummary}
          </div>
        </section>
      ) : null}

      {interpretable && report.headline && (
        <div className="mb-6 text-center">
          <div className="text-4xl sm:text-5xl font-bold text-primary">{report.headline.formatted}</div>
          <div className="text-sm font-medium text-gray-500 mt-1">{participantMetricLabel(report.testType, report.headline)}</div>
          {metricExplanation(report.testType, report.headline.key) ? (
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-400">{metricExplanation(report.testType, report.headline.key)}</p>
          ) : null}
        </div>
      )}

      {report.showProductIndex !== false && (
        <div className={`rounded-lg mb-6 text-left ${interpretable ? 'border border-gray-200 bg-white p-4' : 'bg-gray-50 p-4'}`}>
          <div className="text-xs font-medium text-gray-500">任务表现指数</div>
          <div className={`mt-1 font-semibold ${interpretable ? 'text-2xl text-gray-800' : 'text-lg text-gray-400'}`}>
            {report.productIndex ? `${Math.round(report.productIndex.value)} / 100` : '暂不显示'}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">内部综合指数，用于汇总本次任务表现；不代表百分位、年龄等级、学校成绩或诊断结论。</p>
        </div>
      )}

      {interpretable && report.primaryMetrics.length > 0 && (
        <section className="mb-6">
          <SectionHeading className="text-sm font-semibold text-gray-600 mb-2 text-left">主要指标</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.primaryMetrics.map(renderMetric)}
          </div>
        </section>
      )}

      {interpretable && report.secondaryMetrics.length > 0 && (
        <section className="mb-6">
          <SectionHeading className="text-sm font-semibold text-gray-600 mb-2 text-left">次级指标</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.secondaryMetrics.map(renderMetric)}
          </div>
        </section>
      )}

      {interpretable && report.reference && (
        <section className="text-left mt-4 border-t pt-3">
          <p className="text-sm font-semibold text-gray-600">{report.reference.label}</p>
          {report.reference.available && comparison && (
            <>
              <p className="text-lg font-semibold text-gray-800 mt-1">{comparison.rangeLabel}</p>
              <p className="text-xs text-gray-400 mt-1">
                观察值 {comparison.observed} · {comparison.meanLabel || '参考均值'} {comparison.referenceMean}
                {comparison.referenceSd ? `（SD ${comparison.referenceSd}）` : ''}
              </p>
            </>
          )}
          {report.reference.band && <p className="text-xs text-gray-400 mt-1">参考区间：{report.reference.band}</p>}
          <p className="text-xs text-gray-400 mt-1">{report.reference.disclaimer}</p>
        </section>
      )}

      {(report.caveats.length > 0 || report.practicalTips.length > 0) && (
        <section className="text-left mt-4 border-t pt-3">
          <SectionHeading className="text-sm font-semibold text-gray-600 mb-2">简要解释</SectionHeading>
          {report.caveats.map((caveat) => <p key={caveat} className="text-sm text-amber-800">{caveat}</p>)}
          {report.practicalTips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
        </section>
      )}

      {(method.engineVersion || method.scoringVersion || method.configVersion) && (
        <details className="text-left mt-4 border-t pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-600">方法说明（技术信息）</summary>
          <p className="mt-2 text-xs text-gray-500">
            任务 {method.testType || report.testType} · 引擎 {method.engineVersion} · 评分 {method.scoringVersion} · 配置 {method.configVersion}
            {profileText ? ` · ${profileText}` : ''}
          </p>
        </details>
      )}

      {report.disclaimer && <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>}
    </>
  )
}

export default CognitiveSingleTaskReportCard