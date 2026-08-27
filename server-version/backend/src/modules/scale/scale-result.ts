import {
  hashScaleDefinition,
  type ScaleDefinitionV2,
  type ScaleInterpretationDefinition,
} from './scale-definition'
import {
  scoreScale,
  type ScaleAnswer,
  type ScaleScoringOutput,
  type ScaleScoreValue,
} from './scale-scoring'
import {
  resolveScaleReference,
  type AssessmentReferenceSetDefinition,
  type ReferenceContext,
  type ResolvedScaleReference,
} from '../assessment-reference/reference'

export interface ScaleResultV2 {
  schemaVersion: 2
  instrument: {
    scaleId: string
    code: string
    name: string
    instrumentVersion: string
  }
  method: {
    scaleId: string
    instrumentVersion: string
    scoringVersion: string
    reportVersion: string
    definitionHash: string
    referenceVersions: string[]
    assessmentContext: {
      schemaVersion: 1
      snapshotHash: string
    } | null
  }
  quality: ScaleScoringOutput['quality']
  itemScores: ScaleScoringOutput['itemScores']
  scores: ScaleScoreValue[]
  references: ResolvedScaleReference[]
  interpretations: ScaleInterpretationResult[]
  caveats: string[]
  disclaimer: string
}

export interface ScaleInterpretationResult {
  scoreKey: string
  headline: string
  label: string | null
  interpretation: string
  guidance: Array<{ category: 'reflection' | 'strategy' | 'environment' | 'support'; text: string }>
  limitations: string[]
  referenceVersion: string | null
}

const unique = (values: string[]): string[] => values.filter((value, index) => values.indexOf(value) === index)

const interpretationFor = (
  definition: ScaleDefinitionV2,
  score: ScaleScoreValue,
  references: ResolvedScaleReference[],
): ScaleInterpretationResult | null => {
  const configured = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key)
  if (!configured) return null
  if (score.status === 'not_calculable' || score.value === null) return null

  const reference = references.find((candidate) => {
    if (candidate.scoreKey !== score.key || candidate.status !== 'available') return false
    if (configured.source.type !== 'reference') return true
    return candidate.referenceVersion === configured.source.referenceVersion
      && candidate.referenceKind === configured.source.referenceKind
  })
  let label: string | null = null
  let interpretation = configured.summary
  let guidance = configured.guidance
  let referenceVersion: string | null = null
  if (configured.source.type === 'reference') {
    if (!reference) return {
      scoreKey: score.key,
      headline: configured.headline,
      label: null,
      interpretation: configured.summary,
      guidance: configured.guidance,
      limitations: definition.report.limitations,
      referenceVersion: null,
    }
    referenceVersion = reference.referenceVersion
    label = reference.criterionBand?.label ?? null
    const configuredBand = reference.criterionBand
      ? configured.bands.find((band) => band.key === reference.criterionBand?.key)
      : undefined
    if (configuredBand) {
      label = configuredBand.label
      interpretation = configuredBand.summary
      guidance = [...configuredBand.guidance, ...configured.guidance]
    }
  }

  return {
    scoreKey: score.key,
    headline: configured.headline,
    label,
    interpretation,
    guidance,
    limitations: unique([...definition.report.limitations, ...(reference?.limitations ?? [])]),
    referenceVersion,
  }
}

const caveatsFor = (
  definition: ScaleDefinitionV2,
  scoring: ScaleScoringOutput,
  references: ResolvedScaleReference[],
): string[] => {
  const caveats = [...definition.report.limitations]
  if (scoring.quality.status === 'limited') caveats.push('部分题目未回答，结果按量表定义以有限数据计算。')
  if (scoring.quality.status === 'invalid') caveats.push('至少一个 canonical score 无法计算，因此不提供解释或群体参考。')
  if (definition.referencePolicy.type === 'none') caveats.push('未提供群体参考。')
  references.forEach((reference) => {
    if (reference.percentile?.estimated) caveats.push('百分位由文献均值、标准差和正态分布假设估算。')
    if (reference.status === 'unavailable' && reference.unavailableReason === 'missing_context') caveats.push('某些群体参考需要本次测评未采集的人口学上下文，因此未显示。')
  })
  return unique(caveats)
}

export const buildScaleResult = (input: {
  scaleId: string
  instrumentKey: string
  name: string
  instrumentVersion: string
  definition: ScaleDefinitionV2
  answers: ScaleAnswer[]
  referenceSets?: AssessmentReferenceSetDefinition[]
  participantContext?: ReferenceContext
  participantContextHash?: string | null
}): ScaleResultV2 => {
  const scoring = scoreScale(input.definition, input.answers)
  const references = scoring.quality.status === 'invalid'
    ? []
    : scoring.scores.flatMap((score) => resolveScaleReference({
      policy: input.definition.referencePolicy,
      references: input.referenceSets ?? [],
      instrumentKey: input.instrumentKey,
      instrumentVersion: input.instrumentVersion,
      scoringVersion: input.definition.scoring.scoringVersion,
      score,
      context: input.participantContext,
    }))
  const interpretations = scoring.quality.status === 'invalid'
    ? []
    : input.definition.report.scoreOrder
      .map((key) => scoring.scores.find((score) => score.key === key))
      .filter((score): score is ScaleScoreValue => Boolean(score))
      .map((score) => interpretationFor(input.definition, score, references))
      .filter((interpretation): interpretation is ScaleInterpretationResult => Boolean(interpretation))

  const referenceVersions = unique(references
    .filter((reference) => reference.status === 'available')
    .map((reference) => reference.referenceVersion))
  return {
    schemaVersion: 2,
    instrument: {
      scaleId: input.scaleId,
      code: input.instrumentKey,
      name: input.name,
      instrumentVersion: input.instrumentVersion,
    },
    method: {
      scaleId: input.scaleId,
      instrumentVersion: input.instrumentVersion,
      scoringVersion: input.definition.scoring.scoringVersion,
      reportVersion: input.definition.report.reportVersion,
      definitionHash: hashScaleDefinition(input.definition),
      referenceVersions,
      assessmentContext: input.participantContextHash
        ? { schemaVersion: 1, snapshotHash: input.participantContextHash }
        : null,
    },
    quality: scoring.quality,
    itemScores: scoring.itemScores,
    scores: scoring.scores,
    references,
    interpretations,
    caveats: caveatsFor(input.definition, scoring, references),
    disclaimer: input.definition.report.disclaimer,
  }
}

export const formatScaleScore = (score: ScaleScoreValue): number | null => (
  score.value === null ? null : Number(score.value.toFixed(score.displayPrecision))
)

export type { ScaleInterpretationDefinition }
