import React from 'react'
import type { CognitiveV2Report, CognitiveV2ReportMetricView } from './types'

const profileLabel = (profile: CognitiveV2Report['method']['profile']): string => {
  if (profile === 'experience') return '体验版'
  if (profile === 'research') return '科研版'
  if (profile === 'standard') return '正式版'
  return ''
}

const PARTICIPANT_METRIC_LABELS: Record<string, string> = {
  correctPerMinute: '每分钟正确比较数',
  medianCorrectRtMs: '典型正确反应时间',
  lapseRate: '未作答比例',
  correctCount: '正确比较次数',
  completedTrialCount: '完成比较次数',
  flankerEffectMs: '干扰反应时间差',
  incongruentAccuracy: '不一致条件正确率',
  congruentAccuracy: '一致条件正确率',
  errorCost: '准确率干扰差',
  medianRtCongruent: '一致条件典型反应时间',
  medianRtIncongruent: '不一致条件典型反应时间',
}

const METRIC_EXPLANATIONS: Record<string, string> = {
  medianRtMs: '典型反应速度：多数有效反应所需的时间。',
  rtICV: '反应稳定性：不同试次之间反应速度的波动程度。',
  missRate: '遗漏比例：应该响应但没有在有效时间内响应的比例。',
  stroopEffectMs: '冲突干扰时间：冲突条件相对一致条件增加的反应时间。',
  flankerEffectMs: '干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。',
  incongruentAccuracy: '不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。',
  congruentAccuracy: '一致条件正确率：干扰信息与目标信息一致时正确作答的比例。',
  errorCost: '准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。',
  medianRtCongruent: '一致条件典型反应时间：一致条件中正确有效反应的中位时间。',
  medianRtIncongruent: '不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。',
  commissionRate: '误按比例：本来不应该按时发生按键的比例。',
  omissionRate: '遗漏比例：应该响应但没有响应的比例。',
  dPrime: '目标辨别敏感度：区分目标与非目标表现的信号检测指标。',
  maxSpan: '最长正确序列：本次任务中能够正确完成的最高序列长度。',
  totalCorrectTrials: '正确试次数：本次正式测验中完整答对的试次数。',
  dPrimeByN: '各 N 难度的目标辨别敏感度；不同 N 应分开阅读。',
  maxReliableN: '本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。',
  pRespondStop: '停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。',
  ssrtMs: '停止反应估计时间：根据停止信号模型估计的动作停止时间。',
  switchCostRtMs: '规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。',
  switchCostAccuracy: '准确率转换代价：切换规则时相对重复规则时的正确率变化。',
  correctPerMinute: '单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。',
  accuracy: '正确率：正式作答中判断正确的比例。',
  medianCorrectRtMs: '典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。',
  lapseRate: '未作答比例：正式试次中未在有效时间内作答的比例。',
  correctCount: '正确比较次数：本次正式计时内完成并判断正确的试次数。',
  completedTrialCount: '完成比较次数：本次正式计时内进入评分的试次数。',
}

const participantMetricLabel = (metric: CognitiveV2ReportMetricView): string =>
  PARTICIPANT_METRIC_LABELS[metric.key] ?? metric.label

const metricExplanation = (metric: CognitiveV2ReportMetricView): string =>
  METRIC_EXPLANATIONS[metric.key] ?? '该指标用于描述本次任务中的一个具体表现维度，请结合任务说明与其他指标共同阅读。'

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