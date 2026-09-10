import type { Request, Response } from 'express'
import { z } from 'zod'
import { error, success, unauthorized } from '../../utils/response'
import { CognitiveServiceError } from './cognitive.errors'
import {
  issueCognitiveSessionVideoCapabilities,
  issuePublicCognitiveSessionVideoCapabilities,
} from './cognitive-video.service'

const requestSchema = z.object({
  videoKey: z.string().regex(/^(instruction|example|stimulus):\d+$/),
}).strict()

const handleVideoError = (res: Response, reason: unknown) => {
  if (reason instanceof CognitiveServiceError) {
    return error(res, reason.message, -1, reason.statusCode)
  }
  return error(res, 'Cognitive video capability issuance failed', -1, 500)
}

export const cognitiveVideoController = {
  async issue(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = requestSchema.parse(req.body)
      return success(res, await issueCognitiveSessionVideoCapabilities({
        userId: req.user.userId,
        sessionId: req.params.id,
        videoKey: input.videoKey,
      }))
    } catch (reason) {
      return handleVideoError(res, reason)
    }
  },

  async publicIssue(req: Request, res: Response) {
    try {
      const recoveryToken = req.headers['x-recovery-token']
      if (typeof recoveryToken !== 'string' || !recoveryToken) {
        return error(res, 'Recovery credential is required', -1, 403)
      }
      const input = requestSchema.parse(req.body)
      return success(res, await issuePublicCognitiveSessionVideoCapabilities({
        recoveryToken,
        sessionId: req.params.id,
        videoKey: input.videoKey,
      }))
    } catch (reason) {
      return handleVideoError(res, reason)
    }
  },
}
