import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import {
  buildAssessmentContext,
  hashAssessmentContext,
  readContextFormAnswer,
  type AssessmentContextV1,
  writeContextFormAnswer,
} from '../../modules/assessment-context'
import {
  encryptAssessmentContext,
  assessmentContextHashMatches,
} from '../../modules/assessment-context/security'
import {
  freezeCompositeAttemptContext,
  freezeQuestionnaireAssessmentContext,
  freezeQuestionnaireAssessmentContextFromSnapshot,
  readQuestionnaireAssessmentContext,
} from '../../services/assessmentContextService'

const frozenAt = new Date('2026-08-27T12:00:00.000Z')

const contextItems = [
  {
    id: 'birth-month',
    type: 'year_month',
    label: '出生年月',
    required: true,
    position: 0,
    contextKey: 'birthYearMonth',
  },
  {
    id: 'sex',
    type: 'single_choice',
    label: '性别',
    required: false,
    position: 1,
    contextKey: 'sexAtBirth',
    options: [
      { value: 'female', label: '女' },
      { value: 'male', label: '男' },
    ],
  },
]

const questionnaireRow = (id: string, birthYearMonth: string, sexAtBirth?: string) => ({
  id,
  contextSnapshotEncrypted: null as string | null,
  contextSnapshotHash: null as string | null,
  contextFrozenAt: null as Date | null,
  questionnaire: { formItems: contextItems },
  formAnswers: [
    { formItemId: 'birth-month', value: writeContextFormAnswer('birthYearMonth', birthYearMonth) },
    ...(sexAtBirth ? [{ formItemId: 'sex', value: writeContextFormAnswer('sexAtBirth', sexAtBirth) }] : []),
  ],
})

const compositeRow = (id: string, birthYearMonth: string) => ({
  id,
  contextSnapshotEncrypted: null as string | null,
  contextSnapshotHash: null as string | null,
  contextFrozenAt: null as Date | null,
  compositeAssessment: {
    items: contextItems.map((item) => ({
      id: item.id,
      type: 'FORM',
      formType: item.type,
      formLabel: item.label,
      required: item.required,
      position: item.position,
      contextKey: item.contextKey,
      formOptions: item.options ?? null,
    })),
  },
  formAnswers: [{ itemId: 'birth-month', value: writeContextFormAnswer('birthYearMonth', birthYearMonth) }],
})

const makeDb = (questionnaireRows: Record<string, any> = {}, compositeRows: Record<string, any> = {}) => {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
    questionnaireAssessment: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => questionnaireRows[where.id] ?? null),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const row = questionnaireRows[where.id]
        if (!row || row.contextSnapshotEncrypted !== null || row.contextSnapshotHash !== null) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      }),
    },
    compositeAssessmentAttempt: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => compositeRows[where.id] ?? null),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const row = compositeRows[where.id]
        if (!row || row.contextSnapshotEncrypted !== null || row.contextSnapshotHash !== null) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      }),
    },
  }
  return db as any
}

describe('parent-scoped AssessmentContext freeze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the same Scale isolated across questionnaire attempts', async () => {
    const firstRow = questionnaireRow('qa-1', '2014-02', 'female')
    const secondRow = questionnaireRow('qa-2', '2012-08', 'male')
    const db = makeDb({ 'qa-1': firstRow, 'qa-2': secondRow })

    const first = await freezeQuestionnaireAssessmentContext(db, 'qa-1', frozenAt)
    const second = await freezeQuestionnaireAssessmentContext(db, 'qa-2', frozenAt)

    expect(first.hash).not.toBe(second.hash)
    expect(first.context.values).toMatchObject({ birthYearMonth: '2014-02', sexAtBirth: 'female', ageMonthsAtFreeze: 150 })
    expect(second.context.values).toMatchObject({ birthYearMonth: '2012-08', sexAtBirth: 'male', ageMonthsAtFreeze: 168 })
    expect(firstRow.contextSnapshotHash).toBe(first.hash)
    expect(secondRow.contextSnapshotHash).toBe(second.hash)
    expect(firstRow.formAnswers[0].value).not.toBe('2014-02')
    expect(readContextFormAnswer('birthYearMonth', firstRow.formAnswers[0].value)).toBe('2014-02')

    const repeated = await freezeQuestionnaireAssessmentContext(db, 'qa-1', new Date('2027-01-01T00:00:00Z'))
    expect(repeated).toMatchObject({ hash: first.hash, alreadyFrozen: true, context: first.context })
    expect(assessmentContextHashMatches(first.context, first.hash)).toBe(true)
  })

  it('freezes a transaction-loaded snapshot without reloading the questionnaire graph', async () => {
    const row = questionnaireRow('qa-snapshot', '2014-02', 'female')
    const db = makeDb({ 'qa-snapshot': row })

    const result = await freezeQuestionnaireAssessmentContextFromSnapshot(db, row, frozenAt)

    expect(result).toMatchObject({ alreadyFrozen: false, hash: expect.any(String) })
    expect(db.questionnaireAssessment.findUnique).not.toHaveBeenCalled()
    expect(row.contextSnapshotHash).toBe(result.hash)
  })

  it('freezes a composite attempt with one parent snapshot and refuses incomplete required context', async () => {
    const row = compositeRow('attempt-1', '2015-09')
    const db = makeDb({}, { 'attempt-1': row })
    const result = await freezeCompositeAttemptContext(db, 'attempt-1', frozenAt)

    expect(result.context.values).toMatchObject({ birthYearMonth: '2015-09', ageMonthsAtFreeze: 131, ageYearsAtFreeze: 10 })
    expect(row.contextSnapshotEncrypted).toEqual(expect.any(String))
    expect(row.contextSnapshotHash).toBe(result.hash)

    const incomplete = questionnaireRow('qa-incomplete', '')
    const incompleteDb = makeDb({ 'qa-incomplete': incomplete })
    await expect(freezeQuestionnaireAssessmentContext(incompleteDb, 'qa-incomplete', frozenAt))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(incompleteDb.questionnaireAssessment.updateMany).not.toHaveBeenCalled()
  })

  it('does not downgrade a damaged snapshot to an empty context', async () => {
    const context: AssessmentContextV1 = buildAssessmentContext({
      items: [contextItems[0]],
      answers: [{ formItemId: 'birth-month', value: '2014-02' }],
      frozenAt,
    })
    const row = questionnaireRow('qa-damaged', '2014-02')
    row.contextSnapshotEncrypted = encryptAssessmentContext(context)
    row.contextSnapshotHash = '0'.repeat(64)
    const db = makeDb({ 'qa-damaged': row })

    const readable = readQuestionnaireAssessmentContext(row)
    expect(readable).toMatchObject({ context: null, hash: row.contextSnapshotHash, decryptError: true })
    await expect(freezeQuestionnaireAssessmentContext(db, 'qa-damaged', frozenAt))
      .rejects.toMatchObject({ statusCode: 500 })
    expect(hashAssessmentContext(context)).not.toBe(row.contextSnapshotHash)
  })
})
