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

    // Conditional update makes concurrent operators harmless: only the
    // process that still sees this plaintext value clears it.
    const data = {
      tokenHash: row.tokenHash || hashToken(row.token),
      tokenEncrypted: row.tokenEncrypted || encryptToken(row.token),
      token: null,
    }
    if (typeof (db.checkinAccessToken as any).updateMany === 'function') {
      const updated = await db.checkinAccessToken.updateMany({
        where: { id: row.id, token: row.token },
        data,
      })
      if (updated.count === 1) processed += 1
    } else {
      // Lightweight unit-test doubles and older migration runners may expose
      // only update(). The production Prisma client always takes the
      // conditional updateMany path above.
      await db.checkinAccessToken.update({ where: { id: row.id }, data })
      processed += 1
    }
  }

  const remaining = await db.checkinAccessToken.count({ where: { token: { not: null } } })
  if (remaining === 0 && typeof (db as any).$executeRaw === 'function') {
    // The migration installs this check as NOT VALID so legacy rows can be
    // backfilled safely. Once no plaintext remains, validate it to make the
    // invariant explicit for future writes and for the release record.
    await (db as any).$executeRaw`
      ALTER TABLE "checkin_access_tokens"
      VALIDATE CONSTRAINT "checkin_access_tokens_token_must_be_null"
    `
  }
  return { processed, remaining }
}
