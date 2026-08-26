import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPrisma,
  mockLogger,
  mockWordSegmentation,
} = vi.hoisted(() => ({
  mockPrisma: {
    classroomQuestion: { findUnique: vi.fn() },
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockWordSegmentation: {
    calculateWordFrequency: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/logger', () => ({ logger: mockLogger }))
vi.mock('../../services/wordSegmentation', () => ({
  wordSegmentation: mockWordSegmentation,
}))

import { StatsAggregator } from '../../services/statsAggregator'

describe('classroom answer log sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.classroomQuestion.findUnique.mockResolvedValue({
      id: 'question-1',
      questionContent: { type: 'fill_blank' },
      answers: [
        { id: 'answer-1', answer: '学生的秘密回答' },
      ],
      classroom: {
        sessions: [{ id: 'session-1' }],
      },
    })
    mockWordSegmentation.calculateWordFrequency.mockResolvedValue({
      学生: 1,
    })
  })

  it('keeps answer text in the authorized result but never in logs', async () => {
    const result = await new StatsAggregator().getQuestionStats('question-1')

    expect(result?.stats.answers).toEqual(['学生的秘密回答'])
    const allLogs = JSON.stringify([
      mockLogger.debug.mock.calls,
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
    ])
    expect(allLogs).not.toContain('学生的秘密回答')
  })
})
