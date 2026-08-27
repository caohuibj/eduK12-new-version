import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

const DEFAULT_RESUME_TTL_MS = 24 * 60 * 60 * 1000

export const hashQuestionnaireResumeToken = (token: string): string => {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const getResumeExpiry = (accessTokenExpiresAt: Date, now = Date.now()): Date => {
  const configuredExpiry = now + DEFAULT_RESUME_TTL_MS
  return new Date(Math.min(accessTokenExpiresAt.getTime(), configuredExpiry))
}

export const questionnaireResumeTokenService = {
  async issue(
    assessmentId: string,
    accessTokenExpiresAt: Date,
    db: typeof prisma | Prisma.TransactionClient = prisma,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = getResumeExpiry(accessTokenExpiresAt)

    await db.questionnaireAssessment.update({
      where: { id: assessmentId },
      data: {
        resumeTokenHash: hashQuestionnaireResumeToken(token),
        resumeTokenExpiresAt: expiresAt,
      },
    })

    return token
  },

  /**
   * Rotate a capability only if the presented hash is still current. This
   * makes two concurrent resume requests a compare-and-swap: one succeeds and
   * the other cannot reuse the old capability.
   */
  async rotate(
    assessmentId: string,
    currentToken: string,
    accessTokenExpiresAt: Date,
    db: typeof prisma | Prisma.TransactionClient = prisma,
  ): Promise<string | null> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = getResumeExpiry(accessTokenExpiresAt)
    const updated = await db.questionnaireAssessment.updateMany({
      where: {
        id: assessmentId,
        resumeTokenHash: hashQuestionnaireResumeToken(currentToken),
        resumeTokenExpiresAt: { gt: new Date() },
        status: 'IN_PROGRESS',
      },
      data: {
        resumeTokenHash: hashQuestionnaireResumeToken(token),
        resumeTokenExpiresAt: expiresAt,
      },
    })

    return updated.count === 1 ? token : null
  },

  isExpired(expiresAt: Date | null): boolean {
    return !expiresAt || expiresAt.getTime() <= Date.now()
  },
}
