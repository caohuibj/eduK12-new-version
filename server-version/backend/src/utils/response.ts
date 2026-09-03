import { Response } from 'express'
import { ApiResponse } from '../types'

export const success = <T>(res: Response, data: T, message: string = '操作成功') => {
  const response: ApiResponse<T> = {
    code: 0,
    message,
    data
  }
  return res.json(response)
}

export const error = (res: Response, message: string = '操作失败', code: number = -1, statusCode: number = 400) => {
  const response: ApiResponse = {
    code,
    message,
    data: null,
  }
  return res.status(statusCode).json(response)
}

export const instrumentError = (res: Response, code: string, message: string, statusCode = 409) => (
  res.status(statusCode).json({ code, message, data: null })
)

export const unauthorized = (res: Response, message: string = '未授权') => {
  return error(res, message, -1, 401)
}

export const forbidden = (res: Response, message: string = '无权限') => {
  return error(res, message, -1, 403)
}

export const notFound = (res: Response, message: string = '资源不存在') => {
  return error(res, message, -1, 404)
}

const busyEnvelope = (
  res: Response,
  input: { code: string; message: string; retryAfterSeconds?: number },
) => {
  const retryAfter = Number.isFinite(input.retryAfterSeconds) && (input.retryAfterSeconds ?? 0) > 0
    ? Math.ceil(input.retryAfterSeconds as number)
    : 1
  res.setHeader('Retry-After', String(retryAfter))
  return res.status(503).json({
    code: input.code,
    message: input.message,
    data: null,
  })
}

/** A bounded completion queue is full or expired; clients may retry safely. */
export const completionBusy = (res: Response, retryAfterSeconds = 1) => (
  busyEnvelope(res, {
    code: 'COMPLETION_BUSY',
    message: '测评完成请求繁忙，请稍后重试',
    retryAfterSeconds,
  })
)

/** UNIT FINAL submit admission is full; clients may retry with the same submissionId. */
export const assessmentSubmitBusy = (res: Response, retryAfterSeconds = 1) => (
  busyEnvelope(res, {
    code: 'ASSESSMENT_SUBMIT_BUSY',
    message: '测评提交繁忙，请稍后重试',
    retryAfterSeconds,
  })
)

