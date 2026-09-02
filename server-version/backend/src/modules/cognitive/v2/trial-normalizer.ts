import type { TaskDefinition, TrialEnvelope } from './types'
import { parseTrialEnvelope } from './trial-envelope'

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
  const maxTrials = input.maxTrials ?? 1000
  if (input.values.length === 0 || input.values.length > maxTrials) {
    throw new Error('Trial count is outside the supported range')
  }
  return input.values.map((value) => validateAndNormalizeTrial({ definition: input.definition, value }))
}
