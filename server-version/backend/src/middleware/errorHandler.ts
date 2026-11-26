import { Request, Response, NextFunction } from 'express'
import { error, instrumentError, completionBusy } from '../utils/response'
import { logger } from '../utils/logger'
import { isAssessmentStartBusyError } from '../modules/composite/start-transient'
import { isAssessmentStartResourceGateError } from '../services/assessmentResourceProtection'

const TRANSIENT_READ_PRISMA_CODES = new Set(['P2024', 'P2028'])
const TRANSIENT_READ_PG_SQLSTATES = new Set(['53300', '57014'])

const isTransientReadContentionError = (err: any): boolean => {
  const code = typeof err?.code === 'string' ? err.code : ''
  if (TRANSIENT_READ_PRISMA_CODES.has(code) || TRANSIENT_READ_PG_SQLSTATES.has(code)) {
    return true
  }
  const metaCode = typeof err?.meta?.code === 'string' ? err.meta.code : ''
  return TRANSIENT_READ_PG_SQLSTATES.has(metaCode)
}

export const errorHandler = (err: any, req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err)
  // Only the shared completion boundary classifies transient DB failures.
  // Preserve its safe retry contract in routes without a local busy mapper.
  if (err?.code === 'COMPLETION_BUSY') return completionBusy(res, err.retryAfterSeconds)
  // Host CPU / memory resource gates reject START before admission; preserve 503 + Retry-After.
  if (isAssessmentStartResourceGateError(err)) {
    const preferred = (err as { preferredRetryAfterSeconds?: number }).preferredRetryAfterSeconds
    const retryAfter = typeof preferred === 'number' && Number.isFinite(preferred) && preferred > 0
      ? Math.ceil(preferred)
      : 10
    res.setHeader('Retry-After', String(retryAfter))
    return instrumentError(res, err.code, err.message, err.statusCode)
  }
  // A Run START transaction that rolled back before committing is safe to retry.
  if (isAssessmentStartBusyError(err)) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds))
    return instrumentError(res, err.code, err.message, 503)
  }
  if (err?.code === 'ASSESSMENT_RUNTIME_UNAVAILABLE' && err?.statusCode === 503) {
    res.setHeader('Retry-After', '5')
    return instrumentError(res, 'ASSESSMENT_RUNTIME_UNAVAILABLE', '测评内容暂时无法读取，作答会保留，请稍后重试。', 503)
  }
  // Idempotent read requests hitting transient DB pool or interactive-transaction wait
  // contention under bursts are safely retryable as 503 SERVICE_BUSY; mutations keep their
  // explicit route boundaries so uncertain writes are never blindly replayed.
  if ((req.method === 'GET' || req.method === 'HEAD') && isTransientReadContentionError(err)) {
    const log = typeof logger.warn === 'function' ? logger.warn.bind(logger) : logger.error.bind(logger)
    log('Transient read contention error', {
      requestId: req.requestId,
      method: req.method,
      code: err?.code,
      metaCode: err?.meta?.code,
    })
    res.setHeader('Retry-After', '1')
    return instrumentError(res, 'SERVICE_BUSY', '服务繁忙，请稍后重试', 503)
  }
  // Body parsers attach input fragments to their errors. Keep the status while
  // excluding the dependency message and body from responses and diagnostics.
  if (err?.type === 'entity.parse.failed' || err?.type === 'querystring.parse.rangeError'
    || err?.type === 'request.size.invalid' || err?.type === 'request.aborted') {
    return error(res, '请求体格式无效', -1, 400)
  }
  if (err?.type === 'entity.too.large' || err?.type === 'parameters.too.many') {
    return error(res, '请求体超过限制', -1, 413)
  }
  if (err?.type === 'charset.unsupported' || err?.type === 'encoding.unsupported') {
    return error(res, '不支持的请求编码', -1, 415)
  }
  const rawStatusCode = Number(err?.statusCode)
  const statusCode = Number.isInteger(rawStatusCode) && rawStatusCode >= 400 && rawStatusCode < 600
    ? rawStatusCode
    : 500

  logger.error('Unhandled request error', {
    requestId: req.requestId,
    statusCode,
    error: err,
  })

  // Prisma error
  if (err?.code) {
    switch (err.code) {
      case 'P2002':
        return error(res, '数据已存在', -1, 409)
      case 'P2025':
        return error(res, '记录不存在', -1, 404)
      case 'P2003':
        return error(res, '外键约束错误', -1, 400)
    }
  }

  // Default error
  // Only explicitly classified client errors may expose their safe message.
  // Unknown failures must not disclose database, filesystem, or dependency details.
  const message = statusCode < 500 && typeof err?.message === 'string'
    ? err.message
    : '服务器内部错误'
  
  return error(res, message, -1, statusCode)
}

export const notFoundHandler = (req: Request & { requestId?: string }, res: Response) => {
  return error(res, '接口不存在', -1, 404)
}
