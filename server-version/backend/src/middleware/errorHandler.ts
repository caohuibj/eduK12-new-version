import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'
import { logger } from '../utils/logger'

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const rawStatusCode = Number(err?.statusCode)
  const statusCode = Number.isInteger(rawStatusCode) && rawStatusCode >= 400 && rawStatusCode < 600
    ? rawStatusCode
    : 500

  logger.error('Unhandled request error', {
    statusCode,
    error: err,
  })

  // Prisma error
  if (err.code) {
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

export const notFoundHandler = (req: Request, res: Response) => {
  return error(res, '接口不存在', -1, 404)
}
