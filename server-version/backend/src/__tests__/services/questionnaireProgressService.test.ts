import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAssessment: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  applyQuestionnaireProgressDelta,
  refreshQuestionnaireProgress,
  withQuestionnaireAnswerTransaction,
  withSerializableQuestionnaireTransaction,
} from '../../services/questionnaireProgressService'

const makeQa = (overrides: Record<string, unknown> = {}) => ({
  id: 'qa-1',
  status: 'IN_PROGRESS',
  progress: 0,
  startedAt: new Date('2026-08-26T00:00:00.000Z'),
  completedAt: null,
  questionnaire: {
    name: '问卷',
    formItems: [{ id: 'form-1', position: 0, label: '年级' }],
    questionnaireScales: [{
      id: 'qs-1',
      scaleId: 'scale-1',
      position: 1,
      scale: { id: 'scale-1', name: '量表', dimensions: [] },
    }],
  },
  scaleAssessments: [{
    id: 'assessment-1',
    scaleId: 'scale-1',
    status: 'IN_PROGRESS',
    completedAt: null,
    totalTime: null,
    scores: null,
    feedback: null,
    scale: { id: 'scale-1', name: '量表', dimensions: [] },
  }],
  formAnswers: [],
  ...overrides,
})

describe('questionnaire progress consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    mockPrisma.questionnaireAssessment.updateMany.mockResolvedValue({ count: 1 })
  })

  it('recomputes cached counters from child rows instead of incrementing them', async () => {
    const qa = makeQa({
      completedScales: 99,
      completedForms: 99,
      formAnswers: [{ formItemId: 'form-1', value: '三年级' }],
      scaleAssessments: [{
        id: 'assessment-1',
        scaleId: 'scale-1',
        status: 'COMPLETED',
        completedAt: new Date(),
        totalTime: 10,
        scores: null,
        feedback: null,
        scale: { id: 'scale-1', name: '量表', dimensions: [] },
      }],
    })
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(qa)

    const result = await refreshQuestionnaireProgress(mockPrisma as any, 'qa-1')

    expect(result).toMatchObject({ completedScales: 1, completedForms: 1, progress: 100, completed: true })
    expect(mockPrisma.questionnaireAssessment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'qa-1', status: 'IN_PROGRESS' },
      data: expect.objectContaining({ completedScales: 1, completedForms: 1, progress: 100, status: 'COMPLETED' }),
    }))
    expect(mockPrisma.questionnaireAssessment.updateMany.mock.calls[0][0].data).not.toHaveProperty('completedScales', 100)
  })

  it('does not perform a second completion transition for an already completed row', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(makeQa({
      status: 'COMPLETED',
      progress: 100,
    }))

    const result = await refreshQuestionnaireProgress(mockPrisma as any, 'qa-1')

    expect(result?.completed).toBe(true)
    expect(mockPrisma.questionnaireAssessment.updateMany).not.toHaveBeenCalled()
  })

  it('keeps abandoned rows closed and does not recompute or transition them', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(makeQa({
      status: 'ABANDONED',
      progress: 25,
      completedScales: 0,
      completedForms: 0,
      formAnswers: [{ formItemId: 'form-1', value: '三年级' }],
    }))

    const result = await refreshQuestionnaireProgress(mockPrisma as any, 'qa-1')

    expect(result).toMatchObject({ status: 'ABANDONED', progress: 25, completed: false })
    expect(mockPrisma.questionnaireAssessment.updateMany).not.toHaveBeenCalled()
  })

  it('retries serializable conflicts', async () => {
    const transactionCallback = vi.fn(async () => 'ok')
    mockPrisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(transactionCallback)

    await expect(withSerializableQuestionnaireTransaction(async (tx) => {
      void tx
      return 'ok'
    })).resolves.toBe('ok')

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('retries raw-query serialization failures reported as PostgreSQL 40001', async () => {
    mockPrisma.$transaction
      .mockRejectedValueOnce({ code: 'P2010', meta: { code: '40001' } })
      .mockResolvedValueOnce('ok')

    await expect(withSerializableQuestionnaireTransaction(async () => 'ok')).resolves.toBe('ok')
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('locks only the current assessment for ordinary answer transactions', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'qa-1' }])
    const transactionCallback = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: queryRaw }))
    mockPrisma.$transaction.mockImplementation(transactionCallback)

    await expect(withQuestionnaireAnswerTransaction('session-1', async (tx) => tx)).resolves.toEqual({ $queryRaw: queryRaw })

    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    })
  })

  it('does not hide an assessment-lock failure or invoke the answer callback', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('lock query failed'))
    const callback = vi.fn()
    mockPrisma.$transaction.mockImplementation(async (transaction: (tx: unknown) => Promise<unknown>) => (
      transaction({ $queryRaw: queryRaw })
    ))

    await expect(withQuestionnaireAnswerTransaction('session-1', callback)).rejects.toThrow('lock query failed')
    expect(callback).not.toHaveBeenCalled()
  })

  it('uses an atomic field increment for a newly completed form', async () => {
    const result = await applyQuestionnaireProgressDelta(
      mockPrisma as any,
      { id: 'qa-1', status: 'IN_PROGRESS', progress: 0, completedScales: 1, completedForms: 0 },
      1,
      2,
    )

    expect(result).toEqual({ completedScales: 1, completedForms: 1, progress: 100 })
    expect(mockPrisma.questionnaireAssessment.updateMany).toHaveBeenCalledWith({
      where: { id: 'qa-1', status: 'IN_PROGRESS' },
      data: { completedForms: { increment: 1 }, progress: 100 },
    })
  })

  it('does not write a counter delta when an existing form is edited', async () => {
    const result = await applyQuestionnaireProgressDelta(
      mockPrisma as any,
      { id: 'qa-1', status: 'IN_PROGRESS', progress: 50, completedScales: 0, completedForms: 1 },
      0,
      2,
    )

    expect(result).toEqual({ completedScales: 0, completedForms: 1, progress: 50 })
    expect(mockPrisma.questionnaireAssessment.updateMany).toHaveBeenCalledWith({
      where: { id: 'qa-1', status: 'IN_PROGRESS' },
      data: { progress: 50 },
    })
  })
})
