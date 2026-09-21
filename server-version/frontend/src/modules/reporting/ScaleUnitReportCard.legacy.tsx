import React from 'react'
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

const valuePosition = (score: ExternalScaleScoreValue): number | null => {
  if (score.value === null || !score.range || score.range.max <= score.range.min) return null
  return Math.max(0, Math.min(100, ((score.value - score.range.min) / (score.range.max - score.range.min)) * 100))
}

const guidanceLabel = (category: 'reflection' | 'strategy' | 'environment' | 'support'): string => ({
  reflection: '自我观察',
  strategy: '策略建议',
  environment: '环境支持',
  support: '支持建议',
}[category])

const renderReferenceDetails = (reference: ScaleReferenceValue) => {
  if (reference.status !== 'available') {
    const reason = reference.unavailableReason === 'missing_context'
      ? '本次测评没有该 reference 所需的人口学上下文。'
      : reference.unavailableReason === 'version_mismatch'
        ? 'reference 与本次量表或计分版本不匹配。'
        : reference.unavailableReason === 'inactive'
          ? '该 reference 尚未激活。'
          : '当前没有可用的匹配 reference。'
    return <p className="text-sm text-gray-500">{reason}</p>
  }

  return (
    <div className="space-y-2 text-sm text-gray-600">
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
      <p className="text-xs text-gray-500">{reference.disclaimer}</p>
    </div>
  )
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

  return (
    <div data-testid={`scale-unit-report-${report.itemId || report.scaleId}`} className="space-y-6">
      <p className="text-xs text-gray-500">
        {report.scaleName}
        {report.method?.reportVersion ? ` · 报告版本 ${report.method.reportVersion}` : ''}
      </p>

      {!invalid && interpretations.length > 0 && (
        <section data-testid="scale-core-feedback">
          <h3 className="text-base font-semibold text-gray-800 mb-3">核心反馈</h3>
          <div className="space-y-4">
            {interpretations.map((interpretation) => (
              <article key={interpretation.scoreKey} className="rounded-lg bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-800">{interpretation.headline}</h4>
                  {interpretation.label && <span className="text-sm text-gray-600">{interpretation.label}</span>}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{interpretation.interpretation}</p>
                {interpretation.guidance.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    {interpretation.guidance.map((entry, index) => <li key={`${entry.category}-${index}`}><span className="font-medium">{guidanceLabel(entry.category)}：</span>{entry.text}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section data-testid="scale-score-layer">
        <h3 className="text-base font-semibold text-gray-800 mb-3">实际得分</h3>
        {scores.length === 0 ? (
          <p className="text-sm text-gray-500">该量表尚未形成可展示的分数。</p>
        ) : (
          <div className="space-y-4">
            {scores.map((score) => {
              const position = valuePosition(score)
              return (
                <div key={score.key}>
                  <div className="flex justify-between gap-4 text-sm mb-1">
                    <span className="font-medium text-gray-700">{score.label}</span>
                    <span className="text-gray-700">
                      <span>{formatNumber(score.value, score.displayPrecision)}</span>
                      {score.range && <span>{` / ${formatNumber(score.range.min, score.displayPrecision)}–${formatNumber(score.range.max, score.displayPrecision)}`}</span>}
                    </span>
                  </div>
                  <div className="relative w-full h-2 rounded-full bg-gray-200" aria-label={`${score.label}量表范围`}>
                    {position !== null && <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-primary bg-white" style={{ left: `${position}%` }} />}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>{score.range ? formatNumber(score.range.min, score.displayPrecision) : '—'}</span>
                    <span>{score.status === 'limited' ? (score.prorated ? '有限数据 · 已折算' : '有限数据') : score.status === 'not_calculable' ? '无法计算' : ''}</span>
                    <span>{score.range ? formatNumber(score.range.max, score.displayPrecision) : '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {!invalid && (
        <section data-testid="scale-reference-layer">
          <h3 className="text-base font-semibold text-gray-800 mb-3">详细参考</h3>
          {references.length === 0 ? (
            <p className="text-sm text-gray-500">未提供群体参考。</p>
          ) : (
            <div className="space-y-4">
              {references.map((reference) => {
                const score = scores.find((candidate) => candidate.key === reference.scoreKey)
                return (
                  <article key={`${reference.scoreKey}-${reference.referenceVersion}-${reference.referenceKind}`} className="border rounded-lg p-4">
                    <div className="flex flex-wrap justify-between gap-2 mb-2">
                      <h4 className="font-medium text-gray-800">{score?.label || reference.scoreKey}</h4>
                      <span className="text-sm text-gray-500">{reference.label}</span>
                    </div>
                    {renderReferenceDetails(reference)}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {invalid && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">当前作答不足以稳定计算核心分数，因此不提供解释或群体参考。</p>}
      {(report.caveats || []).length > 0 && <ul className="list-disc list-inside text-sm text-amber-700 space-y-1" data-testid="scale-caveats">{report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>}
      {report.disclaimer && <p className="text-xs text-gray-500" data-testid="scale-disclaimer">{report.disclaimer}</p>}
    </div>
  )
}

export default ScaleUnitReportCard
