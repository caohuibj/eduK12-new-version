import React from 'react'
import type { CognitiveSingleTaskReport } from './types'

const profileLabelOf = (profile: CognitiveSingleTaskReport['profile'], explicit?: string | null) =>
  explicit || (profile === 'experience' ? '体验版' : profile === 'research' ? '科研版' : profile === 'standard' ? '正式版' : '')

const METRIC_EXPLANATIONS: Record<string, string> = {
  medianRtMs: '典型反应速度：多数有效反应所需的时间。',
  rtICV: '反应稳定性：不同试次之间反应速度的波动程度。',
  missRate: '遗漏比例：该作答但没有在有效时间内作答的比例。',
  stroopEffectMs: '冲突干扰时间：冲突条件相对一致条件增加的反应时间。',
  incongruentAccuracy: '冲突条件正确率：在字义与字体颜色冲突时仍按目标规则正确作答的比例。',
  commissionRate: '误按比例：本来不应该按时发生按键的比例。',
  omissionRate: '遗漏比例：应该响应但没有响应的比例。',
  dPrime: '目标辨别敏感度：区分目标和非目标表现的信号检测指标。',
  maxSpan: '最长正确序列：本次任务中能够正确完成的最高序列长度。',
  totalCorrectTrials: '正确试次数：本次正式测验中完整答对的试次数。',
  dPrimeByN: '各 N 难度的目标辨别敏感度；不同 N 应分开阅读。',
  maxReliableN: '本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。',
  pRespondStop: '停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。',
  ssrtMs: '停止反应估计时间：根据停止信号模型估计的动作停止时间。',
  switchCostRtMs: '规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。',
  switchCostAccuracy: '准确率转换代价：切换规则时相对重复规则时的正确率变化。',
}

const metricExplanation = (key: string) => METRIC_EXPLANATIONS[key]

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
      <div className="text-xs font-medium text-gray-500">{metric.label}</div>
      {metricExplanation(metric.key) ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{metricExplanation(metric.key)}</p>
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

      {interpretable && report.headline && (
        <div className="mb-6 text-center">
          <div className="text-4xl sm:text-5xl font-bold text-primary">{report.headline.formatted}</div>
          <div className="text-sm font-medium text-gray-500 mt-1">{report.headline.label}</div>
          {metricExplanation(report.headline.key) ? (
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-400">{metricExplanation(report.headline.key)}</p>
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