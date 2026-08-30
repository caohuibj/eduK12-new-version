import { prisma } from '../config/database'
import {
  encryptPublicAccessToken,
  hashPublicAccessToken,
} from './publicAccessTokenCrypto'

type TokenDelegate = {
  findFirst: (args: unknown) => Promise<{ id: string; token: string | null } | null>
  count: (args: unknown) => Promise<number>
  update?: (args: unknown) => Promise<unknown>
  updateMany?: (args: unknown) => Promise<{ count: number }>
}

type BackfillResult = { processed: number; remaining: number }

const validateConstraints = async (
  db: any,
  table: string,
  constraints: [string, string],
  remaining: number,
): Promise<void> => {
  if (remaining !== 0 || typeof db?.$queryRawUnsafe !== 'function' || typeof db?.$executeRawUnsafe !== 'function') return

  const rows = await db.$queryRawUnsafe(
    `SELECT conname FROM pg_constraint WHERE conrelid = '${table}'::regclass AND conname IN ('${constraints[0]}','${constraints[1]}')`,
  ) as Array<{ conname?: unknown }>
  const present = new Set(rows.map((row) => row?.conname).filter((name): name is string => typeof name === 'string'))
  for (const constraint of constraints) {
    if (present.has(constraint)) {
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`)
    }
  }
}

const backfillTokenTable = async (
  db: any,
  delegate: TokenDelegate,
  table: string,
  constraints: [string, string],
): Promise<BackfillResult> => {
  let processed = 0
  for (;;) {
    const row = await delegate.findFirst({
      where: { token: { not: null } },
      select: { id: true, token: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!row || !row.token) break

    const data = {
      token: null,
      tokenHash: hashPublicAccessToken(row.token),
      tokenEncrypted: encryptPublicAccessToken(row.token),
    }
    if (typeof delegate.updateMany === 'function') {
      const updated = await delegate.updateMany({
        where: { id: row.id, token: row.token },
        data,
      })
      if (updated.count === 1) processed += 1
    } else if (typeof delegate.update === 'function') {
      await delegate.update({ where: { id: row.id }, data })
      processed += 1
    } else {
      throw new Error(`${table} backfill delegate does not support update`)
    }
  }

  const remaining = await delegate.count({ where: { token: { not: null } } })
  await validateConstraints(db, table, constraints, remaining)
  return { processed, remaining }
}

/**
 * Idempotent, resumable migration for every public bearer-token table.  The
 * plaintext column is cleared in the same conditional update that writes the
 * hash and encrypted management copy, so concurrent operators cannot lose a
 * token or accidentally overwrite a newer backfill result.
 */
export async function backfillPublicAccessTokens(db: typeof prisma = prisma) {
  const questionnaire = await backfillTokenTable(
    db,
    db.questionnaireAccessToken as any,
    'questionnaire_access_tokens',
    ['questionnaire_access_tokens_token_must_be_null', 'questionnaire_access_tokens_protected_fields_present'],
  )
  const checkin = await backfillTokenTable(
    db,
    db.checkinAccessToken as any,
    'checkin_access_tokens',
    ['checkin_access_tokens_token_must_be_null', 'checkin_access_tokens_protected_fields_present'],
  )
  const composite = await backfillTokenTable(
    db,
    db.compositeAssessmentAccessToken as any,
    'composite_assessment_access_tokens',
    ['composite_assessment_access_tokens_token_must_be_null', 'composite_assessment_access_tokens_protected_fields_present'],
  )
  const cognitive = await backfillTokenTable(
    db,
    db.cognitiveAccessToken as any,
    'cognitive_access_tokens',
    ['cognitive_access_tokens_token_must_be_null', 'cognitive_access_tokens_protected_fields_present'],
  )
  return { questionnaire, checkin, composite, cognitive }
}
