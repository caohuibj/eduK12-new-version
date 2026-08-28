import { prisma } from '../config/database'
import { backfillAggregateReports } from '../services/aggregateReportBackfillService'

/**
 * Explicit operator-run backfill. It is intentionally not part of the
 * migration so encryption keys never enter migration SQL and a failed run can
 * be resumed safely.
 */
async function main(): Promise<void> {
  const result = await backfillAggregateReports(prisma)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'aggregate report backfill failed'}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
