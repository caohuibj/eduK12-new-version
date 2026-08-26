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
  refreshQuestionnaireProgress,
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
})
