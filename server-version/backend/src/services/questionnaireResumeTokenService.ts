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

  isExpired(expiresAt: Date | null): boolean {
    return !expiresAt || expiresAt.getTime() <= Date.now()
  },
}
