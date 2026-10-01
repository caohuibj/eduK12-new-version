import {
  hashScaleDefinition,
  scaleDirectionSchema,
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
import { z } from 'zod'

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
    reportAudience?: 'student' | 'parent' | 'teacher'
    localizationVersion?: string
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

const scaleResponseValueSchema = z.union([z.string(), z.number().finite()])

const scaleItemScoreSchema = z.object({
  itemCode: z.string().min(1),
  responseValue: scaleResponseValueSchema,
  baseScore: z.number().finite(),
  score: z.number().finite(),
  responseTimeMs: z.number().finite().nonnegative().optional(),
  answeredAt: z.string().optional(),
  changeCount: z.number().int().nonnegative().optional(),
}).passthrough()

const scaleScoreSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['total', 'dimension']),
  label: z.string().min(1),
  description: z.string().optional(),
  direction: scaleDirectionSchema,
  canonical: z.boolean(),
  displayPrecision: z.number().int().min(0).max(6),
  value: z.number().finite().nullable(),
  range: z.object({
    min: z.number().finite(),
    max: z.number().finite(),
  }).passthrough().nullable(),
  expectedItems: z.array(z.string().min(1)),
  answeredItems: z.array(z.string().min(1)),
  status: z.enum(['calculated', 'limited', 'not_calculable']),
  prorated: z.boolean(),
}).passthrough()

const scaleQualitySchema = z.object({
  status: z.enum(['interpretable', 'limited', 'invalid']),
  flags: z.array(z.enum(['missing_items', 'insufficient_items', 'score_not_calculable'])),
}).passthrough()

const scaleAssessmentContextSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotHash: z.string().min(1),
}).strict().nullable()

const scaleResultV2Schema = z.object({
  schemaVersion: z.literal(2),
  instrument: z.object({
    scaleId: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    instrumentVersion: z.string().min(1),
  }).passthrough(),
  method: z.object({
    scaleId: z.string().min(1),
    instrumentVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
    reportVersion: z.string().min(1),
    definitionHash: z.string().min(1),
    referenceVersions: z.array(z.string().min(1)),
    assessmentContext: scaleAssessmentContextSchema,
  }).passthrough(),
  quality: scaleQualitySchema,
  itemScores: z.array(scaleItemScoreSchema),
  scores: z.array(scaleScoreSchema).min(1),
  references: z.array(z.record(z.unknown())),
  interpretations: z.array(z.object({
    scoreKey: z.string().min(1),
    headline: z.string().min(1),
    label: z.string().nullable(),
    interpretation: z.string(),
    guidance: z.array(z.object({
      category: z.enum(['reflection', 'strategy', 'environment', 'support']),
      text: z.string().min(1),
    }).passthrough()),
    limitations: z.array(z.string()),
    referenceVersion: z.string().nullable(),
  }).passthrough()),
  caveats: z.array(z.string()),
  disclaimer: z.string().min(1),
}).passthrough().superRefine((result, context) => {
  if (result.instrument.scaleId !== result.method.scaleId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['method', 'scaleId'],
      message: 'method.scaleId must match instrument.scaleId',
    })
  }
  if (result.instrument.instrumentVersion !== result.method.instrumentVersion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['method', 'instrumentVersion'],
      message: 'method.instrumentVersion must match instrument.instrumentVersion',
    })
  }
  const keys = new Set<string>()
  result.scores.forEach((score, index) => {
    if (keys.has(score.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scores', index, 'key'],
        message: 'score keys must be unique',
      })
    }
    keys.add(score.key)
    if (score.status === 'not_calculable' && score.value !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scores', index, 'value'],
        message: 'not_calculable scores must have a null value',
      })
    }
    if (score.status !== 'not_calculable' && score.value === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scores', index, 'value'],
        message: `${score.status} scores must have a numeric value`,
      })
    }
  })
  const canonicalScores = result.scores.filter((score) => score.canonical)
  const expectedQualityStatus = canonicalScores.some((score) => score.status === 'not_calculable')
    ? 'invalid'
    : canonicalScores.some((score) => score.status === 'limited')
      ? 'limited'
      : 'interpretable'
  if (result.quality.status !== expectedQualityStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quality', 'status'],
      message: `quality.status must be ${expectedQualityStatus} for canonical score statuses`,
    })
  }
  if (expectedQualityStatus === 'invalid' && !result.quality.flags.includes('score_not_calculable')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quality', 'flags'],
      message: 'invalid quality must include score_not_calculable',
    })
  }
  if (
    expectedQualityStatus === 'limited'
    && !result.quality.flags.includes('missing_items')
    && !result.quality.flags.includes('insufficient_items')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quality', 'flags'],
      message: 'limited quality must include missing_items or insufficient_items',
    })
  }
})

/**
 * Parse the persisted v2 result at the boundary shared by reports and
 * cross-source analysis. Keeping this contract in the scale module prevents
 * each consumer from accepting a different subset of ScaleResultV2.
 */
export const parseScaleResultV2 = (value: unknown): ScaleResultV2 => (
  scaleResultV2Schema.parse(value) as unknown as ScaleResultV2
)

export const isScaleResultV2 = (value: unknown): value is ScaleResultV2 => (
  scaleResultV2Schema.safeParse(value).success
)

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
  if (configured.source.type === 'reference' || configured.source.type === 'reference_context') {
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
      // Governed language identifies the administered form, not a student's home language.
      context: input.definition.versionAxes ? {...input.participantContext,language:input.definition.versionAxes.locale} : input.participantContext,
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
      ...(input.definition.report.audienceContract ? { reportAudience: input.definition.report.audienceContract.audience } : {}),
      ...(input.definition.versionAxes ? { localizationVersion: input.definition.versionAxes.localizationVersion } : {}),
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
