import { prisma } from '../config/database'
import { tokenService } from './tokenService'

/**
 * Idempotent application-level migration for legacy plaintext questionnaire
 * tokens. It deliberately processes one row at a time so a failure leaves a
 * resumable checkpoint and never puts bearer secrets in migration SQL/logs.
 */
export async function backfillQuestionnaireTokens(db: typeof prisma = prisma): Promise<{ processed: number; remaining: number }> {
  let processed = 0
  for (;;) {
    const row = await db.questionnaireAccessToken.findFirst({
      where: { token: { not: null } },
      select: { id: true, token: true, tokenHash: true, tokenEncrypted: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!row || !row.token) break
    await db.questionnaireAccessToken.update({
      where: { id: row.id },
      data: {
        tokenHash: row.tokenHash || tokenService.hashToken(row.token),
        tokenEncrypted: row.tokenEncrypted || tokenService.encryptToken(row.token),
        token: null,
      },
    })
    processed += 1
  }
  const remaining = await db.questionnaireAccessToken.count({ where: { token: { not: null } } })
  return { processed, remaining }
}
