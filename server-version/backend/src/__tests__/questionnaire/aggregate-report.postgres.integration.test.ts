import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { performance } from 'node:perf_hooks'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'

/**
 * Opt-in PostgreSQL coverage for the completion storage invariant. The test
 * creates and removes its own tiny fixture and never touches the developer
 * database unless PR26_INTEGRATION_DATABASE_URL is explicitly supplied.
 */
const DB_URL = integrationDatabaseUrl('PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
const completionBurstSize = Math.max(1, Number.parseInt(process.env.PR26_COMPLETION_BURST_SIZE || '200', 10))

let prisma: PrismaClient
let refreshQuestionnaireProgress: typeof import('../../services/questionnaireProgressService')['refreshQuestionnaireProgress']
let withQuestionnaireCompletionTransaction: typeof import('../../services/questionnaireProgressService')['withQuestionnaireCompletionTransaction']
let decryptField: typeof import('../../utils/encryption')['decryptField']
let assessmentId = ''
let questionnaireId = ''
let userId = ''

suite('aggregate report completion storage (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    const progressService = await import('../../services/questionnaireProgressService')
    refreshQuestionnaireProgress = progressService.refreshQuestionnaireProgress
    withQuestionnaireCompletionTransaction = progressService.withQuestionnaireCompletionTransaction
    decryptField = (await import('../../utils/encryption')).decryptField

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: { username: `pr26-report-${suffix}`, passwordHash: 'test-only', role: 'STUDENT' },
    })
    userId = user.id
    const questionnaire = await prisma.questionnaire.create({
      data: {
        code: `PR26-${suffix}`,
        name: 'PR26 aggregate report fixture',
        creatorId: userId,
        type: 'COURSE',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    questionnaireId = questionnaire.id
    const assessment = await prisma.questionnaireAssessment.create({
      data: { questionnaireId, userId, status: 'IN_PROGRESS' },
    })
    assessmentId = assessment.id
  })

  afterAll(async () => {
    try {
      if (assessmentId) await prisma.questionnaireAssessment.delete({ where: { id: assessmentId } })
      if (questionnaireId) await prisma.questionnaire.delete({ where: { id: questionnaireId } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('writes ciphertext only and keeps the report readable through the service', async () => {
    const result = await refreshQuestionnaireProgress(prisma, assessmentId)
    expect(result?.completed).toBe(true)

    const row = await prisma.questionnaireAssessment.findUnique({
      where: { id: assessmentId },
      select: { aggregateReport: true, aggregateReportEncrypted: true },
    })
    expect(row?.aggregateReport).toBeNull()
    expect(row?.aggregateReportEncrypted).toEqual(expect.any(String))
    expect(decryptField<Record<string, unknown>>(row!.aggregateReportEncrypted!)).toMatchObject({
      reportDefinitionVersion: 'collection-only-v2',
    })
  })

  it('completes 200 independent assessments concurrently without duplicate terminal writes', async () => {
    const assessments = await prisma.questionnaireAssessment.createManyAndReturn({
      data: Array.from({ length: completionBurstSize }, () => ({
        questionnaireId,
        // Anonymous rows may share a questionnaire; the production partial
        // unique index intentionally permits multiple NULL user IDs.
        userId: null,
        status: 'IN_PROGRESS' as const,
        progress: 0,
      })),
      select: { id: true },
    })
    const { runtimeMetricLines, resetRuntimeObservabilityForTests } = await import('../../services/runtimeObservability')
    resetRuntimeObservabilityForTests()
    const startedAt = performance.now()
    try {
      // Keep at most 20 completion calls in flight, above the default pool
      // size. Refill each slot as it completes: a slow Serializable retry must
      // not hold up the next 20 independent assessments behind a batch barrier.
      // Production admission, pool limits, retries and the <10s gate still apply.
      const concurrency = Math.min(20, assessments.length)
      const results: Array<Awaited<ReturnType<typeof withQuestionnaireCompletionTransaction>>> = []
      let nextIndex = 0
      // Drain all workers even on failure before deleting fixtures; Promise.all
      // would let cleanup race with transactions that are still running.
      const workers = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
        while (nextIndex < assessments.length) {
          const index = nextIndex++
          results[index] = await withQuestionnaireCompletionTransaction(
            (tx) => refreshQuestionnaireProgress(tx, assessments[index].id),
          )
        }
      }))
      const elapsedMs = performance.now() - startedAt
      const diagnostics = JSON.stringify({
        burstSize: completionBurstSize,
        concurrency,
        elapsedMs,
        metrics: runtimeMetricLines().filter((line) => (
          !line.startsWith('#') && /ptool_serializable_attempts_total|ptool_serialization_conflicts_total|ptool_completion_admission_rejections_total/.test(line)
        )),
      })
      console.info('Questionnaire completion burst:', diagnostics)

      expect(workers.filter((worker) => worker.status === 'rejected'), diagnostics).toEqual([])
      expect(results).toHaveLength(completionBurstSize)
      expect(results.every((result) => result?.completed && result.status === 'COMPLETED')).toBe(true)

      const completedRows = await prisma.questionnaireAssessment.count({
        where: { id: { in: assessments.map(({ id }) => id) }, status: 'COMPLETED' },
      })
      expect(completedRows).toBe(completionBurstSize)
      const reports = await prisma.questionnaireAssessment.findMany({
        where: { id: { in: assessments.map(({ id }) => id) } },
        select: { aggregateReport: true, aggregateReportEncrypted: true },
      })
      expect(reports.every((row) => row.aggregateReport === null && typeof row.aggregateReportEncrypted === 'string')).toBe(true)
      // Check storage invariants before reporting a timing failure, while only
      // measuring the burst itself (including admission and retry backoff).
      expect(elapsedMs, diagnostics).toBeLessThan(10_000)
    } finally {
      await prisma.questionnaireAssessment.deleteMany({ where: { id: { in: assessments.map(({ id }) => id) } } })
    }
  }, 60000)

  it('keeps one terminal report and timestamp across concurrent completion and replay', async () => {
    const assessment = await prisma.questionnaireAssessment.create({
      data: { questionnaireId, userId: null, status: 'IN_PROGRESS' },
      select: { id: true },
    })
    const terminalSelect = {
      status: true,
      completedAt: true,
      totalTime: true,
      aggregateReport: true,
      aggregateReportEncrypted: true,
    } as const
    const completeConcurrently = () => Promise.allSettled(Array.from({ length: 20 }, () => (
      withQuestionnaireCompletionTransaction((tx) => refreshQuestionnaireProgress(tx, assessment.id))
    )))
    try {
      const completions = await completeConcurrently()
      expect(completions.filter((result) => result.status === 'rejected')).toEqual([])
      const terminal = await prisma.questionnaireAssessment.findUniqueOrThrow({
        where: { id: assessment.id },
        select: terminalSelect,
      })
      expect(terminal).toMatchObject({
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        aggregateReport: null,
        aggregateReportEncrypted: expect.any(String),
      })
      for (const result of completions) {
        if (result.status === 'fulfilled') {
          expect(result.value).toMatchObject({
            completed: true,
            status: 'COMPLETED',
            completedAt: terminal.completedAt,
            totalTime: terminal.totalTime,
          })
        }
      }

      const replays = await completeConcurrently()
      expect(replays.filter((result) => result.status === 'rejected')).toEqual([])
      expect(await prisma.questionnaireAssessment.findUniqueOrThrow({
        where: { id: assessment.id },
        select: terminalSelect,
      })).toEqual(terminal)
    } finally {
      await prisma.questionnaireAssessment.delete({ where: { id: assessment.id } })
    }
  }, 60000)
})
