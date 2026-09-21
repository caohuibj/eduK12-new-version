import { createHash } from 'crypto'
import { decryptCognitivePayload, encryptCognitivePayload } from './cognitive.security'
import { BAD_REQUEST } from './cognitive.errors'
import type {
  CognitiveProfile,
  MetricDefinition,
  QualityDefinition,
  RegistryEntry,
  SingleTaskReportDefinition,
} from './cognitive.types'
import {
  resolveCognitiveProtocolPresentation,
  type CognitiveProtocolTier,
} from './protocol-presentation'

export interface FrozenReportSnapshot {
  profile: CognitiveProfile
  /** Optional only so report snapshots published before this field remain readable. */
  randomizationAlgorithmVersion?: string
  profileDefinitionVersion: string
  metricDefinitionVersion: string
  qualityDefinitionVersion: string
  reportDefinitionVersion: string
  reportCaveats: string[]
  metricDefinitions: Record<string, MetricDefinition>
  qualityDefinitions: Record<string, QualityDefinition>
  reportDefinition: SingleTaskReportDefinition
  /** Publish-prep protocol presentation is frozen with the assignment when reviewed. */
  protocolTier?: CognitiveProtocolTier
  profileLabel?: string
  participantConclusion?: string
  protocolShowProductIndex?: boolean
}

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

export const hashResolvedConfig = (config: unknown): string =>
  createHash('sha256').update(JSON.stringify(sortValue(config))).digest('hex')

export const mergeProfileConfig = <TConfig, TTrial>(
  entry: RegistryEntry<TConfig, TTrial>,
  baseConfig: unknown,
  profile: CognitiveProfile,
): TConfig => {
  const definition = entry.profiles[profile]
  if (!definition) {
    throw BAD_REQUEST(`该任务未声明 Profile ${profile}`)
  }
  const merged = {
    ...(baseConfig as Record<string, unknown>),
    ...definition.configPatch,
  }
  const parsed = entry.configSchema.safeParse(merged)
  if (!parsed.success) {
    throw BAD_REQUEST('Profile 配置与任务 schema 不匹配')
  }
  return parsed.data
}

export const freezeAssignmentProfile = <TConfig, TTrial>(input: {
  entry: RegistryEntry<TConfig, TTrial>
  baseConfig: unknown
  profile: CognitiveProfile
}) => {
  const resolvedConfig = mergeProfileConfig(input.entry, input.baseConfig, input.profile)
  const profileDefinition = input.entry.profiles[input.profile]
  const protocolPresentation = resolveCognitiveProtocolPresentation({
    testType: input.entry.testType,
    engineVersion: input.entry.engineVersion,
    scoringVersion: input.entry.scoringVersion,
    profile: input.profile,
  })
  const resolvedReport: FrozenReportSnapshot = {
    profile: input.profile,
    randomizationAlgorithmVersion: input.entry.randomizationAlgorithmVersion,
    profileDefinitionVersion: input.entry.profileDefinitionVersion,
    metricDefinitionVersion: input.entry.metricDefinitionVersion,
    qualityDefinitionVersion: input.entry.qualityDefinitionVersion,
    reportDefinitionVersion: input.entry.reportDefinitionVersion,
    reportCaveats: protocolPresentation?.reportCaveats ?? profileDefinition.reportCaveats,
    metricDefinitions: input.entry.metricDefinitions,
    qualityDefinitions: input.entry.qualityDefinitions,
    reportDefinition: input.entry.reportDefinition,
    ...(protocolPresentation ? {
      protocolTier: protocolPresentation.tier,
      profileLabel: protocolPresentation.profileLabel,
      participantConclusion: protocolPresentation.participantConclusion,
      protocolShowProductIndex: protocolPresentation.showProductIndex,
    } : {}),
  }
  return {
    profile: input.profile,
    profileDefinitionVersion: input.entry.profileDefinitionVersion,
    resolvedConfig,
    resolvedConfigHash: hashResolvedConfig(resolvedConfig),
    resolvedConfigSnapshotEncrypted: encryptCognitivePayload(resolvedConfig),
    resolvedReportSnapshotEncrypted: encryptCognitivePayload(resolvedReport),
  }
}

export const readFrozenReport = (encrypted?: string | null): FrozenReportSnapshot | null => {
  if (!encrypted) return null
  return decryptCognitivePayload<FrozenReportSnapshot>(encrypted)
}

export interface FrozenMeasurementContext {
  profile: CognitiveProfile | null
  frozenReport: FrozenReportSnapshot | null
  resolvedConfigHash: string | null
}
