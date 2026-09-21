import type { Request, Response } from 'express'
import { error, success, unauthorized } from '../../utils/response'
import { CognitiveServiceError } from './cognitive.errors'
import { publishCognitiveConfig, retireCognitiveConfig } from './release.service'

const handleReleaseError = (res: Response, err: unknown) => {
  if (err instanceof CognitiveServiceError) {
    return error(res, err.message, -1, err.statusCode)
  }
  return error(res, 'Cognitive config lifecycle operation failed', -1, 500)
}

/** Admin-only product lifecycle actions. Authorization is enforced by routes. */
export const cognitiveReleaseController = {
  async publishConfig(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await publishCognitiveConfig(req.params.id)
      return success(res, data, '认知测验配置已发布')
    } catch (err) {
      return handleReleaseError(res, err)
    }
  },

  async retireConfig(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await retireCognitiveConfig(req.params.id)
      return success(res, data, '认知测验配置已退役')
    } catch (err) {
      return handleReleaseError(res, err)
    }
  },
}
