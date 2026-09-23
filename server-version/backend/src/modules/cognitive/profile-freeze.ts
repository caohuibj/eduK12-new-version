import { resolveParticipantPresentation, type CognitiveParticipantPresentationV1 } from './participant-presentation'
import { buildCognitiveV2TaskDefinition } from './v2/registry'
import type { TaskDefinition } from './v2/types'
import { createHash } from 'crypto'
import { decryptCognitivePayload, encryptCognitivePayload } from './cognitive.security'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
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
  presentationVersion?: string
  participantPresentation?: CognitiveParticipantPresentationV1
  v2ReportDefinition?: TaskDefinition['report']
  v2MetricDefinitions?: TaskDefinition['metrics']
  v2QualityDefinitions?: TaskDefinition['quality']
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
  if (!profileDefinition) throw BAD_REQUEST(`该任务未声明 Profile ${input.profile}`)
  const protocolPresentation = resolveCognitiveProtocolPresentation({
    testType: input.entry.testType,
    engineVersion: input.entry.engineVersion,
    scoringVersion: input.entry.scoringVersion,
    profile: input.profile,
  })
  const participantPresentation = resolveParticipantPresentation(input.entry)
  if (!participantPresentation) throw new Error(`COG_PRESENTATION_MISSING: ${input.entry.testType}/${input.entry.engineVersion}/${input.entry.scoringVersion}`)
  const v2 = buildCognitiveV2TaskDefinition(input.entry as unknown as RegistryEntry<unknown, unknown>)
  const resolvedReport: FrozenReportSnapshot = {
    presentationVersion: participantPresentation.presentationVersion,
    participantPresentation,
    v2ReportDefinition: v2.report,
    v2MetricDefinitions: v2.metrics,
    v2QualityDefinitions: v2.quality,
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
  const snapshot = measureRequestPhaseSync('cognitive.frozen_report_decrypt', () => (
    decryptCognitivePayload<FrozenReportSnapshot>(encrypted)
  ))
  if (snapshot.presentationVersion !== undefined && (
    !snapshot.participantPresentation
    || snapshot.participantPresentation.presentationVersion !== snapshot.presentationVersion
    || !snapshot.v2ReportDefinition || !snapshot.v2MetricDefinitions || !snapshot.v2QualityDefinitions
  )) throw new Error('COG_PRESENTATION_SNAPSHOT_INVALID')
  return snapshot
}

export interface FrozenMeasurementContext {
  profile: CognitiveProfile | null
  frozenReport: FrozenReportSnapshot | null
  resolvedConfigHash: string | null
}

/** 读取发布时冻结的 Profile / 报告快照；缺失时保持 null，不得回填 standard。 */
export const loadFrozenMeasurementContext = async (
  db: { cognitiveAssignment: { findUnique: (args: never) => Promise<unknown> } },
  assignmentId: string | null | undefined,
): Promise<FrozenMeasurementContext> => {
  if (!assignmentId) {
    return { profile: null, frozenReport: null, resolvedConfigHash: null }
  }
  const assignment = await measureRequestPhase('cognitive.frozen_report_db', () => db.cognitiveAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      profile: true,
      resolvedConfigHash: true,
      resolvedReportSnapshotEncrypted: true,
    },
  } as never)) as {
    profile: string | null
    resolvedConfigHash: string | null
    resolvedReportSnapshotEncrypted: string | null
  } | null
  if (!assignment) {
    return { profile: null, frozenReport: null, resolvedConfigHash: null }
  }
  const profile =
    assignment.profile === 'experience' || assignment.profile === 'standard' || assignment.profile === 'research'
      ? assignment.profile
      : null
  return {
    profile,
    frozenReport: readFrozenReport(assignment.resolvedReportSnapshotEncrypted),
    resolvedConfigHash: assignment.resolvedConfigHash,
  }
}

export const freezeDataForWrite = (freeze: ReturnType<typeof freezeAssignmentProfile>) => ({
  profile: freeze.profile,
  profileDefinitionVersion: freeze.profileDefinitionVersion,
  resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
  resolvedConfigHash: freeze.resolvedConfigHash,
  resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
})
