import { requiredScaleContextKeys } from './policy/context-preflight'
import { withSerializableScaleTransaction } from './deployment/transactions'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { ageMonthsAt, hashAssessmentContext, type AssessmentContextV1, type AssessmentContextValues } from '../assessment-context/context'
import { encryptFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart } from '../assessment-runtime/runtime-snapshot'
import { canStudentAccessScale } from './scale-access'
import { retainFrozenScaleAssessmentImages } from './scale-image-retention'
import { readStoredScaleAdmission, standaloneAdmissionPersistenceForRuntime } from './scale-admission.service'
import { encryptScaleAnswers, scaleDefinitionFromRecord } from './scale-workflow.service'

const refreezeStandaloneContext = (
  values: AssessmentContextValues | null,
  frozenAt: Date,
): { context: AssessmentContextV1 | null; hash: string | null } => {
  if (!values) return { context: null, hash: null }
  const nextValues: AssessmentContextValues = { ...values }
  if (values.birthYearMonth) {
    nextValues.ageMonthsAtFreeze = ageMonthsAt(values.birthYearMonth, frozenAt)
    nextValues.ageYearsAtFreeze = Math.floor(nextValues.ageMonthsAtFreeze / 12)
  } else {
    delete nextValues.ageMonthsAtFreeze
    delete nextValues.ageYearsAtFreeze
  }
  const context: AssessmentContextV1 = {
    schemaVersion: 1,
    frozenAt: frozenAt.toISOString(),
    values: nextValues,
  }
  return { context, hash: hashAssessmentContext(context) }
}

export const restartStandaloneScaleAssessmentWithPolicy = async (assessmentId: string, userId: string, contextInput?: AssessmentContextValues) => (
  withSerializableScaleTransaction(prisma, async (tx) => {
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
        attemptEpoch: true,
        questionnaireAssessmentId: true,
        compositeAttemptId: true,
        frozenAdmissionSnapshotEncrypted: true,
        frozenAdmissionSnapshotHash: true,
        scale: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            instruction: true,
            estimatedTime: true,
            instrumentVersion: true,
            instrumentClass: true,
            definition: true,
            status: true,
            visibility: true,
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
    if (!(await canStudentAccessScale(current.scale, userId, tx))) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表当前不可用于新的测评轮次', 403)
    }

    const priorAdmission = readStoredScaleAdmission(current as any)
    const frozenAt = new Date()
    const definition = scaleDefinitionFromRecord(current.scale)
    const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(tx as any, {
      instrumentKey: current.scale.code,
      instrumentVersion: current.scale.instrumentVersion,
      definition,
      frozenAt,
    })
    const supplied = contextInput ?? priorAdmission?.contextValues
    const keys = runtimeSnapshot.schemaVersion === 2 ? requiredScaleContextKeys(runtimeSnapshot.compiledPolicy.applicability) : []
    const values = supplied ? Object.fromEntries(keys.filter(key => supplied[key] !== undefined).map(key => [key, supplied[key]])) : null
    const context = refreezeStandaloneContext(values, frozenAt)
    const nextEpoch = current.attemptEpoch + 1
    const admission = await standaloneAdmissionPersistenceForRuntime({
      db: tx,
      attemptEpoch: nextEpoch,
      userId,
      scale: {
        id: current.scale.id,
        code: current.scale.code,
        name: current.scale.name,
        instrumentVersion: current.scale.instrumentVersion,
        instrumentClass: current.scale.instrumentClass,
        status: current.scale.status,
      },
      runtime: runtimeSnapshot,
      contextSnapshotHash: context.hash,
      contextValues: context.context?.values ?? null,
      contextFrozenAt: context.context?.frozenAt ?? null,
    })

    // Retire the prior epoch only after the replacement has passed current
    // resource access, deployment, authorization and eligibility checks. Any
    // later failure rolls the transaction back, so restart cannot destroy the
    // active attempt.
    await tx.assessment.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: frozenAt },
    })
    const next = await tx.assessment.create({
      data: {
        scaleId: current.scaleId,
        userId,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot),
        compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
        ...admission,
        attemptEpoch: nextEpoch,
        progress: 0,
        answers: encryptScaleAnswers([]),
        startedAt: frozenAt,
        subjectUserId: userId,
        respondentUserId: userId,
        respondentType: 'SELF',
      },
      include: { scale: true },
    })
    await retainFrozenScaleAssessmentImages({ assessmentId: next.id, snapshot: runtimeSnapshot, db: tx as never })
    return next
  })
)
