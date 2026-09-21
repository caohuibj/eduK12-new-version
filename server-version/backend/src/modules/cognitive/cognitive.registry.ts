import type { CognitiveProfile, RegistryEntry } from './cognitive.types'
import { COGNITIVE_TASK_PACKAGES } from './tasks/task-packages'

/**
 * Exact Cognitive registry. Task assembly is owned by tasks/<testType>/package.ts.
 * This module only enforces uniqueness and exposes exact lookup helpers.
 */
type AnyRegistryEntry = RegistryEntry<unknown, unknown>

const REGISTRY = new Map<string, AnyRegistryEntry>()

const keyOf = (testType: string, engineVersion: string, scoringVersion: string): string =>
  `${testType}/${engineVersion}/${scoringVersion}`

const registerEntry = (entry: AnyRegistryEntry): void => {
  const key = keyOf(entry.testType, entry.engineVersion, entry.scoringVersion)
  if (REGISTRY.has(key)) throw new Error(`Cognitive registry duplicate key: ${key}`)
  REGISTRY.set(key, entry)
}

for (const taskPackage of COGNITIVE_TASK_PACKAGES) {
  for (const entry of taskPackage.entries) {
    registerEntry(entry as unknown as AnyRegistryEntry)
  }
}

export const hasCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): boolean => REGISTRY.has(keyOf(testType, engineVersion, scoringVersion))

export const getCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): AnyRegistryEntry | undefined => REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))

export const requireCognitiveRegistryEntry = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): AnyRegistryEntry => {
  const entry = REGISTRY.get(keyOf(testType, engineVersion, scoringVersion))
  if (!entry) {
    throw new Error(`No cognitive registry entry for ${testType}/${engineVersion}/${scoringVersion}`)
  }
  return entry
}

export const listCognitiveRegistryEntries = (): AnyRegistryEntry[] => [...REGISTRY.values()]

export const listCognitiveRegistryEntriesForType = (testType: string): AnyRegistryEntry[] =>
  listCognitiveRegistryEntries().filter((entry) => entry.testType === testType)

export const hasCognitiveProfile = (
  entry: AnyRegistryEntry,
  profile: string,
): profile is CognitiveProfile => (
  profile === 'experience' || profile === 'standard' || profile === 'research'
    ? Boolean(entry.profiles[profile])
    : false
)
