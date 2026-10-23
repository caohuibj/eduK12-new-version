import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ZodError } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupPrivateFormExecutionFixture } from './educationPrivateFormExecutionFixture'
import { listOwnTeacherPrivateFormTaskPage } from '../../modules/huiteacher/privateFormRuntime.routes'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
suite('Teacher private Form actual task pagination', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it('returns every real published task exactly once across timestamp ties and binds cursors to the current actor', async () => {
    // Real author freeze, parent-bound track attachment and publication; no fabricated executions.
    const f = await setupPrivateFormExecutionFixture(db, 'TEACHER', 'SELF', 102)
    // Deliberately retain PostgreSQL microseconds beyond JavaScript Date precision.
    await db.$executeRaw`UPDATE assessment_run_executions SET created_at=TIMESTAMPTZ '2026-10-22 01:02:03.123456+00' WHERE run_id=${f.runId}`
    const expected = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM assessment_run_executions WHERE run_id=${f.runId} ORDER BY created_at DESC,id DESC`
    expect(expected).toHaveLength(102)
    const first = await listOwnTeacherPrivateFormTaskPage(f.participantUserId, { pageSize: 50 })
    expect(first.list).toHaveLength(50); expect(first.nextCursor).toEqual(expect.any(String))
    await expect(listOwnTeacherPrivateFormTaskPage(f.managerUserId, { pageSize: 50, cursor: first.nextCursor! })).rejects.toBeInstanceOf(ZodError)
    const second = await listOwnTeacherPrivateFormTaskPage(f.participantUserId, { pageSize: 50, cursor: first.nextCursor! })
    expect(second.list).toHaveLength(50); expect(second.nextCursor).toEqual(expect.any(String))
    const third = await listOwnTeacherPrivateFormTaskPage(f.participantUserId, { pageSize: 50, cursor: second.nextCursor! })
    expect(third.list).toHaveLength(2); expect(third.nextCursor).toBeNull()
    const ids = [...first.list, ...second.list, ...third.list].map(task => task.executionId)
    expect(new Set(ids).size).toBe(102); expect(ids).toEqual(expected.map(task => task.id))
    await db.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      userId: f.participantUserId, permission: 'RUN_START', reason: 'Synthetic pagination current-authority check', deniedByUserId: f.managerUserId } })
    const denied = await listOwnTeacherPrivateFormTaskPage(f.participantUserId, { pageSize: 50, cursor: first.nextCursor! })
    expect(denied).toEqual({ list: [], nextCursor: null })
    expect(await db.compositeAssessmentAttempt.count({ where: { userId: f.participantUserId } })).toBe(0)
  }, 300_000)
})
