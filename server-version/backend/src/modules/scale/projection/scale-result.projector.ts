import type { DisclosureCapabilitiesV1 } from '../policy/types'
import type { ScaleResultV2 } from '../scale-result'
import { resolveEffectiveScaleDisclosure } from './context'
import {
  projectExternalEducationalFeedback,
  projectExternalInterpretations,
  projectExternalScaleItemScores,
  projectExternalScaleMethod,
  projectExternalScaleQuality,
  projectExternalScaleReferences,
  projectExternalScaleScores,
} from './serialization'
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

/** Strict allowlist serializer for completed Scale results. */
export const projectScaleResult = (input: ProjectScaleResultInput): ExternalScaleReportV1 => {
  const base = baseFor(input)
  if (input.context.frozenPolicy.disposition === 'UNKNOWN') {
    return { ...base, kind: 'unavailable', reason: 'POLICY_UNAVAILABLE' }
  }
  if (input.decryptError) return { ...base, kind: 'unavailable', reason: 'RESULT_UNAVAILABLE' }
  if (!input.result) return { ...base, kind: 'completion' }

  const capabilities = { ...resolveEffectiveScaleDisclosure(input.context) }
  const expectedAudience = ['respondent','subject'].includes(input.context.audience) ? 'student' : input.context.audience === 'teacher' ? 'teacher' : null
  if (input.result.method.reportAudience && input.result.method.reportAudience !== expectedAudience) capabilities.individualInterpretations = false
  const feedback = projectExternalEducationalFeedback(input.context.frozenPolicy.educationalFeedback)

  if (!capabilities.numericScores && !hasRichCapability(capabilities)) {
    if (capabilities.educationalContent && feedback) {
      return {
        ...base,
        kind: 'educational',
        ...feedback,
      }
    }
    return { ...base, kind: 'completion' }
  }

  if (capabilities.numericScores && !hasRichCapability(capabilities)) {
    return {
      ...base,
      kind: 'scores',
      scores: projectExternalScaleScores(input.result.scores),
      disclaimer: input.result.disclaimer,
    }
  }

  const quality = capabilities.resultQualityDetails ? projectExternalScaleQuality(input.result.quality) : null
  const method = capabilities.methods ? projectExternalScaleMethod(input.result.method) : null
  return {
    ...base,
    kind: 'full',
    ...(capabilities.numericScores ? { scores: projectExternalScaleScores(input.result.scores) } : {}),
    ...(capabilities.references
      ? { references: projectExternalScaleReferences(input.result.references, capabilities) }
      : {}),
    ...(capabilities.individualInterpretations
      ? { interpretations: projectExternalInterpretations(input.result.interpretations, capabilities) }
      : {}),
    ...(quality ? { quality, caveats: input.result.caveats.map(String) } : {}),
    ...(capabilities.itemScores
      ? { itemScores: projectExternalScaleItemScores(input.result.itemScores, capabilities.rawAnswers) }
      : {}),
    ...(method ? { method } : {}),
    ...(capabilities.educationalContent && feedback ? { educationalContent: feedback } : {}),
    disclaimer: input.result.disclaimer,
  }
}
