import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { standaloneContextSchema } from './scale-context-input'
import type { Request, Response } from 'express'
import { forbidden, instrumentError, success, error } from '../../utils/response'
import { logger } from '../../utils/logger'
import { hashScaleDefinition } from './scale-definition'
import { loadStoredScaleAdmission } from './scale-admission.service'
import { restartStandaloneScaleAssessmentWithPolicy } from './scale-restart.service'
import { loadScaleAssessmentForResponse, scaleDefinitionFromRecord, scaleRunnerFromRecord } from './scale-workflow.service'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

export const restartStandaloneScaleAssessmentWithPolicyController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId
    if (!userId) return forbidden(res, '请先登录')
    const context = standaloneContextSchema.safeParse(req.body?.context)
    if (!context.success) return error(res, context.error.issues[0].message)
    const created = await restartStandaloneScaleAssessmentWithPolicy(req.params.assessmentId, userId, context.data)
    const definition = scaleDefinitionFromRecord(created.scale)
    const admission = await loadStoredScaleAdmission(created as any)
    return success(res, {
      assessment: {
        ...(await loadScaleAssessmentForResponse(created)),
        contextSnapshotHash: admission?.contextSnapshotHash ?? null,
        contextFrozenAt: admission?.frozenAt ?? null,
      },
      scale: {
        id: created.scale.id,
        code: created.scale.code,
        name: created.scale.name,
        description: created.scale.description,
        instruction: created.scale.instruction,
        estimatedTime: created.scale.estimatedTime,
        definition: scaleRunnerFromRecord(created.scale),
        definitionHash: hashScaleDefinition(definition),
      },
    }, '量表测评已重启')
  } catch (err) {
    if (err instanceof ScaleLibraryError) return error(res, err.message, -1, err.statusCode)
    if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
    logger.error('重启量表测评错误', err)
    return error(res, err instanceof Error ? err.message : '重启量表测评失败')
  }
}
