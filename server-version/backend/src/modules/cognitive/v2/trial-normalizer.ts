import type { TaskDefinition, TrialEnvelope } from './types'
import { parseTrialEnvelope } from './trial-envelope'
import { COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS } from './final-submission-budget'

/** Parse one untrusted envelope and its task payload exactly once. */
export const validateAndNormalizeTrial = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  value: unknown
}): TrialEnvelope<TTrial> => {
  const envelope = parseTrialEnvelope<TTrial>(input.value)
  const payload = input.definition.trialSchema.parse(envelope.payload)
  return { ...envelope, payload }
}

export const validateAndNormalizeTrials = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  values: unknown[]
  maxTrials?: number
}): TrialEnvelope<TTrial>[] => {
  const maxTrials = input.maxTrials ?? COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS
  if (input.values.length === 0) {
    throw new Error('Trial count is outside the supported range')
  }
  if (input.values.length > maxTrials) {
    throw new Error('submitted trial count exceeds frozen task limit')
  }
  return input.values.map((value) => validateAndNormalizeTrial({ definition: input.definition, value }))
}
