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
  projectSituationCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import {
  createSituationalRawSubmissionPayload,
  SITUATIONAL_RAW_ENCODING_VERSION,
  SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION,
} from './situational-raw-submission'
import {
  missingRequiredSituationalResponseKeys,
  scoreSituational,
  SituationalResponseValidationError,
  validateSituationalResponse,
  type SituationalResponse,
} from './situation-scoring'
import {
  loadSituationalAttemptRuntime,
  assertSituationalAttemptOwner,
  assertRowMatchesSnapshot,
  situationalAttemptForResponse,
  SITUATIONAL_ATTEMPT_SELECT,
  type SituationalAttemptRow,
} from './situational-runtime.service'
import type { SituationalFinalSubmitInput } from './situational-final-submit.schema'

export type SituationalFinalSubmitServiceInput = SituationalFinalSubmitInput & {
  attemptId: string
  userId: string
}

const normalizedResponse = (response: SituationalResponse): SituationalResponse => ({
  sceneKey: response.sceneKey,
  channelKey: response.channelKey,
  responseValue: response.responseValue,
  ...(response.responseTimeMs === undefined ? {} : { responseTimeMs: response.responseTimeMs }),
  ...(response.answeredAt === undefined ? {} : { answeredAt: response.answeredAt }),
})

/** Validate each untrusted response once, reject omissions, then order once. */
export const normalizeSituationalResponses = (
  definition: Parameters<typeof scoreSituational>[0],
  input: SituationalResponse[],
): SituationalResponse[] => {
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
      validateSituationalResponse(definition, candidate)
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
  const missing = missingRequiredSituationalResponseKeys(definition, input)
  if (missing.length > 0) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      `还有 ${missing.length} 个场景通道未作答`,
      409,
    )
  }
  return definition.scenes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((scene) => scene.channels.flatMap((channel) => {
      const value = byPair.get(`${scene.sceneKey}:${channel.channelKey}`)
      return value ? [value] : []
    }))
}

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
  const runtime = await loadSituationalAttemptRuntime(input.attemptId, input.userId)
  const { row, snapshot } = runtime
  assertFinalOnly(row.deliveryMode)
  assertAttemptEpoch(row.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(row.status, '情境化测评')
  assertRequestRuntimeIdentity(row, input)

  const responses = normalizeSituationalResponses(snapshot.definition, input.responses)
  const canonical = prepareCanonicalSubmission({ responses })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.situational, '情境化测评提交数据')
  const payloadHash = canonical.hash

  if (row.status === 'COMPLETED') {
    if (assertSubmissionReplay(row, submissionId, payloadHash) === 'replay') {
      return situationalAttemptForResponse(row, snapshot, { replayed: true })
    }
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评已完成，请重启后重新作答', 409)
  }

  // This is the sole scoring call for an accepted FINAL. The response
  // validation above has completed, so the scorer only builds the pure result.
  const result = scoreSituational(snapshot.definition, responses, { responsesValidated: true })
  const canonicalCore = projectSituationCanonicalUnitResult({
    result,
    runtime: snapshot.compiledRuntime,
    contextHash: null,
  })
  const completedAt = new Date()
  const canonicalResult = createCanonicalUnitResultEnvelope({
    core: canonicalCore,
    completedAt,
    persistenceProvenance: {
      sourceType: 'ASSESSMENT',
      sourceAttemptId: row.id,
      sourceSubmissionId: submissionId,
    },
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
    await lockSituationalAttempt(tx, input.attemptId)
    const current = await transactionRow(tx, input.attemptId)
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
    assertSituationalAttemptOwner(current, input.userId)
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

  return situationalAttemptForResponse(committed.row, snapshot, { replayed: committed.kind === 'replay' })
}
