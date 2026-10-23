import { getCognitiveRegistryEntry, listCognitiveRegistryEntries } from './cognitive.registry'
import { cognitiveNativeDefinitions } from './generated/native-execution'
import type { RegistryEntry, CognitiveProfile } from './cognitive.types'
import type { TaskDefinition } from './v2/types'

/** Read-only catalog projection. It deliberately has no scorer or executable schema. */
export type CognitiveCatalogMetadata = Pick<RegistryEntry<unknown, unknown>,
  'testType' | 'name' | 'category' | 'engineVersion' | 'scoringVersion' | 'profiles' |
  'profileDefinitionVersion' | 'metricDefinitionVersion' | 'metricDefinitions' |
  'qualityDefinitionVersion' | 'qualityDefinitions' | 'reportDefinitionVersion' |
  'reportDefinition' | 'recommendedForCreate'>
export function nativeCatalogMetadata(definition: TaskDefinition): CognitiveCatalogMetadata {
  return {
    testType: definition.testType, name: definition.name, category: definition.category,
    engineVersion: definition.engineVersion, scoringVersion: definition.scoringVersion,
    profileDefinitionVersion: definition.protocol.version,
    profiles: Object.fromEntries(Object.entries(definition.profiles).map(([profile, value]) =>
      [profile, { ...value, profile: profile as CognitiveProfile }])),
    metricDefinitionVersion: definition.scoringVersion, metricDefinitions: definition.metrics,
    qualityDefinitionVersion: definition.scoringVersion, qualityDefinitions: definition.quality,
    reportDefinitionVersion: definition.report.version,
    reportDefinition: { title: definition.report.title, headlineMetric: definition.report.headlineMetrics[0],
      primaryMetrics: definition.report.userMetrics, secondaryMetrics: definition.report.detailMetrics,
      disclaimer: definition.report.disclaimer, practicalTips: definition.report.practicalTips, showProductIndex: false },
    // Native v2 support here does not enable the legacy Training assignment path.
    recommendedForCreate: false,
  }
}
export function getCognitiveCatalogMetadata(testType: string, engineVersion: string, scoringVersion: string): CognitiveCatalogMetadata | undefined {
  const legacy = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  if (legacy) return legacy
  const native = cognitiveNativeDefinitions.find((d: TaskDefinition) => d.testType === testType && d.engineVersion === engineVersion && d.scoringVersion === scoringVersion)
  return native ? nativeCatalogMetadata(native) : undefined
}
export function listCognitiveCatalogMetadata(): CognitiveCatalogMetadata[] {
  return [...listCognitiveRegistryEntries(), ...cognitiveNativeDefinitions.map(nativeCatalogMetadata)]
}
