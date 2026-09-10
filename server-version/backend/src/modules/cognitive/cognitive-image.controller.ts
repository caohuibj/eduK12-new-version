import type { Request, Response } from 'express'
import { error, unauthorized } from '../../utils/response'
import { CognitiveServiceError } from './cognitive.errors'
import {
  serveCognitiveSessionImage,
  servePublicCognitiveSessionImage,
} from './cognitive-image.service'

const handleImageError = (res: Response, reason: unknown) => {
  if (reason instanceof CognitiveServiceError) {
    return error(res, reason.message, -1, reason.statusCode)
  }
  return error(res, 'Cognitive image delivery failed', -1, 500)
}

export const cognitiveImageController = {
  async content(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return await serveCognitiveSessionImage({
        userId: req.user.userId,
        sessionId: req.params.id,
        assetId: req.params.assetId,
        res,
      })
    } catch (reason) {
      return handleImageError(res, reason)
    }
  },

  async publicContent(req: Request, res: Response) {
    try {
      const recoveryToken = req.headers['x-recovery-token']
      if (typeof recoveryToken !== 'string' || !recoveryToken) {
        return error(res, 'Recovery credential is required', -1, 403)
      }
      return await servePublicCognitiveSessionImage({
        recoveryToken,
        sessionId: req.params.id,
        assetId: req.params.assetId,
        res,
      })
    } catch (reason) {
      return handleImageError(res, reason)
    }
  },
}
