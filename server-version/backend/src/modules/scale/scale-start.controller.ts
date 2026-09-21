import type { Request, Response } from 'express'
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
      contextFrozenAt: admission?.frozenAt ?? null,
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

export const startStandaloneScaleAssessment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId
    if (!userId) return forbidden(res, '请先登录')
    const contextInput = standaloneContextSchema.safeParse(req.body?.context)
    if (!contextInput.success) return error(res, contextInput.error.errors[0].message)

    const { scaleId } = req.params
    const scale = await prisma.scale.findUnique({
      where: { id: scaleId },
      select: {
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
      },
    })
    if (!scale) return notFound(res, '量表不存在')
    if (!(await canStudentAccessScale(scale, userId))) return notFound(res, '量表不存在')
    if (scale.status !== 'PUBLISHED') return error(res, '量表未发布')

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
      const stored = readScaleAnswers(existing.answers)
      if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
      return success(res, responseEnvelope(existing, scale, definition, runner), '继续未完成的测评')
    }

    const frozenAt = new Date()
    const context = buildStandaloneContext(contextInput.data, frozenAt)
    const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(prisma as any, {
      instrumentKey: scale.code,
      instrumentVersion: scale.instrumentVersion,
      definition,
      frozenAt,
    })
    const admission = await standaloneAdmissionPersistenceForRuntime({
      db: prisma,
      attemptEpoch: 1,
      userId,
      scale: {
        id: scale.id,
        code: scale.code,
        name: scale.name,
        instrumentVersion: scale.instrumentVersion,
        instrumentClass: scale.instrumentClass,
        status: scale.status,
      },
      runtime: runtimeSnapshot,
      contextSnapshotHash: context.hash,
      contextValues: context.context?.values ?? null,
      contextFrozenAt: context.context?.frozenAt ?? null,
    })

    let assessment
    try {
      assessment = await prisma.$transaction(async (tx) => {
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
