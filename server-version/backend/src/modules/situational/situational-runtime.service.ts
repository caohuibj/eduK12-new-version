import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  compileSituationRuntime,
} from '../assessment-runtime/compiler'
import {
  decryptFrozenSituationalRuntimeSnapshot,
  encryptFrozenSituationalRuntimeSnapshot,
  freezeSituationalRuntimeAtAttemptStart,
  type FrozenSituationalRuntimeSnapshotV1,
} from '../assessment-runtime/situational-runtime-snapshot'
import { getParticipantKey } from '../assessment-runtime/participant-key'
import {
  InstrumentFinalSubmitError,
} from '../../services/instrumentFinalSubmit'
import {
  listSituationPackages,
  getSituationPackage,
  selectPublishedSituationPackage,
  validateSituationPackage,
  type SituationPackageV1,
} from './situation-package.registry'
import { runnerSituationDefinition, situationDefinitionAssetReferences } from './situation-definition'
import type { SituationalResultV1 } from './situation-scoring'
import {
  decryptUnifiedRuntimePayload,
} from '../assessment-runtime/security'
import {
  parseCanonicalUnitResultEnvelope,
  type CanonicalUnitResultEnvelopeV1,
} from '../assessment-runtime/unit-result'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  AssessmentAssetValidationError,
  retainAssessmentAssetReferences,
} from '../assessment-media/assessment-asset'
import { assertSituationalAssetReferencesReady } from './situational-asset.service'

export const SITUATIONAL_ATTEMPT_SELECT = {
  id: true,
  userId: true,
  compositeAttemptId: true,
  compositeItemId: true,
  compositeSlotKey: true,
  participantKey: true,
  instrumentKey: true,
  instrumentVersion: true,
  attemptNo: true,
  status: true,
  deliveryMode: true,
  runtimeGeneration: true,
  attemptEpoch: true,
  definitionHash: true,
  compiledRuntimeHash: true,
  scorerKey: true,
  scoringVersion: true,
  frozenAt: true,
  runtimeSnapshotEncrypted: true,
  submissionId: true,
  submissionPayloadHash: true,
  submittedAt: true,
  progress: true,
  startedAt: true,
  completedAt: true,
  totalTime: true,
  resultEncrypted: true,
  canonicalResultEncrypted: true,
  createdAt: true,
  updatedAt: true,
  compositeAttempt: {
    select: {
      id: true,
      userId: true,
      recoveryTokenHash: true,
      participantKey: true,
      status: true,
      attemptEpoch: true,
      contextSnapshotHash: true,
    },
  },
  compositeItem: {
    select: {
      id: true,
      type: true,
      situationalInstrumentKey: true,
      situationalInstrumentVersion: true,
    },
  },
} as const

export type SituationalAttemptRow = Prisma.SituationalAttemptGetPayload<{
  select: typeof SITUATIONAL_ATTEMPT_SELECT
}>

export type SituationalAttemptRuntime = {
  row: SituationalAttemptRow
  snapshot: FrozenSituationalRuntimeSnapshotV1
}

const instrumentResponse = (snapshot: FrozenSituationalRuntimeSnapshotV1) => ({
  key: snapshot.instrumentKey,
  version: snapshot.instrumentVersion,
  definitionHash: snapshot.definitionHash,
  compiledRuntimeHash: snapshot.compiledRuntimeHash,
  scorerKey: snapshot.scorerKey,
  scoringVersion: snapshot.scoringVersion,
  frozenAt: snapshot.frozenAt,
  releaseStatus: 'PUBLISHED' as const,
  sampling: snapshot.runnerDefinition.sampling,
  definition: snapshot.runnerDefinition,
  report: snapshot.definition.report,
  referencePolicy: snapshot.definition.referencePolicy,
  scienceMaturity: 'PILOT' as const,
  runtimeCapabilities: snapshot.compiledRuntime.runtimeCapabilities,
})

export const assertRowMatchesSnapshot = (
  row: Pick<SituationalAttemptRow, 'instrumentKey' | 'instrumentVersion' | 'definitionHash' | 'compiledRuntimeHash' | 'scorerKey' | 'scoringVersion' | 'runtimeGeneration' | 'deliveryMode' | 'frozenAt'>,
  snapshot: FrozenSituationalRuntimeSnapshotV1,
): void => {
  if (
    row.runtimeGeneration !== 'UNIFIED_V1'
    || row.deliveryMode !== 'FINAL_ONLY'
    || row.instrumentKey !== snapshot.instrumentKey
    || row.instrumentVersion !== snapshot.instrumentVersion
    || row.definitionHash !== snapshot.definitionHash
    || row.compiledRuntimeHash !== snapshot.compiledRuntimeHash
    || row.scorerKey !== snapshot.scorerKey
    || row.scoringVersion !== snapshot.scoringVersion
    || row.frozenAt.toISOString() !== snapshot.frozenAt
  ) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '测评运行时快照与尝试记录不一致', 500)
  }
}

export const assertSituationalAttemptOwner = (row: Pick<SituationalAttemptRow, 'userId' | 'participantKey'>, userId: string): void => {
  if (!row.userId || row.userId !== userId || row.participantKey !== getParticipantKey(userId)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此情境化测评', 403)
  }
}

export type SituationalEmbeddedAccess = {
  compositeAttemptId: string
  compositeItemId: string
  compositeSlotKey: string
  userId?: string
  recoveryTokenHash?: string
}

export const assertEmbeddedSituationalAttemptBinding = (
  row: Pick<SituationalAttemptRow, 'userId' | 'participantKey' | 'compositeAttemptId' | 'compositeItemId' | 'compositeSlotKey' | 'compositeAttempt'>,
  input: SituationalEmbeddedAccess,
): void => {
  if (
    row.compositeAttemptId !== input.compositeAttemptId
    || row.compositeItemId !== input.compositeItemId
    || row.compositeSlotKey !== input.compositeSlotKey
    || !row.compositeAttempt
    || row.compositeAttempt.id !== input.compositeAttemptId
  ) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评与综合测评槽位绑定不一致', 409)
  }
  const authorized = input.userId
    ? row.compositeAttempt.userId === input.userId && row.userId === input.userId && row.participantKey === getParticipantKey(input.userId)
    : Boolean(
        input.recoveryTokenHash
        && row.compositeAttempt.userId === null
        && row.userId === null
        && row.compositeAttempt.recoveryTokenHash === input.recoveryTokenHash,
      )
  if (!authorized) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此综合测评情境化模块', 403)
  if (row.compositeAttempt.status !== 'IN_PROGRESS' && row.compositeAttempt.status !== 'COMPLETED') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评尝试状态不可用', 409)
  }
}

export const loadSituationalAttemptRuntime = async (
  attemptId: string,
  userId: string,
): Promise<SituationalAttemptRuntime> => {
  const row = await prisma.situationalAttempt.findUnique({
    where: { id: attemptId },
    select: SITUATIONAL_ATTEMPT_SELECT,
  })
  if (!row) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
  assertSituationalAttemptOwner(row, userId)
  let snapshot: FrozenSituationalRuntimeSnapshotV1
  try {
    snapshot = decryptFrozenSituationalRuntimeSnapshot(row.runtimeSnapshotEncrypted)
  } catch {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评运行时快照无法读取', 500)
  }
  assertRowMatchesSnapshot(row, snapshot)
  return { row, snapshot }
}

export const loadEmbeddedSituationalAttemptRuntime = async (
  attemptId: string,
  input: SituationalEmbeddedAccess,
): Promise<SituationalAttemptRuntime> => {
  const row = await prisma.situationalAttempt.findUnique({
    where: { id: attemptId },
    select: SITUATIONAL_ATTEMPT_SELECT,
  })
  if (!row) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
  assertEmbeddedSituationalAttemptBinding(row, input)
  let snapshot: FrozenSituationalRuntimeSnapshotV1
  try {
    snapshot = decryptFrozenSituationalRuntimeSnapshot(row.runtimeSnapshotEncrypted)
  } catch {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评运行时快照无法读取', 500)
  }
  assertRowMatchesSnapshot(row, snapshot)
  return { row, snapshot }
}

const decodeStoredResult = (row: Pick<SituationalAttemptRow, 'resultEncrypted' | 'canonicalResultEncrypted'>): {
  result: SituationalResultV1
  canonicalResult: CanonicalUnitResultEnvelopeV1
} | null => {
  if (!row.resultEncrypted || !row.canonicalResultEncrypted) return null
  try {
    const result = decryptUnifiedRuntimePayload<SituationalResultV1>(row.resultEncrypted)
    const canonicalResult = parseCanonicalUnitResultEnvelope(
      decryptUnifiedRuntimePayload<unknown>(row.canonicalResultEncrypted),
    )
    if (canonicalResult.core.unitType !== 'SITUATIONAL') throw new Error('wrong canonical unit type')
    if (!Array.isArray(result.metrics) || !result.quality) throw new Error('malformed situational result')
    return { result, canonicalResult }
  } catch {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评结果无法读取，请联系管理员', 500)
  }
}

export const situationalAttemptForResponse = (
  row: SituationalAttemptRow,
  snapshot: FrozenSituationalRuntimeSnapshotV1,
  options: { replayed?: boolean } = {},
) => {
  const stored = row.status === 'COMPLETED' ? decodeStoredResult(row) : null
  if (row.status === 'COMPLETED' && !stored) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评终态结果缺失，请联系管理员', 500)
  }
  return {
    attemptId: row.id,
    attempt: {
      id: row.id,
      instrumentKey: row.instrumentKey,
      instrumentVersion: row.instrumentVersion,
      attemptNo: row.attemptNo,
      status: row.status,
      deliveryMode: row.deliveryMode,
      runtimeGeneration: row.runtimeGeneration,
      attemptEpoch: row.attemptEpoch,
      progress: row.progress,
      definitionHash: row.definitionHash,
      compiledRuntimeHash: row.compiledRuntimeHash,
      scorerKey: row.scorerKey,
      scoringVersion: row.scoringVersion,
      submissionId: row.submissionId,
      submissionPayloadHash: row.submissionPayloadHash,
      submittedAt: row.submittedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      totalTime: row.totalTime,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    instrument: instrumentResponse(snapshot),
    ...(stored ? { result: stored.result, canonicalResult: stored.canonicalResult } : {}),
    ...(options.replayed === undefined ? {} : { replayed: options.replayed }),
  }
}

const pilotPackage = (instrumentKey: string, instrumentVersion?: string): SituationPackageV1 => {
  const situationPackage = selectPublishedSituationPackage(
    instrumentVersion
      ? [getSituationPackage(instrumentKey, instrumentVersion)].filter((candidate): candidate is SituationPackageV1 => candidate !== undefined)
      : listSituationPackages(),
    instrumentKey,
    instrumentVersion,
  )
  if (!situationPackage) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化测评题包不存在或已停用', 404)
  }
  const validation = validateSituationPackage(situationPackage)
  if (!validation.valid) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化测评题包未通过运行时校验', 409)
  }
  return situationPackage
}

export const listSituationalInstruments = () => listSituationPackages()
  .filter((situationPackage) => (
    situationPackage.releaseStatus === 'PUBLISHED'
    && situationPackage.scienceMaturity === 'PILOT'
  ))
  .map((situationPackage) => {
    const validation = validateSituationPackage(situationPackage)
    if (!validation.valid) return null
    const runtime = compileSituationRuntime({
      instrumentKey: situationPackage.key,
      instrumentVersion: situationPackage.instrumentVersion,
      definition: situationPackage.definition,
      sourceDefinitionHash: validation.definitionHash,
    })
    const runnerDefinition = runnerSituationDefinition(situationPackage.definition)
    return {
      key: situationPackage.key,
      version: situationPackage.instrumentVersion,
      releaseStatus: situationPackage.releaseStatus,
      definitionHash: validation.definitionHash,
      compiledRuntimeHash: runtime.compiledRuntimeHash,
      scorerKey: runtime.scorerKey,
      scoringVersion: runtime.scorerVersion,
      sampling: runnerDefinition.sampling,
      definition: runnerDefinition,
      report: situationPackage.definition.report,
      referencePolicy: situationPackage.definition.referencePolicy,
      scienceMaturity: situationPackage.scienceMaturity,
      runtimeCapabilities: runtime.runtimeCapabilities,
    }
  })
  .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

export const getSituationalInstrument = (instrumentKey: string, instrumentVersion?: string) => {
  const situationPackage = pilotPackage(instrumentKey, instrumentVersion)
  const snapshot = freezeSituationalRuntimeAtAttemptStart({
    instrumentKey: situationPackage.key,
    instrumentVersion: situationPackage.instrumentVersion,
    definition: situationPackage.definition,
    frozenAt: new Date(0),
  })
  return {
    ...instrumentResponse(snapshot),
  }
}

const retainFrozenSituationalAssets = async (
  db: Prisma.TransactionClient,
  attemptId: string,
  snapshot: FrozenSituationalRuntimeSnapshotV1,
): Promise<void> => {
  try {
    await retainAssessmentAssetReferences({
      owner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: `SITUATIONAL:${attemptId}`,
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      references: situationDefinitionAssetReferences(snapshot.definition),
      db,
    })
  } catch (error) {
    if (error instanceof AssessmentAssetValidationError) {
      throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化视觉内容在冻结时已失效', 409)
    }
    throw error
  }
}

export const startSituationalAttempt = async (userId: string, input: {
  instrumentKey: string
  instrumentVersion?: string
}) => {
  const situationPackage = pilotPackage(input.instrumentKey, input.instrumentVersion)
  await assertSituationalAssetReferencesReady(situationPackage.definition)
  const participantKey = getParticipantKey(userId)
  const frozenAt = new Date()
  const snapshot = freezeSituationalRuntimeAtAttemptStart({
    instrumentKey: situationPackage.key,
    instrumentVersion: situationPackage.instrumentVersion,
    definition: situationPackage.definition,
    frozenAt,
  })
  const encryptedSnapshot = encryptFrozenSituationalRuntimeSnapshot(snapshot)

  // The partial unique index is the authoritative active-attempt boundary. A
  // losing request returns that row; completed attempts always receive a new
  // attemptNo and can never be reopened.
  for (let retry = 0; retry < 3; retry += 1) {
    const active = await prisma.situationalAttempt.findFirst({
      where: {
        instrumentKey: situationPackage.key,
        instrumentVersion: situationPackage.instrumentVersion,
        participantKey,
        status: 'IN_PROGRESS',
      },
      orderBy: { attemptNo: 'desc' },
      select: SITUATIONAL_ATTEMPT_SELECT,
    })
    if (active) {
      const activeSnapshot = decryptFrozenSituationalRuntimeSnapshot(active.runtimeSnapshotEncrypted)
      assertRowMatchesSnapshot(active, activeSnapshot)
      return situationalAttemptForResponse(active, activeSnapshot)
    }
    const latest = await prisma.situationalAttempt.findFirst({
      where: {
        instrumentKey: situationPackage.key,
        instrumentVersion: situationPackage.instrumentVersion,
        participantKey,
      },
      orderBy: { attemptNo: 'desc' },
      select: { attemptNo: true },
    })
    const attemptNo = (latest?.attemptNo ?? 0) + 1
    try {
      const created = await prisma.$transaction(async (db) => {
        const row = await db.situationalAttempt.create({
          data: {
            userId,
            participantKey,
            instrumentKey: situationPackage.key,
            instrumentVersion: situationPackage.instrumentVersion,
            attemptNo,
            status: 'IN_PROGRESS',
            deliveryMode: 'FINAL_ONLY',
            runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: 1,
            definitionHash: snapshot.definitionHash,
            compiledRuntimeHash: snapshot.compiledRuntimeHash,
            scorerKey: snapshot.scorerKey,
            scoringVersion: snapshot.scoringVersion,
            frozenAt: new Date(snapshot.frozenAt),
            runtimeSnapshotEncrypted: encryptedSnapshot,
            progress: 0,
          },
          select: SITUATIONAL_ATTEMPT_SELECT,
        })
        await retainFrozenSituationalAssets(db, row.id, snapshot)
        return row
      })
      return situationalAttemptForResponse(created, snapshot)
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error
    }
  }
  throw new InstrumentFinalSubmitError('SUBMISSION_ALREADY_IN_PROGRESS', '已有进行中的情境化测评，请继续作答', 409)
}

export const createEmbeddedSituationalAttempt = async (
  db: Prisma.TransactionClient,
  input: {
    userId: string | null
    participantKey: string
    compositeAttemptId: string
    compositeItemId: string
    compositeSlotKey: string
    instrumentKey: string
    instrumentVersion: string
    attemptEpoch: number
  },
) => {
  const situationPackage = pilotPackage(input.instrumentKey, input.instrumentVersion)
  await assertSituationalAssetReferencesReady(situationPackage.definition, db)
  const frozenAt = new Date()
  const snapshot = freezeSituationalRuntimeAtAttemptStart({
    instrumentKey: situationPackage.key,
    instrumentVersion: situationPackage.instrumentVersion,
    definition: situationPackage.definition,
    frozenAt,
  })
  const encryptedSnapshot = encryptFrozenSituationalRuntimeSnapshot(snapshot)
  const existing = await db.situationalAttempt.findFirst({
    where: {
      compositeAttemptId: input.compositeAttemptId,
      compositeItemId: input.compositeItemId,
    },
    select: SITUATIONAL_ATTEMPT_SELECT,
  })
  if (existing) {
    const existingSnapshot = decryptFrozenSituationalRuntimeSnapshot(existing.runtimeSnapshotEncrypted)
    assertRowMatchesSnapshot(existing, existingSnapshot)
    if (existing.compositeSlotKey !== input.compositeSlotKey) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评情境化槽位绑定已变化', 409)
    }
    return { row: existing, snapshot: existingSnapshot }
  }
  try {
    const row = await db.situationalAttempt.create({
      data: {
        userId: input.userId,
        participantKey: input.participantKey,
        compositeAttemptId: input.compositeAttemptId,
        compositeItemId: input.compositeItemId,
        compositeSlotKey: input.compositeSlotKey,
        instrumentKey: situationPackage.key,
        instrumentVersion: situationPackage.instrumentVersion,
        attemptNo: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: input.attemptEpoch,
        definitionHash: snapshot.definitionHash,
        compiledRuntimeHash: snapshot.compiledRuntimeHash,
        scorerKey: snapshot.scorerKey,
        scoringVersion: snapshot.scoringVersion,
        frozenAt: new Date(snapshot.frozenAt),
        runtimeSnapshotEncrypted: encryptedSnapshot,
        progress: 0,
      },
      select: SITUATIONAL_ATTEMPT_SELECT,
    })
    await retainFrozenSituationalAssets(db, row.id, snapshot)
    return { row, snapshot }
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
    const concurrent = await db.situationalAttempt.findFirst({
      where: { compositeAttemptId: input.compositeAttemptId, compositeItemId: input.compositeItemId },
      select: SITUATIONAL_ATTEMPT_SELECT,
    })
    if (!concurrent) throw error
    const concurrentSnapshot = decryptFrozenSituationalRuntimeSnapshot(concurrent.runtimeSnapshotEncrypted)
    assertRowMatchesSnapshot(concurrent, concurrentSnapshot)
    return { row: concurrent, snapshot: concurrentSnapshot }
  }
}

export const resumeSituationalAttempt = async (attemptId: string, userId: string) => {
  const runtime = await loadSituationalAttemptRuntime(attemptId, userId)
  return situationalAttemptForResponse(runtime.row, runtime.snapshot)
}

export const getSituationalAttemptResult = resumeSituationalAttempt

export const listSituationalHistory = async (userId: string) => {
  const rows = await prisma.situationalAttempt.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 100,
    select: SITUATIONAL_ATTEMPT_SELECT,
  })
  return {
    list: rows.map((row) => {
      const snapshot = decryptFrozenSituationalRuntimeSnapshot(row.runtimeSnapshotEncrypted)
      assertRowMatchesSnapshot(row, snapshot)
      return situationalAttemptForResponse(row, snapshot)
    }),
    total: rows.length,
  }
}
