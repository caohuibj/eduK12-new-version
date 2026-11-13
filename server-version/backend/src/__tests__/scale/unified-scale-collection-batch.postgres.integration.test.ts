import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { updateCompletedAssessmentsBatch, type CompletedAssessmentBatchWrite } from '../../modules/scale/unified-final-submit.service'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const attemptEpoch = 1

let db: PrismaClient
let scaleId = ''
let userId = ''
let compositeId = ''
let attemptId = ''
let sentinelId = ''
const childIds: string[] = []

const sentinelSubmissionId = `sentinel-${randomUUID()}`
const sentinelPayloadHash = 'c'.repeat(64)
const sentinelAnswers = { sentinel: true, marker: 'precompleted-answers' }
const sentinelResult = { score: 4242, marker: 'precompleted-score' }
const sentinelTiming = 'SENTINEL_TIMING'
const sentinelTotalTime = 111
const sentinelCompletedAt = new Date('2024-02-02T02:02:02.000Z')

const writesFor = (ids: string[]): CompletedAssessmentBatchWrite[] => ids.map((id, index) => ({
  id,
  submissionId: randomUUID(),
  payloadHash: (index + 1).toString(16).padStart(64, 'a'),
  answers: { n: index, marker: 'batch-answers' },
  result: { score: 70 + index, marker: 'batch-score' },
  completedAt: new Date(Date.UTC(2026, 0, 10, 0, 0, index)).toISOString(),
  totalTime: 1000 + index,
  timingEncrypted: `timing-${index}`,
}))

let applied: CompletedAssessmentBatchWrite[] = []

const fingerprint = () => db.$queryRaw<Array<{
  id: string
  status: string
  answers: unknown
  result: unknown
  progress: number
  total_time: number | null
  submission_id: string | null
  submission_payload_hash: string | null
  timing_encrypted: string | null
  completed_at: Date | null
  submission_completed_at: Date | null
}>>`
  SELECT id, status::text AS status, answers, result, progress, total_time, submission_id,
    submission_payload_hash, timing_encrypted, completed_at, submission_completed_at
  FROM assessments
  WHERE composite_attempt_id = ${attemptId}
  ORDER BY id
`

suite('updateCompletedAssessmentsBatch on isolated PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
    const scale = await db.scale.findFirst({ where: { status: 'PUBLISHED' }, select: { id: true } })
    const user = await db.user.findFirst({ select: { id: true }, orderBy: { id: 'asc' } })
    if (!scale || !user) throw new Error('disposable database is missing a published scale or user')
    scaleId = scale.id
    userId = user.id
    compositeId = (await db.compositeAssessment.create({
      data: { code: `batch-upd-${randomUUID()}`, name: 'Batch assessment update fixture', createdBy: userId, status: 'DRAFT' },
    })).id
    attemptId = (await db.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: compositeId,
        userId,
        participantKey: `batch-${randomUUID()}`,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch,
        progress: 0,
      },
    })).id
    for (let index = 0; index < 9; index += 1) {
      const row = await db.assessment.create({
        data: {
          scaleId,
          userId,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          runtimeGeneration: 'UNIFIED_V1',
          attemptEpoch,
          compositeAttemptId: attemptId,
          progress: 0,
          answers: { draft: index },
        },
      })
      childIds.push(row.id)
    }
    sentinelId = (await db.assessment.create({
      data: {
        scaleId,
        userId,
        status: 'COMPLETED',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch,
        compositeAttemptId: attemptId,
        progress: 100,
        submissionId: sentinelSubmissionId,
        submissionPayloadHash: sentinelPayloadHash,
        answers: sentinelAnswers,
        result: sentinelResult,
        timingEncrypted: sentinelTiming,
        totalTime: sentinelTotalTime,
        completedAt: sentinelCompletedAt,
        submissionCompletedAt: sentinelCompletedAt,
      },
    })).id
    applied = writesFor(childIds)
  })

  afterAll(async () => {
    if (!db) return
    const ids = [...childIds, sentinelId].filter(Boolean)
    if (ids.length) await db.assessment.deleteMany({ where: { id: { in: ids } } })
    if (attemptId) await db.compositeAssessmentAttempt.deleteMany({ where: { id: attemptId } })
    if (compositeId) await db.compositeAssessment.deleteMany({ where: { id: compositeId } })
    await db.$disconnect()
  })

  it('completes the nine IN_PROGRESS children and leaves the pre-completed sentinel', async () => {
    const sentinelBefore = await db.assessment.findUniqueOrThrow({ where: { id: sentinelId } })
    const changed = await db.$transaction(tx => updateCompletedAssessmentsBatch(tx, { attemptId, attemptEpoch, writes: applied }))
    expect(changed).toHaveLength(9)
    expect(new Set(changed.map(row => row.id))).toEqual(new Set(childIds))

    const [matched] = await db.$queryRaw<Array<{ n: number | bigint }>>`
      SELECT count(*)::int AS n
      FROM assessments child
      JOIN jsonb_to_recordset(${JSON.stringify(applied)}::jsonb) AS source(
        "id" text, "answers" jsonb, "result" jsonb, "completedAt" timestamp,
        "totalTime" integer, "submissionId" text, "payloadHash" text, "timingEncrypted" text)
      ON child.id = source.id
      WHERE child.status = 'COMPLETED' AND child.progress = 100
        AND child.answers = source.answers AND child.result = source.result
        AND child.completed_at = source."completedAt" AND child.submission_completed_at = source."completedAt"
        AND child.total_time = source."totalTime" AND child.submission_id = source."submissionId"
        AND child.submission_payload_hash = source."payloadHash" AND child.timing_encrypted = source."timingEncrypted"
        AND child.composite_attempt_id = ${attemptId} AND child.attempt_epoch = ${attemptEpoch}
    `
    expect(Number(matched.n)).toBe(9)
    expect(await db.assessment.findUniqueOrThrow({ where: { id: sentinelId } })).toEqual(sentinelBefore)
    const saved = await db.assessment.findMany({ where: { id: { in: childIds } } })
    expect(saved).toHaveLength(9)
    for (const write of applied) {
      const row = saved.find(item => item.id === write.id)
      expect(row).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        submissionId: write.submissionId,
        submissionPayloadHash: write.payloadHash,
        totalTime: write.totalTime,
        timingEncrypted: write.timingEncrypted,
        answers: write.answers,
        result: write.result,
      })
    }
  })

  it('rejects a second write of those completed rows and rolls the transaction back', async () => {
    const beforeRows = await fingerprint()
    const beforeParent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { progress: true } })
    let caught: unknown
    try {
      await db.$transaction(async tx => {
        await tx.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { progress: 77 } })
        await updateCompletedAssessmentsBatch(tx, { attemptId, attemptEpoch, writes: applied })
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(InstrumentFinalSubmitError)
    expect(caught).toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 409, message: '批量量表更新行数不匹配' })
    expect(await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { progress: true } })).toEqual(beforeParent)
    expect(await fingerprint()).toEqual(beforeRows)
    const sentinel = await db.assessment.findUniqueOrThrow({ where: { id: sentinelId } })
    expect(sentinel).toMatchObject({
      status: 'COMPLETED',
      submissionId: sentinelSubmissionId,
      submissionPayloadHash: sentinelPayloadHash,
      answers: sentinelAnswers,
      result: sentinelResult,
      timingEncrypted: sentinelTiming,
      totalTime: sentinelTotalTime,
      progress: 100,
    })
  })
})
