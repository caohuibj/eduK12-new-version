import { Request, Response } from 'express'
import { logger } from '../utils/logger'
import { assessmentSubmitBusy, error, instrumentError, success } from '../utils/response'
import { isUnitSubmitAdmissionBusyError, withUnitSubmitAdmission } from '../services/unitSubmitAdmission'
import { isInstrumentFinalSubmitError } from '../services/instrumentFinalSubmit'
import {
  getSituationalAttemptResult,
  getSituationalInstrument,
  listSituationalHistory,
  listSituationalInstruments,
  loadSituationalAttemptRuntime,
  resumeSituationalAttempt,
  startSituationalAttempt,
} from '../modules/situational/situational-runtime.service'
import { submitSituationalAttemptFinal } from '../modules/situational/situational-final-submit.service'
import { situationalFinalSubmitSchema, situationalStartSchema } from '../modules/situational/situational-final-submit.schema'
import { serveFrozenSituationalAsset } from '../modules/situational/situational-asset.service'
import { projectRelationalUnitFinalResponse } from '../modules/assessment-relational/result-authority'
import { prisma } from '../config/database'

const firstZodMessage = (errorValue: { errors?: Array<{ message: string }> }): string => (
  errorValue.errors?.[0]?.message ?? '请求参数不合法'
)

const handleSituationalError = (res: Response, errorValue: unknown, operation: string) => {
  if (isUnitSubmitAdmissionBusyError(errorValue)) return assessmentSubmitBusy(res, errorValue.retryAfterSeconds)
  if (isInstrumentFinalSubmitError(errorValue)) return instrumentError(res, errorValue.code, errorValue.message, errorValue.statusCode)
  logger.error(operation, errorValue)
  return error(res, errorValue instanceof Error ? errorValue.message : '情境化测评请求失败')
}

export const situationalController = {
  async listInstruments(_req: Request, res: Response) {
    try {
      return success(res, { list: listSituationalInstruments() })
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '获取情境化题包列表失败')
    }
  },

  async getInstrument(req: Request, res: Response) {
    try {
      const version = typeof req.query.version === 'string' ? req.query.version : undefined
      return success(res, getSituationalInstrument(req.params.instrumentKey, version))
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '获取情境化题包详情失败')
    }
  },

  async start(req: Request, res: Response) {
    try {
      const parsed = situationalStartSchema.safeParse(req.body)
      if (!parsed.success) return error(res, firstZodMessage(parsed.error))
      const data = await startSituationalAttempt(req.user!.userId, parsed.data)
      return success(res, data, '情境化测评已开始')
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '开始情境化测评失败')
    }
  },

  async startByPath(req: Request, res: Response) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      if (body.instrumentKey !== undefined && body.instrumentKey !== req.params.instrumentKey) {
        return error(res, 'instrumentKey 与路径不一致')
      }
      const parsed = situationalStartSchema.safeParse({
        instrumentKey: req.params.instrumentKey,
        instrumentVersion: body.instrumentVersion,
      })
      if (!parsed.success) return error(res, firstZodMessage(parsed.error))
      const data = await startSituationalAttempt(req.user!.userId, parsed.data)
      return success(res, data, '情境化测评已开始')
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '开始情境化测评失败')
    }
  },

  async resume(req: Request, res: Response) {
    try {
      const data = await resumeSituationalAttempt(req.params.attemptId, req.user!.userId)
      return success(res, data, data.attempt.status === 'COMPLETED' ? '情境化测评已完成' : '继续情境化测评')
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '恢复情境化测评失败')
    }
  },

  async result(req: Request, res: Response) {
    try {
      const data = await getSituationalAttemptResult(req.params.attemptId, req.user!.userId)
      return success(res, data)
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '获取情境化测评结果失败')
    }
  },

  async assetContent(req: Request, res: Response) {
    try {
      const runtime = await loadSituationalAttemptRuntime(req.params.attemptId, req.user!.userId)
      return serveFrozenSituationalAsset({
        snapshot: runtime.snapshot,
        assetId: req.params.assetId,
        res,
      })
    } catch (errorValue) {
      if (isInstrumentFinalSubmitError(errorValue)) return instrumentError(res, errorValue.code, errorValue.message, errorValue.statusCode)
      return handleSituationalError(res, errorValue, '读取情境化视觉资产失败')
    }
  },

  async submitFinal(req: Request, res: Response) {
    try {
      const parsed = situationalFinalSubmitSchema.safeParse(req.body)
      if (!parsed.success) return error(res, firstZodMessage(parsed.error))
      const data = await withUnitSubmitAdmission(() => submitSituationalAttemptFinal({
        attemptId: req.params.attemptId,
        userId: req.user!.userId,
        ...parsed.data,
      }))
      const binding = await prisma.situationalAttempt.findUnique({
        where: { id: req.params.attemptId },
        select: { compositeAttemptId: true },
      })
      const responseData = await projectRelationalUnitFinalResponse(binding?.compositeAttemptId, data)
      return success(res, responseData, data.replayed ? '情境化测评提交已确认' : '情境化测评提交成功')
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '最终提交情境化测评失败')
    }
  },

  async history(req: Request, res: Response) {
    try {
      return success(res, await listSituationalHistory(req.user!.userId))
    } catch (errorValue) {
      return handleSituationalError(res, errorValue, '获取情境化测评历史失败')
    }
  },
}
