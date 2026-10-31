import { createReportOutboxFixture } from './report-outbox-fixture'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient, type CompositeReportJob } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

const url = integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const readinessRedisUrl = process.env.REPORT_READY_INTEGRATION_REDIS_URL || process.env.REDIS_URL
if (process.env.CI && !readinessRedisUrl) throw new Error('CI requires real Redis readiness coverage')
let db: PrismaClient
let outbox: typeof import('../../modules/assessment-runtime/report-outbox.service')
let service: typeof import('../../modules/composite/composite.service')
let submit: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let processJob: typeof import('../../workers/compositeReportWorker')['processCompositeReportJob']
const users: string[] = [], scales: string[] = [], composites: string[] = [], attempts: string[] = []
const cognitiveConfigs: string[] = [], cognitiveAssignments: string[] = []

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
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'false')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS', '')
    for (const name of ["ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED", "ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED", "ASSESSMENT_REPORT_NARROW_LOAD_ENABLED", "ASSESSMENT_REPORT_ATOMIC_FINISH_ENABLED", "ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED", "ASSESSMENT_REPORT_COMPACT_READ_ENABLED", "ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED", "ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED"]) vi.stubEnv(name, 'true')
    vi.stubEnv('REPORT_READY_INTEGRATION_REDIS_URL', process.env.REPORT_READY_INTEGRATION_REDIS_URL || process.env.REDIS_URL || '')
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
    for (const name of ["ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED", "ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED", "ASSESSMENT_REPORT_NARROW_LOAD_ENABLED", "ASSESSMENT_REPORT_ATOMIC_FINISH_ENABLED", "ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED", "ASSESSMENT_REPORT_COMPACT_READ_ENABLED", "ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED", "ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED"]) vi.stubEnv(name, 'true')
    vi.stubEnv('REPORT_READY_INTEGRATION_REDIS_URL', process.env.REPORT_READY_INTEGRATION_REDIS_URL || process.env.REDIS_URL || '')
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '200')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'false')
  })

  afterAll(async () => {
    if (db) {
      // Delete attempts before definition items: the child item FK is RESTRICT.
      await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attempts } } })
      await db.compositeAssessment.deleteMany({ where: { id: { in: composites } } })
      await db.scale.deleteMany({ where: { id: { in: scales } } })
      await db.cognitiveAssignment.deleteMany({ where: { id: { in: cognitiveAssignments } } })
      await db.cognitiveTestConfig.deleteMany({ where: { id: { in: cognitiveConfigs } } })
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

  it('scores and renders a real multi-scale report from shared immutable definitions', async () => {
    const f = await fixture(3)
    const runtime = await import('../../modules/assessment-runtime/runtime-snapshot')
    vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED', 'true')
    try {
      const rows = await db.assessment.findMany({ where: { compositeAttemptId: f.parent.id }, select: { id: true, runtimeSnapshotEncrypted: true } })
      await db.$transaction(async tx => {
        for (const row of rows) {
          const snapshot = runtime.decryptFrozenScaleRuntimeSnapshot(row.runtimeSnapshotEncrypted!)
          await tx.assessment.update({ where: { id: row.id }, data: { runtimeSnapshotEncrypted: await runtime.persistFrozenScaleRuntimeSnapshot(snapshot, tx) } })
        }
      })
      for (const input of f.inputs) await submit(input)
      await processJob(await claim())
      const report = await service.getReport(f.parent.id, { userId: f.participant.id })
      expect(report.unitReports).toHaveLength(3)
      for (const unit of report.unitReports) expect(unit.scores[0].value).toBe(3)
      expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
      expect(await budget()).toBe(0)
    } finally {
      vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED', 'false')
      vi.stubEnv('ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED', 'false')
    }
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

  it('holds incomplete receipts without consuming global budget and observes concurrent final units', async () => {
    const f = await fixture(3)
    await submit(f.inputs[0])
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'WAITING', budgetHeld: false })
    expect(await budget()).toBe(0)
    expect(await outbox.claimCompositeReportJob()).toBeNull()
    await Promise.all([submit(f.inputs[1]), submit(f.inputs[2])])
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', requestedRevision: 3, budgetHeld: true })
    await processJob(await claim())
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(3)
    expect(await budget()).toBe(0)
  })

  it('does not take the shared budget lock for a partial questionnaire when the ready queue is full', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '1')
    const a = await fixture(), b = await fixture(2)
    await submit(a.inputs[0])
    await submit(b.inputs[0])
    expect(await outbox.readCompositeReportJob(b.parent.id, 1)).toMatchObject({ status: 'WAITING', budgetHeld: false })
    await expect(submit(b.inputs[1])).rejects.toMatchObject({ code: 'COMPLETION_BUSY' })
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: b.parent.id } })).toBe(1)
    await processJob(await claim())
    await submit(b.inputs[1])
    await processJob(await claim())
    expect(await budget()).toBe(0)
  })

  it('recovers an actual killed lease owner without resubmitting answers', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const child = spawn(process.execPath, ['--import', 'tsx', '-e', "const o=require('./src/modules/assessment-runtime/report-outbox.service.ts'); o.claimCompositeReportJob().then(j=>{process.send({id:j.id,token:j.leaseToken});setInterval(()=>{},1000)}).catch(e=>{process.send({error:String(e)});process.exit(1)})"],
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
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('WAITING')
    expect(await outbox.claimCompositeReportJob()).toBeNull()
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
  const wholeInput = async (f: Awaited<ReturnType<typeof fixture>>) => {
    const whole = await import('../../modules/composite/whole-questionnaire.service')
    const definition = await whole.getWholeQuestionnaireDefinition(f.parent.id, { userId: f.participant.id })
    const children = await db.assessment.findMany({ where: { compositeAttemptId: f.parent.id }, select: { id: true, compositeItemId: true } })
    return { whole, input: { submissionId: 'whole-fixture-' + randomUUID(), attemptEpoch: 1,
      slotSetHash: definition.slotSetHash!, contextSnapshotHash: definition.contextSnapshotHash,
      units: definition.units.map(unit => ({ itemId: unit.itemId, definitionHash: unit.definitionHash,
        answers: f.inputs.find(input => input.assessmentId === children.find(row => row.compositeItemId === unit.itemId)!.id)!.answers })) } }
  }

  it('ACKs one complete answer envelope before scoring, then materializes the full report', async () => {
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    expect(accepted).toMatchObject({ submissionId: input.submissionId, status: 'ACCEPTED', replayed: false })
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'IN_PROGRESS' } })).toBe(3)
    const receipt = await outbox.readWholeQuestionnaireReceipt(f.parent.id, 1)
    expect(receipt!.wholePayloadHash).toBe(accepted.payloadHash)
    expect(receipt!.wholeAnswersEncrypted).toBeTruthy()
    expect(receipt!.wholeAnswersEncrypted).not.toContain('responseValue')
    await processJob(await claim())
    const report = await service.getReport(f.parent.id, { userId: f.participant.id })
    expect(report.unitReports).toHaveLength(3)
    expect(report.unitReports.every((unit: any) => unit.scores[0].value === 3)).toBe(true)
    expect(await budget()).toBe(0)
    expect(await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })).toMatchObject({ replayed: true, payloadHash: accepted.payloadHash })
  })

  it('reconstructs compact validation plans from durable frozen definitions after all process-local rules are lost', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_COMPACT_MANIFEST_ENABLED', 'true')
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    const receipt = await outbox.readWholeQuestionnaireReceipt(f.parent.id, 1)
    const { decryptUnifiedRuntimePayload } = await import('../../modules/assessment-runtime/security')
    const manifest = decryptUnifiedRuntimePayload<any>(receipt!.wholeValidationEncrypted!)
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.units.every((unit: any) => unit.rulesHash && !unit.items)).toBe(true)
    whole.clearWholeValidationRulesForTest()
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    expect(accepted.status).toBe('ACCEPTED')
    await processJob((await outbox.claimCompositeReportJob())!)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'READY' })
    expect(await budget()).toBe(0)
  })

  it('coalesces simultaneous whole retries and rejects changed answers or a foreign principal', async () => {
    const f = await fixture(2), { whole, input } = await wholeInput(f)
    const replies = await Promise.all(Array.from({ length: 8 }, () => whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })))
    expect(replies.filter(reply => !reply.replayed)).toHaveLength(1)
    expect(new Set(replies.map(reply => reply.payloadHash)).size).toBe(1)
    expect(await budget()).toBe(1)
    const changed = { ...input, units: input.units.map((unit, index) => index ? unit : { ...unit, answers: unit.answers.map(answer => ({ ...answer, responseValue: 'no' })) }) }
    await expect(whole.submitWholeQuestionnaire(f.parent.id, changed, { userId: f.participant.id })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    await expect(whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.owner.id })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('checks completeness before whole ACK and rolls back the envelope when the queue is full', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING', '1')
    const a = await fixture(2), b = await fixture(2), wa = await wholeInput(a), wb = await wholeInput(b)
    await expect(wa.whole.submitWholeQuestionnaire(a.parent.id, { ...wa.input, units: wa.input.units.slice(0, 1) }, { userId: a.participant.id })).rejects.toMatchObject({ statusCode: 400 })
    expect(await outbox.readWholeQuestionnaireReceipt(a.parent.id, 1)).toMatchObject({ wholeSubmissionId: null })
    const invalid = { ...wa.input, units: wa.input.units.map((unit, index) => index ? unit : { ...unit, answers: unit.answers.map(answer => ({ ...answer, responseValue: 'invalid-option' })) }) }
    await expect(wa.whole.submitWholeQuestionnaire(a.parent.id, invalid, { userId: a.participant.id })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    expect((await service.getCompositeReportStatus(a.parent.id, { userId: a.participant.id })).hasAcceptedSubmission).toBe(false)
    await wa.whole.submitWholeQuestionnaire(a.parent.id, wa.input, { userId: a.participant.id })
    await expect(wb.whole.submitWholeQuestionnaire(b.parent.id, wb.input, { userId: b.participant.id })).rejects.toMatchObject({ code: 'COMPLETION_BUSY' })
    expect(await outbox.readWholeQuestionnaireReceipt(b.parent.id, 1)).toMatchObject({ wholeSubmissionId: null })
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: b.parent.id } })).asyncReportEpoch).toBeNull()
  })

  it('rejects individual writes and restart after a whole ACK without changing its durable answers', async () => {
    const f = await fixture(2), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    await expect(submit(f.inputs[0])).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'IN_PROGRESS' } })).toBe(2)
    await expect(service.restartUserAttempt(f.participant.id, f.parent.id)).rejects.toMatchObject({ code: 'SUBMISSION_ALREADY_IN_PROGRESS' })
    expect((await outbox.readWholeQuestionnaireReceipt(f.parent.id, 1))!.wholePayloadHash).toBe(accepted.payloadHash)
    await processJob(await claim())
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(2)
  })

  it('recovers partly scored whole answers with the original per-unit identities and receipt time', async () => {
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    const { UNIFIED_SCALE_CHILD_ADMISSION_SELECT } = await import('../../modules/scale/scale-admission.service')
    const { submitUnifiedScaleAssessmentFinal } = await import('../../modules/scale/unified-final-submit.service')
    const first = input.units[0]
    const child = await db.assessment.findFirstOrThrow({ where: { compositeAttemptId: f.parent.id, compositeItemId: first.itemId }, select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
    const { createHash } = await import('node:crypto')
    const submissionId = 'whole-' + createHash('sha256').update(input.submissionId + '/' + first.itemId).digest('hex')
    await submitUnifiedScaleAssessmentFinal({ ...first, assessmentId: child.id, attemptEpoch: 1, submissionId,
      compositeAttemptId: f.parent.id, userId: f.participant.id, contextSnapshotHash: null }, child,
      { submissionId: input.submissionId, payloadHash: accepted.payloadHash, leaseToken: old.leaseToken!, acceptedAtMs: accepted.acceptedAt.getTime() })
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(1)
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } })
    const recovered = await claim()
    expect(recovered.leaseToken).not.toBe(old.leaseToken)
    await processJob(recovered)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(3)
    expect((await db.assessment.findUniqueOrThrow({ where: { id: child.id } })).submissionId).toBe(submissionId)
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: f.parent.id } })).completedAt).toEqual(accepted.acceptedAt)
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'STALE' })).toBe(false)
    expect(await budget()).toBe(0)
  })

  it('drains received whole answers and confirms retries when new whole enrollment is disabled', async () => {
    const a = await fixture(2), b = await fixture(2), wa = await wholeInput(a), wb = await wholeInput(b)
    const accepted = await wa.whole.submitWholeQuestionnaire(a.parent.id, wa.input, { userId: a.participant.id })
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'false')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false')
    await expect(wb.whole.submitWholeQuestionnaire(b.parent.id, wb.input, { userId: b.participant.id })).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 503 })
    expect(await outbox.readWholeQuestionnaireReceipt(b.parent.id, 1)).toMatchObject({ wholeSubmissionId: null, wholeAnswersEncrypted: null, status: 'WAITING' })
    expect((await db.compositeReportJob.findUniqueOrThrow({ where: { attemptId_attemptEpoch: { attemptId: b.parent.id, attemptEpoch: 1 } } })).budgetHeld).toBe(false)
    expect(await wa.whole.submitWholeQuestionnaire(a.parent.id, wa.input, { userId: a.participant.id })).toMatchObject({ replayed: true, payloadHash: accepted.payloadHash })
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(a.parent.id, 1))!.status).toBe('READY')
    expect((await service.getReport(a.parent.id, { userId: a.participant.id })).unitReports).toHaveLength(2)
    expect(await budget()).toBe(0)
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'false')
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    expect(await wb.whole.submitWholeQuestionnaire(b.parent.id, wb.input, { userId: b.participant.id })).toMatchObject({ submissionId: wb.input.submissionId, status: 'ACCEPTED', replayed: false })
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(b.parent.id, 1))!.status).toBe('READY')
    expect(await budget()).toBe(0)
  })

  it('rejects a validation manifest copied from another owned attempt before accepting answers', async () => {
    const a = await fixture(2), b = await fixture(2), wa = await wholeInput(a), wb = await wholeInput(b)
    const foreign = await db.compositeReportJob.findUniqueOrThrow({ where: { attemptId_attemptEpoch: { attemptId: b.parent.id, attemptEpoch: 1 } } })
    await db.compositeReportJob.update({ where: { attemptId_attemptEpoch: { attemptId: a.parent.id, attemptEpoch: 1 } }, data: {
      wholeValidationEncrypted: foreign.wholeValidationEncrypted, wholeValidationHash: foreign.wholeValidationHash,
    } })
    await expect(wa.whole.submitWholeQuestionnaire(a.parent.id, wa.input, { userId: a.participant.id })).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
    expect((await outbox.readWholeQuestionnaireReceipt(a.parent.id, 1))!.wholeSubmissionId).toBeNull()
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: a.parent.id } })).toBe(0)
    expect(await budget()).toBe(0)
  })

  it('returns an unstarted lease without consuming a retry or releasing its durable permit', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const old = await claim()
    expect(old.attemptCount).toBe(1)
    expect(await outbox.returnUnstartedCompositeReportJob(old)).toBe(true)
    expect(await outbox.returnUnstartedCompositeReportJob(old)).toBe(false)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', attemptCount: 0, budgetHeld: true, leaseToken: null })
    expect(await budget()).toBe(1)
    const resumed = await claim()
    expect(resumed.leaseToken).not.toBe(old.leaseToken)
    expect(resumed.attemptCount).toBe(1)
    await processJob(resumed)
    expect(await budget()).toBe(0)
  })

  it.each([1, 5, 8])('batch saves arbitrary %i-scale collections with identical scoring and one permit', async units => {
    const f = await fixture(units), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    await processJob(await claim())
    const report = await service.getReport(f.parent.id, { userId: f.participant.id })
    expect(report.unitReports).toHaveLength(units)
    expect(report.unitReports.every((unit: any) => !unit.decryptError && unit.scores[0].value === 3)).toBe(true)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(units)
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'COMPLETED' } })).toBe(units)
    expect(await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })).toMatchObject({
      replayed: true, payloadHash: accepted.payloadHash,
    })
    expect(await budget()).toBe(0)
  })

  it('batch database failure rolls back every new unit and recovers the same durable answers', async () => {
    const f = await fixture(5), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    const target = f.inputs[f.inputs.length - 1].assessmentId
    expect(target).toMatch(/^[a-f0-9-]{36}$/)
    // Real PostgreSQL failure AFTER the bulk UPDATE, not a mocked transaction.
    await db.$executeRawUnsafe("CREATE FUNCTION eduk12_batch_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_BATCH_WRITE_FAILURE'; END $$")
    await db.$executeRawUnsafe("CREATE TRIGGER eduk12_batch_fault BEFORE INSERT ON assessment_unit_snapshots FOR EACH ROW WHEN (NEW.source_attempt_id = '" + target + "') EXECUTE FUNCTION eduk12_batch_fault()")
    try {
      await expect(whole.processWholeQuestionnaireAnswers(old)).rejects.toThrow()
      expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'IN_PROGRESS', submissionId: null } })).toBe(5)
      expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
      expect((await outbox.readWholeQuestionnaireReceipt(f.parent.id, 1))!.wholePayloadHash).toBe(accepted.payloadHash)
      expect(await budget()).toBe(1)
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER eduk12_batch_fault ON assessment_unit_snapshots')
      await db.$executeRawUnsafe('DROP FUNCTION eduk12_batch_fault()')
    }
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } })
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(5)
    expect(await budget()).toBe(0)
  })

  it('expired batch owner cannot write after a new owner has claimed the same receipt', async () => {
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } })
    const current = await claim()
    await expect(whole.processWholeQuestionnaireAnswers(old)).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'IN_PROGRESS' } })).toBe(3)
    await processJob(current)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'STALE' })).toBe(false)
    expect(await budget()).toBe(0)
  })

  it('uses the shared optimized finalizer for real scale-plus-cognitive submissions and identical report projection', async () => {
    const f = await fixture(2)
    const { createUnifiedCognitiveSessionConfigSnapshot, readCognitiveSessionConfig } = await import('../../modules/cognitive/session.service')
    const { freezeCompositeActiveSlotSet } = await import('../../modules/assessment-runtime/attempt-runtime')
    const { encryptFrozenActiveSlotSet, decryptFrozenActiveSlotSet, createFrozenActiveSlotSet } = await import('../../modules/assessment-runtime/slot-set')
    const { createTrialEnvelope } = await import('../../modules/cognitive/v2/trial-envelope')
    const { ensureCognitiveAdmissionAtDelivery } = await import('../../modules/cognitive/cognitive-admission.service')
    const { submitCognitiveSessionFinal } = await import('../../modules/cognitive/final-submit.service')
    const configData = { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }
    let config = await db.cognitiveTestConfig.findUnique({ where: { testType_configVersion: { testType: 'fake', configVersion: '1.0.0' } } })
    if (!config) {
      config = await db.cognitiveTestConfig.create({ data: { testType: 'fake', configVersion: '1.0.0',
        name: 'Mixed collection synthetic cognitive task', status: 'PUBLISHED', engineVersion: '1.0.0',
        scoringVersion: '1.0.0', accessPolicy: 'OPEN', publishedAt: new Date(), config: configData } })
      cognitiveConfigs.push(config.id)
    }
    const frozen = await createUnifiedCognitiveSessionConfigSnapshot({ testType: 'fake', configVersion: '1.0.0',
      engineVersion: '1.0.0', scoringVersion: '1.0.0', config: configData, db: db as any })
    const snapshot = readCognitiveSessionConfig(frozen.encrypted).snapshot!
    const assignment = await db.cognitiveAssignment.create({ data: { configId: config.id, createdBy: f.owner.id,
      title: 'Mixed cognitive fixture', status: 'PUBLISHED', resolvedConfigSnapshotEncrypted: frozen.encrypted,
      resolvedConfigHash: snapshot.configHash } })
    cognitiveAssignments.push(assignment.id)
    const item = await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: f.composite.id,
      type: 'COGNITIVE', position: 2, required: true, cognitiveAssignmentId: assignment.id } })
    const oldSlots = decryptFrozenActiveSlotSet(f.parent.frozenActiveSlotSetEncrypted!)
    const cognitiveSlots = freezeCompositeActiveSlotSet({ attemptEpoch: 1, scales: [], formSections: [],
      cognitive: [{ compositeItemId: item.id, testType: 'fake', instrumentVersion: '1.0.0',
        sourceDefinitionHash: frozen.compiledRuntime.sourceDefinitionHash,
        compiledRuntimeHash: frozen.compiledRuntime.compiledRuntimeHash }] })
    const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      slots: [...oldSlots.slots, ...cognitiveSlots.slots].sort((a, b) => a.slotKey.localeCompare(b.slotKey)) })
    await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: {
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    } })
    const session = await db.cognitiveSession.create({ data: { userId: f.participant.id,
      participantKey: 'mixed-' + randomUUID(), assignmentId: assignment.id, compositeAttemptId: f.parent.id,
      compositeItemId: item.id, configId: config.id, testType: 'fake', attemptNo: 1, status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', configVersion: '1.0.0',
      engineVersion: '1.0.0', scoringVersion: '1.0.0', configSnapshotEncrypted: frozen.encrypted,
      compiledRuntimeHash: frozen.compiledRuntime.compiledRuntimeHash, randomSeed: 'mixed-' + randomUUID() } })
    await ensureCognitiveAdmissionAtDelivery(session.id)
    await submit(f.inputs[0]); await submit(f.inputs[1])
    expect(await budget()).toBe(0)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('WAITING')
    const cognitiveInput = { sessionId: session.id, submissionId: 'mixed-cognitive-' + randomUUID(),
      attemptEpoch: 1, definitionHash: snapshot.configHash, contextSnapshotHash: null,
      trials: Array.from({ length: 3 }, (_, trialIndex) => createTrialEnvelope({ trialIndex, phase: 'test',
        payload: { correct: trialIndex % 2 === 0, rtMs: 400 + trialIndex },
        startedAtPerfMs: trialIndex * 1000, endedAtPerfMs: trialIndex * 1000 + 400 })) }
    const finished = await submitCognitiveSessionFinal(f.participant.id, cognitiveInput)
    expect(await db.cognitiveRawSubmission.count({ where: { sessionId: session.id } })).toBe(1)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(3)
    expect(await budget()).toBe(1)
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    const narrow = await service.getReport(f.parent.id, { userId: f.participant.id })
    expect(narrow.unitReports).toHaveLength(3)
    expect(narrow.unitReports.every((unit: any) => !unit.decryptError)).toBe(true)
    const cognitiveReport = narrow.unitReports.find((unit: any) => unit.kind === 'cognitive')
    expect(cognitiveReport).toBeTruthy() // Public projection intentionally omits raw cognitive metrics.
    // Rebuild with the prior loader and compare the complete projected report.
    vi.stubEnv('ASSESSMENT_REPORT_NARROW_LOAD_ENABLED', 'false')
    const wideBuilt = await service.materializeCompositeQuestionnaireReport(f.parent.id, {
      attemptEpoch: 1, slotSetHash: slots.snapshotHash, contextHash: null,
    })
    vi.stubEnv('ASSESSMENT_REPORT_NARROW_LOAD_ENABLED', 'true')
    const { decryptCompositeCollectionReport } = await import('../../modules/composite/composite-report-cache')
    // The canonical reader checks binding; HTTP projection is tested by the service.
    const wide = decryptCompositeCollectionReport(wideBuilt.reportEncrypted, { attemptId: f.parent.id,
      attemptEpoch: 1, slotSetHash: slots.snapshotHash, contextHash: null, aggregateInputHash: wideBuilt.aggregateInputHash })
    const narrowBuilt = await service.materializeCompositeQuestionnaireReport(f.parent.id, {
      attemptEpoch: 1, slotSetHash: slots.snapshotHash, contextHash: null,
    })
    const narrowRaw = decryptCompositeCollectionReport(narrowBuilt.reportEncrypted, { attemptId: f.parent.id,
      attemptEpoch: 1, slotSetHash: slots.snapshotHash, contextHash: null, aggregateInputHash: narrowBuilt.aggregateInputHash })
    expect(narrowRaw).toEqual(wide)
    const internalCognitive = narrowRaw.unitReports.find((unit: any) => unit.kind === 'cognitive')
    expect(internalCognitive.metrics).toEqual((finished as any).response?.metrics ?? (finished as any).result?.metrics ?? (finished as any).metrics)
    for (const unit of narrowRaw.unitReports) {
      const oldUnit = wide.unitReports.find((row: any) => row.itemId === unit.itemId)
      expect(unit.__scaleProjectionPolicy).toEqual(oldUnit.__scaleProjectionPolicy)
      expect(unit.__frozenMetricDefinitions).toEqual(oldUnit.__frozenMetricDefinitions)
    }
    expect(await budget()).toBe(0)
  })

  it('expired sole owner retries durable whole answers instead of cancelling the receipt or releasing its permit', async () => {
    const f = await fixture(2), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } })
    await processJob(old)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({
      status: 'PENDING', budgetHeld: true, wholePayloadHash: accepted.payloadHash,
    })
    expect(await budget()).toBe(1)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
    await db.compositeReportJob.update({ where: { id: old.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
    await processJob(await claim())
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(2)
    expect(await budget()).toBe(0)
  })

  it('atomic finish releases a permit exactly once under simultaneous duplicate finishers', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const job = await claim()
    const replies = await Promise.all(Array.from({ length: 16 }, () => outbox.finishCompositeReportJob(job, {
      kind: 'failed', errorCode: 'SYNTHETIC_DUPLICATE_FINISH',
    })))
    expect(replies.filter(Boolean)).toHaveLength(1)
    expect(await budget()).toBe(0)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'FAILED', budgetHeld: false })
  })

  it('atomic finish preserves the leased job when its budget invariant is corrupt', async () => {
    const f = await fixture()
    await submit(f.inputs[0])
    const job = await claim()
    await db.compositeReportQueueBudget.update({ where: { id: 'reports' }, data: { pending: 0 } })
    try {
      await expect(outbox.finishCompositeReportJob(job, { kind: 'failed', errorCode: 'SYNTHETIC' })).rejects.toThrow('budget invariant')
      expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({
        status: 'PROCESSING', leaseToken: job.leaseToken, budgetHeld: true,
      })
    } finally {
      await db.compositeReportQueueBudget.update({ where: { id: 'reports' }, data: { pending: 1 } })
    }
    await processJob(job)
    expect(await budget()).toBe(0)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
  })

  it('joins a fresh status snapshot and excludes sealed answers from report reads', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'true')
    try {
      const f = await fixture(2), { whole, input } = await wholeInput(f)
      await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
      const shared = (await import('../../config/database')).prisma
      const raw = vi.spyOn(shared, '$queryRaw')
      const status = await service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })
      expect(raw).toHaveBeenCalledTimes(1)
      raw.mockRestore()
      expect(status).toMatchObject({ hasAcceptedSubmission: true, wholeSubmissionReceived: true, reportStatus: { state: 'PENDING' } })
      await processJob(await claim())
      const small = await outbox.readCompositeReportMaterialization(f.parent.id, 1)
      expect(small?.reportEncrypted).toBeTruthy()
      expect(small).not.toHaveProperty('wholeAnswersEncrypted')
      expect(small).not.toHaveProperty('wholeValidationEncrypted')
      expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(2)
      expect((await service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })).reportStatus.completedAt).toBeInstanceOf(Date)
      await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: { userId: null, recoveryTokenHash: randomUUID() } })
      await expect(service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })).rejects.toMatchObject({ statusCode: 403 })
      await expect(service.getCompositeReportStatus('missing-status-fixture', { userId: f.participant.id })).rejects.toMatchObject({ statusCode: 404 })
    } finally { vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'false') }
  })

  it('reauthorizes the joined snapshot after a ready hint before returning status', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'true')
    const notifications = await import('../../services/reportReadyNotifications')
    let spy: ReturnType<typeof vi.spyOn> | undefined
    try {
      const f = await fixture(), { whole, input } = await wholeInput(f)
      await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
      spy = vi.spyOn(notifications, 'beginReportReadyWait').mockImplementation(() => ({
        done: (async () => {
          await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: { userId: f.owner.id } })
          return 'ready' as const
        })(), cancel: () => {},
      }))
      await expect(service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id }, { waitMs: 4000 })).rejects.toMatchObject({ statusCode: 403 })
    } finally { spy?.mockRestore(); vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'false') }
  })

  it.runIf(Boolean(readinessRedisUrl))('initializes readiness hints on the first ordinary compact status read', async () => {
    const notifications = await import('../../services/reportReadyNotifications')
    notifications.stopReportReadyNotifications()
    vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'true')
    vi.stubEnv('REDIS_URL', readinessRedisUrl!)
    try {
      const f = await fixture(), { whole, input } = await wholeInput(f)
      await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
      const status = await service.getCompositeReportStatus(f.parent.id, { userId: f.participant.id })
      expect(status.feedbackWaitMs).toBe(4000)
      expect(notifications.reportReadyWaitAvailable()).toBe(true)
    } finally {
      notifications.stopReportReadyNotifications()
      vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'false')
      vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'false')
    }
  })

  it.each([1, 5, 8])('reuses only committed results in arbitrary %i-scale reports with an equal durable fallback', async count => {
    vi.stubEnv('ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED', 'true')
    const f = await fixture(count), { whole, input } = await wholeInput(f)
    await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const job = await claim()
    let context: import('../../modules/composite/whole-questionnaire.service').WholeQuestionnaireReportContext | undefined
    await whole.processWholeQuestionnaireAnswers(job, value => { context = value })
    expect(context?.committed?.parent.scaleAssessments).toHaveLength(count)
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'COMPLETED' } })).toBe(count)
    const shared = (await import('../../config/database')).prisma
    const reads = vi.spyOn(shared.compositeAssessmentAttempt, 'findUnique')
    try {
      const parent = context!.committed!.parent
      const finalized = await service.finalizeCompositeAttemptIfReady(f.parent.id, {
        reportJob: identity(job), preloadedParent: parent, committedGraph: parent,
      })
      expect(finalized!.status).toBe('COMPLETED')
      expect(reads).not.toHaveBeenCalled()
      const projected = { ...parent, ...finalized }
      const fast = await service.materializeCompositeQuestionnaireReport(f.parent.id, identity(job), context, projected)
      expect(reads).not.toHaveBeenCalled()
      const fallback = await service.materializeCompositeQuestionnaireReport(f.parent.id, identity(job))
      expect(reads).toHaveBeenCalledTimes(1)
      const { decryptCompositeCollectionReport } = await import('../../modules/composite/composite-report-cache')
      const binding = { attemptId: f.parent.id, ...identity(job), aggregateInputHash: fast.aggregateInputHash }
      expect(decryptCompositeCollectionReport(fast.reportEncrypted, binding)).toEqual(decryptCompositeCollectionReport(fallback.reportEncrypted, binding))
      expect(await outbox.finishCompositeReportJob(job, { kind: 'ready', ...fast })).toBe(true)
      expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(count)
      expect(await budget()).toBe(0)
    } finally { reads.mockRestore() }
  })

  it('reconstructs committed units after a lost invocation without reusing a stale lease context', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED', 'true')
    const f = await fixture(5), { whole, input } = await wholeInput(f)
    await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    let prior: import('../../modules/composite/whole-questionnaire.service').WholeQuestionnaireReportContext | undefined
    await whole.processWholeQuestionnaireAnswers(old, value => { prior = value })
    expect(prior?.committed).toBeTruthy()
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } })
    const next = await claim()
    expect(next.leaseToken).not.toBe(prior!.committed!.leaseToken)
    let rebuilt: import('../../modules/composite/whole-questionnaire.service').WholeQuestionnaireReportContext | undefined
    await whole.processWholeQuestionnaireAnswers(next, value => { rebuilt = value })
    expect(rebuilt?.committed).toBeUndefined()
    await processJob(next)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'STALE' })).toBe(false)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(5)
    expect(await budget()).toBe(0)
  })

  it('reuses the admission-owned fresh header for consent without another parent query', async () => {
    const priorAtomic = process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED
    vi.stubEnv('ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED', 'true')
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    const shared = (await import('../../config/database')).prisma, query = vi.spyOn(shared, '$queryRaw')
    const parentReads = vi.spyOn(shared.compositeAssessmentAttempt, 'findUnique')
    try {
      await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
      const statements=query.mock.calls.map(args=>{const sql=args[0] as any;return sql?.sql??(Array.isArray(sql)?sql.join('?'):String(sql))})
      // Receipt initialization and current collection authority are separate
      // work; neither may cause the consent header to be loaded again.
      expect(statements.filter(sql=>/^\s*SELECT\b/.test(sql)&&sql.includes('"composite_assessment_attempts"'))).toHaveLength(1)
      expect(statements.filter(sql=>/^\s*WITH\s+parent_cas\s+AS\b/.test(sql))).toHaveLength(1)
      expect(parentReads).not.toHaveBeenCalled()
      await processJob(await claim()); expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(3)
      expect(await budget()).toBe(0)
    } finally { query.mockRestore(); parentReads.mockRestore(); vi.stubEnv('ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED', priorAtomic || '') }
  })
  it('keeps the atomic fence if the parent changes after the admission-owned header read', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED', 'true')
    const f = await fixture(1), { whole, input } = await wholeInput(f)
    const shared = (await import('../../config/database')).prisma, original = shared.$queryRaw.bind(shared)
    const query = vi.spyOn(shared, '$queryRaw').mockImplementationOnce((...args: any[]) => (async () => {
      const rows = await (original as any)(...args)
      await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: { status: 'ABANDONED' } })
      return rows
    })() as any)
    try {
      await expect(whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
      expect(await budget()).toBe(0); expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.wholeSubmissionId).toBeNull()
    } finally { query.mockRestore() }
  })

  it('detached whole answers are durable while the legacy 600-counter is full and locked', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'true')
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    const { recoverWholeQuestionnaireReceipt: recover } = await import('../../modules/composite/whole-receipt-recovery')
    expect(await recover(f.parent.id, input.submissionId, 1, { userId: f.participant.id })).toMatchObject({ status: 'NOT_RECEIVED' })
    await db.compositeReportQueueBudget.update({ where: { id: 'reports' }, data: { pending: 600 } })
    let release!: () => void, locked!: () => void
    const ready = new Promise<void>(resolve => { locked = resolve })
    const held = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE composite_report_queue_budget SET pending=pending WHERE id='reports'`
      locked()
      await new Promise<void>(resolve => { release = resolve })
    }, { timeout: 10000 })
    let accepted: Awaited<ReturnType<typeof whole.submitWholeQuestionnaire>>
    try {
      await ready
      accepted = await Promise.race([
        whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DETACHED_RECEIPT_WAITED_FOR_LEGACY_LOCK')), 1500)),
      ])
      expect(accepted.status).toBe('ACCEPTED')
      expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', budgetHeld: false })
      expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
    } finally {
      release?.(); await held
      await db.compositeReportQueueBudget.update({ where: { id: 'reports' }, data: { pending: 0 } })
    }
    expect(await recover(f.parent.id, input.submissionId, 1, { userId: f.participant.id })).toMatchObject({ status: 'ACCEPTED', payloadHash: accepted!.payloadHash })
    // Removing the complete receipt cannot turn an unbudgeted task into a legacy pending task.
    await expect(db.$executeRaw`UPDATE composite_report_jobs SET whole_submission_id=NULL,
      whole_payload_hash=NULL,whole_answers_encrypted=NULL,whole_accepted_at=NULL
      WHERE attempt_id=${f.parent.id} AND attempt_epoch=1`).rejects.toThrow()

    await expect(recover(f.parent.id, input.submissionId, 1, { userId: f.owner.id })).rejects.toMatchObject({ statusCode: 403 })
    await expect(recover(f.parent.id, input.submissionId + '-wrong', 1, { userId: f.participant.id })).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT' })
    await expect(recover(f.parent.id, input.submissionId, 2, { userId: f.participant.id })).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
    expect(await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })).toMatchObject({ replayed: true, payloadHash: accepted!.payloadHash })
    await processJob(await claim()); expect(await budget()).toBe(0)
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(3)
  })

  it('detached whole jobs retain their receipt through retry, lost lease and explicit failed-report recovery', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'true')
    const f = await fixture(2), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const first = await claim()
    expect(await outbox.finishCompositeReportJob(first, { kind: 'retry', errorCode: 'SYNTHETIC', delayMs: 0 })).toBe(true)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', budgetHeld: false, wholePayloadHash: accepted.payloadHash })
    const old = await claim()
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(0) } })
    const next = await claim(); expect(next.leaseToken).not.toBe(old.leaseToken)
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'OLD' })).toBe(false)
    expect(await outbox.finishCompositeReportJob(next, { kind: 'failed', errorCode: 'SYNTHETIC' })).toBe(true)
    await outbox.retryCompositeReport(f.parent)
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'PENDING', budgetHeld: false, wholePayloadHash: accepted.payloadHash })
    await processJob(await claim())
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'READY', budgetHeld: false, wholePayloadHash: accepted.payloadHash })
    expect(await budget()).toBe(0)
  })

  it.each([1, 5])('retries completed-parent whole reports with %i immutable units after materialization failure', async units => {
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_REPORT_COMPRESSION_ENABLED', 'true')
    const f = await fixture(units), { whole, input } = await wholeInput(f)
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const prior = await claim()
    await whole.processWholeQuestionnaireAnswers(prior)
    expect((await service.finalizeCompositeAttemptIfReady(f.parent.id, { reportJob: identity(prior) }))?.status).toBe('COMPLETED')
    const rows = await db.assessment.findMany({ where: { compositeAttemptId: f.parent.id }, orderBy: { id: 'asc' } })
    const snapshots = await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: f.parent.id }, orderBy: { id: 'asc' } })
    const receipt = await db.compositeReportJob.findUniqueOrThrow({ where: { id: prior.id } })
    expect(await outbox.finishCompositeReportJob(prior, { kind: 'failed', errorCode: 'SYNTHETIC_AFTER_FINALIZE' })).toBe(true)
    await outbox.retryCompositeReport(f.parent)
    await processJob(await claim())
    expect(await outbox.readCompositeReportJob(f.parent.id, 1)).toMatchObject({ status: 'READY', budgetHeld: false, wholePayloadHash: accepted.payloadHash })
    expect((await service.getReport(f.parent.id, { userId: f.participant.id })).unitReports).toHaveLength(units)
    expect(await db.assessment.findMany({ where: { compositeAttemptId: f.parent.id }, orderBy: { id: 'asc' } })).toEqual(rows)
    expect(await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: f.parent.id }, orderBy: { id: 'asc' } })).toEqual(snapshots)
    const after = await db.compositeReportJob.findUniqueOrThrow({ where: { id: prior.id } })
    expect(after.wholeSubmissionId).toBe(receipt.wholeSubmissionId)
    expect(after.wholeAnswersEncrypted).toBe(receipt.wholeAnswersEncrypted)
    expect(after.wholeValidationEncrypted).toBe(receipt.wholeValidationEncrypted)
    expect(await outbox.finishCompositeReportJob(prior, { kind: 'failed', errorCode: 'STALE' })).toBe(false)
    expect(await budget()).toBe(0)
  })

  it('rejects completed-parent whole writes while any unit is still fresh', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'true')
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const job = await claim()
    await db.compositeAssessmentAttempt.update({ where: { id: f.parent.id }, data: { status: 'COMPLETED' } })
    await expect(whole.processWholeQuestionnaireAnswers(job)).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
    expect(await db.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'IN_PROGRESS', submissionId: null } })).toBe(3)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(0)
  })

  it('fences expired completed-parent whole replays from the current lease owner', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED', 'true')
    const f = await fixture(3), { whole, input } = await wholeInput(f)
    await whole.submitWholeQuestionnaire(f.parent.id, input, { userId: f.participant.id })
    const old = await claim()
    await whole.processWholeQuestionnaireAnswers(old)
    expect((await service.finalizeCompositeAttemptIfReady(f.parent.id, { reportJob: identity(old) }))?.status).toBe('COMPLETED')
    await db.compositeReportJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(0) } })
    const current = await claim()
    await expect(whole.processWholeQuestionnaireAnswers(old)).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
    await processJob(current)
    expect((await outbox.readCompositeReportJob(f.parent.id, 1))!.status).toBe('READY')
    expect(await outbox.finishCompositeReportJob(old, { kind: 'failed', errorCode: 'STALE' })).toBe(false)
    expect(await db.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id } })).toBe(3)
  })

})
