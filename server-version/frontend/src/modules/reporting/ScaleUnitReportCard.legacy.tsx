import React from 'react'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
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

const ScaleUnitReportCard: React.FC<{ report: SafeScaleUnitReport }> = ({ report }) => {
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
    <ReportRangeTrack
      key={score.key}
      label={score.label}
      value={score.value}
      formattedValue={formatNumber(score.value, score.displayPrecision)}
      range={score.range}
      reference={overlayFor(score, references)}
      status={scoreStatusLabel(score)}
    />
  )

  return (
    <div data-testid={`scale-unit-report-${report.itemId || report.scaleId}`} className="space-y-5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{report.scaleName}</span>
        {report.method?.reportVersion && <span>报告版本 {report.method.reportVersion}</span>}
        {quality?.status && <span>数据质量：{quality.status}</span>}
      </div>

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
                  <p>{interpretation.interpretation}</p>
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

      <ReportSection
        title={dimensionScores.length > 0 ? '结果概览' : '实际得分'}
        eyebrow="分数层"
        description={dimensionScores.length > 0
          ? '总体结果与各维度按后台定义分别展示；不同量表范围不会被前端标准化后直接比较。'
          : '展示后台报告投影中已有的分数和原始范围。'}
        testId="scale-score-layer"
      >
        {scores.length === 0 ? (
          <p className="text-sm text-gray-500">该量表尚未形成可展示的分数。</p>
        ) : (
          <div className="space-y-5">
            {totalScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">总体结果</p>
                {totalScores.length === 1 ? (
                  <div className="space-y-3">
                    <ReportMetric
                      emphasis
                      label={totalScores[0].label}
                      value={formatNumber(totalScores[0].value, totalScores[0].displayPrecision)}
                      description={totalScores[0].description}
                      meta={scoreStatusLabel(totalScores[0]) || undefined}
                    />
                    {rangeTrack(totalScores[0])}
                  </div>
                ) : (
                  <div className="report-range-grid">{totalScores.map(rangeTrack)}</div>
                )}
              </div>
            )}

            {dimensionScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">维度结果</p>
                <div className="report-range-grid">{dimensionScores.map(rangeTrack)}</div>
              </div>
            )}

            {unclassifiedScores.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">其他得分</p>
                <p className="mb-3 text-xs text-gray-500">这些历史或受众安全分数未携带 total / dimension 类型，页面不会自行推断其层级。</p>
                <div className="report-range-grid">{unclassifiedScores.map(rangeTrack)}</div>
              </div>
            )}
          </div>
        )}
      </ReportSection>

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

      {invalid && (
        <ReportCoreSummary label="数据质量">
          <p>当前作答不足以稳定计算核心分数，因此不提供解释或群体参考。</p>
        </ReportCoreSummary>
      )}

      {(report.caveats || []).length > 0 && (
        <ReportSection title="阅读提示" eyebrow="限制" headingLevel={3}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700" data-testid="scale-caveats">
            {report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </ReportSection>
      )}

      {report.disclaimer && <ReportDisclaimer testId="scale-disclaimer">{report.disclaimer}</ReportDisclaimer>}
    </div>
  )
}

export default ScaleUnitReportCard
