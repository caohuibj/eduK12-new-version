import { prisma } from '../config/database'
import { encryptField } from '../utils/encryption'
import { Prisma } from '@prisma/client'

export type AggregateReportBackfillResult = {
  processed: number
  remaining: number
}

/**
 * Move legacy JSON aggregate reports into the encrypted column one row at a
 * time. The old column is cleared only after the encrypted write succeeds.
 */
export const backfillAggregateReports = async (
  db: typeof prisma = prisma,
): Promise<AggregateReportBackfillResult> => {
  const rows = await db.questionnaireAssessment.findMany({
    where: { aggregateReportEncrypted: null, aggregateReport: { not: Prisma.DbNull } },
    select: { id: true, aggregateReport: true },
    orderBy: { id: 'asc' },
  })
  let processed = 0
  for (const row of rows) {
    if (row.aggregateReport === null) continue
    const encrypted = encryptField(row.aggregateReport as Record<string, unknown>)
    await db.questionnaireAssessment.update({
      where: { id: row.id },
      data: { aggregateReportEncrypted: encrypted, aggregateReport: Prisma.DbNull },
    })
    processed += 1
  }
  const remainingRows = await db.questionnaireAssessment.findMany({
    where: { aggregateReportEncrypted: null, aggregateReport: { not: Prisma.DbNull } },
    select: { id: true, aggregateReport: true },
  })
  return { processed, remaining: remainingRows.filter((row) => row.aggregateReport !== null).length }
}
