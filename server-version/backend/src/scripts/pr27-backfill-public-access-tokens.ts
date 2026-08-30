import { prisma } from '../config/database'
import { backfillPublicAccessTokens } from '../services/publicAccessTokenBackfillService'

/** Explicit operator-run backfill; never part of generic SQL migration. */
async function main(): Promise<void> {
  const result = await backfillPublicAccessTokens(prisma)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'public access-token backfill failed'}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
