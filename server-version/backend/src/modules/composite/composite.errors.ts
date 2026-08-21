export class CompositeServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message)
    this.name = 'CompositeServiceError'
  }
}

export const compositeNotFound = (message = '综合测评不存在') => new CompositeServiceError(message, 404)
export const compositeForbidden = (message = '无权限操作此综合测评') => new CompositeServiceError(message, 403)
export const compositeBadRequest = (message: string) => new CompositeServiceError(message, 400)
export const compositeConflict = (message: string) => new CompositeServiceError(message, 409)
