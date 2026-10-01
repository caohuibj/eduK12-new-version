import { standaloneContextSchema } from './scale-context-input'
import { withSerializableScaleTransaction } from './deployment/transactions'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, forbidden, instrumentError, notFound, success } from '../../utils/response'
import { logger } from '../../utils/logger'
import { canStudentAccessScale } from './scale-access'
import {
  ageMonthsAt,
  hashAssessmentContext,
  type AssessmentContextV1,
  type AssessmentContextValues,
} from '../assessment-context/context'
import { resolveScaleStartDeployment } from './deployment/service'
import { requiredScaleContextKeys } from './policy/context-preflight'
import { hashScaleDefinition, runnerDefinition } from './scale-definition'
import {
  readScaleAnswers,
  scaleAssessmentForResponse,
  scaleDefinitionFromRecord,
} from './scale-workflow.service'
import { freezeScaleRuntimeAtAttemptStart, encryptFrozenScaleRuntimeSnapshot, decryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { encryptField } from '../../utils/encryption'
import { retainFrozenScaleAssessmentImages } from './scale-image-retention'
import {
  activateScaleAdmission,
  readStoredScaleAdmission,
  standaloneAdmissionPersistenceForRuntime,
} from './scale-admission.service'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'



const buildStandaloneContext = (
  input: z.infer<typeof standaloneContextSchema>,
  frozenAt: Date,
): { context: AssessmentContextV1 | null; hash: string | null } => {
  if (!input || Object.keys(input).length === 0) return { context: null, hash: null }
  const values: AssessmentContextValues = {}
  if (input.birthYearMonth) {
    values.birthYearMonth = input.birthYearMonth
    values.ageMonthsAtFreeze = ageMonthsAt(input.birthYearMonth, frozenAt)
    values.ageYearsAtFreeze = Math.floor(values.ageMonthsAtFreeze / 12)
  }
  if (input.sexAtBirth) values.sexAtBirth = input.sexAtBirth
  if (input.gradeLevel) values.gradeLevel = input.gradeLevel
  if (input.primaryLanguage) values.primaryLanguage = input.primaryLanguage
  if (input.countryOrRegion) values.countryOrRegion = input.countryOrRegion
  const context: AssessmentContextV1 = { schemaVersion: 1, frozenAt: frozenAt.toISOString(), values }
  return { context, hash: hashAssessmentContext(context) }
}

const responseEnvelope = (assessment: any, scale: any) => {
  const admission = readStoredScaleAdmission(assessment)
  const definition = assessment.runtimeSnapshotEncrypted
    ? decryptFrozenScaleRuntimeSnapshot(assessment.runtimeSnapshotEncrypted).definition
    : scaleDefinitionFromRecord(scale)
  const runner = runnerDefinition(definition)
  return {
    assessment: {
      ...scaleAssessmentForResponse(assessment),
      contextSnapshotHash: admission?.contextSnapshotHash ?? null,
      contextFrozenAt: admission?.schemaVersion === 2
        ? admission.scalePolicy?.eligibility.contextFrozenAt ?? admission.frozenAt
        : admission?.frozenAt ?? null,
    },
    scale: {
      id: scale.id,
      code: scale.code,
      name: scale.name,
      description: scale.description,
      instruction: scale.instruction,
      estimatedTime: scale.estimatedTime,
      definition: runner,
      definitionHash: hashScaleDefinition(definition),
    },
  }
}

const scaleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  instruction: true,
  estimatedTime: true,
  status: true,
  visibility: true,
  instrumentVersion: true,
  instrumentClass: true,
  definition: true,
} as const

export const startStandaloneScaleAssessment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId
    if (!userId) return forbidden(res, '请先登录')
    const contextInput = standaloneContextSchema.safeParse(req.body?.context)
    if (!contextInput.success) return error(res, contextInput.error.errors[0].message)

    const { scaleId } = req.params
    const scale = await prisma.scale.findUnique({ where: { id: scaleId }, select: scaleSelect })
    if (!scale) return notFound(res, '量表不存在')

    const existing = await prisma.assessment.findFirst({
      where: {
        scaleId,
        userId,
        status: 'IN_PROGRESS',
        questionnaireAssessmentId: null,
        compositeAttemptId: null,
      },
    })
    if (existing) {
      // Resume is governed by the already-frozen admission. Current product
      // access, deployment and grant state are new-start controls and must not
      // retroactively invalidate an in-flight attempt.
      if (existing.runtimeGeneration === 'UNIFIED_V1') await activateScaleAdmission({ ...existing, scale } as any)
      const stored = readScaleAnswers(existing.answers)
      if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
      return success(res, responseEnvelope(existing, scale), '继续未完成的测评')
    }

    let assessment
    try {
      assessment = await withSerializableScaleTransaction(prisma, async (tx) => {
        // Re-read every mutable new-start control inside the Serializable
        // transaction. Resource access, deployment/grant evaluation, runtime
        // freezing and admission persistence therefore share one DB snapshot.
        const currentScale = await tx.scale.findUnique({ where: { id: scaleId }, select: scaleSelect })
        if (!currentScale || !(await canStudentAccessScale(currentScale, userId, tx))) {
          throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表不存在', 404)
        }
        const deployment = await resolveScaleStartDeployment({ db: tx, scale: currentScale, requestedMode: 'STANDALONE' })
        if (req.user?.role !== 'STUDENT' && (deployment.kind !== 'MANAGED_V2' || !deployment.runtimePolicy.applicability.respondentTypes.includes('SELF'))) {
          throw new InstrumentFinalSubmitError('STALE_ATTEMPT', 'This content does not authorize governed self-report starts', 403)
        }
        if (!deployment.allowNewStarts) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', deployment.reasons.join(','), 409)
        const requiredContextKeys = deployment.kind === 'MANAGED_V2'
          ? requiredScaleContextKeys(deployment.runtimePolicy.applicability) : []
        if (requiredContextKeys.some(key => !contextInput.data?.[key])) {
          return { preflight: { kind: 'CONTEXT_REQUIRED' as const, requiredContextKeys } }
        }
        const selectedContext = Object.fromEntries(requiredContextKeys.map(key => [key, contextInput.data?.[key]]))
        const frozenAt = new Date()
        const context = buildStandaloneContext(standaloneContextSchema.parse(selectedContext), frozenAt)
        const currentDefinition = scaleDefinitionFromRecord(currentScale)
        const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(tx as any, {
          instrumentKey: currentScale.code,
          instrumentVersion: currentScale.instrumentVersion,
          definition: currentDefinition,
          frozenAt,
        })
        const admission = await standaloneAdmissionPersistenceForRuntime({
          db: tx,
          attemptEpoch: 1,
          userId,
          scale: {
            id: currentScale.id,
            code: currentScale.code,
            name: currentScale.name,
            instrumentVersion: currentScale.instrumentVersion,
            instrumentClass: currentScale.instrumentClass,
            status: currentScale.status,
          },
          runtime: runtimeSnapshot,
          contextSnapshotHash: context.hash,
          contextValues: context.context?.values ?? null,
          contextFrozenAt: context.context?.frozenAt ?? null,
        })
        const created = await tx.assessment.create({
          data: {
            scaleId,
            userId,
            status: 'IN_PROGRESS',
            deliveryMode: 'FINAL_ONLY',
            runtimeGeneration: 'UNIFIED_V1',
            runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot),
            compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
            ...admission,
            attemptEpoch: 1,
            progress: 0,
            answers: encryptField([]),
            startedAt: frozenAt,
            subjectUserId: userId,
            respondentUserId: userId,
            respondentType: 'SELF',
          },
        })
        await retainFrozenScaleAssessmentImages({ assessmentId: created.id, snapshot: runtimeSnapshot, db: tx as never })
        return created
      })
    } catch (err: any) {
      // The partial unique index remains the final concurrent-start boundary.
      // A concurrent winner is resumed by identity; every other serialization
      // or policy failure is surfaced rather than silently using stale state.
      if (err?.code !== 'P2002') throw err
      assessment = await prisma.assessment.findFirst({
        where: {
          scaleId,
          userId,
          status: 'IN_PROGRESS',
          questionnaireAssessmentId: null,
          compositeAttemptId: null,
        },
      })
      if (!assessment) throw err
    }
    if ('preflight' in assessment) return success(res, assessment, '请先补充测评所需资料')
    if (assessment.runtimeGeneration === 'UNIFIED_V1') await activateScaleAdmission({ ...assessment, scale } as any)
    const stored = readScaleAnswers(assessment.answers)
    if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
    return success(res, responseEnvelope(assessment, scale), '测评已开始')
  } catch (err) {
    if (err instanceof InstrumentFinalSubmitError) return instrumentError(res, err.code, err.message, err.statusCode)
    logger.error('开始 v2 量表测评错误', err)
    return error(res, err instanceof Error ? err.message : '开始测评失败')
  }
}
