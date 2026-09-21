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
import { resolveCognitiveTaskParticipantPresentation } from './tasks/participant-presentation'
import { resolveLegacyCognitiveParticipantPresentation } from './tasks/legacy-participant-presentation'
import type {
  CognitiveProtocolTier,
  ResolvedCognitiveParticipantPresentationV1,
} from './tasks/participant-presentation.types'

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
  /** New assignments freeze the complete task-owned participant presentation. */
  participantPresentation?: ResolvedCognitiveParticipantPresentationV1
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
  const participantPresentation = resolveCognitiveTaskParticipantPresentation({
    testType: input.entry.testType,
    engineVersion: input.entry.engineVersion,
    scoringVersion: input.entry.scoringVersion,
    profile: input.profile,
  })
  const protocolPresentation = participantPresentation?.protocol
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
    ...(participantPresentation ? { participantPresentation } : {}),
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

export const resolveFrozenParticipantPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
  frozenReport: FrozenReportSnapshot | null
}): ResolvedCognitiveParticipantPresentationV1 | null => {
  if (input.frozenReport?.participantPresentation) return input.frozenReport.participantPresentation
  return resolveLegacyCognitiveParticipantPresentation({
    testType: input.testType,
    engineVersion: input.engineVersion,
    scoringVersion: input.scoringVersion,
    profile: input.profile,
    frozenProtocol: input.frozenReport,
  })
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
  const assignment = await db.cognitiveAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      profile: true,
      resolvedConfigHash: true,
      resolvedReportSnapshotEncrypted: true,
    },
  } as never) as {
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
