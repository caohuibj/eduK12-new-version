import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'

/**
 * X-04A real-PostgreSQL closure: mixed Scale+Form whole submission must travel
 * ACK → receipt → worker materialization → aggregate COMPLETED → report READY,
 * with idempotent replay under both a fresh and an expired lease. Opt-in:
 *
 *   WHOLE_FORM_CLOSURE_INTEGRATION_DATABASE_URL=postgresql://... npx vitest run \
 *     src/__tests__/composite/whole-form-closure.postgres.integration.test.ts
 */
const DB_URL = integrationDatabaseUrl('WHOLE_FORM_CLOSURE_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let whole: typeof import('../../modules/composite/whole-questionnaire.service')
let worker: typeof import('../../workers/compositeReportWorker')
const createdCompositeIds: string[] = []
const createdAttemptIds: string[] = []
const createdScaleIds: string[] = []

beforeAll(async () => {
  process.env.DATABASE_URL = DB_URL
  process.env.DATA_ENCRYPTION_KEY = 'b'.repeat(64)
  process.env.ASSESSMENT_REPORT_ASYNC_ENABLED = 'true'
  process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED = 'true'
  process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED = 'true'
  ;({ prisma } = await import('../../config/database'))
  // Mirror the CI regression database: the receipt fence compares
  // whole_accepted_at round-trips against a `timestamp without time zone`
  // column, so the database timezone must be UTC or a non-UTC host clock
  // breaks the accepted-at identity (see ci-backend-regression UTC setup).
  const databaseName = new URL(DB_URL).pathname.replace(/^\//, '')
  await prisma.$executeRawUnsafe(`ALTER DATABASE "${databaseName}" SET timezone TO 'UTC'`)
  await prisma.$disconnect()
  whole = await import('../../modules/composite/whole-questionnaire.service')
  worker = await import('../../workers/compositeReportWorker')
}, 120000)

afterAll(async () => {
  try {
    if (prisma && createdCompositeIds.length) {
      await prisma.compositeReportJob.deleteMany({ where: { attemptId: { in: createdAttemptIds } } })
    await prisma.assessmentUnitSnapshot.deleteMany({ where: { compositeAttempt: { compositeAssessmentId: { in: createdCompositeIds } } } })
    await prisma.compositeFormAnswer.deleteMany({ where: { attempt: { compositeAssessmentId: { in: createdCompositeIds } } } })
    await prisma.compositeFormSectionAttempt.deleteMany({ where: { attempt: { compositeAssessmentId: { in: createdCompositeIds } } } })
    await prisma.assessment.deleteMany({ where: { compositeAttempt: { compositeAssessmentId: { in: createdCompositeIds } } } })
    await prisma.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: createdCompositeIds } } })
    await prisma.compositeFormSection.deleteMany({ where: { compositeAssessmentId: { in: createdCompositeIds } } })
    await prisma.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: { in: createdCompositeIds } } })
    await prisma.compositeAssessment.deleteMany({ where: { id: { in: createdCompositeIds } } })
    await prisma.scale.deleteMany({ where: { id: { in: createdScaleIds } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: 'report-owner-' } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: 'report-participant-' } } })
    }
  } catch {
    // Best-effort cleanup on a disposable integration database.
  }
  await prisma?.$disconnect()
})

suite('mixed Scale+Form whole submission closure (X-04A)', () => {
  it('travels ACK → receipt → Form/Scale materialization → COMPLETED → READY and replays idempotently', async () => {
    const { createReportOutboxFixture } = await import('../integration/report-outbox-fixture')
    const f = await createReportOutboxFixture(prisma as unknown as Parameters<typeof createReportOutboxFixture>[0], 2, 1)
    createdCompositeIds.push(f.composite.id); createdAttemptIds.push(f.parent.id)
    createdScaleIds.push(...f.scaleIds)
    expect(f.formSections).toHaveLength(1)
    const formSection = f.formSections[0]

    // Delivery: the whole definition must expose the frozen Form section and
    // persist the validation manifest (the whole-submit precondition).
    const definition = await whole.getWholeQuestionnaireDefinition(f.parent.id, { userId: f.participant.id })
    expect(definition.formSections).toHaveLength(1)
    expect(definition.formSections![0].definitionHash).toBe(formSection.definitionHash)
    const manifest = await prisma.compositeReportJob.findUniqueOrThrow({
      where: { attemptId_attemptEpoch: { attemptId: f.parent.id, attemptEpoch: definition.attemptEpoch } },
      select: { wholeValidationEncrypted: true, wholeValidationHash: true },
    })
    expect(manifest.wholeValidationEncrypted).toBeTruthy()

    // ACK: one encrypted envelope covering the Scale units and the Form answers.
    const submissionId = randomUUID()
    const wholeInput = {
      submissionId, attemptEpoch: definition.attemptEpoch, slotSetHash: definition.slotSetHash!,
      contextSnapshotHash: definition.contextSnapshotHash,
      units: definition.units.map(unit => ({
        itemId: unit.itemId, definitionHash: unit.definitionHash,
        answers: f.inputs.find((input: any) => input.assessmentId === unit.scaleAssessmentId)!.answers,
      })),
      formAnswers: [{
        sectionId: formSection.sectionId, definitionHash: formSection.definitionHash,
        answers: [
          { formItemId: formSection.requiredItemId, value: '  混合整卷必填答案  ' },
          { formItemId: formSection.optionalItemId, value: '可选作答' },
        ],
      }],
    }
    const accepted = await whole.submitWholeQuestionnaire(f.parent.id, wholeInput, { userId: f.participant.id })
    expect(accepted).toMatchObject({ status: 'ACCEPTED', replayed: false })

    // Worker: claim then process through the real composite report worker.
    const claim = async () => {
      const job = await (await import('../../modules/assessment-runtime/report-outbox.service')).claimCompositeReportJob()
      if (!job) {
        const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>
          `SELECT status, budget_held, next_attempt_at, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') >= next_attempt_at AS due FROM composite_report_jobs`
        throw new Error(`claim returned null; job rows: ${JSON.stringify(rows)}`)
      }
      expect(job.attemptId).toBe(f.parent.id)
      return job!
    }
    const job = await claim()
    await worker.processCompositeReportJob(job)

    const done = await prisma.compositeReportJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(done.errorCode, `worker outcome: ${done.status}/${done.errorCode ?? 'none'}`).toBeNull()
    expect(done.status).toBe('READY')
    expect(done.reportEncrypted).toBeTruthy()
    expect(done.wholePayloadHash).toBe(accepted.payloadHash)

    const parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: f.parent.id } })
    expect(parent.status).toBe('COMPLETED')

    // Scale side unchanged: batch-collected, one completed snapshot per unit.
    expect(await prisma.assessment.count({ where: { compositeAttemptId: f.parent.id, status: 'COMPLETED' } })).toBe(2)
    expect(await prisma.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id, unitType: 'SCALE', terminalState: 'COMPLETED' } })).toBe(2)

    // Form side: one completed FORM_SECTION attempt with the encrypted
    // COLLECTION_FACTS snapshot, the derived per-section submission identity,
    // and the legacy string projection (documented storage model — report
    // building, personal tracking and variant export read it).
    const sectionAttempt = await prisma.compositeFormSectionAttempt.findUniqueOrThrow({
      where: { attemptId_sectionId: { attemptId: f.parent.id, sectionId: formSection.sectionId } },
    })
    expect(sectionAttempt.status).toBe('COMPLETED')
    expect(sectionAttempt.submissionId).toBe('whole-form-' + (await import('node:crypto')).createHash('sha256').update(submissionId + '/' + formSection.sectionId).digest('hex'))
    const formSnapshots = await prisma.assessmentUnitSnapshot.findMany({
      where: { compositeAttemptId: f.parent.id, unitType: 'FORM_SECTION' },
    })
    expect(formSnapshots).toHaveLength(1)
    expect(formSnapshots[0].payloadKind).toBe('COLLECTION_FACTS')
    expect(formSnapshots[0].terminalState).toBe('COMPLETED')
    expect(formSnapshots[0].collectionFactsEncrypted).toBeTruthy()
    const projection = await prisma.compositeFormAnswer.findMany({ where: { attemptId: f.parent.id } })
    expect(projection).toHaveLength(2)
    expect(projection.find(row => row.itemId === formSection.requiredItemId)?.value).toBe('混合整卷必填答案')

    // Replay 1: the identical accepted submission replays its receipt without
    // new work — same bytes, same payload hash, same persisted answer.
    await expect(whole.submitWholeQuestionnaire(f.parent.id, wholeInput, { userId: f.participant.id }))
      .resolves.toMatchObject({ replayed: true, payloadHash: accepted.payloadHash })
    expect(await prisma.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id, unitType: 'FORM_SECTION' } })).toBe(1)

    // Replay 2: an expired worker's lease is preempted by a fresh claim —
    // the derived section identities hit the committed-replay guard and the
    // settled report stays READY without any duplicate materialization.
    await prisma.$executeRaw`
      UPDATE "composite_report_jobs" SET "status" = 'PROCESSING',
        "lease_token" = 'expired-worker-token',
        "lease_expires_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 second'
      WHERE "id" = ${job.id}`
    const job2 = await claim()
    expect(job2.id).toBe(job.id)
    expect(job2.leaseToken).not.toBe(job.leaseToken)
    await worker.processCompositeReportJob(job2)
    const settled = await prisma.compositeReportJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(settled.status).toBe('READY')
    expect(await prisma.assessmentUnitSnapshot.count({ where: { compositeAttemptId: f.parent.id, unitType: 'FORM_SECTION' } })).toBe(1)
    expect(await prisma.compositeFormSectionAttempt.count({ where: { attemptId: f.parent.id } })).toBe(1)
  }, 120000)

  it('rejects a context-bearing composite at the whole delivery boundary', async () => {
    const { createReportOutboxFixture } = await import('../integration/report-outbox-fixture')
    // The fixture builds the context section with the real frozen bindings, so
    // the attempt is otherwise whole-capable — the delivery boundary itself
    // must refuse it (v3.0 ruling; the DTO executionMode alone is not a gate).
    const f = await createReportOutboxFixture(prisma as unknown as Parameters<typeof createReportOutboxFixture>[0], 1, 0, { contextSection: true })
    createdCompositeIds.push(f.composite.id); createdAttemptIds.push(f.parent.id)
    createdScaleIds.push(...f.scaleIds)
    await expect(whole.getWholeQuestionnaireDefinition(f.parent.id, { userId: f.participant.id }))
      .rejects.toThrow('含人口学上下文区段的问卷暂不支持整份交卷')
  }, 60000)
})
