import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { reconcileLockedRunExecutionInTransaction } from '../../modules/assessment-run/reconcile'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip

suite('Run completion timestamps on real PostgreSQL', () => {
  afterAll(async () => { await prisma.$disconnect() })

  it('reconciles an exact completed assignment using UTC regardless of session timezone', async () => {
    requireIsolatedReleaseDatabase(url!)
    const completedAt = new Date('2026-11-25T03:48:01.451Z')
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Tokyo'`
      // Project the actual column types from the migrated schema. Only these
      // disposable rows are needed to exercise the Run completion statement.
      await tx.$executeRaw`CREATE TEMP TABLE assessment_run_executions ON COMMIT DROP AS
        SELECT id, status, completed_at, updated_at FROM public.assessment_run_executions WHERE false`
      await tx.$executeRaw`CREATE TEMP TABLE relational_assessment_assignments ON COMMIT DROP AS
        SELECT id, status, policy_domain, completed_at, updated_at FROM public.relational_assessment_assignments WHERE false`
      await tx.$executeRaw`INSERT INTO assessment_run_executions (id, status)
        VALUES ('same-run', 'STARTED'), ('different-run', 'STARTED'), ('new-run', 'STARTED')`
      await tx.$executeRaw`INSERT INTO relational_assessment_assignments (id, status, policy_domain, completed_at)
        VALUES ('same-assignment', 'COMPLETED', 'ORGANIZATION_RUN', TIMESTAMP '2026-11-25 03:48:01.451'),
          ('different-assignment', 'COMPLETED', 'ORGANIZATION_RUN', TIMESTAMP '2026-11-25 03:48:01.452'),
          ('new-assignment', 'STARTED', 'ORGANIZATION_RUN', NULL)`

      const reconcile = (key: string) => {
        const assignmentRef = `${key}-assignment`
        const attemptId = `${key}-attempt`
        return reconcileLockedRunExecutionInTransaction(tx, {
          id: `${key}-run`, status: 'STARTED', completedAt: null,
          relationalAssignmentId: assignmentRef, runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: attemptId,
        }, { id: attemptId, status: 'COMPLETED', completedAt, assignmentRef })
      }

      const expected = { state: 'COMPLETED', completedAt, replayed: false }
      await expect(reconcile('same')).resolves.toEqual(expected)
      await expect(reconcile('new')).resolves.toEqual(expected)
      await expect(reconcile('different')).rejects.toMatchObject({ code: 'RUN_RECONCILIATION_CONFLICT' })
      const [timestamps] = await tx.$queryRaw<Array<{ run: string; assignment: string }>>`
        SELECT to_char(run.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') AS run,
          to_char(assignment.completed_at, 'YYYY-MM-DD HH24:MI:SS.MS') AS assignment
        FROM assessment_run_executions run, relational_assessment_assignments assignment
        WHERE run.id = 'new-run' AND assignment.id = 'new-assignment'
      `
      expect(timestamps).toEqual({ run: '2026-11-25 03:48:01.451', assignment: '2026-11-25 03:48:01.451' })
    })
  })
})
