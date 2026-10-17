import { Request, Response, NextFunction } from 'express'
import { error, instrumentError, completionBusy } from '../utils/response'
import { logger } from '../utils/logger'

export const errorHandler = (err: any, req: Request & { requestId?: string }, res: Response, _next: NextFunction) => {
  // Only the shared completion boundary classifies transient DB failures.
  // Preserve its safe retry contract in routes without a local busy mapper.
  if (err?.code === 'COMPLETION_BUSY') return completionBusy(res, err.retryAfterSeconds)
  if (err?.code === 'ASSESSMENT_RUNTIME_UNAVAILABLE' && err?.statusCode === 503) {
    res.setHeader('Retry-After', '5')
    return instrumentError(res, 'ASSESSMENT_RUNTIME_UNAVAILABLE', '测评内容暂时无法读取，作答会保留，请稍后重试。', 503)
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
