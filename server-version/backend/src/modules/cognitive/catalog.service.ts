import { isCognitiveProductEligible } from './product-eligibility'
import { BAD_REQUEST, NOT_FOUND } from './cognitive.errors'
import {
  getCognitiveRegistryEntry,
  listCognitiveRegistryEntries,
  listCognitiveRegistryEntriesForType,
} from './cognitive.registry'
import type { RegistryEntry } from './cognitive.types'

const toCatalogRow = (entry: RegistryEntry<unknown, unknown>) => ({
  testType: entry.testType,
  name: entry.name,
  category: entry.category,
  engineVersion: entry.engineVersion,
  scoringVersion: entry.scoringVersion,
  profileDefinitionVersion: entry.profileDefinitionVersion,
  metricDefinitionVersion: entry.metricDefinitionVersion,
  qualityDefinitionVersion: entry.qualityDefinitionVersion,
  reportDefinitionVersion: entry.reportDefinitionVersion,
  recommendedForCreate: entry.recommendedForCreate === true,
  profiles: Object.values(entry.profiles).map((profile) => ({
    profile: profile.profile,
    estimatedMinutes: profile.estimatedMinutes,
    reportCaveats: profile.reportCaveats,
  })),
  metricDefinitions: entry.metricDefinitions,
  qualityDefinitions: entry.qualityDefinitions,
  reportDefinition: entry.reportDefinition,
})

export const listCognitiveTestsCatalog = (testType?: string) => {
  const entries = testType
    ? listCognitiveRegistryEntriesForType(testType)
    : listCognitiveRegistryEntries()
  return { list: entries.filter(entry => isCognitiveProductEligible(entry.testType)).map((entry) => toCatalogRow(entry as RegistryEntry<unknown, unknown>)) }
}

export const getCognitiveTestCatalog = (
  testType: string,
  engineVersion?: string,
  scoringVersion?: string,
) => {
  if (!isCognitiveProductEligible(testType)) throw NOT_FOUND('Cognitive task is not available as a product')
  if (Boolean(engineVersion) !== Boolean(scoringVersion)) {
    throw BAD_REQUEST('engineVersion 与 scoringVersion 必须同时提供')
  }
  if (engineVersion && scoringVersion) {
    const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
    if (!entry) {
      throw NOT_FOUND(`No cognitive registry entry for ${testType}/${engineVersion}/${scoringVersion}`)
    }
    return toCatalogRow(entry as RegistryEntry<unknown, unknown>)
  }
  const list = listCognitiveRegistryEntriesForType(testType).map((entry) =>
    toCatalogRow(entry as RegistryEntry<unknown, unknown>),
  )
  if (list.length === 0) throw NOT_FOUND(`No cognitive registry entries for ${testType}`)
  return { list }
}
