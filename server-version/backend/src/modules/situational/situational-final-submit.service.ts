import {assertCurrentStudyPrincipal} from '../anonymous-study/admission-principal'
import { lockTrainingFlowFinalAdmission, requiresTrainingFlowFinalLock } from '../composite/training-variant-child-scope'
import { onlineSituationalTaskSatisfied, SJT_ONLINE_PROTOCOL_FLAG, SJT_ONLINE_UNSATISFIED_FLAG } from './situational-task-satisfaction'
import { normalizeSjtOnlineResponses } from './authoring/online'
import { situationalLegacyFinalSubmitSchema, situationalOnlineFinalSubmitSchema } from './situational-final-submit.schema'
import { buildSjtNarrative } from './authoring/narrative'
import { deriveSituationalAssignment, assignedSituationalDefinition } from './situation-assignment'
import { situationalResponseHistoryIdentities, validateSituationalResearchCapture } from './situation-research-capture'
import { scoreSituationalModel } from './situation-model-resolver'
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
import {assertPrivateFormFinalCurrent} from '../assessment-run/educationPrivateFormExecution'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import { withUnitSubmitAdmission } from '../../services/unitSubmitAdmission'
import {
  createCanonicalUnitResultEnvelope,
  buildSituationalBundleBridge,
  projectSituationCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import {
  createSituationalRawSubmissionPayload,
  createSituationalOnlineRawSubmissionPayload,
  SITUATIONAL_ONLINE_RAW_ENCODING_VERSION,
  SITUATIONAL_RAW_ENCODING_VERSION,
} from './situational-raw-submission'
import {
  createSituationalResponseValidator,
  SituationalResponseValidationError,
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
  SITUATIONAL_ATTEMPT_COMMIT_SELECT,
  type SituationalAttemptCommitRow,
  type SituationalAttemptRow,
} from './situational-runtime.service'
import type { SituationalFinalSubmitInput } from './situational-final-submit.schema'

export type SituationalFinalSubmitServiceInput = SituationalFinalSubmitInput & {
  attemptId: string
  userId?: string
  embedded?: SituationalEmbeddedAccess
}

export type SituationalFinalSubmitInternalContext = {
  compositeAttemptId: string | null
  attemptEpoch: number
}

const normalizedResponse = (response: SituationalResponse): SituationalResponse => ({
  sceneKey: response.sceneKey,
  channelKey: response.channelKey,
  responseValue: response.responseValue,
  ...(response.responseTimeMs === undefined ? {} : { responseTimeMs: response.responseTimeMs }),
  ...(response.answeredAt === undefined ? {} : { answeredAt: response.answeredAt }),
  ...(response.responseRevision === undefined ? {} : { responseRevision: response.responseRevision }),
  ...(response.historyIdentity === undefined ? {} : { historyIdentity: response.historyIdentity }),
  ...(response.stageConfirmed === undefined ? {} : { stageConfirmed: response.stageConfirmed }),
})

const normalizeSituationalSubmission = (
  definition: SituationRuntimeDefinition,
  input: SituationalResponse[],
  options: { requiredValidated?: boolean } = {},
): { responses: SituationalResponse[]; trajectory: AuthoritativeSituationalTrajectory } => {
  const scientificDefinition = asLinearSituationDefinition(definition)
  const byPair = measureRequestPhaseSync('sjt.validation_index', () => {
    const validateResponse = createSituationalResponseValidator(scientificDefinition)
    const index = new Map<string, SituationalResponse>()
    input.forEach((candidate, position) => {
      const pairKey = `${candidate.sceneKey}:${candidate.channelKey}`
      if (index.has(pairKey)) {
        throw new InstrumentFinalSubmitError(
          'SUBMISSION_PAYLOAD_CONFLICT',
          `同一场景通道重复回答：${pairKey}`,
          400,
        )
      }
      try {
        validateResponse(candidate)
      } catch (error) {
        if (error instanceof SituationalResponseValidationError) {
          const issue = error.issues[0]
          throw new InstrumentFinalSubmitError(
            'SUBMISSION_PAYLOAD_CONFLICT',
            issue ? `${issue.path}: ${issue.message}` : `第 ${position + 1} 个回答不合法`,
            400,
          )
        }
        throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '回答数据不合法', 400)
      }
      index.set(pairKey, normalizedResponse(candidate))
    })
    return index
  })

  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, [...byPair.values()])
  if (isBranchingSituationDefinition(definition) && !trajectory.reachedTerminal) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      '当前分支尚未到达结束节点',
      409,
    )
  }

  const histories = situationalResponseHistoryIdentities(definition, [...byPair.values()])
  for (const response of byPair.values()) if (response.historyIdentity !== undefined && response.historyIdentity !== histories.get(response.sceneKey)) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '回答属于旧的测量历史', 400)
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
  if (missing.length > 0 && !options.requiredValidated) {
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

const transactionRow = async (
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<SituationalAttemptCommitRow | null> => (
  tx.situationalAttempt.findUnique({
    where: { id: attemptId },
    select: SITUATIONAL_ATTEMPT_COMMIT_SELECT,
  })
)

const inputForValidation = (input: SituationalFinalSubmitServiceInput) => {
  const { attemptId: _attemptId, userId: _userId, embedded: _embedded, ...payload } = input
  return payload
}

type SituationalFinalRuntime = Awaited<ReturnType<typeof loadSituationalAttemptRuntime>>

/** Pure scientific preparation. Host authorization must precede runtime loading;
 * this value is request-local, never a substitute for locked-row admission. */
export function prepareSituationalFinalSubmission(input: SituationalFinalSubmitServiceInput, runtime: SituationalFinalRuntime) {
  const submissionId = validateSubmissionId(input.submissionId)
  const { row, snapshot } = runtime
  if (row.id !== input.attemptId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录与提交身份不一致', 409)
  assertFinalOnly(row.deliveryMode)
  assertAttemptEpoch(row.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(row.status, '情境化测评')
  assertRequestRuntimeIdentity(row, input)

  const assignment = deriveSituationalAssignment(snapshot.definition, row.id, snapshot.definitionHash)
  const assignedDefinition = assignedSituationalDefinition(snapshot.definition, assignment)
  // Protocol authority belongs to the frozen release, never the request.
  const onlineInput = snapshot.online ? situationalOnlineFinalSubmitSchema.safeParse(inputForValidation(input)) : undefined
  const legacyInput = !snapshot.online ? situationalLegacyFinalSubmitSchema.safeParse(inputForValidation(input)) : undefined
  if (onlineInput && !onlineInput.success || legacyInput && !legacyInput.success) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '提交协议与冻结运行时不一致', 400)
  }
  let onlineNormalized: ReturnType<typeof normalizeSjtOnlineResponses> | undefined
  try {
    if (snapshot.online && onlineInput?.success) onlineNormalized = normalizeSjtOnlineResponses(snapshot.online.display, assignedDefinition, onlineInput.data.responses)
  } catch (error) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', error instanceof Error ? error.message : '在线回答不合法', 400)
  }
  const normalized = normalizeSituationalSubmission(assignedDefinition, onlineNormalized?.responses ?? (legacyInput?.success ? legacyInput.data.responses : []), { requiredValidated: Boolean(onlineNormalized) })
  let researchCapture: typeof input.researchCapture
  try { researchCapture = validateSituationalResearchCapture({ definition: assignedDefinition, definitionHash: snapshot.definitionHash, assignment, responses: normalized.responses, capture: input.researchCapture }) }
  catch (error) { throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', String(error), 400) }
  const responses = normalized.responses
  const canonical = prepareCanonicalSubmission({ responses, ...(onlineNormalized ? { responseProtocol: 'sjt-online-response-v1', rawResponses: onlineNormalized.rawResponses } : {}), ...(researchCapture ? { researchCapture } : {}) })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.situational, '情境化测评提交数据')
  const payloadHash = canonical.hash

  return { submissionId, row, snapshot, assignedDefinition, normalized, onlineNormalized, researchCapture, responses, payloadHash }
}
type PreparedSituationalFinal = ReturnType<typeof prepareSituationalFinalSubmission>

/** Exactly the existing scorer/raw/projection path, before database locks. */
export function deriveSituationalFinalFacts(prepared: PreparedSituationalFinal, provenance: 'SITUATIONAL_ATTEMPT' | 'ASSESSMENT') {
  const { row, snapshot, submissionId, assignedDefinition, normalized, responses, onlineNormalized, researchCapture } = prepared
  // This is the sole scoring call for an accepted FINAL. V2 traversal and
  // response validation have already completed, so the existing pure scorer
  // receives only the reachable scientific plane.
  const scoringDefinition = projectReachableSituationDefinitionForScoring(
    assignedDefinition,
    normalized.trajectory,
  )
  const result = scoreSituationalModel(scoringDefinition, responses, { responsesValidated: true, ...(assignedDefinition.schemaVersion === 2 ? { independentSceneKeyBySceneKey: Object.fromEntries(assignedDefinition.flow.nodes.flatMap(n => n.nodeType === 'SCENE' ? [[n.sceneKey, n.motherSceneKey]] : [])) } : {}) })
  const narrative = buildSjtNarrative(assignedDefinition, responses)
  if (narrative) result.narrative = narrative
  const canonicalCore = projectSituationCanonicalUnitResult({
    result,
    runtime: snapshot.compiledRuntime,
    contextHash: row.compositeAttempt?.contextSnapshotHash ?? null,
  })
  if (onlineNormalized) {
    canonicalCore.quality.flags.push(SJT_ONLINE_PROTOCOL_FLAG)
    if (!onlineSituationalTaskSatisfied(assignedDefinition, responses, snapshot.online!.display.scenes.flatMap(scene => scene.questions.filter(question => question.required).map(question => question.questionKey)))) canonicalCore.quality.flags.push(SJT_ONLINE_UNSATISFIED_FLAG)
    canonicalCore.quality.flags.sort()
  }
  const completedAt = new Date()
  const canonicalResult = createCanonicalUnitResultEnvelope({
    core: canonicalCore,
    completedAt,
    persistenceProvenance: {
      sourceType: provenance,
      sourceAttemptId: row.id,
      sourceSubmissionId: submissionId,
    },
    bundleBridge: buildSituationalBundleBridge(result),
  })
  const rawPayload = onlineNormalized ? createSituationalOnlineRawSubmissionPayload({
    attemptEpoch: row.attemptEpoch, responses, rawResponses: onlineNormalized.rawResponses,
    ...(researchCapture ? { researchCapture } : {}),
  }) : createSituationalRawSubmissionPayload({
    attemptEpoch: row.attemptEpoch,
    responses,
    ...(researchCapture ? { researchCapture } : {}),
  })
  const encryptedRawPayload = encryptUnifiedRuntimePayload(rawPayload)
  const encryptedResult = encryptUnifiedRuntimePayload(result)
  const encryptedCanonicalResult = encryptUnifiedRuntimePayload(canonicalResult)
  const totalTime = Math.max(0, completedAt.getTime() - row.startedAt.getTime())

  return { result, canonicalResult, rawPayload, encryptedRawPayload, encryptedResult, encryptedCanonicalResult, completedAt, totalTime }
}
type DerivedSituationalFinal = ReturnType<typeof deriveSituationalFinalFacts>

/** Internal authority adapter. Construct only AFTER acquiring parent/flow locks
 * in this transaction. No method may acquire an ancestor lock after child lock.
 * Survey is deliberately not an accepted kind until its real adapter exists. */
export type LockedSituationalFinalHost = {
  kind: 'TRAINING' | 'SURVEY'
  assertLockedAuthority: (row: SituationalAttemptCommitRow) => void | Promise<void>
  assertReplayAdmission: (replayed: boolean) => void
  persistProjection: (tx: Prisma.TransactionClient, row: SituationalAttemptCommitRow, facts: DerivedSituationalFinal) => Promise<void>
}

/** One facts writer, on the caller's existing transaction. There is no optional
 * authorization hook and no nested transaction or alternative scoring engine. */
export async function commitPreparedSituationalFinal(tx: Prisma.TransactionClient, input: SituationalFinalSubmitServiceInput,
  prepared: PreparedSituationalFinal, derived: DerivedSituationalFinal, host: LockedSituationalFinalHost) {
  const { row, snapshot, submissionId, payloadHash } = prepared
  const { rawPayload, encryptedRawPayload, encryptedResult, encryptedCanonicalResult, completedAt, totalTime } = derived
  await lockSituationalAttempt(tx, input.attemptId)
  const current = await transactionRow(tx, input.attemptId)
  if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评记录不存在', 404)
  if (host.kind === 'TRAINING' ? current.surveyAttemptId != null
    : host.kind !== 'SURVEY' || current.surveyAttemptId == null || current.userId != null || current.compositeAttemptId != null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评宿主不匹配', 403)
  }
  await host.assertLockedAuthority(current)
  assertRowMatchesSnapshot(current, snapshot)
  assertFinalOnly(current.deliveryMode)
  assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(current.status, '情境化测评')
  assertRequestRuntimeIdentity(current, input)

  if (current.status === 'COMPLETED') {
    if (assertSubmissionReplay(current, submissionId, payloadHash) === 'replay') {
      host.assertReplayAdmission(true)
      return { kind: 'replay' as const, row: current }
    }
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', 'submissionId 已用于其他提交内容', 409)
  }

  host.assertReplayAdmission(false)
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
      responseCount: rawPayload.schemaVersion === 2 ? rawPayload.rawResponses.length : rawPayload.responses.length,
      payloadEncrypted: encryptedRawPayload,
      payloadHash,
      payloadSchemaVersion: rawPayload.schemaVersion,
      encodingVersion: rawPayload.schemaVersion === 2 ? SITUATIONAL_ONLINE_RAW_ENCODING_VERSION : SITUATIONAL_RAW_ENCODING_VERSION,
    },
  })
  await host.persistProjection(tx, current, derived)

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
    } as SituationalAttemptCommitRow,
  }
}

const persistSituationalAttemptFinal = async (
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
  const educationComposition=row.compositeAttempt?.compositeAssessment?.creationKey?.startsWith('education-composition:')===true
  const prepared = prepareSituationalFinalSubmission(input, runtime)
  const { payloadHash } = prepared

  if (row.status === 'COMPLETED') {
    if (assertSubmissionReplay(row, submissionId, payloadHash) === 'replay') {
      if (educationComposition||requiresTrainingFlowFinalLock(row.compositeAttemptId, row.compositeAttempt) || await assertCurrentStudyPrincipal(prisma,{attemptId:row.compositeAttemptId,userId:embedded?.userId,recoveryTokenHash:embedded?.recoveryTokenHash,attemptEpoch:input.attemptEpoch})) {
        await withFinalOnlyCompletionTransaction(async tx => {
          if(educationComposition)await assertPrivateFormFinalCurrent(tx,{attemptId:row.compositeAttemptId!,actorUserId:embedded?.userId??input.userId})
          await assertCurrentStudyPrincipal(tx,{attemptId:row.compositeAttemptId,userId:embedded?.userId,recoveryTokenHash:embedded?.recoveryTokenHash,attemptEpoch:input.attemptEpoch},true)
          const assertFlowFinal = await lockTrainingFlowFinalAdmission(tx, { attemptId: row.compositeAttemptId, parent: row.compositeAttempt, attemptEpoch: input.attemptEpoch, itemId: row.compositeItemId, sourceAttemptId: row.id, submissionId })
          assertFlowFinal(true)
        })
      }
      return {
        data: situationalAttemptForResponse(row, snapshot, { replayed: true }),
        parentAttemptId: embedded?.compositeAttemptId ?? null,
      }
    }
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '情境化测评已完成，请重启后重新作答', 409)
  }

  const derived = deriveSituationalFinalFacts(prepared, embedded ? 'SITUATIONAL_ATTEMPT' : 'ASSESSMENT')
  const { result, canonicalResult } = derived

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    if(educationComposition)await assertPrivateFormFinalCurrent(tx,{attemptId:row.compositeAttemptId!,actorUserId:embedded?.userId??input.userId})
    await assertCurrentStudyPrincipal(tx,{attemptId:row.compositeAttemptId,userId:embedded?.userId,recoveryTokenHash:embedded?.recoveryTokenHash,attemptEpoch:input.attemptEpoch},true)
    if (embedded) await lockEmbeddedCompositeAttempt(tx, embedded.compositeAttemptId)
    const assertFlowFinal = await lockTrainingFlowFinalAdmission(tx, { attemptId: row.compositeAttemptId, parent: row.compositeAttempt, attemptEpoch: input.attemptEpoch, itemId: row.compositeItemId, sourceAttemptId: row.id, submissionId, parentLocked: Boolean(embedded) })
    const host: LockedSituationalFinalHost = {
      kind: 'TRAINING',
      assertLockedAuthority: current => {
        if (embedded) return assertEmbeddedSituationalAttemptBinding(current, embedded)
        return assertSituationalAttemptOwner(current, input.userId as string)
      },
      assertReplayAdmission: assertFlowFinal,
      persistProjection: async (transaction, current, facts) => {
        if (!embedded) return
        await insertCompletedUnitSnapshot(transaction, {
          compositeAttemptId: embedded.compositeAttemptId,
          attemptEpoch: current.attemptEpoch,
          slotKey: embedded.compositeSlotKey,
          unitType: 'SITUATIONAL', payloadKind: 'UNIT_RESULT', sourceType: 'SITUATIONAL_ATTEMPT',
          sourceAttemptId: current.id, sourceSubmissionId: submissionId,
          sourceDefinitionHash: snapshot.definitionHash, compiledRuntimeHash: snapshot.compiledRuntimeHash,
          canonicalResultEncrypted: facts.encryptedCanonicalResult, completedAt: facts.completedAt,
        })
      },
    }
    return commitPreparedSituationalFinal(tx, input, prepared, derived, host)
  })

  return {
    data: situationalAttemptForResponse(
      committed.row,
      snapshot,
      committed.kind === 'committed'
        ? { replayed: false, committedResult: { result, canonicalResult } }
        : { replayed: true },
    ),
    parentAttemptId: embedded?.compositeAttemptId ?? null,
  }
}

/**
 * Production orchestration boundary: child FINAL/replay is admitted as UNIT work,
 * then the UNIT permit is released before any embedded parent aggregate/recovery.
 * A legal replay also re-runs parent finalization so a response lost after child
 * commit can deterministically repair the parent without duplicating child data.
 */
export const submitSituationalAttemptFinalWithContext = async (
  input: SituationalFinalSubmitServiceInput,
) => {
  const persisted = await withUnitSubmitAdmission(() => persistSituationalAttemptFinal(input))
  if (persisted.parentAttemptId) {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await measureRequestPhase(
      'final_submit_parent_finalization',
      () => finalizeCompositeAttemptIfReady(persisted.parentAttemptId as string),
    )
  }
  return {
    data: persisted.data,
    internalContext: {
      compositeAttemptId: persisted.parentAttemptId,
      attemptEpoch: input.attemptEpoch,
    } satisfies SituationalFinalSubmitInternalContext,
  }
}

export const submitSituationalAttemptFinal = async (
  input: SituationalFinalSubmitServiceInput,
) => (await submitSituationalAttemptFinalWithContext(input)).data

/**
 * Test-only persistence entry for high-fanout transaction correctness tests.
 * Production routes and ordinary service callers must use submitSituationalAttemptFinal.
 */
export const __testOnlyPersistSituationalAttemptFinal = async (
  input: SituationalFinalSubmitServiceInput,
) => {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only Situational persistence entry requires NODE_ENV=test')
  return (await persistSituationalAttemptFinal(input)).data
}
