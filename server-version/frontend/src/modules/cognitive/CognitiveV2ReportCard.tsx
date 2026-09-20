import React from 'react'
import type { CognitiveV2Report, CognitiveV2ReportMetricView } from './types'

const profileLabel = (profile: CognitiveV2Report['method']['profile']): string => {
  if (profile === 'experience') return '体验版'
  if (profile === 'research') return '科研版'
  if (profile === 'standard') return '正式版'
  return ''
}

const METRIC_EXPLANATIONS: Record<string, string> = {
  medianRtMs: '典型反应速度：多数有效反应所需的时间。',
  rtICV: '反应稳定性：不同试次之间反应速度的波动程度。',
  missRate: '遗漏比例：应该响应但没有在有效时间内响应的比例。',
  meanRtMs: '平均反应时间：所有有效反应时间的平均值，容易受极慢或极快试次影响。',
  sdRtMs: '反应时间标准差：反映不同试次之间反应速度的绝对波动。',
  fastestRtMs: '最快有效反应：本次任务中最快的有效响应，仅作描述，不代表稳定能力。',
  prematureCount: '提前反应次数：刺激允许响应前已经作出反应的次数。',
  validTrialCount: '有效试次数：达到评分要求并进入速度指标计算的试次数。',
  maxSpan: '最长正确序列：本次任务中能够正确完成的最高序列长度。',
  totalCorrectTrials: '正确试次数：本次正式测验中完整答对的试次数。',
  levelsPassed: '通过级数：达到该长度层级通过规则的级数。',
  firstTryPassCount: '首次通过级数：第一次尝试即达到通过要求的层级数量。',
  medianResponseDurationMs: '典型作答时长：完成一次序列复现所需时间的中位数。',
  trialCount: '完成试次数：本次正式任务实际完成并进入记录的试次数。',
  stroopEffectMs: '冲突干扰时间：冲突条件相对一致条件增加的反应时间。',
  incongruentAccuracy: '冲突条件正确率：在目标信息与干扰信息冲突时仍按目标规则正确作答的比例。',
  errorCost: '准确率干扰代价：冲突条件相对一致条件出现的准确率下降。',
  accuracy: '总体正确率：本次任务所有计分试次中正确作答的比例。',
  congruentAccuracy: '一致条件正确率：目标与干扰信息一致时正确作答的比例。',
  medianRtCongruent: '一致条件典型反应时间：一致试次正确反应时间的中位数。',
  medianRtIncongruent: '冲突条件典型反应时间：冲突试次正确反应时间的中位数。',
  timeoutCount: '超时次数：在规定响应时间内没有完成有效反应的试次数。',
  commissionRate: '误按比例：本来不应该响应时仍作出响应的比例。',
  omissionRate: '遗漏比例：应该响应但没有响应的比例。',
  dPrime: '目标辨别敏感度：区分目标与非目标表现的信号检测指标。',
  goMedianRtMs: 'Go 条件典型反应时间：应当响应的试次中正确反应时间的中位数。',
  hitRate: '命中率：应当响应时成功作出正确反应的比例。',
  commissionErrors: '误按次数：不应响应的试次中实际发生响应的次数。',
  hitMedianRtMs: '目标命中典型反应时间：正确识别目标时反应时间的中位数。',
  hitRtSdMs: '目标反应时间波动：正确目标试次反应时间的标准差。',
  perseverationRate: '极短反应比例：短到可能不代表完整刺激加工的反应所占比例。',
  blockSlopeRt: '跨区块反应时间趋势：随任务推进，典型反应速度变化的方向与幅度。',
  blockSlopeOmission: '跨区块遗漏趋势：随任务推进，遗漏比例变化的方向与幅度。',
  dPrimeByN: '各 N 难度的目标辨别敏感度；不同 N 应分开阅读。',
  maxReliableN: '本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。',
  hitRateByN: '各 N 命中率：分别描述不同工作记忆负荷下正确识别目标的比例。',
  falseAlarmRateByN: '各 N 误报率：分别描述不同工作记忆负荷下错误报告目标的比例。',
  medianRtByN: '各 N 典型反应时间：分别描述不同工作记忆负荷下正确反应的速度。',
  loadCostDPrime: '负荷代价：较高 N 相对较低 N 的辨别敏感度变化，应结合各 N 的 d′ 共同阅读。',
  sequenceErrorDistance: '序列位置误差距离：科研档用于描述错误序列与目标序列的位置偏离程度。',
  pRespondStop: '停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。',
  ssrtMs: '停止反应估计时间：根据停止信号模型估计的动作停止时间。',
  goOmissionRate: 'Go 遗漏率：应当响应的 Go 试次中没有作出响应的比例。',
  goChoiceErrorRate: 'Go 选择错误率：已经响应但选择了错误按键的 Go 试次比例。',
  meanSsdMs: '平均停止信号延迟：Go 刺激出现到停止信号出现之间的平均时间。',
  unsuccessfulStopRtMs: '失败停止试次反应时间：收到停止信号后仍然作出反应时的典型速度。',
  switchCostRtMs: '规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。',
  switchCostAccuracy: '准确率转换代价：切换规则时相对重复规则时的正确率变化。',
  medianRtSwitch: '切换试次典型反应时间：需要更换规则时正确反应时间的中位数。',
  medianRtRepeat: '重复试次典型反应时间：继续使用同一规则时正确反应时间的中位数。',
  accuracySwitch: '切换试次正确率：需要更换规则时正确作答的比例。',
  accuracyRepeat: '重复试次正确率：继续使用同一规则时正确作答的比例。',
  mixingCost: '混合代价：科研档中混合规则区块相对单一规则区块增加的反应时间。',
}

const directionFallback = (metric: CognitiveV2ReportMetricView): string => {
  if (metric.direction === 'higher_is_better') {
    return `${metric.label}用于描述本次任务表现；在其他条件相近且数据质量可接受时，数值较高通常表示该指标表现较高。`
  }
  if (metric.direction === 'lower_is_better') {
    return `${metric.label}用于描述本次任务表现；在其他条件相近且数据质量可接受时，数值较低通常表示该指标表现较好。`
  }
  if (metric.direction === 'target_range') {
    return `${metric.label}用于检查结果是否处在任务预期的可解释范围，应结合其他指标共同阅读。`
  }
  if (metric.direction === 'signed') {
    return `${metric.label}表示条件或负荷之间差异的方向与大小，应结合相关准确率和反应时共同阅读。`
  }
  return `${metric.label}是本次任务的描述性观察值，不应单独解释为能力高低或常模位置。`
}

const metricExplanation = (metric: CognitiveV2ReportMetricView): string => {
  const curated = METRIC_EXPLANATIONS[metric.key]
  if (curated) return curated
  const description = (metric as CognitiveV2ReportMetricView & { description?: string }).description?.trim()
  if (description && description !== metric.label && description !== metric.category) return description
  return directionFallback(metric)
}

const MetricGrid = ({ metrics }: { metrics: CognitiveV2ReportMetricView[] }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {metrics.map((metric) => (
      <div key={metric.key} className="rounded-lg bg-gray-50 px-4 py-3">
        <div className="text-lg font-semibold text-gray-800">{metric.formatted}</div>
        <div className="text-xs font-medium text-gray-500">{metric.label}</div>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          {metricExplanation(metric)}
        </p>
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
  const extendedReport = report as CognitiveV2Report & {
    caveats?: string[]
    research?: CognitiveV2ReportMetricView[]
  }
  const activeQuality = report.quality.filter((item) => item.active)
  const profileText = profileLabel(report.method.profile)
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
  const caveats = extendedReport.caveats ?? []
  const researchMetrics = report.qualityState === 'invalid' ? [] : (extendedReport.research ?? [])

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

      {caveats.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-left">
          <h2 className="text-sm font-semibold text-amber-900">本档说明</h2>
          {caveats.map((caveat) => (
            <p key={caveat} className="mt-1 text-xs leading-relaxed text-amber-800">{caveat}</p>
          ))}
        </section>
      )}

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
              <div className="mt-1 text-sm font-medium text-gray-500">{report.headline[0].label}</div>
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
          {report.method.profile === 'research' && researchMetrics.length > 0 && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">科研指标（仅科研档）</h2>
              <p className="mb-2 text-xs leading-relaxed text-gray-400">这些指标用于更细的研究描述，不是人口常模、临床等级或单独的能力结论。</p>
              <MetricGrid metrics={researchMetrics} />
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
            </p>
          </section>
        </div>
      </details>
      <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>
    </>
  )
}

export default CognitiveV2ReportCard
