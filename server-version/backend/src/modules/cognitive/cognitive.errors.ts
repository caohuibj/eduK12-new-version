/**
 * Cognitive 服务层共享业务错误（D3 起）。
 * 带 statusCode 的业务错误，controller 统一映射为 HTTP 状态。
 */

export class CognitiveServiceError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'CognitiveServiceError'
    this.statusCode = statusCode
  }
}

export const NOT_FOUND = (msg: string) => new CognitiveServiceError(msg, 404)
export const FORBIDDEN = (msg: string) => new CognitiveServiceError(msg, 403)
export const BAD_REQUEST = (msg: string) => new CognitiveServiceError(msg, 400)
export const CONFLICT = (msg: string) => new CognitiveServiceError(msg, 409)
export const SERVER_ERROR = (msg: string) => new CognitiveServiceError(msg, 500)
