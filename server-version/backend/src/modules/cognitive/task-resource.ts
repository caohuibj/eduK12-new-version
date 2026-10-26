import type { RegistryEntry, CognitiveProfile, CognitiveProfileDefinition, MetricDefinition, QualityDefinition, SingleTaskReportDefinition } from './cognitive.types'
import type { TaskDefinition } from './v2/types'
import { getCognitiveRegistryEntry, listCognitiveRegistryEntries } from './cognitive.registry'
import { getNativeCognitiveTaskDefinition, listNativeCognitiveTaskDefinitions } from './content-candidates/native-registry/definitions'
import { ANT_IDENTITY } from './content-candidates/ant/protocol'
import { ENUMERATION_IDENTITY } from './content-candidates/enumeration/protocol'
import { getMotReportBundle } from './content-candidates/mot/package'
import { MOT_IDENTITY } from './content-candidates/mot/protocol'
import { NATIVE_IDENTITY } from './content-candidates/continuous-recognition/native'
import { BAD_REQUEST } from './cognitive.errors'
/** Display/freeze metadata only: no legacy score method or manufactured numeric score. */
interface ResourceMetadata {
  testType: string; name: string; category: string; engineVersion: string; scoringVersion: string;
  randomizationAlgorithmVersion: string; configSchema: TaskDefinition['configSchema']; trialSchema: TaskDefinition['trialSchema'];
  profileDefinitionVersion: string; profiles: Partial<Record<CognitiveProfile, CognitiveProfileDefinition>>;
  metricDefinitionVersion: string; metricDefinitions: Record<string, MetricDefinition>;
  qualityDefinitionVersion: string; qualityDefinitions: Record<string, QualityDefinition>;
  reportDefinitionVersion: string; reportDefinition: SingleTaskReportDefinition; recommendedForCreate?: boolean;
}
export type CognitiveTaskResource = ResourceMetadata & (
  { kind: 'legacy'; entry: RegistryEntry<unknown, unknown> } |
  { kind: 'native'; definition: TaskDefinition<unknown, unknown>; configVersion: string }
)
const nativeVersionFacts = (d: TaskDefinition) => {
  if (d.testType === 'ant') return { configVersion: ANT_IDENTITY.configVersion, profileDefinitionVersion: ANT_IDENTITY.configVersion,
    metricDefinitionVersion: ANT_IDENTITY.metricDefinitionVersion, qualityDefinitionVersion: ANT_IDENTITY.qualityDefinitionVersion }
  if (d.testType === 'enumeration') return { configVersion: ENUMERATION_IDENTITY.configVersion, profileDefinitionVersion: ENUMERATION_IDENTITY.configVersion,
    metricDefinitionVersion: ENUMERATION_IDENTITY.metricDefinitionVersion, qualityDefinitionVersion: ENUMERATION_IDENTITY.qualityDefinitionVersion }
  if (d.testType === 'mot') return { configVersion: MOT_IDENTITY.configVersion, profileDefinitionVersion: MOT_IDENTITY.configVersion,
    metricDefinitionVersion: MOT_IDENTITY.scoringVersion, qualityDefinitionVersion: MOT_IDENTITY.scoringVersion }
  if (d.testType === 'continuous-recognition') return { configVersion: NATIVE_IDENTITY.configVersion, profileDefinitionVersion: NATIVE_IDENTITY.configVersion,
    metricDefinitionVersion: NATIVE_IDENTITY.scoringVersion, qualityDefinitionVersion: NATIVE_IDENTITY.scoringVersion }
  throw BAD_REQUEST('No exact native version metadata')
}
const nativeResource = (definition: TaskDefinition<unknown, unknown>): CognitiveTaskResource => ({
  kind: 'native', definition, ...nativeVersionFacts(definition),
  testType: definition.testType, name: definition.name, category: definition.category,
  engineVersion: definition.engineVersion, scoringVersion: definition.scoringVersion,
  randomizationAlgorithmVersion: definition.protocol.randomizationAlgorithmVersion,
  configSchema: definition.configSchema, trialSchema: definition.trialSchema,
  profiles: Object.fromEntries(Object.entries(definition.profiles).map(([profile, value]) => [profile, { ...value!, profile: profile as CognitiveProfile }])),
  metricDefinitions: definition.metrics, qualityDefinitions: definition.quality,
  reportDefinitionVersion: definition.report.version,
  reportDefinition: { title: definition.report.title, headlineMetric: definition.report.headlineMetrics[0],
    primaryMetrics: [...definition.report.headlineMetrics, ...definition.report.userMetrics], secondaryMetrics: [...definition.report.detailMetrics],
    showProductIndex: false, disclaimer: definition.report.disclaimer, practicalTips: [...definition.report.practicalTips] },
  recommendedForCreate: definition.testType === 'mot',
})
export function getCognitiveTaskResource(testType: string, engineVersion: string, scoringVersion: string): CognitiveTaskResource | undefined {
  const native = getNativeCognitiveTaskDefinition(testType, engineVersion, scoringVersion)
  if (native) return nativeResource(native)
  const entry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  return entry ? { ...entry, kind: 'legacy', entry } : undefined
}
export function requireCognitiveTaskResource(testType: string, engineVersion: string, scoringVersion: string): CognitiveTaskResource {
  const resource = getCognitiveTaskResource(testType, engineVersion, scoringVersion)
  if (!resource) throw BAD_REQUEST(`No Cognitive implementation for ${testType}/${engineVersion}/${scoringVersion}`)
  return resource
}
export const listCognitiveTaskResources = (): CognitiveTaskResource[] => [
  ...listCognitiveRegistryEntries().map(entry => ({ ...entry, kind: 'legacy' as const, entry })),
  ...listNativeCognitiveTaskDefinitions().map(nativeResource),
]
export const hasResourceProfile = (resource: CognitiveTaskResource, profile: string): profile is CognitiveProfile =>
  ['experience', 'standard', 'research'].includes(profile) && Boolean(resource.profiles[profile as CognitiveProfile])
export function assertResourceConfigVersion(resource: CognitiveTaskResource, configVersion: string | undefined): void {
  if (resource.kind === 'native' && resource.configVersion !== configVersion) throw BAD_REQUEST('Native Cognitive configVersion does not match its frozen implementation')
}
export function assertNativeDeliverySupported(resource: CognitiveTaskResource, purpose: 'authenticated' | 'public'): void {
  if (resource.kind !== 'native') return
  if (purpose !== 'authenticated' || resource.testType !== 'mot')
    throw BAD_REQUEST('This native Cognitive identity is not enabled for this delivery path')
}

/** Report-only compatibility is independent from measurement/scorer identity. Unknown bundles never fall back. */
export function resolveNativeReportBundle(resource: Extract<CognitiveTaskResource, { kind: 'native' }>, version: string) {
  if (resource.testType === MOT_IDENTITY.testType && resource.engineVersion === MOT_IDENTITY.engineVersion
    && resource.scoringVersion === MOT_IDENTITY.scoringVersion) return getMotReportBundle(version)
  return version === resource.definition.report.version
    ? { report: resource.definition.report, metrics: resource.definition.metrics, quality: resource.definition.quality } : undefined
}
export function nativeDefinitionForFrozenReport(resource: Extract<CognitiveTaskResource, { kind: 'native' }>, version: string) {
  const bundle = resolveNativeReportBundle(resource, version)
  if (!bundle) throw BAD_REQUEST('Unknown native frozen report version')
  return { ...resource.definition, metrics: bundle.metrics, quality: bundle.quality, report: bundle.report }
}
