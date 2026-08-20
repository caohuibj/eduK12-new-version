import { getCognitiveRegistryEntry } from '../cognitive.registry'

/**
 * The registry is the single source of truth for a cognitive config
 * contract. Validation is keyed by the frozen implementation tuple, so a
 * config can never silently fall back to a newer schema.
 */
export interface CognitiveConfigVersion {
  testType: string
  engineVersion: string
  scoringVersion: string
}

export const getCognitiveConfigContract = (version: CognitiveConfigVersion) => {
  const entry = getCognitiveRegistryEntry(
    version.testType,
    version.engineVersion,
    version.scoringVersion
  )
  if (!entry) {
    throw new Error(
      `No cognitive registry entry for ${version.testType}/${version.engineVersion}/${version.scoringVersion}`
    )
  }
  return entry
}

export const validateCognitiveConfig = (
  version: CognitiveConfigVersion,
  config: unknown
) => getCognitiveConfigContract(version).configSchema.parse(config)

export const parseCognitiveConfig = (
  version: CognitiveConfigVersion,
  config: unknown
) => {
  const entry = getCognitiveConfigContract(version)
  return { entry, config: entry.configSchema.parse(config) }
}
