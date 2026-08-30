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
    const data = {
      tokenHash: tokenService.hashToken(row.token),
      tokenEncrypted: tokenService.encryptToken(row.token),
      token: null,
    }
    if (typeof (db.questionnaireAccessToken as any).updateMany === 'function') {
      const updated = await (db.questionnaireAccessToken as any).updateMany({
        where: { id: row.id, token: row.token },
        data,
      })
      if (updated.count === 1) processed += 1
    } else {
      await db.questionnaireAccessToken.update({ where: { id: row.id }, data })
      processed += 1
    }
  }
  const remaining = await db.questionnaireAccessToken.count({ where: { token: { not: null } } })
  if (
    remaining === 0
    && typeof (db as any).$queryRaw === 'function'
    && typeof (db as any).$executeRawUnsafe === 'function'
  ) {
    const rows = await (db as any).$queryRaw`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'questionnaire_access_tokens'::regclass
        AND conname IN (
          'questionnaire_access_tokens_token_must_be_null',
          'questionnaire_access_tokens_protected_fields_present'
        )
    `
    const present = new Set((rows as Array<{ conname?: unknown }>).map((row) => row?.conname).filter((name): name is string => typeof name === 'string'))
    for (const constraint of [
      'questionnaire_access_tokens_token_must_be_null',
      'questionnaire_access_tokens_protected_fields_present',
    ]) {
      if (present.has(constraint)) {
        await (db as any).$executeRawUnsafe(
          `ALTER TABLE "questionnaire_access_tokens" VALIDATE CONSTRAINT "${constraint}"`,
        )
      }
    }
  }
  return { processed, remaining }
}
