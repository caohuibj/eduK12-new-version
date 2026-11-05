import { afterAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'

/**
 * Migration-presence check for the respondent-direct execution lookup index
 * (20261106090000_assessment_run_executions_respondent_created_idx). This is
 * intentionally minimal: the index is transparent to query results, so the
 * suite only asserts the index exists on the isolated integration database
 * with the exact definition the migration intends. Performance evidence for
 * the index lives in the PR review notes (non-empty authorized success path
 * at 1M executions: service median 7,051 ms -> 45 ms, identical returned ID
 * set/order, unauthorized identity empty; LEGACY product-domain fixture
 * caveat documented there).
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip

suite('assessment_run_executions respondent index migration (real PostgreSQL)', () => {
  afterAll(async () => {
    await db.$disconnect()
  })

  it('has the respondent+created_at DESC index with the migration-intended definition', async () => {
    const rows = await db.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes
       WHERE indexname = 'assessment_run_executions_respondent_created_idx'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('assessment_run_executions')
    expect(rows[0].indexdef).toContain('respondent_actor_snapshot_id')
    expect(rows[0].indexdef).toContain('created_at DESC')
  }, 30000)
})
