import { prisma } from '../config/database'
import { backfillCheckinTokens } from '../services/checkinTokenBackfillService'

/** Explicit operator-run backfill; never part of generic SQL migration. */
async function main(): Promise<void> {
  const result = await backfillCheckinTokens(prisma)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'check-in token backfill failed'}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
