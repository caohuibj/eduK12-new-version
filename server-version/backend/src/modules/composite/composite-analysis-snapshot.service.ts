import { createHash } from 'crypto'
import {
  decryptCognitivePayload,
  encryptCognitivePayload,
} from '../cognitive/cognitive.security'
import { hashResolvedConfig, readFrozenReport } from '../cognitive/profile-freeze'
import { sessionConfigFromStoredValue } from '../cognitive/v2/session-snapshot'
import { parseCognitiveResultSnapshot } from '../cognitive/v2/result-snapshot'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'
import { safeDecrypt } from '../../utils/encryption'
import {
  dispatchPackageAnalysis,
  isMentalHealthPackageAnalysis,
  packageAnalysisEngineKeyFor,
  type PackageAnalysisResult,
} from '../cognitive-analysis/package-analysis.dispatcher'
import { readFrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import { buildMentalHealthBundleScaleResults } from '../mental-health-bundle/mental-health-bundle.attempt'
import { logger } from '../../utils/logger'
import type {
  FrozenCognitiveModuleResult,
  FrozenScaleModuleResult,
} from '../cognitive-analysis/cognitive-analysis.types'
import type { FrozenBundleScaleEvidence } from '../mental-health-bundle'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import type {
  FrozenScaleSlotMeasurement,
  ProtocolCompositeItem,
} from '../cognitive-analysis/protocol-freeze'

export type CompositeAnalysisSnapshotGenerationReason = 'COMPLETION' | 'REANALYSIS'

export interface PackageAnalysisFingerprintInput {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults: FrozenCognitiveModuleResult[]
  analysisVersion: string
  reportSchemaVersion: string
  scaleResults?: FrozenScaleModuleResult[]
  bundleScaleResults?: FrozenBundleScaleEvidence[]
}

export interface CompositeAnalysisSnapshotRow {
  id: string
  attemptId: string
  packageKey: string
  packageVersion: string
  analysisDefinitionVersion: string
  analysisVersion: string
  reportSchemaVersion: string
  inputFingerprint: string
  generationReason: CompositeAnalysisSnapshotGenerationReason
  generatedBy: string | null
  payloadEncrypted: string
  createdAt: Date
}

export interface DecryptedCompositeAnalysisSnapshot extends Omit<CompositeAnalysisSnapshotRow, 'payloadEncrypted'> {
  payload: PackageAnalysisResult
}

export interface CompletionSnapshotExpectation {
  attemptId: string
  assessmentId: string
  packageKey: string
  packageVersion: string
  profile: string
  packageSnapshotVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  analysisProtocolSnapshotVersion: string
  packageReportDefinitionVersion: string
  domainDefinitionVersion: string
  evidenceMappingVersion: string
  recommendationRuleVersion: string
  analysisEngineKey?: 'cognitive-v1' | 'mental-health-rule-v1'
}

export interface PackageAnalysisAttemptInput {
  id: string
  compositeAssessmentId: string
  compositeAssessment: {
    reportPackageKey?: string | null
    reportPackageVersion?: string | null
    reportPackageProfile?: string | null
    reportPackageSnapshotEncrypted?: string | null
    analysisEngineKey?: 'cognitive-v1' | 'mental-health-rule-v1' | null
    items: Array<{
      id: string
      type: string
      position: number
      required: boolean
      scaleId?: string | null
      scale?: ProtocolCompositeItem['scale']
      cognitiveAssignment?: {
        id?: string | null
        profile?: string | null
        profileDefinitionVersion?: string | null
        resolvedConfigSnapshotEncrypted?: string | null
        resolvedConfigHash?: string | null
        resolvedReportSnapshotEncrypted?: string | null
        config?: {
          testType: string
          configVersion: string
          engineVersion: string
          scoringVersion: string
          status?: string | null
        } | null
      } | null
    }>
  }
  scaleAssessments?: Array<{
    id: string
    compositeItemId?: string | null
    scaleId: string
    status: string
    result?: unknown
    attemptNo?: number
    completedAt?: Date | string | null
    startedAt?: Date | string | null
  }>
  cognitiveSessions: Array<{
    id: string
    assignmentId?: string | null
    compositeItemId?: string | null
    status: string
    testType: string
    configVersion: string
    engineVersion: string
    scoringVersion: string
    configSnapshotEncrypted?: string | null
    scoreEncrypted?: string | null
    metricsEncrypted?: string | null
    qualityFlagsEncrypted?: string | null
    resultSnapshotEncrypted?: string | null
    attemptNo?: number
  }>
  subjectUserId?: string | null
  subjectKey?: string | null
  respondentUserId?: string | null
  respondentKey?: string | null
  respondentType?: string | null
  assessmentEpisodeId?: string | null
}

export interface BuiltPackageAnalysis {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults: FrozenCognitiveModuleResult[]
  scaleResults: FrozenScaleModuleResult[]
  analysis: PackageAnalysisResult
  inputFingerprint: string
  bundleScaleResults?: FrozenBundleScaleEvidence[]
}

export interface PersistedPackageAnalysisSnapshot {
  row: CompositeAnalysisSnapshotRow
  created: boolean
}

type SnapshotDb = {
  compositeAnalysisSnapshot: {
    findUnique: (args: any) => PromiseLike<CompositeAnalysisSnapshotRow | null>
    upsert: (args: any) => PromiseLike<CompositeAnalysisSnapshotRow>
    findFirst: (args: any) => PromiseLike<CompositeAnalysisSnapshotRow | null>
    findMany?: (args: any) => PromiseLike<CompositeAnalysisSnapshotRow[]>
  }
}

// Do not use localeCompare here.  Fingerprints must be identical across
// processes regardless of the host locale or ICU configuration.
const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const canonicalize = (value: unknown, label: string): unknown => {
  if (value === undefined) throw new Error(`分析快照 fingerprint 含 undefined：${label}`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`分析快照 fingerprint 含非有限数字：${label}`)
    return value
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${label}[${index}]`))
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`分析快照 fingerprint 含非 JSON object：${label}`)
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, entry]) => [key, canonicalize(entry, `${label}.${key}`)]),
    )
  }
  throw new Error(`分析快照 fingerprint 含非 JSON 值：${label}`)
}

const canonicalJson = (value: unknown, label: string): string => {
  const canonical = canonicalize(value, label)
  const json = JSON.stringify(canonical)
  if (json === undefined) throw new Error(`分析快照 fingerprint 无法序列化：${label}`)
  return json
}

const protocolSnapshotForFingerprint = (snapshot: FrozenReportPackageSnapshot) => ({
  snapshotVersion: snapshot.snapshotVersion,
  packageKey: snapshot.packageKey,
  packageVersion: snapshot.packageVersion,
  profile: snapshot.profile,
  packageDefinition: snapshot.packageDefinition,
  analysisProtocolSnapshot: snapshot.analysisProtocolSnapshot,
  analysisEngineKey: snapshot.analysisEngineKey ?? snapshot.packageDefinition.analysisEngineKey ?? 'cognitive-v1',
  bundleDefinitionSnapshot: snapshot.bundleDefinitionSnapshot ?? null,
})

const moduleResultForFingerprint = (result: FrozenCognitiveModuleResult) => ({
  slotKey: result.slotKey,
  sourceResultId: result.sourceResultId,
  assignmentId: result.assignmentId ?? null,
  profile: result.profile,
  testType: result.testType,
  configVersion: result.configVersion,
  engineVersion: result.engineVersion,
  scoringVersion: result.scoringVersion,
  metrics: result.metrics,
  qualityFlags: result.qualityFlags,
  frozenReport: result.frozenReport,
  metricInterpretations: result.metricInterpretations ?? null,
  provenance: result.provenance ?? null,
})

const scaleResultForFingerprint = (result: FrozenScaleModuleResult) => ({
  slotKey: result.slotKey,
  sourceResultId: result.sourceResultId,
  compositeItemId: result.compositeItemId ?? null,
  scaleId: result.scaleId,
  scaleCode: result.scaleCode,
  dimensionCode: result.dimensionCode,
  scaleDefinitionHash: result.scaleDefinitionHash,
  dimensionScore: result.dimensionScore,
  profile: result.profile,
  mappingKey: result.mappingKey,
  mappingVersion: result.mappingVersion,
  respondentType: result.respondentType,
  valueSelector: result.valueSelector,
  qualityState: result.qualityState ?? null,
  qualityFlags: result.qualityFlags,
  provenance: result.provenance ?? null,
})

const bundleScaleResultForFingerprint = (result: FrozenBundleScaleEvidence) => ({
  slotKey: result.slotKey,
  sourceResultId: result.sourceResultId,
  compositeItemId: result.compositeItemId ?? null,
  scaleId: result.scaleId,
  scaleCode: result.scaleCode,
  instrumentVersion: result.instrumentVersion,
  scoreKey: result.scoreKey,
  value: result.value,
  scoreStatus: result.scoreStatus,
  classification: result.classification,
  profile: result.profile,
  mappingKey: result.mappingKey,
  mappingVersion: result.mappingVersion,
  role: result.role,
  construct: result.construct,
  facet: result.facet ?? null,
  direction: result.direction,
  respondentType: result.respondentType,
  qualityState: result.qualityState,
  qualityFlags: result.qualityFlags,
  provenance: result.provenance,
})

/**
 * Hash the canonical plaintext semantics used by the analysis engine.
 * Randomized encrypted envelopes, timestamps, and raw trials are deliberately
 * excluded so retries can be idempotent without making ciphertext part of the
 * analysis identity.
 */
export const buildPackageAnalysisInputFingerprint = (
  input: PackageAnalysisFingerprintInput,
): string => {
  const moduleOrder = new Map(
    [
      ...input.packageSnapshot.analysisProtocolSnapshot.protocolDefinition.cognitiveSlots,
      ...input.packageSnapshot.analysisProtocolSnapshot.protocolDefinition.scaleSlots,
    ].map((slot) => [slot.key, slot.position] as const),
  )
  const modules = [...input.moduleResults]
    .sort((left, right) => {
      const leftPosition = moduleOrder.get(left.slotKey) ?? Number.MAX_SAFE_INTEGER
      const rightPosition = moduleOrder.get(right.slotKey) ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || compareStrings(left.slotKey, right.slotKey)
    })
    .map(moduleResultForFingerprint)
  const scaleResults = [...(input.scaleResults ?? [])]
    .sort((left, right) => {
      const leftPosition = moduleOrder.get(left.slotKey) ?? Number.MAX_SAFE_INTEGER
      const rightPosition = moduleOrder.get(right.slotKey) ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || compareStrings(left.slotKey, right.slotKey)
    })
    .map(scaleResultForFingerprint)
  const bundleScaleResults = [...(input.bundleScaleResults ?? [])]
    .sort((left, right) => {
      const leftPosition = moduleOrder.get(left.slotKey) ?? Number.MAX_SAFE_INTEGER
      const rightPosition = moduleOrder.get(right.slotKey) ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || compareStrings(left.mappingKey, right.mappingKey)
    })
    .map(bundleScaleResultForFingerprint)

  const semanticInput = {
    packageSnapshot: protocolSnapshotForFingerprint(input.packageSnapshot),
    analysisVersion: input.analysisVersion,
    reportSchemaVersion: input.reportSchemaVersion,
    modules,
    scaleResults,
    bundleScaleResults,
  }

  return createHash('sha256')
    .update(canonicalJson(semanticInput, 'package analysis input'))
    .digest('hex')
}

const expectedProvenance = (expected: CompletionSnapshotExpectation) => ({
  attemptId: expected.attemptId,
  assessmentId: expected.assessmentId,
  packageKey: expected.packageKey,
  packageVersion: expected.packageVersion,
  packageSnapshotVersion: expected.packageSnapshotVersion,
  analysisProtocolKey: expected.analysisProtocolKey,
  analysisProtocolVersion: expected.analysisProtocolVersion,
  analysisProtocolSnapshotVersion: expected.analysisProtocolSnapshotVersion,
  profile: expected.profile,
  packageReportDefinitionVersion: expected.packageReportDefinitionVersion,
  domainDefinitionVersion: expected.domainDefinitionVersion,
  evidenceMappingVersion: expected.evidenceMappingVersion,
  recommendationRuleVersion: expected.recommendationRuleVersion,
})

const requireProvenanceString = (
  provenance: Record<string, unknown>,
  key: string,
): string => {
  const value = provenance[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`分析快照 provenance 缺少有效字段：${key}`)
  }
  return value
}

const validateProvenanceContract = (
  payload: PackageAnalysisResult,
  expected: CompletionSnapshotExpectation,
): void => {
  const provenance = isRecord(payload.provenance)
    ? payload.provenance
    : (() => { throw new Error('分析快照 provenance 格式无效') })()
  for (const [key, value] of Object.entries(expectedProvenance(expected))) {
    if (requireProvenanceString(provenance, key) !== value) {
      throw new Error(`分析快照 provenance 元数据不匹配：${key}`)
    }
  }
  if (expected.analysisEngineKey) {
    if (requireProvenanceString(provenance, 'analysisEngineKey') !== expected.analysisEngineKey) {
      throw new Error('分析快照 provenance engine 不匹配')
    }
  }

  const evidence = payload.evidence
  if (!Array.isArray(evidence)) throw new Error('分析快照 Evidence 格式无效')
  const evidenceVersionKeys = [
    'packageKey',
    'packageVersion',
    'packageSnapshotVersion',
    'packageReportDefinitionVersion',
    'analysisProtocolKey',
    'analysisProtocolVersion',
    'analysisProtocolSnapshotVersion',
    'domainDefinitionVersion',
    'evidenceMappingVersion',
    'recommendationRuleVersion',
    'analysisVersion',
    'reportSchemaVersion',
    'profile',
  ] as const
  for (const item of evidence) {
    if (!isRecord(item) || !isRecord(item.provenance)) {
      throw new Error('分析快照 Evidence provenance 格式无效')
    }
    const itemProvenance = item.provenance
    for (const key of evidenceVersionKeys) {
      const value = requireProvenanceString(itemProvenance, key)
      const expectedValue = key === 'analysisVersion'
        ? payload.analysisVersion
        : key === 'reportSchemaVersion'
          ? payload.reportSchemaVersion
          : key === 'packageKey'
            ? expected.packageKey
            : key === 'packageVersion'
              ? expected.packageVersion
              : key === 'packageSnapshotVersion'
                ? expected.packageSnapshotVersion
                : key === 'packageReportDefinitionVersion'
                  ? expected.packageReportDefinitionVersion
                  : key === 'analysisProtocolKey'
                    ? expected.analysisProtocolKey
                    : key === 'analysisProtocolVersion'
                      ? expected.analysisProtocolVersion
                      : key === 'analysisProtocolSnapshotVersion'
                        ? expected.analysisProtocolSnapshotVersion
                        : key === 'domainDefinitionVersion'
                          ? expected.domainDefinitionVersion
                          : key === 'evidenceMappingVersion'
                            ? expected.evidenceMappingVersion
                            : key === 'recommendationRuleVersion'
                              ? expected.recommendationRuleVersion
                              : expected.profile
      if (value !== expectedValue) {
        throw new Error(`分析快照 Evidence provenance 元数据不匹配：${key}`)
      }
    }
    if (item.sourceResultId !== requireProvenanceString(itemProvenance, 'sourceResultId')) {
      throw new Error('分析快照 Evidence sourceResultId provenance 不匹配')
    }
  }
}

const validatePayloadMetadata = (
  row: CompositeAnalysisSnapshotRow,
  payload: PackageAnalysisResult,
  expected: CompletionSnapshotExpectation,
): void => {
  if (!isRecord(payload)) throw new Error('分析快照 payload 格式无效')
  if (
    row.attemptId !== expected.attemptId
    || row.packageKey !== expected.packageKey
    || row.packageVersion !== expected.packageVersion
    || row.analysisDefinitionVersion !== expected.analysisProtocolVersion
    || payload.packageKey !== row.packageKey
    || payload.packageVersion !== row.packageVersion
    || payload.analysisProtocolKey !== expected.analysisProtocolKey
    || payload.analysisProtocolVersion !== row.analysisDefinitionVersion
    || payload.profile !== expected.profile
    || payload.analysisVersion !== row.analysisVersion
    || payload.reportSchemaVersion !== row.reportSchemaVersion
  ) {
    throw new Error('分析快照 payload 版本元数据不匹配')
  }
  if (expected.analysisEngineKey) {
    const actualEngine = isMentalHealthPackageAnalysis(payload) ? 'mental-health-rule-v1' : 'cognitive-v1'
    if (actualEngine !== expected.analysisEngineKey) throw new Error('分析快照 payload engine 不匹配')
  }
  validateProvenanceContract(payload, expected)
}

/**
 * Persist one immutable snapshot or return the row already occupying the
 * unique tuple.
 *
 * Callers must hold `FOR UPDATE` on the parent Attempt for the whole
 * transaction before invoking this helper. The `created` flag is derived
 * from the read-before-upsert fast path; the database unique constraint still
 * guarantees one row, but concurrent unlocked callers cannot both reliably
 * observe which one inserted it.
 */
export const persistOrGetPackageAnalysisSnapshot = async (
  db: SnapshotDb,
  input: {
    attemptId: string
    analysis: PackageAnalysisResult
    inputFingerprint: string
    generationReason: CompositeAnalysisSnapshotGenerationReason
    generatedBy?: string | null
  },
): Promise<PersistedPackageAnalysisSnapshot> => {
  const uniqueKey = {
    attemptId_analysisVersion_inputFingerprint: {
      attemptId: input.attemptId,
      analysisVersion: input.analysis.analysisVersion,
      inputFingerprint: input.inputFingerprint,
    },
  }
  const existing = await db.compositeAnalysisSnapshot.findUnique({ where: uniqueKey })
  if (existing) {
    if (input.generationReason === 'REANALYSIS') {
      logger.info('composite analysis reanalysis request was idempotent', {
        attemptId: input.attemptId,
        snapshotId: existing.id,
        analysisVersion: input.analysis.analysisVersion,
        generatedBy: input.generatedBy ?? null,
      })
    }
    return { row: existing, created: false }
  }

  const payloadEncrypted = encryptCognitivePayload(input.analysis)
  const row = await db.compositeAnalysisSnapshot.upsert({
    where: uniqueKey,
    create: {
      attemptId: input.attemptId,
      packageKey: input.analysis.packageKey,
      packageVersion: input.analysis.packageVersion,
      analysisDefinitionVersion: input.analysis.analysisProtocolVersion,
      analysisVersion: input.analysis.analysisVersion,
      reportSchemaVersion: input.analysis.reportSchemaVersion,
      inputFingerprint: input.inputFingerprint,
      generationReason: input.generationReason,
      generatedBy: input.generatedBy ?? null,
      payloadEncrypted,
    },
    // The snapshot is immutable. A retry must not replace its payload or
    // attribution, even when the retry was triggered for a different reason.
    update: {},
  })
  return { row, created: true }
}

export const readCompletionPackageAnalysisSnapshot = async (
  db: SnapshotDb,
  attemptId: string,
  expected: CompletionSnapshotExpectation,
): Promise<DecryptedCompositeAnalysisSnapshot | null> => {
  const row = await db.compositeAnalysisSnapshot.findFirst({
    where: {
      attemptId,
      generationReason: 'COMPLETION',
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (!row) return null

  const payload = decryptCognitivePayload<PackageAnalysisResult>(row.payloadEncrypted)
  validatePayloadMetadata(row, payload, expected)
  const { payloadEncrypted: _payloadEncrypted, ...metadata } = row
  return { ...metadata, payload }
}

/**
 * Read the immutable snapshot selected by the report API.
 *
 * The completion path deliberately remains a separate PR8 helper so its
 * detailed validation errors stay available to the existing finalization
 * tests. HTTP callers use this wrapper, which never exposes decryption or
 * provenance details to a client and never falls back after an explicit id.
 */
export const readPackageAnalysisSnapshot = async (
  db: SnapshotDb,
  input: {
    attemptId: string
    snapshotId?: string
    expected: CompletionSnapshotExpectation
  },
): Promise<DecryptedCompositeAnalysisSnapshot | null> => {
  const row = input.snapshotId
    ? await db.compositeAnalysisSnapshot.findFirst({
        where: { id: input.snapshotId, attemptId: input.attemptId },
      })
    : await db.compositeAnalysisSnapshot.findFirst({
        where: { attemptId: input.attemptId, generationReason: 'COMPLETION' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })

  if (!row) return null

  try {
    const payload = decryptCognitivePayload<PackageAnalysisResult>(row.payloadEncrypted)
    validatePayloadMetadata(row, payload, input.expected)
    const { payloadEncrypted: _payloadEncrypted, ...metadata } = row
    return { ...metadata, payload }
  } catch {
    logger.warn('composite analysis snapshot unavailable', {
      attemptId: input.attemptId,
      snapshotId: input.snapshotId ?? row.id,
      packageKey: row.packageKey,
      packageVersion: row.packageVersion,
      analysisVersion: row.analysisVersion,
      reportSchemaVersion: row.reportSchemaVersion,
    })
    throw new Error('分析快照不可用')
  }
}

/**
 * Return only database metadata. The encrypted analysis payload is excluded
 * at the query boundary and therefore is never decrypted for history lists.
 */
export const listPackageAnalysisSnapshotMetadata = async (
  db: SnapshotDb,
  attemptId: string,
): Promise<Array<Omit<CompositeAnalysisSnapshotRow, 'payloadEncrypted'>>> => {
  if (!db.compositeAnalysisSnapshot.findMany) {
    throw new Error('Snapshot metadata list is not supported by this database client')
  }
  const rows = await db.compositeAnalysisSnapshot.findMany({
    where: { attemptId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      attemptId: true,
      packageKey: true,
      packageVersion: true,
      analysisDefinitionVersion: true,
      analysisVersion: true,
      reportSchemaVersion: true,
      inputFingerprint: true,
      generationReason: true,
      generatedBy: true,
      createdAt: true,
    },
  })
  return rows.map(({ payloadEncrypted: _payloadEncrypted, ...metadata }) => metadata)
}

export const buildCompletionSnapshotExpectation = (input: {
  attemptId: string
  assessmentId: string
  packageSnapshot: FrozenReportPackageSnapshot
}): CompletionSnapshotExpectation => {
  const protocolSnapshot = input.packageSnapshot.analysisProtocolSnapshot
  const packageDefinition = input.packageSnapshot.packageDefinition
  const protocolDefinition = protocolSnapshot?.protocolDefinition
  if (
    !protocolSnapshot
    || !protocolSnapshot.protocolKey
    || !protocolSnapshot.protocolVersion
    || !protocolDefinition
    || !packageDefinition?.reportDefinitionVersion
    || !protocolDefinition.domainDefinitionVersion
    || !protocolDefinition.evidenceMappingVersion
    || !protocolDefinition.recommendationRuleVersion
  ) {
    throw new Error('报告包冻结快照缺少分析 provenance 版本')
  }
  const engineKey = packageAnalysisEngineKeyFor(input.packageSnapshot)
  return {
    attemptId: input.attemptId,
    assessmentId: input.assessmentId,
    packageKey: input.packageSnapshot.packageKey,
    packageVersion: input.packageSnapshot.packageVersion,
    profile: input.packageSnapshot.profile,
    packageSnapshotVersion: String(input.packageSnapshot.snapshotVersion),
    analysisProtocolKey: protocolSnapshot.protocolKey,
    analysisProtocolVersion: protocolSnapshot.protocolVersion,
    analysisProtocolSnapshotVersion: String(protocolSnapshot.snapshotVersion),
    packageReportDefinitionVersion: packageDefinition.reportDefinitionVersion,
    domainDefinitionVersion: protocolDefinition.domainDefinitionVersion,
    evidenceMappingVersion: protocolDefinition.evidenceMappingVersion,
    recommendationRuleVersion: protocolDefinition.recommendationRuleVersion,
    ...(engineKey === 'mental-health-rule-v1' ? { analysisEngineKey: engineKey } : {}),
  }
}

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} 格式无效`)
  return value
}

const requireCipher = (value: string | null | undefined, label: string): string => {
  if (!value) throw new Error(`${label} 缺失`)
  return value
}

const selectLatestSession = (
  sessions: PackageAnalysisAttemptInput['cognitiveSessions'],
  itemId: string,
) => {
  const candidates = sessions
    .filter((session) => session.compositeItemId === itemId)
    .sort((left, right) =>
      (right.attemptNo ?? 0) - (left.attemptNo ?? 0)
      || compareStrings(left.id, right.id),
    )
  return candidates[0] ?? null
}

const dateValue = (value: Date | string | null | undefined): number => {
  if (!value) return 0
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const selectLatestScaleAssessment = (
  assessments: NonNullable<PackageAnalysisAttemptInput['scaleAssessments']>,
  itemId: string,
  scaleId: string,
) => {
  const candidates = assessments
    .filter((assessment) =>
      assessment.compositeItemId === itemId && assessment.scaleId === scaleId)
    .sort((left, right) =>
      (right.attemptNo ?? 0) - (left.attemptNo ?? 0)
      || dateValue(right.completedAt ?? right.startedAt) - dateValue(left.completedAt ?? left.startedAt)
      || compareStrings(left.id, right.id),
    )
  return candidates[0] ?? null
}

const readScaleDimensionScore = (
  assessment: NonNullable<PackageAnalysisAttemptInput['scaleAssessments']>[number],
  dimensionCode: string,
  slotKey: string,
): { result: ScaleResultV2; dimensionScore: number | null } => {
  const decodedResult: Record<string, unknown> | null = typeof assessment.result === 'string'
    ? safeDecrypt<Record<string, unknown>>(assessment.result)
    : assessment.result && typeof assessment.result === 'object' && !Array.isArray(assessment.result)
      ? assessment.result as Record<string, unknown>
      : null
  let result: ScaleResultV2
  try {
    result = parseScaleResultV2(decodedResult)
  } catch {
    throw new Error(`报告包槽位量表 ScaleResultV2 格式无效：${slotKey}`)
  }
  const score = result.scores.find((candidate) => candidate.key === dimensionCode)
  if (!score || score.type !== 'dimension') {
    throw new Error(`报告包槽位量表 score 不可用：${slotKey}/${dimensionCode}`)
  }
  return { result, dimensionScore: score.value }
}

const validateScaleResultProvenance = (
  result: ScaleResultV2,
  measurement: FrozenScaleSlotMeasurement,
  slotKey: string,
): void => {
  const mismatches = [
    result.instrument.scaleId !== measurement.scaleId ? 'instrument.scaleId' : null,
    result.instrument.code !== measurement.scaleCode ? 'instrument.code' : null,
    result.method.scaleId !== measurement.scaleId ? 'method.scaleId' : null,
    measurement.instrumentVersion !== undefined
      && result.instrument.instrumentVersion !== measurement.instrumentVersion
      ? 'instrument.instrumentVersion'
      : null,
    measurement.instrumentVersion !== undefined
      && result.method.instrumentVersion !== measurement.instrumentVersion
      ? 'method.instrumentVersion'
      : null,
    measurement.scoringVersion !== undefined
      && result.method.scoringVersion !== measurement.scoringVersion
      ? 'method.scoringVersion'
      : null,
    result.method.definitionHash !== measurement.scaleDefinitionHash ? 'method.definitionHash' : null,
  ].filter((field): field is string => field !== null)
  if (mismatches.length > 0) {
    throw new Error(`报告包槽位量表 provenance 与冻结量表不匹配：${slotKey}/${mismatches.join(',')}`)
  }
}

const buildFrozenModuleResults = (
  attempt: PackageAnalysisAttemptInput,
  packageSnapshot: FrozenReportPackageSnapshot,
): FrozenCognitiveModuleResult[] => {
  const protocol = packageSnapshot.analysisProtocolSnapshot.protocolDefinition
  if (
    !protocol
    || !Array.isArray(protocol.cognitiveSlots)
    || !Array.isArray(packageSnapshot.analysisProtocolSnapshot.cognitiveMeasurements)
  ) {
    throw new Error('冻结报告包内部分析协议结构无效')
  }
  const slots = [...protocol.cognitiveSlots].sort((left, right) => left.position - right.position)
  const itemsByPosition = new Map(attempt.compositeAssessment.items.map((item) => [item.position, item]))
  const measurementsBySlot = new Map(
    packageSnapshot.analysisProtocolSnapshot.cognitiveMeasurements.map((measurement) => [measurement.slotKey, measurement]),
  )

  return slots.map((slot) => {
    const item = itemsByPosition.get(slot.position)
    if (!item || item.type !== 'COGNITIVE' || item.required !== true) {
      throw new Error(`报告包槽位未绑定必需认知模块：${slot.key}`)
    }
    const assignment = item.cognitiveAssignment
    const taskConfig = assignment?.config
    if (!assignment || !taskConfig) throw new Error(`报告包槽位任务冻结信息缺失：${slot.key}`)
    if (!assignment.id) throw new Error(`报告包槽位 assignmentId 缺失：${slot.key}`)
    if (assignment.profile !== packageSnapshot.profile) {
      throw new Error(`报告包槽位 Profile 不匹配：${slot.key}`)
    }
    if (
      assignment.id && item.id && !attempt.cognitiveSessions.some((session) => session.assignmentId === assignment.id)
    ) {
      // This branch only guards obviously disconnected data. The actual
      // result session is checked below by compositeItemId and assignmentId.
      throw new Error(`报告包槽位没有对应认知 Session：${slot.key}`)
    }
    if (
      taskConfig.testType !== slot.testType
      || taskConfig.configVersion !== slot.configVersion
      || taskConfig.engineVersion !== slot.engineVersion
      || taskConfig.scoringVersion !== slot.scoringVersion
    ) {
      throw new Error(`报告包槽位任务版本不匹配：${slot.key}`)
    }
    if (
      assignment.profileDefinitionVersion !== slot.profileDefinitionVersion
      || !assignment.resolvedConfigHash
      || !assignment.resolvedReportSnapshotEncrypted
    ) {
      throw new Error(`报告包槽位任务冻结信息不完整：${slot.key}`)
    }

    const measurement = measurementsBySlot.get(slot.key)
    if (!measurement) throw new Error(`报告包快照缺少任务测量：${slot.key}`)
    const configSnapshot = decryptCognitivePayload<unknown>(
      requireCipher(assignment.resolvedConfigSnapshotEncrypted, `报告包槽位配置快照：${slot.key}`),
    )
    if (hashResolvedConfig(configSnapshot) !== measurement.resolvedConfigHash) {
      throw new Error(`报告包槽位配置 hash 不匹配：${slot.key}`)
    }
    if (assignment.resolvedConfigHash !== measurement.resolvedConfigHash) {
      throw new Error(`报告包槽位配置冻结 hash 不匹配：${slot.key}`)
    }
    const frozenReport = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
    if (!frozenReport) throw new Error(`报告包槽位报告快照缺失：${slot.key}`)
    if (hashResolvedConfig(frozenReport) !== measurement.resolvedReportHash) {
      throw new Error(`报告包槽位报告 hash 不匹配：${slot.key}`)
    }

    const session = selectLatestSession(attempt.cognitiveSessions, item.id)
    if (!session || session.status !== 'COMPLETED') {
      throw new Error(`报告包槽位认知 Session 尚未完成：${slot.key}`)
    }
    if (session.assignmentId !== assignment.id) {
      throw new Error(`报告包槽位 Session assignment 不匹配：${slot.key}`)
    }
    if (
      session.testType !== slot.testType
      || session.configVersion !== slot.configVersion
      || session.engineVersion !== slot.engineVersion
      || session.scoringVersion !== slot.scoringVersion
    ) {
      throw new Error(`报告包槽位 Session 版本不匹配：${slot.key}`)
    }
    const storedSessionConfig = decryptCognitivePayload<unknown>(
      requireCipher(session.configSnapshotEncrypted, `报告包槽位 Session 配置快照：${slot.key}`),
    )
    const sessionConfig = sessionConfigFromStoredValue(storedSessionConfig).config
    if (hashResolvedConfig(sessionConfig) !== measurement.resolvedConfigHash) {
      throw new Error(`报告包槽位 Session 配置 hash 不匹配：${slot.key}`)
    }

    const v2Snapshot = session.resultSnapshotEncrypted
      ? parseCognitiveResultSnapshot(
        decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted),
      )
      : null
    // v2 deliberately has no generic product/index score. The package engine
    // consumes metrics and quality flags only; legacy sessions still require
    // and validate their historical score column.
    if (!v2Snapshot) {
      const score = decryptCognitivePayload<unknown>(
        requireCipher(session.scoreEncrypted, `报告包槽位 score：${slot.key}`),
      )
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new Error(`报告包槽位 score 格式无效：${slot.key}`)
      }
    }
    const metrics = v2Snapshot
      ? v2Snapshot.metrics
      : requireRecord(
        decryptCognitivePayload<unknown>(
          requireCipher(session.metricsEncrypted, `报告包槽位 metrics：${slot.key}`),
        ),
        `报告包槽位 metrics：${slot.key}`,
      )
    const qualityFlags = v2Snapshot
      ? v2Snapshot.quality.flags
      : requireRecord(
        decryptCognitivePayload<unknown>(
          requireCipher(session.qualityFlagsEncrypted, `报告包槽位 qualityFlags：${slot.key}`),
        ),
        `报告包槽位 qualityFlags：${slot.key}`,
      )

    return {
      slotKey: slot.key,
      sourceResultId: session.id,
      assignmentId: assignment.id ?? null,
      profile: packageSnapshot.profile,
      testType: session.testType,
      configVersion: session.configVersion,
      engineVersion: session.engineVersion,
      scoringVersion: session.scoringVersion,
      metrics,
      ...(v2Snapshot ? { qualityState: v2Snapshot.quality.state } : {}),
      qualityFlags: v2Snapshot
        ? { ...qualityFlags, interpretable: v2Snapshot.quality.state === 'interpretable' }
        : qualityFlags,
      frozenReport,
      provenance: {
        sourceType: 'cognitive_session',
        sessionId: session.id,
        compositeItemId: item.id,
      },
    }
  })
}

const buildFrozenScaleResults = (
  attempt: PackageAnalysisAttemptInput,
  packageSnapshot: FrozenReportPackageSnapshot,
): FrozenScaleModuleResult[] => {
  const protocol = packageSnapshot.analysisProtocolSnapshot.protocolDefinition
  const measurements = packageSnapshot.analysisProtocolSnapshot.scaleMeasurements
  if (!protocol || !Array.isArray(protocol.scaleSlots)) {
    throw new Error('冻结报告包内部量表协议结构无效')
  }
  if (protocol.scaleSlots.length === 0) return []
  if (!Array.isArray(measurements)) throw new Error('冻结报告包内部量表测量缺失')
  const slots = [...protocol.scaleSlots].sort((left, right) => left.position - right.position)
  const measurementsBySlot = new Map(measurements.map((measurement) => [measurement.slotKey, measurement]))
  const itemsByPosition = new Map(attempt.compositeAssessment.items.map((item) => [item.position, item]))
  const scaleAssessments = attempt.scaleAssessments ?? []

  return slots.map((slot) => {
    const measurement = measurementsBySlot.get(slot.key)
    if (!measurement) throw new Error(`报告包快照缺少量表测量：${slot.key}`)
    const item = itemsByPosition.get(slot.position)
    if (
      !item
      || item.type !== 'SCALE'
      || item.required !== true
      || item.scaleId !== measurement.scaleId
    ) {
      throw new Error(`报告包槽位未绑定必需量表：${slot.key}`)
    }
    if (item.scale?.id && item.scale.id !== measurement.scaleId) {
      throw new Error(`报告包槽位量表 ID 不匹配：${slot.key}`)
    }
    if (item.scale?.code && item.scale.code !== measurement.scaleCode) {
      throw new Error(`报告包槽位量表 code 不匹配：${slot.key}`)
    }
    if (
      item.scale?.instrumentVersion
      && measurement.instrumentVersion
      && item.scale.instrumentVersion !== measurement.instrumentVersion
    ) {
      throw new Error(`报告包槽位量表 instrumentVersion 不匹配：${slot.key}`)
    }

    const assessment = selectLatestScaleAssessment(scaleAssessments, item.id, measurement.scaleId)
    if (!assessment || assessment.status !== 'COMPLETED') {
      throw new Error(`报告包槽位量表测评尚未完成：${slot.key}`)
    }
    const parsed = readScaleDimensionScore(assessment, measurement.dimensionCode, slot.key)
    validateScaleResultProvenance(parsed.result, measurement, slot.key)
    const qualityFlags = Object.fromEntries([
      ['interpretable', parsed.result.quality.status === 'interpretable'],
      ...parsed.result.quality.flags.map((flag) => [flag, true]),
    ]) as Record<string, boolean>

    return {
      slotKey: slot.key,
      sourceResultId: assessment.id,
      compositeItemId: item.id,
      scaleId: measurement.scaleId,
      scaleCode: measurement.scaleCode,
      dimensionCode: measurement.dimensionCode,
      scaleDefinitionHash: measurement.scaleDefinitionHash,
      dimensionScore: parsed.dimensionScore,
      profile: packageSnapshot.profile,
      mappingKey: measurement.mappingKey,
      mappingVersion: measurement.mappingVersion,
      respondentType: measurement.respondentType,
      valueSelector: measurement.valueSelector,
      qualityState: parsed.result.quality.status,
      qualityFlags,
      provenance: {
        sourceType: 'scale_assessment',
        compositeItemId: item.id,
      },
    }
  })
}

/**
 * Build the immutable PR7 input from a completed package Attempt. The
 * function deliberately consumes only frozen assignment/session result
 * columns; it never loads or scores raw CognitiveTrial rows.
 */
export const buildPackageAnalysisForAttempt = (
  attempt: PackageAnalysisAttemptInput,
): BuiltPackageAnalysis | null => {
  const assessment = attempt.compositeAssessment
  const packageFields = [
    assessment.reportPackageKey,
    assessment.reportPackageVersion,
    assessment.reportPackageProfile,
    assessment.reportPackageSnapshotEncrypted,
  ]
  if (packageFields.every((value) => value === null || value === undefined)) return null
  if (
    !assessment.reportPackageKey
    || !assessment.reportPackageVersion
    || !assessment.reportPackageProfile
    || !assessment.reportPackageSnapshotEncrypted
  ) {
    throw new Error('综合测评的报告包冻结信息不完整')
  }
  const packageSnapshot = readFrozenReportPackageSnapshot(assessment.reportPackageSnapshotEncrypted)
  if (
    packageSnapshot.packageKey !== assessment.reportPackageKey
    || packageSnapshot.packageVersion !== assessment.reportPackageVersion
    || packageSnapshot.profile !== assessment.reportPackageProfile
  ) {
    throw new Error('综合测评报告包实例与冻结快照不匹配')
  }
  const protocol = packageSnapshot.analysisProtocolSnapshot.protocolDefinition
  const expectedItemCount = protocol.cognitiveSlots.length + protocol.scaleSlots.length
  if (attempt.compositeAssessment.items.length !== expectedItemCount) {
    throw new Error('综合测评实例槽位数量与冻结报告包不匹配')
  }
  const engineKey = packageAnalysisEngineKeyFor(packageSnapshot)
  if (engineKey === 'mental-health-rule-v1') {
    const bundleScaleResults = buildMentalHealthBundleScaleResults(attempt, packageSnapshot)
    const analysis = dispatchPackageAnalysis({
      packageSnapshot,
      bundleScaleResults,
      attemptId: attempt.id,
      assessmentId: attempt.compositeAssessmentId,
      subject: { userId: attempt.subjectUserId ?? null, subjectKey: attempt.subjectKey ?? null },
      respondent: {
        userId: attempt.respondentUserId ?? null,
        respondentKey: attempt.respondentKey ?? null,
        respondentType: attempt.respondentType ?? undefined,
      },
      assessmentEpisodeId: attempt.assessmentEpisodeId ?? null,
    })
    const inputFingerprint = buildPackageAnalysisInputFingerprint({
      packageSnapshot,
      moduleResults: [],
      scaleResults: [],
      bundleScaleResults,
      analysisVersion: analysis.analysisVersion,
      reportSchemaVersion: analysis.reportSchemaVersion,
    })
    return {
      packageSnapshot,
      moduleResults: [],
      scaleResults: [],
      bundleScaleResults,
      analysis,
      inputFingerprint,
    }
  }

  const moduleResults = buildFrozenModuleResults(attempt, packageSnapshot)
  const scaleResults = buildFrozenScaleResults(attempt, packageSnapshot)
  const analysis = dispatchPackageAnalysis({
    packageSnapshot,
    moduleResults,
    scaleResults,
    attemptId: attempt.id,
    assessmentId: attempt.compositeAssessmentId,
  })
  const inputFingerprint = buildPackageAnalysisInputFingerprint({
    packageSnapshot,
    moduleResults,
    scaleResults,
    analysisVersion: analysis.analysisVersion,
    reportSchemaVersion: analysis.reportSchemaVersion,
  })
  return { packageSnapshot, moduleResults, scaleResults, analysis, inputFingerprint }
}
