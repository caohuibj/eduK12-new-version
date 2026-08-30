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
      // Recompute even when a legacy hash is present: a stale/corrupt hash
      // must not be preserved when the plaintext is removed.
      tokenHash: hashToken(row.token),
      // Re-encrypt every legacy plaintext value instead of trusting an
      // existing ciphertext.  A stale/corrupt ciphertext may otherwise
      // survive after the bearer is removed and become unrecoverable.
      tokenEncrypted: encryptToken(row.token),
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
  if (
    remaining === 0
    && typeof (db as any).$queryRaw === 'function'
    && typeof (db as any).$executeRawUnsafe === 'function'
  ) {
    // Both constraints are installed as NOT VALID so deployment can first
    // migrate historical rows. Validate only constraints that exist, which
    // keeps this resumable runner compatible with databases upgraded from a
    // release before the protected-fields constraint was introduced.
    const rows = await (db as any).$queryRaw`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'checkin_access_tokens'::regclass
        AND conname IN (
          'checkin_access_tokens_token_must_be_null',
          'checkin_access_tokens_protected_fields_present'
        )
    `
    const present = new Set((rows as Array<{ conname?: unknown }>).map((row) => row?.conname).filter((name): name is string => typeof name === 'string'))
    for (const constraint of [
      'checkin_access_tokens_token_must_be_null',
      'checkin_access_tokens_protected_fields_present',
    ]) {
      if (present.has(constraint)) {
        await (db as any).$executeRawUnsafe(
          `ALTER TABLE "checkin_access_tokens" VALIDATE CONSTRAINT "${constraint}"`,
        )
      }
    }
  }
  return { processed, remaining }
}
