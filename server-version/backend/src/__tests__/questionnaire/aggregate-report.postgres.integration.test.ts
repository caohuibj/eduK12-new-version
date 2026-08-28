import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/**
 * Opt-in PostgreSQL coverage for the completion storage invariant. The test
 * creates and removes its own tiny fixture and never touches the developer
 * database unless PR26_INTEGRATION_DATABASE_URL is explicitly supplied.
 */
const DB_URL = process.env.PR26_INTEGRATION_DATABASE_URL
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let refreshQuestionnaireProgress: typeof import('../../services/questionnaireProgressService')['refreshQuestionnaireProgress']
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
    refreshQuestionnaireProgress = (await import('../../services/questionnaireProgressService')).refreshQuestionnaireProgress
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
})
