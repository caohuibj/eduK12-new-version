import { PrismaClient } from '@prisma/client'

// Run against an isolated restore before `prisma migrate deploy`. This check
// is intentionally read-only and refuses to continue if the legacy migration
// would touch any existing assessment/scale data.
const prisma = new PrismaClient()
const tables = ['assessments', 'scales', 'scale_items', 'dimensions']
const destructiveMigration = '20260827100000_scale_assessment_v2_foundation'
try {
  // The legacy-row check protects the one destructive migration. Once that
  // migration has completed successfully, applying the guard again must not
  // block every later migration merely because the old tables are still
  // present (or contain compatibility data).
  const migrationTableRows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS exists
  `
  const migrationTableExists = Boolean(migrationTableRows[0]?.exists)
  let destructiveMigrationApplied = false
  if (migrationTableExists) {
    const migrationRows = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE migration_name = ${destructiveMigration}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      ) AS applied
    `
    destructiveMigrationApplied = Boolean(migrationRows[0]?.applied)
  }

  if (destructiveMigrationApplied) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'destructive_migration_already_applied',
      migration: destructiveMigration,
    }))
  } else {
    const counts = {}
    for (const table of tables) {
      const existsRows = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}
        ) AS exists
      `
      if (!existsRows[0]?.exists) {
        counts[table] = 0
        continue
      }
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`)
      counts[table] = Number(rows[0]?.count || 0)
    }
    const unsafe = Object.entries(counts).filter(([, count]) => count !== 0)
    if (unsafe.length) {
      throw new Error(`PR24 migration preflight refused: legacy rows present (${unsafe.map(([table, count]) => `${table}=${count}`).join(', ')})`)
    }
    console.log(JSON.stringify({ ok: true, counts }))
  }
} finally {
  await prisma.$disconnect()
}
