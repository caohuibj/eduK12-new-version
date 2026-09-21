import type { RegistryEntry } from '../cognitive.types'

export type CognitiveTaskQualityEffectV1 = 'none' | 'limited' | 'invalid'
export type CognitiveTaskPhaseV1 = 'test' | 'learning' | 'delayed'

export interface CognitiveTaskProtocolPhaseV1 {
  key: CognitiveTaskPhaseV1
  persists: boolean
  required: boolean
}

export interface CognitiveTaskSemanticsV1 {
  protocolPhases: readonly CognitiveTaskProtocolPhaseV1[]
  qualityEffects: Readonly<Record<string, CognitiveTaskQualityEffectV1>>
}

export interface CognitiveTaskPackageV1<TConfig, TTrial> extends CognitiveTaskSemanticsV1 {
  testType: string
  entries: readonly RegistryEntry<TConfig, TTrial>[]
}

export const defineCognitiveTaskPackage = <TConfig, TTrial>(
  input: CognitiveTaskPackageV1<TConfig, TTrial>,
): CognitiveTaskPackageV1<TConfig, TTrial> => {
  if (input.entries.length === 0) {
    throw new Error(`Cognitive task package has no identities: ${input.testType}`)
  }

  const entryQualityKeys = new Set<string>()
  for (const entry of input.entries) {
    if (entry.testType !== input.testType) {
      throw new Error(
        `Cognitive task package identity mismatch: expected ${input.testType}, received ${entry.testType}`,
      )
    }
    for (const key of Object.keys(entry.qualityDefinitions)) entryQualityKeys.add(key)
  }

  for (const key of entryQualityKeys) {
    if (!input.qualityEffects[key]) {
      throw new Error(`Cognitive task package missing quality effect: ${input.testType}/${key}`)
    }
  }
  for (const key of Object.keys(input.qualityEffects)) {
    if (!entryQualityKeys.has(key)) {
      throw new Error(`Cognitive task package declares unknown quality effect: ${input.testType}/${key}`)
    }
  }

  if (input.protocolPhases.length === 0 || !input.protocolPhases.some((phase) => phase.persists && phase.required)) {
    throw new Error(`Cognitive task package requires at least one persisted required phase: ${input.testType}`)
  }

  return input
}
