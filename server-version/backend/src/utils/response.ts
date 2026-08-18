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
    message
  }
  return res.status(statusCode).json(response)
}

export const unauthorized = (res: Response, message: string = '未授权') => {
  return error(res, message, -1, 401)
}

export const forbidden = (res: Response, message: string = '无权限') => {
  return error(res, message, -1, 403)
}

export const notFound = (res: Response, message: string = '资源不存在') => {
  return error(res, message, -1, 404)
}
