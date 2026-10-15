import { createReportOutboxFixture } from './report-outbox-fixture'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient, type CompositeReportJob } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

const url = integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let outbox: typeof import('../../modules/assessment-runtime/report-outbox.service')
let service: typeof import('../../modules/composite/composite.service')
let submit: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let processJob: typeof import('../../workers/compositeReportWorker')['processCompositeReportJob']
const users: string[] = [], scales: string[] = [], composites: string[] = [], attempts: string[] = []

const fixture = async (units = 1) => {
  const f = await createReportOutboxFixture(db, units)
  users.push(f.owner.id, f.participant.id); composites.push(f.composite.id)
  attempts.push(f.parent.id); scales.push(...f.scaleIds)
  return f
}

const claim = async (): Promise<CompositeReportJob> => {
  const job = await outbox.claimCompositeReportJob()
  if (!job) throw new Error('No pending fixture job')
  return job
}
const budget = async () => (await db.compositeReportQueueBudget.findUniqueOrThrow({ where: { id: 'reports' } })).pending
const identity = (job: CompositeReportJob) => ({ attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash })

suite('durable report outbox on isolated PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS', '')
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '200')
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
    outbox = await import('../../modules/assessment-runtime/report-outbox.service')
    service = await import('../../modules/composite/composite.service')
    submit = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
    processJob = (await import('../../workers/compositeReportWorker')).processCompositeReportJob
  }, 30_000)

  afterEach(async () => {
    // This job uses a disposable database and runs without file parallelism.
    // Remove only this file's queued fixtures and release their actual permits.
    const cleanupAttempts = attempts
    const held = await db.compositeReportJob.count({ where: { attemptId: { in: cleanupAttempts }, budgetHeld: true } })
    await db.$transaction(async tx => {
      await tx.compositeReportJob.deleteMany({ where: { attemptId: { in: cleanupAttempts } } })
      if (held) await tx.compositeReportQueueBudget.update({ where: { id: 'reports' }, data: { pending: { decrement: held } } })
    })
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '200')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
  })

  afterAll(async () => {
    if (db) {
      // Delete attempts before definition items: the child item FK is RESTRICT.
      await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attempts } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: composites } } })
      await db.scale.deleteMany({ where: { id: { in: scales } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
    }
    await db?.$disconnect()
    vi.unstubAllEnvs()
  })

  it('commits the answer receipt and outbox together; response loss replays the same submission', async () => {
    const f = await fixture()
    const first = await submit(f.inputs[0])
    expect(first.submissionId).toBe(f.inputs[0].submissionId)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(1)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', budgetHeld: true, requestedRevision: 1 })
    const replay = await submit(f.inputs[0])
    expect(replay.replayed).toBe(true)
    expect(replay.payloadHash).toBe(first.payloadHash)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(1)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.requestedRevision).toBe(1)
    await expect(submit({ ...f.inputs[0], answers: f.inputs[0].answers.map(answer => ({ ...answer, responseValue: 'no' })) })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    // No Redis notification or report GET is needed to recover this committed job.
    await processJob(await claim())
    const report = await service.getReport(f.parent.id, { userId: f.participant.id })
    expect(report.unitReports).toHaveLength(1)
    expect(report.unitReports[0].scores[0].value).toBe(3)
    expect(await budget()).toBe(0)
  })

  it('rejects overload before ACK and rolls back both answer completion and the outbox', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '1')
    const a = await fixture(), b = await fixture()
    await submit(a.inputs[0])
    await expect(submit(b.inputs[0])).rejects.toMatchObject({ code: 'COMPLETION_BUSY' })
    expect(await db.assessment.findUnique({ where: { id: b.inputs[0].assessmentId } })).toMatchObject({ status: 'IN_PROGRESS', submissionId: null })
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: b.parent.id } })).toBe(0)
    expect(await outbox.readCompositeReportJob(b.parent.id, 1)).toBeNull()
    expect(await budget()).toBe(1)
    await processJob(await claim())
    await submit(b.inputs[0])
    await processJob(await claim())
    expect(await budget()).toBe(0)
  })

  it('does not lose a last-unit notification while an incomplete report scan is in flight', async () => {
    const f = await fixture(2)
    await submit(f.inputs[0])
    const old = await claim()
    expect((await service.finalizeCompositeAttemptIfReady(f.parent.id, { reportJob: identity(old) }))?.status).toBe('IN_PROGRESS')
    await submit(f.inputs[1])
    await outbox.finishCompositeReportJob(old, { kind: 'waiting' })
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', requestedRevision: 2, budgetHeld: true })
    await processJob(await claim())
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(2)
    expect(await budget()).toBe(0)
  })

  it('recovers an actual killed lease owner without resubmitting answers', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const child = spawn(process.execPath, ['-e', "const o=require('./dist/modules/assessment-runtime/report-outbox.service'); o.claimCompositeReportJob().then(j=>{process.send({id:j.id,token:j.leaseToken});setInterval(()=>{},1000)}).catch(e=>{process.send({error:String(e)});process.exit(1)})"],
      { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    let failureTimer: ReturnType<typeof setTimeout> | undefined
    const message = await Promise.race([
      once(child, 'message').then(([value]) => value as { id?: string; token?: string; error?: string }),
      new Promise<never>((_, reject) => { failureTimer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Fixture worker claim timeout')) }, 10_000) }),
    ])
    if (failureTimer) clearTimeout(failureTimer)
    expect(message.error).toBeUndefined()
    const old = await db.compositeReportJob.findUniqueOrThrow({ where: { id: message.id! } })
    child.kill('SIGKILL')
    await once(child, 'close')
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } })
    const recovered = await claim()
    expect(recovered.leaseToken).not.toBe(old.leaseToken)
    await processJob(recovered)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'STALE_WRITER' })).toBe(false)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(1)
    expect(await budget()).toBe(0)
  }, 20_000)

  it('recovers after canonical completion commits but before the job ACK and publishes once', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const old = await claim()
    await service.finalizeCompositeAttemptIfReady(f.parent.id, { reportJob: identity(old) })
    const completed = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: f.parent.id } })
    expect(completed.status).toBe('COMPLETED')
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } })
    await processJob(await claim())
    const current = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: f.parent.id } })
    expect(current.aggregateInputHash).toBe(completed.aggregateInputHash)
    expect(current.completedAt).toEqual(completed.completedAt)
    expect(await budget()).toBe(0)
    expect(await outbox.finishCompositeReportJob(old, { kind: 'waiting' })).toBe(false)
  })

  it('does not finalize a future epoch or overwrite its state with an old job', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const old = await claim()
    await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: { attemptEpoch: 2 } })
    await processJob(old)
    expect(await db.compositeAssessmentAttempt.findUnique({ where: { id: f.parent.id } })).toMatchObject({ status: 'IN_PROGRESS', attemptEpoch: 2 })
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('CANCELLED')
    expect(await budget()).toBe(0)
  })

  it('continues already enrolled attempts when new async enrollment is disabled', async () => {
    const f = await fixture(2)
    await submit(f.inputs[0])
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('WAITING')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false')
    await submit(f.inputs[1])
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('PENDING')
    await processJob(await claim())
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(2)
  })

  it('keeps status GET pure and checks current participant/teacher authority before cached results', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const before = await outbox.readCompositeReportJob(f.parent.id, 1)
    const status = await service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })
    expect(status.reportStatus.state).toBe('PENDING')
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toEqual(before)
    await expect(service.getCompositeReportStatus(f.parent.id, { userId: f.owner.id })).rejects.toMatchObject({ statusCode: 403 })
    await processJob(await claim())
    await expect(service.getReport(f.parent.id, { recoveryTokenHash: 'wrong' })).rejects.toMatchObject({ statusCode: 403 })
    const owned = await service.getReportForTeacher(f.owner.id, 'TEACHER', f.composite.id, f.parent.id)
    expect(owned.unitReports).toHaveLength(1)
    await expect(service.getReportForTeacher(f.participant.id, 'TEACHER', f.composite.id, f.parent.id)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('retains a failed report receipt and retries report generation without changing answers', async () => {
    const f = await fixture()
    const accepted = await submit(f.inputs[0])
    const job = await claim()
    await outbox.finishCompositeReportJob(job, { kind: 'failed', errorCode: 'SIMULATED_REPORT_FAILURE' })
    expect((await service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })).reportStatus.state).toBe('FAILED')
    await service.retryCompositeQuestionnaireReport(f.parent.id, { userId: f.participant.id })
    await processJob(await claim())
    const child = await db.assessment.findUniqueOrThrow({ where: { id: f.inputs[0].assessmentId } })
    expect(child.submissionId).toBe(accepted.submissionId)
    expect(child.submissionPayloadHash).toBe(accepted.payloadHash)
    expect(await budget()).toBe(0)
  })
})
