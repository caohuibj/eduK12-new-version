import { PrismaClient } from '@prisma/client'

// Run against an isolated restore before `prisma migrate deploy`. This check
// is intentionally read-only and refuses to continue if the legacy migration
// would touch any existing assessment/scale data.
const prisma = new PrismaClient()
const tables = ['assessments', 'scales', 'scale_items', 'dimensions']
try {
  const counts = {}
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`)
    counts[table] = Number(rows[0]?.count || 0)
  }
  const unsafe = Object.entries(counts).filter(([, count]) => count !== 0)
  if (unsafe.length) {
    throw new Error(`PR24 migration preflight refused: legacy rows present (${unsafe.map(([table, count]) => `${table}=${count}`).join(', ')})`)
  }
  console.log(JSON.stringify({ ok: true, counts }))
} finally {
  await prisma.$disconnect()
}
