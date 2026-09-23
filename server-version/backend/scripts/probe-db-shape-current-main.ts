/** Read-only PostgreSQL shape snapshot for an isolated PERF-01 measurement. */
import { PrismaClient } from '@prisma/client'

if (process.env.PERF_ISOLATED_TEST_MODE !== '1') throw new Error('database shape probe requires isolated test mode')
const databaseUrl = new URL(process.env.DATABASE_URL || '')
if (!process.env.PERF_FIXTURE_DB_NAME || decodeURIComponent(databaseUrl.pathname.slice(1)) !== process.env.PERF_FIXTURE_DB_NAME) {
  throw new Error('PERF_FIXTURE_DB_NAME must match DATABASE_URL')
}
const tables = [
  'users', 'scales', 'assessments', 'situational_attempts', 'situational_raw_submissions',
  'cognitive_sessions', 'cognitive_raw_submissions', 'questionnaire_assessments',
  'questionnaire_form_section_attempts', 'composite_assessment_attempts',
  'composite_form_section_attempts', 'assessment_unit_snapshots',
  'relational_assessment_assignments',
] as const
async function main() {
const db = new PrismaClient()
try {
  const version = await db.$queryRawUnsafe<Array<{ version: string }>>('SELECT current_setting(\'server_version\') AS version')
  const tableStats = await db.$queryRawUnsafe<Array<{
    relname: string; n_live_tup: bigint; last_analyze: Date | null; last_autoanalyze: Date | null
  }>>(`SELECT relname, n_live_tup, last_analyze, last_autoanalyze FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND relname IN (${tables.map((table) => `'${table}'`).join(',')})`)
  const indexRows = await db.$queryRawUnsafe<Array<{ tablename: string; indexname: string }>>(
    `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'
      AND tablename IN (${tables.map((table) => `'${table}'`).join(',')}) ORDER BY tablename, indexname`,
  )
  const results = []
  for (const table of tables) {
    const count = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${table}"`)
    const exactRows = Number(count[0]?.count)
    if (!Number.isSafeInteger(exactRows)) throw new Error(`unsafe row count for ${table}`)
    const stats = tableStats.find((row) => row.relname === table)
    results.push({
      table, exactRows, estimatedLiveRows: Number(stats?.n_live_tup ?? 0),
      lastAnalyze: stats?.last_analyze?.toISOString() ?? null,
      lastAutoAnalyze: stats?.last_autoanalyze?.toISOString() ?? null,
      indexes: indexRows.filter((row) => row.tablename === table).map((row) => row.indexname),
    })
  }
  console.log(JSON.stringify({ postgresVersion: version[0]?.version ?? 'unknown', capturedAt: new Date().toISOString(), tables: results }))
} finally {
  await db.$disconnect()
}
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
