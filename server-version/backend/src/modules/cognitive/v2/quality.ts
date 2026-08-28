import type { MetricDefinition, QualityAssessment, QualityDefinition, QualityState } from './types'

const stateRank: Record<QualityState, number> = {
  interpretable: 0,
  limited: 1,
  invalid: 2,
}

export const deriveQualityState = (
  flags: Record<string, boolean>,
  definitions: Record<string, QualityDefinition>,
): QualityState => {
  let state: QualityState = 'interpretable'
  for (const [key, active] of Object.entries(flags)) {
    if (!active) continue
    const effect = definitions[key]?.effect ?? 'limited'
    if (effect === 'invalid') state = 'invalid'
    else if (effect === 'limited' && state !== 'invalid') state = 'limited'
  }
  return state
}

export const buildQualityAssessment = (input: {
  flags: Record<string, boolean>
  definitions: Record<string, QualityDefinition>
  reasons?: Record<string, string>
}): QualityAssessment => {
  const state = deriveQualityState(input.flags, input.definitions)
  const reasons = Object.entries(input.flags)
    .filter(([, active]) => active)
    .map(([key]) => input.reasons?.[key] ?? input.definitions[key]?.description ?? key)
  return { state, flags: { ...input.flags }, reasons }
}

/** A metric stays in the frozen/internal result but is not user-interpretable while a declared gate is active. */
export const metricIsQualityGated = (
  metric: Pick<MetricDefinition, 'requiresQualityFlags'>,
  quality: Pick<QualityAssessment, 'flags'>,
): boolean => (metric.requiresQualityFlags ?? []).some((key) => quality.flags[key] === true)

export const isQualityStateAtLeast = (state: QualityState, minimum: QualityState): boolean =>
  stateRank[state] >= stateRank[minimum]
