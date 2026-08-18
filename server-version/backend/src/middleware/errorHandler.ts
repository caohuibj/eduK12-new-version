import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err)

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
  const message = err.message || '服务器内部错误'
  const statusCode = err.statusCode || 500
  
  return error(res, message, -1, statusCode)
}

export const notFoundHandler = (req: Request, res: Response) => {
  return error(res, '接口不存在', -1, 404)
}
