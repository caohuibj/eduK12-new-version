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
  assertSubmissionPayloadSize,
  assertSubmissionReplay,
  computeSubmissionPayloadHash,
  FINAL_SUBMISSION_MAX_BYTES,
  isInstrumentFinalSubmitError,
  InstrumentFinalSubmitError,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'

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

const contextHashInTransaction = async (tx: Prisma.TransactionClient, assessment: { questionnaireAssessmentId?: string | null; compositeAttemptId?: string | null }) => {
  if (assessment.questionnaireAssessmentId) {
    const parent = await tx.questionnaireAssessment.findUnique({ where: { id: assessment.questionnaireAssessmentId }, select: { contextSnapshotHash: true } })
    return parent?.contextSnapshotHash ?? null
  }
  if (assessment.compositeAttemptId) {
    const parent = await tx.compositeAssessmentAttempt.findUnique({ where: { id: assessment.compositeAttemptId }, select: { contextSnapshotHash: true } })
    return parent?.contextSnapshotHash ?? null
  }
  return null
}

const parentProgressUpdate = async (tx: Prisma.TransactionClient, assessment: any) => {
  if (assessment.questionnaireAssessmentId && assessment.questionnaireAssessment) {
    const parent = await tx.questionnaireAssessment.findUnique({
      where: { id: assessment.questionnaireAssessmentId },
      select: {
        id: true,
        status: true,
        completedScales: true,
        completedForms: true,
        questionnaire: { select: { questionnaireScales: { select: { id: true } }, formSections: { select: { id: true } } } },
      },
    })
    if (!parent || parent.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评已结束', 409)
    const totalUnits = parent.questionnaire.questionnaireScales.length + parent.questionnaire.formSections.length
    const completedScales = (parent.completedScales ?? 0) + 1
    const completedForms = parent.completedForms ?? 0
    const completedUnits = completedScales + completedForms
    await tx.questionnaireAssessment.update({
      where: { id: parent.id, status: 'IN_PROGRESS' },
      data: {
        completedScales: { increment: 1 },
        progress: totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100)),
      },
    })
    return { parentId: parent.id, progress: totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / totalUnits) * 100)) }
  }
  if (assessment.compositeAttemptId && assessment.compositeAttempt) {
    const parent = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: assessment.compositeAttemptId },
      select: {
        id: true,
        status: true,
        completedItems: true,
        compositeAssessment: { select: { items: { select: { type: true } }, formSections: { select: { id: true } } } },
      },
    })
    if (!parent || parent.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评已结束', 409)
    const totalUnits = parent.compositeAssessment.items.filter((item: any) => item.type !== 'FORM').length
      + parent.compositeAssessment.formSections.length
    const completedItems = (parent.completedItems ?? 0) + 1
    const progress = totalUnits === 0 ? 100 : Math.min(100, Math.round((completedItems / totalUnits) * 100))
    await tx.compositeAssessmentAttempt.update({
      where: { id: parent.id, status: 'IN_PROGRESS' },
      data: { completedItems: { increment: 1 }, progress, lastSavedAt: new Date() },
    })
    return { parentId: parent.id, progress }
  }
  return null
}

export const submitScaleAssessmentFinal = async (input: FinalScaleSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const assessment = await prisma.assessment.findUnique({
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
          completedScales: true,
          completedForms: true,
          contextSnapshotEncrypted: true,
          contextSnapshotHash: true,
          questionnaire: { select: { questionnaireScales: { select: { id: true, position: true } }, formSections: { select: { id: true, position: true } } } },
        },
      },
      compositeAttempt: {
        select: {
          id: true,
          userId: true,
          recoveryTokenHash: true,
          status: true,
          completedItems: true,
          contextSnapshotEncrypted: true,
          contextSnapshotHash: true,
          compositeAssessment: { select: { items: { select: { type: true } }, formSections: { select: { id: true } } } },
        },
      },
    },
  })
  if (!assessment) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
  assertPrincipal(assessment, input)
  assertFinalOnly(assessment.deliveryMode)

  const definition = scaleDefinitionFromRecord(assessment.scale)
  const actualDefinitionHash = hashScaleDefinition(definition)
  assertDefinitionHash(actualDefinitionHash, input.definitionHash)
  const answers = normalizedAnswers(definition, input.answers)
  const missingRequiredItems = missingRequiredScaleItemCodes(definition, answers)
  if (missingRequiredItems.length > 0) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `还有 ${missingRequiredItems.length} 道必答题未作答`, 409)
  }
  const payload = { answers }
  assertSubmissionPayloadSize(payload, FINAL_SUBMISSION_MAX_BYTES.scale, '量表提交数据')
  const payloadHash = computeSubmissionPayloadHash(payload)
  if (assessment.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(assessment, submissionId, payloadHash)
    if (replay === 'replay') {
      return {
        submissionId,
        payloadHash,
        replayed: true,
        assessment: scaleAssessmentForResponse(assessment),
        parent: null,
      }
    }
  }
  const context = contextForAssessment(assessment)
  if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
  const result = await buildScaleResultForRecord({
    scale: assessment.scale as ScaleRecord,
    answers,
    participantContext: context.context?.values,
    participantContextHash: context.hash,
  })
  const encryptedAnswers = encryptScaleAnswers(answers)
  const encryptedResult = encryptScaleResult(result)

  const committed = await prisma.$transaction(async (tx) => {
    if (assessment.questionnaireAssessmentId) await lockParent(tx, 'questionnaire_assessments', assessment.questionnaireAssessmentId)
    if (assessment.compositeAttemptId) await lockParent(tx, 'composite_assessment_attempts', assessment.compositeAttemptId)
    await lockAssessment(tx, input.assessmentId)
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
    const replay = assertSubmissionReplay(current, submissionId, payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      return { assessment: scaleAssessmentForResponse(current), replay: true, parent: null }
    }
    const currentContextHash = await contextHashInTransaction(tx, current)
    if ((input.contextSnapshotHash ?? null) !== currentContextHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文版本已变化，请重启后重新作答', 409)
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
    const parent = await parentProgressUpdate(tx, assessment)
    return {
      assessment: scaleAssessmentForResponse({ ...current, status: 'COMPLETED', answers, result, progress: 100, completedAt, totalTime, submissionId, submissionPayloadHash: payloadHash, submissionCompletedAt: completedAt }),
      replay: false,
      parent,
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

  if (committed.parent?.parentId && assessment.compositeAttemptId) {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await finalizeCompositeAttemptIfReady(committed.parent.parentId)
  }
  if (committed.parent?.parentId && assessment.questionnaireAssessmentId) {
    const { finalizeQuestionnaireAttemptIfReady } = await import('../../services/questionnaire-form-section.service')
    await finalizeQuestionnaireAttemptIfReady(committed.parent.parentId)
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
