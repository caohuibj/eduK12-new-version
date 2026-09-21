import type { RegistryEntry } from '../cognitive.types'

export interface CognitiveTaskPackageV1<TConfig, TTrial> {
  testType: string
  entries: readonly RegistryEntry<TConfig, TTrial>[]
}

export const defineCognitiveTaskPackage = <TConfig, TTrial>(
  input: CognitiveTaskPackageV1<TConfig, TTrial>,
): CognitiveTaskPackageV1<TConfig, TTrial> => {
  if (input.entries.length === 0) {
    throw new Error(`Cognitive task package has no identities: ${input.testType}`)
  }
  for (const entry of input.entries) {
    if (entry.testType !== input.testType) {
      throw new Error(
        `Cognitive task package identity mismatch: expected ${input.testType}, received ${entry.testType}`,
      )
    }
  }
  return input
}
