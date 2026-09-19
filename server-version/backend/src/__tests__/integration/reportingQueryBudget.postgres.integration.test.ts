import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { ReportingCohortSnapshotRecord, ReportingResultBatchV1 } from '../../modules/reporting/types'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'

/**
 * PR3 / A-08 — real PostgreSQL population query-budget gate.
 *
 * Fixture creation is deliberately bulk-oriented and excluded from observation.
 * The measured operation is only resolveAuthoritativeRunResults(). Growing a
 * cohort from 100 to 500 subjects must keep the same three batch operations:
 *   1 raw Run graph read
 *   1 CompositeAssessmentAttempt batch read
 *   1 AssessmentUnitSnapshot batch read
 *
 * Prisma middleware records both the operation shape and the actual array row
 * count returned by each measured batch. This fixes an explicit PR3 budget for
 * call count and returned rows without introducing per-subject instrumentation.
 */
const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

type ObservedPrismaCall = { model?: string; action: string; rows: number | null }
type FixtureMember = {
  userId: string
  membershipId: string
  actorSnapshotId: string
  relationshipSnapshotId: string
  executionId: string
  attemptId: string
}
type PopulationFixture = {
  ownerId: string
  organizationId: string
  runId: string
  trackId: string
  compositeId: string
  members: FixtureMember[]
  cohort: ReportingCohortSnapshotRecord
}

let prisma: PrismaClient
let resolveAuthoritativeRunResults: (cohort: ReportingCohortSnapshotRecord) => Promise<ReportingResultBatchV1>
let observedPrismaCalls: ObservedPrismaCall[] = []
const fixtures: PopulationFixture[] = []

const countCall = (calls: ObservedPrismaCall[], model: string | undefined, action: string): number => (
  calls.filter((call) => call.model === model && call.action === action).length
)

const observe = async <T>(operation: () => Promise<T>): Promise<{ value: T; calls: ObservedPrismaCall[] }> => {
  observedPrismaCalls = []
  const value = await operation()
  return { value, calls: [...observedPrismaCalls] }
}

const buildFixture = async (population: number): Promise<PopulationFixture> => {
  const fixture = await buildReportingFixture(prisma, population)
  fixtures.push(fixture)
  return fixture
}

const destroyFixture = async (fixture: PopulationFixture): Promise<void> => {
  const attemptIds = fixture.members.map((member) => member.attemptId)
  const userIds = fixture.members.map((member) => member.userId)
  await prisma.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
  await prisma.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  await prisma.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_executions WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_relationship_snapshots WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_actor_snapshots WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_tracks WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_runs WHERE id=$1', fixture.runId)
  await prisma.organizationMembership.deleteMany({ where: { organizationId: fixture.organizationId } })
  await prisma.organization.deleteMany({ where: { id: fixture.organizationId } })
  await prisma.user.deleteMany({ where: { id: { in: [...userIds, fixture.ownerId] } } })
}

suite('PR3 reporting result-source query budget (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    resolveAuthoritativeRunResults = (await import('../../modules/reporting/resultSource')).resolveAuthoritativeRunResults
    prisma.$use(async (params, next) => {
      const result = await next(params)
      observedPrismaCalls.push({
        model: params.model,
        action: params.action,
        rows: Array.isArray(result) ? result.length : null,
      })
      return result
    })
  })

  afterAll(async () => {
    for (const fixture of [...fixtures].reverse()) await destroyFixture(fixture)
    await prisma.$disconnect()
  }, 120_000)

  it('A-08 fixes the same batch-call shape and linear returned-row budget for 100 and 500 SUBJECT observations', async () => {
    const oneHundred = await buildFixture(100)
    const fiveHundred = await buildFixture(500)

    const measured100 = await observe(() => resolveAuthoritativeRunResults(oneHundred.cohort))
    const measured500 = await observe(() => resolveAuthoritativeRunResults(fiveHundred.cohort))

    expect(measured100.value.resolved).toHaveLength(100)
    expect(measured500.value.resolved).toHaveLength(500)
    expect(measured100.value.unresolved).toHaveLength(0)
    expect(measured500.value.unresolved).toHaveLength(0)

    for (const [population, measured] of [[100, measured100], [500, measured500]] as const) {
      expect(countCall(measured.calls, undefined, 'queryRaw')).toBe(1)
      expect(countCall(measured.calls, 'CompositeAssessmentAttempt', 'findMany')).toBe(1)
      expect(countCall(measured.calls, 'AssessmentUnitSnapshot', 'findMany')).toBe(1)
      expect(measured.calls).toHaveLength(3)
      expect(measured.calls.map((call) => call.rows)).toEqual([population, population, population])
      expect(measured.calls.reduce((sum, call) => sum + (call.rows ?? 0), 0)).toBe(population * 3)
    }
    expect(measured500.calls.map(({ model, action }) => ({ model, action })))
      .toEqual(measured100.calls.map(({ model, action }) => ({ model, action })))
  }, 120_000)

  it('keeps non-completed executions diagnostic and out of the resolved contribution set', async () => {
    const fixture = await buildFixture(3)
    await prisma.$executeRawUnsafe(
      `UPDATE assessment_run_executions SET status='STARTED', completed_at=NULL WHERE id=$1`,
      fixture.members[0].executionId,
    )
    const result = await resolveAuthoritativeRunResults(fixture.cohort)
    expect(result.resolved).toHaveLength(2)
    expect(result.unresolved).toEqual([{
      executionId: fixture.members[0].executionId,
      subjectUserId: fixture.members[0].userId,
      membershipId: fixture.members[0].membershipId,
      reason: 'NOT_COMPLETED',
    }])
  })

  it('rejects COMPLETED executions whose authoritative runtime result is missing', async () => {
    const fixture = await buildFixture(3)
    await prisma.$executeRawUnsafe(
      `UPDATE assessment_run_executions SET runtime_binding_ref=$2 WHERE id=$1`,
      fixture.members[0].executionId,
      randomUUID(),
    )
    await expect(resolveAuthoritativeRunResults(fixture.cohort))
      .rejects.toMatchObject({ code: 'REPORT_RESULT_INTEGRITY', statusCode: 500 })
  })

  it('rejects authoritative results whose frozen subject/respondent identity belongs to another execution', async () => {
    const fixture = await buildFixture(3)
    await prisma.compositeAssessmentAttempt.update({
      where: { id: fixture.members[0].attemptId },
      data: {
        userId: fixture.members[1].userId,
        subjectUserId: fixture.members[1].userId,
        respondentUserId: fixture.members[1].userId,
      },
    })
    await expect(resolveAuthoritativeRunResults(fixture.cohort))
      .rejects.toMatchObject({ code: 'REPORT_RESULT_INTEGRITY', statusCode: 500 })
  })

  it('rejects COMPLETED runtime attempts that have no canonical UNIT_RESULT snapshot', async () => {
    const fixture = await buildFixture(3)
    await prisma.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: fixture.members[0].attemptId } })
    await expect(resolveAuthoritativeRunResults(fixture.cohort))
      .rejects.toMatchObject({ code: 'REPORT_RESULT_INTEGRITY', statusCode: 500 })
  })
})
