import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveSession: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { listMyHistory } from '../../modules/cognitive/history.service'

process.env.DATA_ENCRYPTION_KEY = '11'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cognitive history service', () => {
  it('returns only the student’s completed summary page', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        assignmentId: 'assignment-1',
        testType: 'reaction',
        attemptNo: 1,
        configVersion: '1.0.0',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        finishedAt: new Date('2026-08-20T00:00:00Z'),
        scoreEncrypted: encryptCognitivePayload(88),
        qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
        assignment: { title: 'Reaction pilot' },
      },
    ])
    mockPrisma.cognitiveSession.count.mockResolvedValue(3)

    const result = await listMyHistory('student-1', { page: 2, pageSize: 1, skip: 1, take: 1 })

    expect(mockPrisma.cognitiveSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'student-1', status: 'COMPLETED' },
      skip: 1,
      take: 1,
      select: expect.not.objectContaining({ metricsEncrypted: true }),
    }))
    expect(mockPrisma.cognitiveSession.count).toHaveBeenCalledWith({
      where: { userId: 'student-1', status: 'COMPLETED' },
    })
    expect(result).toEqual({
      total: 3,
      list: [{
        sessionId: 'session-1',
        assignmentId: 'assignment-1',
        title: 'Reaction pilot',
        testType: 'reaction',
        attemptNo: 1,
        configVersion: '1.0.0',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        finishedAt: new Date('2026-08-20T00:00:00Z'),
        score: 88,
        qualityState: 'interpretable',
      }],
    })
  })

  it('marks a non-interpretable result without exposing its flags', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([{
      id: 'session-2',
      assignmentId: null,
      testType: 'stroop',
      attemptNo: 1,
      configVersion: '1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      finishedAt: null,
      scoreEncrypted: encryptCognitivePayload(30),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: false, interrupted: true }),
      assignment: null,
    }])
    mockPrisma.cognitiveSession.count.mockResolvedValue(1)

    const [item] = (await listMyHistory('student-1', { page: 1, pageSize: 20, skip: 0, take: 20 })).list

    expect(item).toMatchObject({ title: 'stroop 测评', score: 30, qualityState: 'insufficient' })
    expect(item).not.toHaveProperty('metrics')
    expect(item).not.toHaveProperty('qualityFlags')
  })
})
