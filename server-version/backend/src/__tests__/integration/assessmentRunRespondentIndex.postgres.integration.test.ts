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

  it('has a valid, ready respondent+created_at DESC index with the migration-intended definition', async () => {
    // pg_index, not pg_indexes: a failed CONCURRENTLY build leaves an INVALID
    // index of the same name, which must not count as present.
    const rows = await db.$queryRawUnsafe<Array<{ indisvalid: boolean; indisready: boolean; indexdef: string }>>(
      `SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) AS indexdef
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = 'assessment_run_executions_respondent_created_idx'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indisvalid).toBe(true)
    expect(rows[0].indisready).toBe(true)
    expect(rows[0].indexdef).toMatch(/ ON (\w+\.)?assessment_run_executions USING btree \(respondent_actor_snapshot_id, created_at DESC\)$/)
  }, 30000)
})
