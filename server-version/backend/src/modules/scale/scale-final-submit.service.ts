import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { encryptScaleAnswers, encryptScaleResult, scaleAssessmentForResponse, scaleDefinitionFromRecord, scaleRunnerFromRecord, buildScaleResultForRecord } from './scale-workflow.service'
import { hashScaleDefinition, type ScaleDefinitionV2 } from './scale-definition'
import { missingRequiredScaleItemCodes, validateScaleAnswer, type ScaleAnswer } from './scale-scoring'
import { readCompositeAttemptContext, readQuestionnaireAssessmentContext } from '../../services/assessmentContextService'
import {
  assertAttemptEpoch,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertCanonicalSubmissionPayloadSize,
  assertSubmissionReplay,
  prepareCanonicalSubmission,
  FINAL_SUBMISSION_MAX_BYTES,
  isInstrumentFinalSubmitError,
  InstrumentFinalSubmitError,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import {
  refreshCompositeFinalOnlyProgress,
  withFinalOnlyCompletionTransaction,
} from '../../services/questionnaireProgressService'
import { submitUnifiedScaleAssessmentFinal } from './unified-final-submit.service'
import type { UnifiedScaleAdmission } from './unified-final-submit.service'
import { encryptFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart } from '../assessment-runtime/runtime-snapshot'

export type FinalScaleAnswerInput = {
  itemCode: string
  responseValue: string | number
  responseTimeMs?: number
  changeCount?: number
}

export type FinalScaleSubmitInput = {
  assessmentId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  answers: FinalScaleAnswerInput[]
  userId?: string | null
  questionnaireSessionId?: string
  compositeAttemptId?: string
  recoveryTokenHash?: string
}

type ScaleRecord = {
  id: string
  code: string
  name: string
  instrumentVersion: string
  instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  definition: unknown
  definitionHash: string | null
}

const lockParent = async (tx: Prisma.TransactionClient, table: 'questionnaire_assessments' | 'composite_assessment_attempts', id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '父级测评记录不存在', 409)
}

const lockAssessment = async (tx: Prisma.TransactionClient, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "assessments" WHERE "id" = ${id} FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
}

const normalizedAnswers = (definition: ScaleDefinitionV2, input: FinalScaleAnswerInput[]): ScaleAnswer[] => {
  const latest = new Map<string, ScaleAnswer>()
  input.forEach((answer) => {
    if (latest.has(answer.itemCode)) {
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `量表题目 ${answer.itemCode} 不能重复提交`, 400)
    }
    const normalized: ScaleAnswer = {
      itemCode: answer.itemCode,
      responseValue: answer.responseValue,
      ...(answer.responseTimeMs === undefined ? {} : { responseTimeMs: answer.responseTimeMs }),
      ...(answer.changeCount === undefined ? {} : { changeCount: answer.changeCount }),
    }
    validateScaleAnswer(definition, normalized)
    latest.set(answer.itemCode, normalized)
  })
  return definition.items.flatMap((item) => {
    const answer = latest.get(item.itemCode)
    return answer ? [answer] : []
  })
}

const assertPrincipal = (assessment: any, input: FinalScaleSubmitInput) => {
  if (input.userId && assessment.userId === input.userId) return
  if (input.questionnaireSessionId && assessment.questionnaireAssessment?.sessionId === input.questionnaireSessionId) {
    if (input.userId && assessment.questionnaireAssessment?.userId === input.userId) return
    if (!input.userId && input.recoveryTokenHash && assessment.questionnaireAssessment?.resumeTokenHash === input.recoveryTokenHash) return
  }
  if (input.compositeAttemptId && assessment.compositeAttemptId === input.compositeAttemptId) {
    if (!input.userId && input.recoveryTokenHash && assessment.compositeAttempt?.recoveryTokenHash === input.recoveryTokenHash) return
    if (input.userId && assessment.compositeAttempt?.userId === input.userId) return
  }
  throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此量表测评', 403)
}

const contextForAssessment = (assessment: any) => {
  if (assessment.questionnaireAssessment) return readQuestionnaireAssessmentContext(assessment.questionnaireAssessment)
  if (assessment.compositeAttempt) return readCompositeAttemptContext(assessment.compositeAttempt)
  return { context: null, hash: null, decryptError: false }
}

const parentStateInTransaction = async (
  tx: Prisma.TransactionClient,
  assessment: { questionnaireAssessmentId?: string | null; compositeAttemptId?: string | null },
) => {
  if (assessment.questionnaireAssessmentId) {
    return tx.questionnaireAssessment.findUnique({
      where: { id: assessment.questionnaireAssessmentId },
      select: {
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotHash: true,
        questionnaire: {
          select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
        },
      },
    })
  }
  if (assessment.compositeAttemptId) {
    return tx.compositeAssessmentAttempt.findUnique({
      where: { id: assessment.compositeAttemptId },
      select: {
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotHash: true,
        compositeAssessment: {
          select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
        },
      },
    })
  }
  return null
}

const hasContextSection = (parent: any): boolean => Boolean(
  parent?.formSections?.some((section: any) => (
    Boolean(section.contextSection) || section.items?.some((item: any) => Boolean(item.contextKey))
  )),
)

const parentProgressUpdate = async (tx: Prisma.TransactionClient, assessment: any) => {
  if (assessment.questionnaireAssessmentId && assessment.questionnaireAssessment) {
    const parent = await tx.questionnaireAssessment.findUnique({
      where: { id: assessment.questionnaireAssessmentId },
      select: {
        id: true,
        status: true,
        attemptEpoch: true,
        progress: true,
        completedScales: true,
        completedForms: true,
        questionnaire: { select: { questionnaireScales: { select: { scaleId: true } }, formSections: { select: { id: true } } } },
        scaleAssessments: { select: { scaleId: true, status: true, attemptEpoch: true } },
        formSectionAttempts: { select: { sectionId: true, status: true, attemptEpoch: true } },
      },
    })
    if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
    if (parent.status !== 'IN_PROGRESS') {
      return { parent: { parentId: parent.id, progress: parent.progress }, terminalCandidate: false }
    }
    const scaleIds = new Set(parent.questionnaire.questionnaireScales.map((item) => item.scaleId))
    const completedScales = new Set(parent.scaleAssessments
      .filter((child) => scaleIds.has(child.scaleId)
        && child.attemptEpoch === parent.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.scaleId)).size
    const sectionIds = new Set(parent.questionnaire.formSections.map((section) => section.id))
    const completedForms = new Set(parent.formSectionAttempts
      .filter((attempt) => sectionIds.has(attempt.sectionId)
        && attempt.attemptEpoch === parent.attemptEpoch
        && attempt.status === 'COMPLETED')
      .map((attempt) => attempt.sectionId)).size
    const totalUnits = scaleIds.size + sectionIds.size
    const completedUnits = completedScales + completedForms
    await tx.questionnaireAssessment.update({
      where: { id: parent.id, status: 'IN_PROGRESS' },
      data: {
        completedScales,
        completedForms,
        progress: totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100)),
      },
    })
    return {
      parent: {
        parentId: parent.id,
        progress: totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100)),
      },
      terminalCandidate: totalUnits > 0 && completedUnits >= totalUnits,
    }
  }
  if (assessment.compositeAttemptId && assessment.compositeAttempt) {
    const progress = await refreshCompositeFinalOnlyProgress(tx, assessment.compositeAttemptId)
    return {
      parent: { parentId: progress.parentId, progress: progress.progress },
      terminalCandidate: progress.terminalCandidate,
    }
  }
  return null
}

const finalizeLinkedParent = async (assessment: any): Promise<void> => {
  if (assessment.compositeAttemptId) {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await finalizeCompositeAttemptIfReady(assessment.compositeAttemptId)
  }
  if (assessment.questionnaireAssessmentId) {
    const { finalizeQuestionnaireAttemptIfReady } = await import('../../services/questionnaire-form-section.service')
    await finalizeQuestionnaireAttemptIfReady(assessment.questionnaireAssessmentId)
  }
}

export const submitScaleAssessmentFinal = async (input: FinalScaleSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const assessment = await measureRequestPhase('final_submit_admission', () => prisma.assessment.findUnique({
    where: { id: input.assessmentId },
    include: {
      scale: {
        select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true, definitionHash: true },
      },
      questionnaireAssessment: {
        select: {
          id: true,
          userId: true,
          sessionId: true,
          resumeTokenHash: true,
          status: true,
          deliveryMode: true,
          attemptEpoch: true,
          completedScales: true,
          completedForms: true,
          contextSnapshotEncrypted: true,
          contextSnapshotHash: true,
          frozenActiveSlotSetEncrypted: true,
          frozenActiveSlotSetHash: true,
          questionnaire: { select: { questionnaireScales: { select: { id: true, scaleId: true, position: true } }, formSections: { select: { id: true, position: true, contextSection: true, items: { select: { contextKey: true } } } } } },
        },
      },
      compositeAttempt: {
        select: {
          id: true,
          userId: true,
          recoveryTokenHash: true,
          status: true,
          deliveryMode: true,
          attemptEpoch: true,
          completedItems: true,
          contextSnapshotEncrypted: true,
          contextSnapshotHash: true,
          frozenActiveSlotSetEncrypted: true,
          frozenActiveSlotSetHash: true,
          compositeAssessment: { select: { items: { select: { type: true } }, formSections: { select: { id: true, contextSection: true, items: { select: { contextKey: true } } } } } },
        },
      },
    },
  }))
  if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
  if (assessment.runtimeGeneration === 'UNIFIED_V1') {
    return submitUnifiedScaleAssessmentFinal(input, assessment as UnifiedScaleAdmission)
  }
  assertPrincipal(assessment, input)
  assertFinalOnly(assessment.deliveryMode)
  assertAttemptEpoch(assessment.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(assessment.status, '量表测评')
  const parentAttempt = assessment.questionnaireAssessment ?? assessment.compositeAttempt
  if (parentAttempt) {
    assertFinalOnly(parentAttempt.deliveryMode)
    assertFinalSubmitStatus(parentAttempt.status, '上级测评')
    assertAttemptEpoch(parentAttempt.attemptEpoch, input.attemptEpoch)
    if (parentAttempt.status === 'COMPLETED' && assessment.status !== 'COMPLETED') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评已结束，请重启后重新作答', 409)
    }
  }
  const contextParent = assessment.questionnaireAssessment ?? assessment.compositeAttempt
  const contextHash = contextParent?.contextSnapshotHash ?? null
  if (hasContextSection(assessment.questionnaireAssessment?.questionnaire || assessment.compositeAttempt?.compositeAssessment) && contextHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== contextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文版本已变化，请重试', 409)
  }

  const definition = await measureRequestPhase('final_submit_definition_prepare', async () => scaleDefinitionFromRecord(assessment.scale))
  const actualDefinitionHash = hashScaleDefinition(definition)
  assertDefinitionHash(actualDefinitionHash, input.definitionHash)
  const answers = await measureRequestPhase('final_submit_payload_validation', async () => normalizedAnswers(definition, input.answers))
  const missingRequiredItems = missingRequiredScaleItemCodes(definition, answers)
  if (missingRequiredItems.length > 0) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `还有 ${missingRequiredItems.length} 道必答题未作答`, 409)
  }
  const payload = { answers }
  const canonical = measureRequestPhaseSync('final_submit_non_db_compute', () => (
    measureRequestPhaseSync('final_submit_serialization', () => (
      measureRequestPhaseSync('final_submit_payload_hash', () => prepareCanonicalSubmission(payload))
    ))
  ))
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.scale, '量表提交数据')
  const payloadHash = canonical.hash
  if (assessment.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(assessment, submissionId, payloadHash)
    if (replay === 'replay') {
      await measureRequestPhase('final_submit_parent_finalization', () => finalizeLinkedParent(assessment))
      return {
        submissionId,
        payloadHash,
        replayed: true,
        assessment: scaleAssessmentForResponse(assessment),
        parent: null,
      }
    }
  }
  const context = measureRequestPhaseSync('final_submit_context_read', () => contextForAssessment(assessment))
  if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
  const result = await measureRequestPhase('final_submit_scoring', () => buildScaleResultForRecord({
    scale: assessment.scale as ScaleRecord,
    answers,
    participantContext: context.context?.values,
    participantContextHash: context.hash,
  }))
  const { encryptedAnswers, encryptedResult } = await measureRequestPhase('final_submit_encryption', async () => ({
    encryptedAnswers: encryptScaleAnswers(answers),
    encryptedResult: encryptScaleResult(result),
  }))

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    await lockAssessment(tx, input.assessmentId)
    if (assessment.questionnaireAssessmentId) await lockParent(tx, 'questionnaire_assessments', assessment.questionnaireAssessmentId)
    if (assessment.compositeAttemptId) await lockParent(tx, 'composite_assessment_attempts', assessment.compositeAttemptId)
    const current = await tx.assessment.findUnique({
      where: { id: input.assessmentId },
      select: {
        id: true,
        userId: true,
        questionnaireAssessmentId: true,
        compositeAttemptId: true,
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        submissionId: true,
        submissionPayloadHash: true,
        answers: true,
        result: true,
        completedAt: true,
        totalTime: true,
        progress: true,
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '量表测评')
    const parentState = await parentStateInTransaction(tx, current)
    if ((current.questionnaireAssessmentId || current.compositeAttemptId) && !parentState) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    }
    if (parentState) {
      assertFinalOnly(parentState.deliveryMode)
      assertFinalSubmitStatus(parentState.status, '上级测评')
      assertAttemptEpoch(parentState.attemptEpoch, input.attemptEpoch)
      if (parentState.status === 'COMPLETED' && current.status !== 'COMPLETED') {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评已结束，请重启后重新作答', 409)
      }
    }
    const currentContextHash = parentState?.contextSnapshotHash ?? null
    const parentDefinition = parentState && 'questionnaire' in parentState
      ? parentState.questionnaire
      : parentState && 'compositeAssessment' in parentState
        ? parentState.compositeAssessment
        : null
    const requiresContext = hasContextSection(parentDefinition)
    if (requiresContext && currentContextHash === null) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    if ((input.contextSnapshotHash ?? null) !== currentContextHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文版本已变化，请重启后重新作答', 409)
    }
    const replay = assertSubmissionReplay(current, submissionId, payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      const parentProgress = await parentProgressUpdate(tx, assessment)
      return {
        assessment: scaleAssessmentForResponse(current),
        replay: true,
        parent: parentProgress?.parent ?? null,
        shouldFinalize: parentProgress?.terminalCandidate ?? false,
      }
    }
    if (current.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评已结束', 409)
    const completedAt = new Date()
    const totalTime = Math.max(0, completedAt.getTime() - new Date(assessment.startedAt).getTime())
    const updated = await tx.assessment.updateMany({
      where: { id: input.assessmentId, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: input.attemptEpoch, submissionId: null },
      data: {
        status: 'COMPLETED',
        answers: encryptedAnswers,
        result: encryptedResult,
        progress: 100,
        completedAt,
        totalTime,
        submissionId,
        submissionPayloadHash: payloadHash,
        submissionCompletedAt: completedAt,
      },
    })
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评状态已变化，请重试', 409)
    const parentProgress = await parentProgressUpdate(tx, assessment)
    return {
      assessment: scaleAssessmentForResponse({ ...current, status: 'COMPLETED', answers, result, progress: 100, completedAt, totalTime, submissionId, submissionPayloadHash: payloadHash, submissionCompletedAt: completedAt }),
      replay: false,
      parent: parentProgress?.parent ?? null,
      shouldFinalize: parentProgress?.terminalCandidate ?? false,
    }
  })

  if (committed.shouldFinalize) {
    await measureRequestPhase('final_submit_parent_finalization', () => finalizeLinkedParent(assessment))
  }
  return {
    submissionId,
    payloadHash,
    replayed: committed.replay,
    assessment: committed.assessment,
    parent: committed.parent,
  }
}

const questionnaireChild = async (scaleAssessmentId: string) => prisma.assessment.findUnique({
  where: { id: scaleAssessmentId },
  select: {
    id: true,
    questionnaireAssessmentId: true,
    questionnaireAssessment: { select: { id: true, userId: true, sessionId: true, resumeTokenHash: true } },
  },
})

export const submitQuestionnaireScaleFinal = async (
  questionnaireAssessmentId: string,
  scaleAssessmentId: string,
  input: Omit<FinalScaleSubmitInput, 'assessmentId' | 'userId' | 'questionnaireSessionId' | 'compositeAttemptId'>,
  context: { userId: string },
) => {
  const child = await questionnaireChild(scaleAssessmentId)
  if (!child || child.questionnaireAssessmentId !== questionnaireAssessmentId || child.questionnaireAssessment?.userId !== context.userId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评不属于当前问卷', 403)
  }
  return submitScaleAssessmentFinal({
    ...input,
    assessmentId: scaleAssessmentId,
    userId: context.userId,
    questionnaireSessionId: child.questionnaireAssessment.sessionId ?? undefined,
  })
}

export const submitQuestionnaireScaleFinalForPublic = async (
  sessionId: string,
  scaleAssessmentId: string,
  input: Omit<FinalScaleSubmitInput, 'assessmentId' | 'userId' | 'questionnaireSessionId' | 'compositeAttemptId' | 'recoveryTokenHash'>,
  resumeTokenHash: string,
) => {
  const child = await questionnaireChild(scaleAssessmentId)
  if (!child || child.questionnaireAssessmentId === null || child.questionnaireAssessment?.sessionId !== sessionId) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评不属于当前会话', 403)
  }
  return submitScaleAssessmentFinal({
    ...input,
    assessmentId: scaleAssessmentId,
    userId: null,
    questionnaireSessionId: sessionId,
    recoveryTokenHash: resumeTokenHash,
  })
}

export const submitCompositeScaleFinal = async (
  attemptId: string,
  itemId: string,
  input: Omit<FinalScaleSubmitInput, 'assessmentId' | 'userId' | 'compositeAttemptId' | 'questionnaireSessionId'>,
  context: { userId?: string | null; recoveryTokenHash?: string },
) => {
  const child = await prisma.assessment.findFirst({
    where: { compositeAttemptId: attemptId, compositeItemId: itemId },
    select: { id: true },
  })
  if (!child) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评不存在', 404)
  return submitScaleAssessmentFinal({
    ...input,
    assessmentId: child.id,
    userId: context.userId,
    compositeAttemptId: attemptId,
    recoveryTokenHash: context.recoveryTokenHash,
  })
}

/**
 * Restart a standalone in-progress assessment without deleting its answers.
 * Embedded children are deliberately rejected here: their lifecycle belongs
 * to the enclosing Questionnaire/Composite attempt and must be restarted as
 * one unit.
 */
export const restartStandaloneScaleAssessment = async (assessmentId: string, userId: string) => {
  const created = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "assessments" WHERE "id" = ${assessmentId} FOR UPDATE
    `
    if (!locked[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)

    const current = await tx.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        scaleId: true,
        userId: true,
        status: true,
        deliveryMode: true,
        attemptEpoch: true,
        questionnaireAssessmentId: true,
        compositeAttemptId: true,
        scale: {
          select: {
            id: true,
            code: true,
            instrumentVersion: true,
            instrumentClass: true,
            definition: true,
            status: true,
          },
        },
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
    if (current.userId !== userId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限重启此量表测评', 403)
    if (current.questionnaireAssessmentId || current.compositeAttemptId) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '嵌入式量表必须重启所属问卷或综合测评', 409)
    }
    if (current.status !== 'IN_PROGRESS') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '只有进行中的量表测评可以重启', 409)
    }

    if (current.scale.status !== 'PUBLISHED') {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表已不再可用于新测评', 409)
    }
    const definition = scaleDefinitionFromRecord(current.scale)
    const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(tx as any, {
      instrumentKey: current.scale.code,
      instrumentVersion: current.scale.instrumentVersion,
      definition,
    })

    const retiredAt = new Date()
    await tx.assessment.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: retiredAt },
    })
    return tx.assessment.create({
      data: {
        scaleId: current.scaleId,
        userId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot),
        compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
        attemptEpoch: current.attemptEpoch + 1,
        progress: 0,
        answers: encryptScaleAnswers([]),
      },
      include: { scale: true },
    })
  })

  const definition = scaleDefinitionFromRecord(created.scale)
  return {
    assessment: scaleAssessmentForResponse(created),
    scale: {
      ...scaleRunnerFromRecord(created.scale),
      id: created.scale.id,
      code: created.scale.code,
      name: created.scale.name,
      description: created.scale.description,
      instruction: created.scale.instruction,
      estimatedTime: created.scale.estimatedTime,
      definitionHash: hashScaleDefinition(definition),
    },
  }
}

export const isFinalScaleSubmitError = isInstrumentFinalSubmitError
