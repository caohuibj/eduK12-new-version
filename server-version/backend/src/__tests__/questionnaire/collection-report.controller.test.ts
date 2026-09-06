import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma, mockCache } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'qa-1' }]),
    questionnaireAssessment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockCache: {
    getQuestionnaireScales: vi.fn(),
    getQuestionnaireFormItems: vi.fn(),
    getQuestionnaireStartContent: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/cacheService', () => ({ cacheService: mockCache }))

import { questionnaireController } from '../../controllers/questionnaireController'
import { publicQuestionnaireController } from '../../controllers/publicQuestionnaireController'

const scale = {
  id: 'scale-1',
  code: 'S-1',
  name: '学习投入',
}

const v2ScaleResult = {
  schemaVersion: 2 as const,
  instrument: { scaleId: 'scale-1', code: 'S-1', name: '学习投入', instrumentVersion: '2.0.0' },
  method: {
    scaleId: 'scale-1',
    instrumentVersion: '2.0.0',
    scoringVersion: '2.0.0',
    reportVersion: '2.0.0',
    definitionHash: 'h'.repeat(64),
    referenceVersions: [],
    assessmentContext: null,
  },
  quality: { status: 'interpretable' as const, flags: [] },
  itemScores: [],
  scores: [{
    key: 'engagement',
    type: 'dimension' as const,
    label: '投入',
    direction: 'descriptive' as const,
    canonical: true,
    displayPrecision: 1,
    value: 0,
    range: { min: 0, max: 20 },
    expectedItems: ['Q1'],
    answeredItems: ['Q1'],
    status: 'calculated' as const,
    prorated: false,
  }],
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。',
}

const makeQa = (overrides: Record<string, unknown> = {}) => ({
  id: 'qa-1',
  sessionId: 'session-1',
  questionnaireId: 'questionnaire-1',
  userId: 'student-1',
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-08-20T00:00:00.000Z'),
  completedAt: null,
  totalTime: null,
  questionnaire: {
    id: 'questionnaire-1',
    name: '学习问卷',
    instruction: null,
    formItems: [{ id: 'form-1', label: '年级', position: 0 }],
    questionnaireScales: [{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 1, scale }],
  },
  scaleAssessments: [{
    id: 'assessment-1',
    scaleId: 'scale-1',
    status: 'COMPLETED',
    progress: 100,
    result: v2ScaleResult,
    completedAt: new Date('2026-08-20T01:00:00.000Z'),
    totalTime: 0,
    scale,
  }],
  formAnswers: [{ formItemId: 'form-1', value: '三年级' }],
  // This shape represents pre-PR6A rows.  It must be read for individual
  // scale values but never exposed as a collection aggregate.
  aggregateReport: {
    averageScore: 99,
    overallSummary: '不应出现在当前报告',
    scaleReports: [{ scaleId: 'scale-1', result: v2ScaleResult }],
  },
  ...overrides,
})

const response = () => ({
  json: vi.fn(),
  status: vi.fn().mockReturnThis(),
}) as any

const dataOf = (res: any) => res.json.mock.calls[0]?.[0]?.data

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma))
  mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(makeQa())
  mockPrisma.questionnaireAssessment.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.questionnaireAssessment.update.mockImplementation(async ({ data }: any) => ({
    ...makeQa({ status: 'COMPLETED', completedAt: new Date('2026-08-20T00:01:00.000Z'), totalTime: 1000 }),
    ...data,
  }))
  mockCache.getQuestionnaireScales.mockResolvedValue([{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 1, scale }])
  mockCache.getQuestionnaireFormItems.mockResolvedValue([{ id: 'form-1', label: '年级', position: 0 }])
  mockCache.getQuestionnaireStartContent.mockResolvedValue({
    questionnaireScales: [{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 1, scale }],
    formItems: [{ id: 'form-1', label: '年级', position: 0 }],
  })
})

describe('collection-only questionnaire completion/report contract', () => {
  it('auth explicit completion on a legacy attempt stays on the 410 boundary (O4 dispatch)', async () => {
    // Since the completion guard, legacy attempts are 410 on /complete — the
    // controller (O4 load-once dispatch) owns that boundary directly now.
    // The per-scale projection contract below remains covered by the
    // automatic-completion and public-completion cases.
    const qa = makeQa()
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(qa)
    const res = response()

    await questionnaireController.completeAssessment({ params: { id: 'qa-1' }, user: { userId: 'student-1' } } as any, res)

    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LEGACY_WRITE_DISABLED' }))
  })

  it('auth automatic completion follows the same projection', async () => {
    const qa = makeQa()
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(qa)
    const res = response()

    await questionnaireController.getAssessment({ params: { id: 'qa-1' }, user: { userId: 'student-1' } } as any, res)

    expect(res.json).toHaveBeenCalled()
    expect(dataOf(res).questionnaireAssessment.status).toBe('COMPLETED')
    expect(mockPrisma.questionnaireAssessment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aggregateReport: Prisma.DbNull, aggregateReportEncrypted: expect.any(String) }),
    }))
  })

  it('public explicit completion returns the same scale DTO and strips legacy aggregate data', async () => {
    const qa = makeQa({ userId: null })
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(qa)
    const res = response()

    await publicQuestionnaireController.completeAssessment({ params: { sessionId: 'session-1' } } as any, res)

    expect(dataOf(res)).toMatchObject({ backgroundValues: [{ itemId: 'form-1', value: '三年级' }], unitReports: [{ scaleId: 'scale-1', scores: [{ key: 'engagement', value: 0 }], totalTime: 0 }] })
    expect(dataOf(res)).not.toHaveProperty('averageScore')
    expect(dataOf(res)).not.toHaveProperty('overallSummary')
    expect(dataOf(res)).not.toHaveProperty('aggregateReport')
  })

  it('public automatic completion persists the same collection-only shape', async () => {
    const qa = makeQa({ userId: null })
    mockPrisma.questionnaireAssessment.findUnique
      .mockResolvedValueOnce(qa)
      .mockResolvedValueOnce(qa)
    const res = response()

    await publicQuestionnaireController.getAssessment({ params: { sessionId: 'session-1' } } as any, res)

    expect(dataOf(res).questionnaireAssessment.status).toBe('COMPLETED')
    expect(mockPrisma.questionnaireAssessment.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'qa-1' },
      select: expect.objectContaining({
        contextSnapshotEncrypted: true,
        questionnaire: expect.objectContaining({ select: expect.objectContaining({ formItems: expect.any(Object) }) }),
      }),
    }))
    expect(mockPrisma.questionnaireAssessment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aggregateReport: Prisma.DbNull, aggregateReportEncrypted: expect.any(String) }),
    }))
  })

  it('authenticated report reads legacy scaleReports without reviving aggregate conclusions', async () => {
    const qa = makeQa({ status: 'COMPLETED', completedAt: new Date('2026-08-20T00:01:00.000Z'), totalTime: 1000 })
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(qa)
    const res = response()

    await questionnaireController.getReport({ params: { id: 'qa-1' }, user: { userId: 'student-1' } } as any, res)

    expect(dataOf(res).unitReports).toHaveLength(1)
    expect(dataOf(res).unitReports[0]).toMatchObject({ scaleId: 'scale-1', caveats: [], disclaimer: expect.any(String) })
    expect(dataOf(res)).not.toHaveProperty('averageScore')
    expect(dataOf(res)).not.toHaveProperty('overallSummary')
  })
})
