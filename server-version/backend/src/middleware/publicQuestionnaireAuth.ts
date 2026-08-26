import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { unauthorized } from '../utils/response'
import { hashQuestionnaireResumeToken, questionnaireResumeTokenService } from '../services/questionnaireResumeTokenService'

const getBearerToken = (req: Request): string | null => {
  const value = req.headers.authorization
  if (!value || !value.startsWith('Bearer ')) return null

  const token = value.slice('Bearer '.length).trim()
  return token ? token : null
}

/**
 * Protects the public questionnaire session endpoints.
 * The URL sessionId is only a locator; authorization comes from the
 * server-issued, hashed resume capability in the Authorization header.
 */
export const requireQuestionnaireResume = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getBearerToken(req)
    if (!token) return unauthorized(res, '缺少测评恢复凭据')

    const assessment = await prisma.questionnaireAssessment.findUnique({
      where: { resumeTokenHash: hashQuestionnaireResumeToken(token) },
      select: {
        id: true,
        sessionId: true,
        resumeTokenExpiresAt: true,
      },
    })

    if (
      !assessment ||
      assessment.sessionId !== req.params.sessionId ||
      questionnaireResumeTokenService.isExpired(assessment.resumeTokenExpiresAt)
    ) {
      return unauthorized(res, '测评恢复凭据无效或已过期')
    }

    next()
  } catch (err) {
    next(err)
  }
}
