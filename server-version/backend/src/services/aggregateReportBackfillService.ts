import { prisma } from '../config/database'
import { decryptField, encryptField } from '../utils/encryption'
import { Prisma } from '@prisma/client'

export type AggregateReportBackfillResult = {
  processed: number
  remaining: number
}

/**
 * Move legacy JSON aggregate reports into the encrypted column one row at a
 * time. Rows with both columns populated are verified before the old column
 * is cleared; a malformed ciphertext aborts the run rather than silently
 * replacing potentially authoritative data.
 */
export const backfillAggregateReports = async (
  db: typeof prisma = prisma,
): Promise<AggregateReportBackfillResult> => {
  const rows = await db.questionnaireAssessment.findMany({
    where: { aggregateReport: { not: Prisma.DbNull } },
    select: { id: true, aggregateReport: true, aggregateReportEncrypted: true },
    orderBy: { id: 'asc' },
  })
  let processed = 0
  for (const row of rows) {
    if (row.aggregateReport === null) continue
    let encrypted = row.aggregateReportEncrypted
    if (!encrypted) {
      encrypted = encryptField(row.aggregateReport as Record<string, unknown>)
    }
    // Verify the exact ciphertext that will be retained before clearing the
    // legacy column, including newly encrypted rows.
    try {
      const verified = decryptField<Record<string, unknown>>(encrypted)
      if (!verified || typeof verified !== 'object') {
        throw new Error('invalid aggregate report payload')
      }
    } catch {
      throw new Error(`aggregate report ciphertext is invalid for assessment ${row.id}`)
    }
    await db.questionnaireAssessment.update({
      where: { id: row.id },
      data: { aggregateReportEncrypted: encrypted, aggregateReport: Prisma.DbNull },
    })
    processed += 1
  }
  const remainingRows = await db.questionnaireAssessment.findMany({
    where: { aggregateReport: { not: Prisma.DbNull } },
    select: { id: true, aggregateReport: true },
  })
  return { processed, remaining: remainingRows.filter((row) => row.aggregateReport !== null).length }
}
