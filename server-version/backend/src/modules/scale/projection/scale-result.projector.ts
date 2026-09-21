import type { DisclosureCapabilitiesV1 } from '../policy/types'
import type { ScaleResultV2 } from '../scale-result'
import { resolveEffectiveScaleDisclosure } from './context'
import type {
  ExternalScaleReportBaseV1,
  ExternalScaleReportV1,
  ScaleProjectionContext,
} from './types'

export interface ProjectScaleResultInput {
  result: ScaleResultV2 | null
  instrument: ExternalScaleReportBaseV1['instrument']
  completedAt?: Date | string | null
  totalTime?: number | null
  context: ScaleProjectionContext
  decryptError?: boolean
}

const isoOrNull = (value: Date | string | null | undefined): string | null => {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

const baseFor = (input: ProjectScaleResultInput): Omit<ExternalScaleReportBaseV1, 'kind'> => ({
  schemaVersion: 1,
  instrument: {
    scaleId: input.instrument.scaleId,
    code: input.instrument.code,
    name: input.instrument.name,
    instrumentVersion: input.instrument.instrumentVersion,
  },
  completedAt: isoOrNull(input.completedAt),
  totalTime: input.totalTime ?? null,
})

const hasRichCapability = (capabilities: DisclosureCapabilitiesV1): boolean => (
  capabilities.references
  || capabilities.individualInterpretations
  || capabilities.scoreDerivedLabels
  || capabilities.resultQualityDetails
  || capabilities.itemScores
  || capabilities.methods
)

const projectInterpretations = (
  result: ScaleResultV2,
  capabilities: DisclosureCapabilitiesV1,
) => result.interpretations.map((entry) => ({
  scoreKey: entry.scoreKey,
  ...(capabilities.scoreDerivedLabels ? { headline: entry.headline, label: entry.label } : {}),
  interpretation: entry.interpretation,
  guidance: entry.guidance.map((guidance) => ({ category: guidance.category, text: guidance.text })),
  limitations: [...entry.limitations],
  referenceVersion: entry.referenceVersion,
}))

/** Strict allowlist serializer for completed Scale results. */
export const projectScaleResult = (input: ProjectScaleResultInput): ExternalScaleReportV1 => {
  const base = baseFor(input)
  if (input.context.frozenPolicy.disposition === 'UNKNOWN') {
    return { ...base, kind: 'unavailable', reason: 'POLICY_UNAVAILABLE' }
  }
  if (input.decryptError) return { ...base, kind: 'unavailable', reason: 'RESULT_UNAVAILABLE' }
  if (!input.result) return { ...base, kind: 'completion' }

  const capabilities = resolveEffectiveScaleDisclosure(input.context)
  const feedback = input.context.frozenPolicy.educationalFeedback

  if (!capabilities.numericScores && !hasRichCapability(capabilities)) {
    if (capabilities.educationalContent && feedback) {
      return {
        ...base,
        kind: 'educational',
        contentVersion: feedback.contentVersion,
        blocks: feedback.blocks.map((block) => ({ ...block })),
        ...(feedback.choices ? { choices: feedback.choices.map((choice) => ({ ...choice })) } : {}),
        ...(feedback.disclaimer ? { disclaimer: feedback.disclaimer } : {}),
      }
    }
    return { ...base, kind: 'completion' }
  }

  if (capabilities.numericScores && !hasRichCapability(capabilities)) {
    return {
      ...base,
      kind: 'scores',
      scores: input.result.scores.map((score) => ({ ...score })),
      disclaimer: input.result.disclaimer,
    }
  }

  return {
    ...base,
    kind: 'full',
    ...(capabilities.numericScores ? { scores: input.result.scores.map((score) => ({ ...score })) } : {}),
    ...(capabilities.references ? { references: input.result.references.map((reference) => ({ ...reference })) } : {}),
    ...(capabilities.individualInterpretations
      ? { interpretations: projectInterpretations(input.result, capabilities) }
      : {}),
    ...(capabilities.resultQualityDetails
      ? { quality: { status: input.result.quality.status, flags: [...input.result.quality.flags] }, caveats: [...input.result.caveats] }
      : {}),
    ...(capabilities.itemScores ? { itemScores: input.result.itemScores.map((item) => ({ ...item })) } : {}),
    ...(capabilities.methods
      ? { method: { ...input.result.method, referenceVersions: [...input.result.method.referenceVersions], assessmentContext: input.result.method.assessmentContext ? { ...input.result.method.assessmentContext } : null } }
      : {}),
    ...(capabilities.educationalContent && feedback ? { educationalContent: feedback } : {}),
    disclaimer: input.result.disclaimer,
  }
}
