import { prisma } from '../config/database'
import { encryptToken, hashToken } from './checkinTokenCrypto'

/**
 * Idempotent, application-level migration for legacy plaintext check-in
 * tokens. The raw bearer is cleared only after hash/encrypted values are
 * written in the same row update, so an interrupted run can safely resume.
 */
export async function backfillCheckinTokens(
  db: typeof prisma = prisma,
): Promise<{ processed: number; remaining: number }> {
  let processed = 0

  for (;;) {
    const row = await db.checkinAccessToken.findFirst({
      where: { token: { not: null } },
      select: { id: true, token: true, tokenHash: true, tokenEncrypted: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!row || !row.token) break

    await db.checkinAccessToken.update({
      where: { id: row.id },
      data: {
        tokenHash: row.tokenHash || hashToken(row.token),
        tokenEncrypted: row.tokenEncrypted || encryptToken(row.token),
        token: null,
      },
    })
    processed += 1
  }

  const remaining = await db.checkinAccessToken.count({ where: { token: { not: null } } })
  return { processed, remaining }
}
