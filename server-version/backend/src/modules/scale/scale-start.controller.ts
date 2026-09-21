import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, forbidden, instrumentError, notFound, success } from '../../utils/response'
import { logger } from '../../utils/logger'
import { canStudentAccessScale } from './scale-access'
import {
  ageMonthsAt,
  gradeLevelSchema,
  hashAssessmentContext,
  isValidYearMonth,
  sexAtBirthSchema,
  type AssessmentContextV1,
  type AssessmentContextValues,
} from '../assessment-context/context'
import { hashScaleDefinition } from './scale-definition'
import {
  readScaleAnswers,
  scaleAssessmentForResponse,
  scaleDefinitionFromRecord,
  scaleRunnerFromRecord,
} from './scale-workflow.service'
import { freezeScaleRuntimeAtAttemptStart, encryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { encryptField } from '../../utils/encryption'
import { retainFrozenScaleAssessmentImages } from './scale-image-retention'
import {
  readStoredScaleAdmission,
  standaloneAdmissionPersistenceForRuntime,
} from './scale-admission.service'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const standaloneContextSchema = z.object({
  birthYearMonth: z.string().refine(isValidYearMonth, '出生年月必须是 YYYY-MM').optional(),
  sexAtBirth: sexAtBirthSchema.optional(),
  gradeLevel: gradeLevelSchema.optional(),
  primaryLanguage: z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).optional(),
  countryOrRegion: z.string().regex(/^[A-Z]{2}$/).optional(),
}).strict().optional()

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

const responseEnvelope = (assessment: any, scale: any, definition: any, runner: any) => {
  const admission = readStoredScaleAdmission(assessment)
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

    const definition = scaleDefinitionFromRecord(scale)
    const runner = scaleRunnerFromRecord(scale)
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
      const stored = readScaleAnswers(existing.answers)
      if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
      return success(res, responseEnvelope(existing, scale, definition, runner), '继续未完成的测评')
    }

    let assessment
    try {
      assessment = await prisma.$transaction(async (tx) => {
        // Re-read every mutable new-start control inside the Serializable
        // transaction. Resource access, deployment/grant evaluation, runtime
        // freezing and admission persistence therefore share one DB snapshot.
        const currentScale = await tx.scale.findUnique({ where: { id: scaleId }, select: scaleSelect })
        if (!currentScale || !(await canStudentAccessScale(currentScale, userId, tx))) {
          throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表不存在', 404)
        }
        const frozenAt = new Date()
        const context = buildStandaloneContext(contextInput.data, frozenAt)
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
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
    const stored = readScaleAnswers(assessment.answers)
    if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
    return success(res, responseEnvelope(assessment, scale, definition, runner), '测评已开始')
  } catch (err) {
    if (err instanceof InstrumentFinalSubmitError) return instrumentError(res, err.code, err.message, err.statusCode)
    logger.error('开始 v2 量表测评错误', err)
    return error(res, err instanceof Error ? err.message : '开始测评失败')
  }
}
