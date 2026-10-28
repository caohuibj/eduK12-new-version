import {nativeCognitiveConfigSeeds} from './content-candidates/native-registry/config-seeds'
import type { RegistryEntry, CognitiveProfile, CognitiveProfileDefinition, MetricDefinition, QualityDefinition, SingleTaskReportDefinition } from './cognitive.types'
import type { TaskDefinition } from './v2/types'
import { getCognitiveRegistryEntry, listCognitiveRegistryEntries } from './cognitive.registry'
import { getNativeCognitiveTaskDefinition, listNativeCognitiveTaskDefinitions, getNativeContentDefinition } from './content-candidates/native-registry/definitions'
import { getAntIdentity } from './content-candidates/ant/protocol'
import { getEnumerationIdentity, ENUMERATION_RECIPE_IDENTITY } from './content-candidates/enumeration/protocol'
import { getMotReportBundle } from './content-candidates/mot/package'
import { MOT_IDENTITY } from './content-candidates/mot/protocol'
import { getRecognitionIdentity } from './content-candidates/continuous-recognition/native'
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
  if (d.testType === 'ant') {
    const id=getAntIdentity(d.engineVersion,d.scoringVersion)
    if(!id)throw BAD_REQUEST('No exact ANT version metadata')
    return {configVersion:id.configVersion,profileDefinitionVersion:id.configVersion,
      metricDefinitionVersion:id.metricDefinitionVersion,qualityDefinitionVersion:id.qualityDefinitionVersion}
  }
  if (d.testType === 'enumeration') {
    const identity = getEnumerationIdentity(d.engineVersion, d.scoringVersion)
    if (!identity) throw BAD_REQUEST('No exact enumeration version metadata')
    return { configVersion: identity.configVersion, profileDefinitionVersion: identity.configVersion,
      metricDefinitionVersion: identity.metricDefinitionVersion, qualityDefinitionVersion: identity.qualityDefinitionVersion }
  }
  if (d.testType === 'mot') return { configVersion: MOT_IDENTITY.configVersion, profileDefinitionVersion: MOT_IDENTITY.configVersion,
    metricDefinitionVersion: MOT_IDENTITY.scoringVersion, qualityDefinitionVersion: MOT_IDENTITY.scoringVersion }
  if (d.testType === 'continuous-recognition') {
    const id=getRecognitionIdentity(d.engineVersion,d.scoringVersion)
    if(!id)throw BAD_REQUEST('No exact recognition version metadata')
    return {configVersion:id.configVersion,profileDefinitionVersion:id.configVersion,metricDefinitionVersion:id.scoringVersion,qualityDefinitionVersion:id.scoringVersion}
  }
  const seed=nativeCognitiveConfigSeeds.find(value=>value.testType===d.testType&&value.engineVersion===d.engineVersion&&value.scoringVersion===d.scoringVersion)
  if(seed)return {configVersion:seed.configVersion,profileDefinitionVersion:seed.configVersion,
    metricDefinitionVersion:d.scoringVersion,qualityDefinitionVersion:d.scoringVersion}
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
  const enumeration = resource.testType === ENUMERATION_RECIPE_IDENTITY.testType
    && resource.engineVersion === ENUMERATION_RECIPE_IDENTITY.engineVersion
    && resource.scoringVersion === ENUMERATION_RECIPE_IDENTITY.scoringVersion
    && resource.configVersion === ENUMERATION_RECIPE_IDENTITY.configVersion
  const content=getNativeContentDefinition(resource.testType,resource.engineVersion,resource.scoringVersion)
  if (purpose !== 'authenticated' || (resource.testType !== 'mot' && !enumeration && content?.configVersion!==resource.configVersion))
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
