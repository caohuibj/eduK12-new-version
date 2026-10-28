import React from 'react'
import './ScaleUnitReportCard.css'
import { TrainingRawScoreFeedback, type MatchedRawScoreFeedback } from './TrainingRawScoreFeedback'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportRangeTrack,
  ReportSection,
  type ReportRangeReference,
} from './ReportPrimitives'
import type {
  ExternalScaleMethod,
  ExternalScaleQuality,
  ExternalScaleScoreValue,
  ScaleInterpretationValue,
  ScaleReferenceValue,
  ScaleResultV2,
  ScaleUnitReport,
} from './types'

export type SafeScaleUnitReport = Pick<
  ScaleUnitReport,
  'itemId' | 'type' | 'kind' | 'scaleCode' | 'scaleName' | 'caveats' | 'disclaimer' | 'completedAt' | 'totalTime' | 'decryptError'
> & {
  scaleId?: string
  assessmentId?: string
  rawScoreFeedback?: MatchedRawScoreFeedback[]
  label?: string | null
  result?: ScaleResultV2 | null
  quality?: ExternalScaleQuality | null
  scores?: ExternalScaleScoreValue[]
  references?: ScaleReferenceValue[]
  interpretations?: ScaleInterpretationValue[]
  method?: ExternalScaleMethod | null
}

const formatNumber = (value: number | null | undefined, precision = 2): string => (
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(Math.max(0, precision))
)

const kindLabel = (kind: ScaleReferenceValue['referenceKind']): string => {
  if (kind === 'theoretical_range') return '量尺范围描述（暂定）'
  if (kind === 'criterion_threshold') return '来源定义阈值'
  if (kind === 'descriptive_sample') return '文献描述性样本'
  return '参考分布'
}

const guidanceLabel = (category: 'reflection' | 'strategy' | 'environment' | 'support'): string => ({
  reflection: '自我观察',
  strategy: '策略建议',
  environment: '环境支持',
  support: '支持建议',
}[category])

const scoreStatusLabel = (score: ExternalScaleScoreValue): string => {
  if (score.status === 'limited') return score.prorated ? '有限数据 · 已折算' : '有限数据'
  if (score.status === 'not_calculable') return '无法计算'
  return ''
}

const qualityStatusLabel = (status: string): string => ({
  interpretable: '可解释',
  limited: '仅支持有限解释',
  invalid: '当前结果不可解释',
}[status] ?? status)

// Use only already-disclosed result metadata. Never recover counts from a live
// instrument, the score range, labels or internal item-score/answer payloads.
const responseCounts = (score: ExternalScaleScoreValue): { answered: number; expected: number } | null => {
  const expected = score.expectedItems
  const answered = score.answeredItems
  if (!Array.isArray(expected) || !Array.isArray(answered) || expected.length === 0) return null
  const validCodes = (codes: string[]) => codes.every(code => typeof code === 'string' && code.trim().length > 0)
    && new Set(codes).size === codes.length
  if (!validCodes(expected) || !validCodes(answered)) return null
  const expectedSet = new Set(expected)
  if (answered.some(code => !expectedSet.has(code))) return null
  return { answered: answered.length, expected: expected.length }
}

const directionExplanation = (score: ExternalScaleScoreValue): string => {
  // Preserve the saved version's authored meaning, including reversed constructs.
  if (typeof score.description === 'string' && score.description.trim()) return score.description
  switch (score.direction) {
    case 'higher_is_better': return '按本量表定义，高分表示更有利的结果，不代表人群排名。'
    case 'higher_is_worse': return '按本量表定义，高分表示更不利的结果，不代表人群排名。'
    case 'lower_is_better': return '按本量表定义，低分表示更有利的结果，不代表人群排名。'
    case 'higher_is_more': return '高分表示所测特征较多，不直接代表更好或排名更靠前。'
    case 'bipolar': return '本维度有两个方向，不能只凭分数高低判断好坏。'
    case 'descriptive': return '本维度用于描述本次作答，不作好坏或排名判断。'
    default: return '计分方向未提供，请结合量表说明阅读。'
  }
}

const ScoreContext: React.FC<{ score: ExternalScaleScoreValue }> = ({ score }) => {
  const counts = responseCounts(score)
  return <div className="scale-score-context">
    <p className="scale-score-count" aria-label={`${score.label}作答数量`}>
      {counts
        ? <>已答 <strong>{counts.answered}</strong> / 共 <strong>{counts.expected}</strong> 题
          <span>未答 {counts.expected - counts.answered} 题</span></>
        : '作答数量未提供'}
    </p>
    <p className="scale-score-explanation"><span>分数说明：</span>{directionExplanation(score)}</p>
  </div>
}

const renderReferenceDetails = (reference: ScaleReferenceValue) => {
  if (reference.status !== 'available') {
    const reason = reference.unavailableReason === 'missing_context'
      ? '本次测评没有该 reference 所需的人口学上下文。'
      : reference.unavailableReason === 'version_mismatch'
        ? 'reference 与本次量表或计分版本不匹配。'
        : reference.unavailableReason === 'inactive'
          ? '该 reference 尚未激活。'
          : '当前没有可用的匹配 reference。'
    return <p>{reason}</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>类型：{kindLabel(reference.referenceKind)}</span>
        <span>版本：{reference.referenceVersion}</span>
        {reference.source?.publicationYear && <span>年份：{reference.source.publicationYear}</span>}
        {reference.source?.sampleSize && <span>样本量：{reference.source.sampleSize}</span>}
      </div>
      {reference.mean !== null && <p>文献均值：{formatNumber(reference.mean)}{reference.sd !== null ? `；SD：${formatNumber(reference.sd)}` : ''}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {reference.z !== null && <span>z：{formatNumber(reference.z)}</span>}
        {reference.t !== null && <span>T：{formatNumber(reference.t)}</span>}
        {reference.percentile && <span>{reference.percentile.estimated ? '估算百分位' : '百分位'}：{formatNumber(reference.percentile.value, 1)}</span>}
        {reference.criterionBand && <span>区间：{reference.criterionBand.label}（{formatNumber(reference.criterionBand.minInclusive)}–{formatNumber(reference.criterionBand.maxInclusive)}）</span>}
        {reference.criterionBand && reference.value !== null && <span>当前位置：{formatNumber(reference.value)}</span>}
        {reference.meanDifference !== null && <span>与样本均值差：{formatNumber(reference.meanDifference)}</span>}
      </div>
      {reference.source?.citation && <p>来源：{reference.source.citation}</p>}
      {reference.source?.doi && <p>DOI：{reference.source.doi}</p>}
      {reference.source?.url && <p>链接：{reference.source.url}</p>}
      {reference.population?.description && <p>样本说明：{reference.population.description}</p>}
      {reference.limitations.length > 0 && <p>限制：{reference.limitations.join('；')}</p>}
      <p className="text-xs">{reference.disclaimer}</p>
    </div>
  )
}

const overlayFor = (score: ExternalScaleScoreValue, references: ScaleReferenceValue[]): ReportRangeReference | null => {
  const available = references.filter((reference) => reference.scoreKey === score.key && reference.status === 'available')
  if (available.length !== 1) return null
  const reference = available[0]
  return {
    ...(reference.mean !== null
      ? { mean: reference.mean, label: reference.label || `参考均值 ${formatNumber(reference.mean)}` }
      : {}),
    ...(reference.criterionBand
      ? {
          band: {
            label: reference.criterionBand.label,
            min: reference.criterionBand.minInclusive,
            max: reference.criterionBand.maxInclusive,
          },
        }
      : {}),
  }
}

const ScaleUnitReportCard: React.FC<{ report: SafeScaleUnitReport; loadReportImage?: (assetId: string) => Promise<Blob> }> = ({ report, loadReportImage }) => {
  if (report.decryptError) {
    return <p className="text-amber-700">该量表结果无法解密，分数未展示。</p>
  }

  const result = report.result ?? null
  const quality: ExternalScaleQuality | ScaleResultV2['quality'] | null = report.quality ?? result?.quality ?? null
  const scores: ExternalScaleScoreValue[] = result?.scores ?? report.scores ?? []
  const references = result?.references ?? report.references ?? []
  const interpretations = result?.interpretations ?? report.interpretations ?? []
  const invalid = quality?.status === 'invalid'
  const totalScores = scores.filter((score) => score.type === 'total')
  const dimensionScores = scores.filter((score) => score.type === 'dimension')
  const unclassifiedScores = scores.filter((score) => score.type !== 'total' && score.type !== 'dimension')

  const rangeTrack = (score: ExternalScaleScoreValue) => (
    <div className="scale-score-card" key={score.key}>
      <ReportRangeTrack
        label={score.label}
        value={score.value}
        formattedValue={formatNumber(score.value, score.displayPrecision)}
        range={score.range}
        reference={overlayFor(score, references)}
        status={scoreStatusLabel(score)}
      />
      <ScoreContext score={score} />
    </div>
  )

  return (
    <div data-testid={`scale-unit-report-${report.itemId || report.scaleId}`} className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{report.scaleName}</span>
        {report.method?.reportVersion && <span>报告版本 {report.method.reportVersion}</span>}
        {quality?.status && <span>数据质量：{qualityStatusLabel(quality.status)}</span>}
      </div>

      <ReportSection
        title={dimensionScores.length > 0 ? '这次回答的概览' : '本次得分'}
        eyebrow="我的回答"
        description={dimensionScores.length > 0
          ? '下面的图只显示你在这份问卷计分范围里的位置，不代表在人群中的排名；不同方面的分数也不宜直接比较。'
          : '查看你这次的得分和问卷本身的分数范围。刻度不是人群排名。'}
        testId="scale-score-layer"
      >
        {scores.length === 0 ? (
          <p className="text-sm text-gray-500">该量表尚未形成可展示的分数。</p>
        ) : (
          <div className="space-y-5">
            {totalScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">整体情况</p>
                {totalScores.length === 1 ? (
                  <div className="report-primary-score space-y-2">
                    {rangeTrack(totalScores[0])}
                  </div>
                ) : (
                  <div className="report-range-grid">{totalScores.map(rangeTrack)}</div>
                )}
              </div>
            )}

            {dimensionScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">不同方面</p>
                <div className="report-range-grid">{dimensionScores.map(rangeTrack)}</div>
              </div>
            )}

            {unclassifiedScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">其他得分</p>
                <p className="mb-3 text-sm text-gray-500">这些得分未标注为总分或维度，因此单独列出，不推断其层级。</p>
                <div className="report-range-grid">{unclassifiedScores.map(rangeTrack)}</div>
              </div>
            )}
          </div>
        )}
      </ReportSection>

      {!invalid && Boolean(report.rawScoreFeedback?.length) && <TrainingRawScoreFeedback loadReportImage={loadReportImage} entries={report.rawScoreFeedback!} assessmentId={report.assessmentId} labels={Object.fromEntries(scores.map(score => [score.key, score.label]))} />}

      {!invalid && interpretations.length > 0 && (
        <div data-testid="scale-core-feedback">
          <ReportCoreSummary label="核心反馈">
            <div className="report-feedback-list">
              {interpretations.map((interpretation) => (
                <article key={interpretation.scoreKey} className="report-feedback">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4>{interpretation.headline}</h4>
                    {interpretation.label && <span className="text-sm font-normal text-gray-500">{interpretation.label}</span>}
                  </div>
                  <p className="whitespace-pre-line leading-relaxed">{interpretation.interpretation}</p>
                  {interpretation.guidance.length > 0 && (
                    <ul>
                      {interpretation.guidance.map((entry, index) => (
                        <li key={`${entry.category}-${index}`}><span className="font-medium">{guidanceLabel(entry.category)}：</span>{entry.text}</li>
                      ))}
                    </ul>
                  )}
                  {interpretation.limitations.length > 0 && (
                    <p className="text-xs text-amber-700">解释限制：{interpretation.limitations.join('；')}</p>
                  )}
                </article>
              ))}
            </div>
          </ReportCoreSummary>
        </div>
      )}

      {invalid && (
        <ReportCoreSummary label="数据质量">
          <p>当前作答不足以稳定计算核心分数，因此不提供解释或群体参考。</p>
        </ReportCoreSummary>
      )}

      {(report.caveats || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            这份结果只反映本次回答，不能单独作为诊断或重要决定的依据。需要了解适用范围时，可展开以下说明。
          </p>
          <ReportDetails title="进一步了解：问卷的适用范围与限制" testId="scale-caveats-layer">
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700" data-testid="scale-caveats">
              {report.caveats!.map((caveat) => <li key={caveat}>{caveat}</li>)}
            </ul>
          </ReportDetails>
        </div>
      )}

      {report.disclaimer && <ReportDisclaimer testId="scale-disclaimer">{report.disclaimer}</ReportDisclaimer>}
      {!invalid && (
        <ReportDetails title="科学依据与详细参考" testId="scale-reference-layer">
          {references.length === 0 ? (
            <p>未提供群体参考。</p>
          ) : (
            <div className="space-y-4">
              {references.map((reference) => {
                const score = scores.find((candidate) => candidate.key === reference.scoreKey)
                return (
                  <article key={`${reference.scoreKey}-${reference.referenceVersion}-${reference.referenceKind}`} className="report-feedback">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h4>{score?.label || reference.scoreKey}</h4>
                      <span className="text-xs text-gray-500">{reference.label}</span>
                    </div>
                    <div className="mt-2">{renderReferenceDetails(reference)}</div>
                  </article>
                )
              })}
            </div>
          )}
        </ReportDetails>
      )}

    </div>
  )
}

export default ScaleUnitReportCard
