import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  assertAttemptEpoch,
  assertCanonicalSubmissionPayloadSize,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionReplay,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  prepareCanonicalSubmission,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import {
  createCanonicalUnitResultEnvelope,
  buildSituationalBundleBridge,
  projectSituationCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import {
  createSituationalRawSubmissionPayload,
  SITUATIONAL_RAW_ENCODING_VERSION,
  SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION,
} from './situational-raw-submission'
import {
  scoreSituational,
  SituationalResponseValidationError,
  validateSituationalResponse,
  type SituationalResponse,
} from './situation-scoring'
import {
  asLinearSituationDefinition,
  isBranchingSituationDefinition,
  type SituationRuntimeDefinition,
} from './situation-runtime-definition'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
  reachableSituationalResponseKeys,
  requiredReachableSituationalResponseKeys,
  type AuthoritativeSituationalTrajectory,
} from './situation-trajectory'
import {
  loadSituationalAttemptRuntime,
  assertSituationalAttemptOwner,
  assertRowMatchesSnapshot,
  situationalAttemptForResponse,
  loadEmbeddedSituationalAttemptRuntime,
  assertEmbeddedSituationalAttemptBinding,
  type SituationalEmbeddedAccess,
  SITUATIONAL_ATTEMPT_SELECT,
  type SituationalAttemptRow,
} from './situational-runtime.service'
import type { SituationalFinalSubmitInput } from './situational-final-submit.schema'

export type SituationalFinalSubmitServiceInput = SituationalFinalSubmitInput & {
  attemptId: string
  userId?: string
  embedded?: SituationalEmbeddedAccess
}

const normalizedResponse = (response: SituationalResponse): SituationalResponse => ({
  sceneKey: response.sceneKey,
  channelKey: response.channelKey,
  responseValue: response.responseValue,
  ...(response.responseTimeMs === undefined ? {} : { responseTimeMs: response.responseTimeMs }),
  ...(response.answeredAt === undefined ? {} : { answeredAt: response.answeredAt }),
})

const normalizeSituationalSubmission = (
  definition: SituationRuntimeDefinition,
  input: SituationalResponse[],
): { responses: SituationalResponse[]; trajectory: AuthoritativeSituationalTrajectory } => {
  const scientificDefinition = asLinearSituationDefinition(definition)
  const byPair = new Map<string, SituationalResponse>()
  input.forEach((candidate, index) => {
    const pairKey = `${candidate.sceneKey}:${candidate.channelKey}`
    if (byPair.has(pairKey)) {
      throw new InstrumentFinalSubmitError(
        'SUBMISSION_PAYLOAD_CONFLICT',
        `同一场景通道重复回答：${pairKey}`,
        400,
      )
    }
    try {
      validateSituationalResponse(scientificDefinition, candidate)
    } catch (error) {
      if (error instanceof SituationalResponseValidationError) {
        const issue = error.issues[0]
        throw new InstrumentFinalSubmitError(
          'SUBMISSION_PAYLOAD_CONFLICT',
          issue ? `${issue.path}: ${issue.message}` : `第 ${index + 1} 个回答不合法`,
          400,
        )
      }
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '回答数据不合法', 400)
    }
    byPair.set(pairKey, normalizedResponse(candidate))
  })

  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, [...byPair.values()])
  if (isBranchingSituationDefinition(definition) && !trajectory.reachedTerminal) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      '当前分支尚未到达结束节点',
      409,
    )
  }

  const reachableKeys = reachableSituationalResponseKeys(definition, trajectory)
  const reachableSet = new Set(reachableKeys)
  const offPath = [...byPair.keys()].filter((pairKey) => !reachableSet.has(pairKey))
  if (offPath.length > 0) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      `提交包含当前分支不可达回答：${offPath[0]}`,
      400,
    )
  }

  const requiredKeys = requiredReachableSituationalResponseKeys(definition, trajectory)
  const missing = requiredKeys.filter((pairKey) => !byPair.has(pairKey))
  if (missing.length > 0) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      `还有 ${missing.length} 个当前分支必答通道未作答`,
      409,
    )
  }

  const sceneByKey = new Map(scientificDefinition.scenes.map((scene) => [scene.sceneKey, scene] as const))
  const responses = trajectory.sceneKeys.flatMap((sceneKey) => {
    const scene = sceneByKey.get(sceneKey)
    if (!scene) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', `冻结分支场景不存在：${sceneKey}`, 500)
    return scene.channels.flatMap((channel) => {
      const value = byPair.get(`${scene.sceneKey}:${channel.channelKey}`)
      return value ? [value] : []
    })
  })
  return { responses, trajectory }
}

/** Validate untrusted responses once and return authoritative frozen-path order. */
export const normalizeSituationalResponses = (
  definition: SituationRuntimeDefinition,
  input: SituationalResponse[],
): SituationalResponse[] => normalizeSituationalSubmission(definition, input).responses

const assertRequestRuntimeIdentity = (
  row: Pick<SituationalAttemptRow, 'instrumentVersion' | 'definitionHash' | 'compiledRuntimeHash' | 'scoringVersion'>,
  input: SituationalFinalSubmitServiceInput,
): void => {
  assertDefinitionHash(row.definitionHash, input.definitionHash)
  if (input.instrumentVersion !== undefined && input.instrumentVersion !== row.instrumentVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', 'instrumentVersion 与冻结运行时不一致', 409)
  }
  if (input.compiledRuntimeHash !== undefined && input.compiledRuntimeHash !== row.compiledRuntimeHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', 'compiledRuntimeHash 与冻结运行时不一致', 409)
  }
  if (input.scoringVersion !== undefined && input.scoringVersion !== row.scoringVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', 'scoringVersion 与冻结运行时不一致', 409)
  }
}

const lockSituationalAttempt = async (tx: Prisma.TransactionClient, attemptId: string): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "situational_attempts" WHERE "id" = ${attemptId} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
}

const lockEmbeddedCompositeAttempt = async (tx: Prisma.TransactionClient, attemptId: string): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${attemptId} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
}

const transactionRow = async (tx: Prisma.TransactionClient, attemptId: string) => (
  tx.situationalAttempt.findUnique({
    where: { id: attemptId },
    select: SITUATIONAL_ATTEMPT_SELECT,
  })
)

export const submitSituationalAttemptFinal = async (
  input: SituationalFinalSubmitServiceInput,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  // Controller callers pass the authenticated identity in both the service
  // input and the embedded binding. Keep the service boundary tolerant of
  // direct callers that provide the same identity only at the top level, but
  // never let it override an explicit anonymous recovery binding.
  const embedded = input.embedded
    ? {
        ...input.embedded,
        ...(!input.embedded.userId && !input.embedded.recoveryTokenHash && input.userId
          ? { userId: input.userId }
          : {}),
      }
    : undefined
  if (!embedded && !input.userId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评参与者身份缺失', 403)
  }
  const runtime = embedded
    ? await loadEmbeddedSituationalAttemptRuntime(input.attemptId, embedded)
    : await loadSituationalAttemptRuntime(input.attemptId, input.userId as string)
  const { row, snapshot } = runtime
  assertFinalOnly(row.deliveryMode)
  assertAttemptEpoch(row.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(row.status, '情境化测评')
  assertRequestRuntimeIdentity(row, input)

  const normalized = normalizeSituationalSubmission(snapshot.definition, input.responses)
  const responses = normalized.responses
  const canonical = prepareCanonicalSubmission({ responses })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.situational, '情境化测评提交数据')
  const payloadHash = canonical.hash

  if (row.status === 'COMPLETED') {
    if (assertSubmissionReplay(row, submissionId, payloadHash) === 'replay') {
      return situationalAttemptForResponse(row, snapshot, { replayed: true })
    }
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评已完成，请重启后重新作答', 409)
  }

  // This is the sole scoring call for an accepted FINAL. V2 traversal and
  // response validation have already completed, so the existing pure scorer
  // receives only the reachable scientific plane.
  const scoringDefinition = projectReachableSituationDefinitionForScoring(
    snapshot.definition,
    normalized.trajectory,
  )
  const result = scoreSituational(scoringDefinition, responses, { responsesValidated: true })
  const canonicalCore = projectSituationCanonicalUnitResult({
    result,
    runtime: snapshot.compiledRuntime,
    contextHash: row.compositeAttempt?.contextSnapshotHash ?? null,
  })
  const completedAt = new Date()
  const canonicalResult = createCanonicalUnitResultEnvelope({
    core: canonicalCore,
    completedAt,
    persistenceProvenance: {
      sourceType: embedded ? 'SITUATIONAL_ATTEMPT' : 'ASSESSMENT',
      sourceAttemptId: row.id,
      sourceSubmissionId: submissionId,
    },
    bundleBridge: buildSituationalBundleBridge(result),
  })
  const rawPayload = createSituationalRawSubmissionPayload({
    attemptEpoch: row.attemptEpoch,
    responses,
  })
  const encryptedRawPayload = encryptUnifiedRuntimePayload(rawPayload)
  const encryptedResult = encryptUnifiedRuntimePayload(result)
  const encryptedCanonicalResult = encryptUnifiedRuntimePayload(canonicalResult)
  const totalTime = Math.max(0, completedAt.getTime() - row.startedAt.getTime())

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    if (embedded) await lockEmbeddedCompositeAttempt(tx, embedded.compositeAttemptId)
    await lockSituationalAttempt(tx, input.attemptId)
    const current = await transactionRow(tx, input.attemptId)
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
    if (embedded) {
      assertEmbeddedSituationalAttemptBinding(current, embedded)
    } else {
      assertSituationalAttemptOwner(current, input.userId as string)
    }
    assertRowMatchesSnapshot(current, snapshot)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '情境化测评')
    assertRequestRuntimeIdentity(current, input)

    if (current.status === 'COMPLETED') {
      if (assertSubmissionReplay(current, submissionId, payloadHash) === 'replay') {
        return { kind: 'replay' as const, row: current }
      }
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', 'submissionId 已用于其他提交内容', 409)
    }

    const update = await tx.situationalAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: input.attemptEpoch,
        submissionId: null,
      },
      data: {
        status: 'COMPLETED',
        progress: 100,
        submissionId,
        submissionPayloadHash: payloadHash,
        submittedAt: completedAt,
        completedAt,
        totalTime,
        resultEncrypted: encryptedResult,
        canonicalResultEncrypted: encryptedCanonicalResult,
      },
    })
    if (update.count !== 1) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评提交状态已变化，请重试', 409)
    }
    await tx.situationalRawSubmission.create({
      data: {
        attemptId: input.attemptId,
        attemptEpoch: row.attemptEpoch,
        responseCount: rawPayload.responses.length,
        payloadEncrypted: encryptedRawPayload,
        payloadHash,
        payloadSchemaVersion: SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION,
        encodingVersion: SITUATIONAL_RAW_ENCODING_VERSION,
      },
    })
    if (embedded) {
      await insertCompletedUnitSnapshot(tx, {
        compositeAttemptId: embedded.compositeAttemptId,
        attemptEpoch: current.attemptEpoch,
        slotKey: embedded.compositeSlotKey,
        unitType: 'SITUATIONAL',
        payloadKind: 'UNIT_RESULT',
        sourceType: 'SITUATIONAL_ATTEMPT',
        sourceAttemptId: current.id,
        sourceSubmissionId: submissionId,
        sourceDefinitionHash: snapshot.definitionHash,
        compiledRuntimeHash: snapshot.compiledRuntimeHash,
        canonicalResultEncrypted: encryptedCanonicalResult,
        completedAt,
      })
    }
    return {
      kind: 'committed' as const,
      row: {
        ...current,
        status: 'COMPLETED' as const,
        progress: 100,
        submissionId,
        submissionPayloadHash: payloadHash,
        submittedAt: completedAt,
        completedAt,
        totalTime,
        resultEncrypted: encryptedResult,
        canonicalResultEncrypted: encryptedCanonicalResult,
      } as SituationalAttemptRow,
    }
  })

  if (embedded && committed.kind === 'committed') {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await finalizeCompositeAttemptIfReady(embedded.compositeAttemptId)
  }
  return situationalAttemptForResponse(committed.row, snapshot, { replayed: committed.kind === 'replay' })
}
