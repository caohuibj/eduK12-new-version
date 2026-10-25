import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
const isolated=await vi.hoisted(async()=>{
 vi.resetModules()
 const {isolatedTestDatabase}=await import('../fixtures/isolated-test-database')
 return isolatedTestDatabase(['REPORT_OUTBOX_INTEGRATION_DATABASE_URL'],'report_conflict')
})
import { PrismaClient } from '@prisma/client'
import { createReportOutboxFixture } from './report-outbox-fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { REPORT_SUBMISSION_KEY_CONFLICT } from '../../modules/scale/scale-final-submit-conflict'
const url = integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let outbox: typeof import('../../modules/assessment-runtime/report-outbox.service')
let submit: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
const fixtures: Awaited<ReturnType<typeof createReportOutboxFixture>>[] = []
suite('permanent report conflict on isolated PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!); vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS', ''); vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'false')
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    outbox = await import('../../modules/assessment-runtime/report-outbox.service')
    submit = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
  })
  afterAll(async () => {
    for (const f of fixtures) {
      await db.compositeAssessmentAttempt.delete({ where: { id: f.parent.id } })
      await db.compositeAssessment.delete({ where: { id: f.composite.id } })
      await db.scale.deleteMany({ where: { id: { in: f.scaleIds } } })
      await db.user.deleteMany({ where: { id: { in: [f.owner.id, f.participant.id] } } })
    }
    await db?.$disconnect(); vi.unstubAllEnvs(); await isolated.restore()
  })
  it.each(['false', 'true'])('releases budget/lease once and rejects futile retry with atomic finish=%s', async atomic => {
    vi.stubEnv('ASSESSMENT_REPORT_ATOMIC_FINISH_ENABLED', atomic)
    const f = await createReportOutboxFixture(db, 1); fixtures.push(f)
    await submit(f.inputs[0]); const first = await outbox.claimCompositeReportJob(); expect(first).not.toBeNull()
    expect(await outbox.finishCompositeReportJob(first!, { kind: 'retry', errorCode: 'REPORT_GENERATION_FAILED', delayMs: 0 })).toBe(true)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', budgetHeld: true })
    const second = await outbox.claimCompositeReportJob(); expect(second!.attemptCount).toBe(2)
    expect(await outbox.finishCompositeReportJob(second!, { kind: 'failed', errorCode: REPORT_SUBMISSION_KEY_CONFLICT })).toBe(true)
    const final = await outbox.readCompositeReportJob(f.parent.id, 1)
    expect(final).toMatchObject({ status: 'FAILED', errorCode: REPORT_SUBMISSION_KEY_CONFLICT, budgetHeld: false, leaseToken: null })
    expect(outbox.compositeReportJobState(final)).toMatchObject({ state: 'FAILED', errorCode: REPORT_SUBMISSION_KEY_CONFLICT })
    const receipt = await db.assessment.findUniqueOrThrow({ where: { id: f.inputs[0].assessmentId } })
    const budget = await db.compositeReportQueueBudget.findUniqueOrThrow({ where: { id: 'reports' } }); expect(budget.pending).toBe(0)
    await expect(outbox.retryCompositeReport(f.parent)).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409,
      message: '作答已保存，报告需要负责人处理，请勿重复提交或重新生成。' })
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toEqual(final)
    expect(await db.assessment.findUniqueOrThrow({ where: { id: receipt.id } })).toEqual(receipt)
    expect(await db.compositeReportQueueBudget.findUniqueOrThrow({ where: { id: 'reports' } })).toEqual(budget)
    expect(await outbox.claimCompositeReportJob()).toBeNull()
    expect(await outbox.finishCompositeReportJob(second!, { kind: 'ready', reportEncrypted: 'stale', aggregateInputHash: 'stale' })).toBe(false)
    expect(await outbox.finishCompositeReportJob(first!, { kind: 'failed', errorCode: 'stale' })).toBe(false)
    expect(await db.compositeReportQueueBudget.findUniqueOrThrow({ where: { id: 'reports' } })).toEqual(budget)
  })
})
