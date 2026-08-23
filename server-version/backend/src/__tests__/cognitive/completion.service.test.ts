import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveSession: { findUnique: vi.fn(), updateMany: vi.fn() },
    cognitiveTrial: { findMany: vi.fn() },
    cognitiveAssignment: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { completeSession } from '../../modules/cognitive/completion.service'
import { encryptCognitivePayload, decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'

const FAKE_CONFIG = { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }

// D6.1：completeSession 在 $transaction + FOR UPDATE 行锁内读取 session（$queryRaw 返回 raw 行）。
const sessionRow = (overrides: any = {}) => ({
  id: 'session-1',
  userId: 'student-1',
  participantKey: 'pkey',
  participantSnapshotEncrypted: 'x',
  assignmentId: 'asg-1',
  configId: 'config-1',
  testType: 'fake',
  attemptNo: 2,
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  finishedAt: null,
  scoreEncrypted: null,
  metricsEncrypted: null,
  qualityFlagsEncrypted: null,
  configVersion: '1.0.0',
  configSnapshotEncrypted: encryptCognitivePayload(FAKE_CONFIG),
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  randomSeed: 'seed',
  completionKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const rawRow = (s: any = sessionRow()) => ({
  id: s.id,
  user_id: s.userId,
  participant_key: s.participantKey,
  participant_snapshot_encrypted: s.participantSnapshotEncrypted,
  assignment_id: s.assignmentId,
  config_id: s.configId,
  test_type: s.testType,
  attempt_no: s.attemptNo,
  status: s.status,
  started_at: s.startedAt,
  finished_at: s.finishedAt,
  score_encrypted: s.scoreEncrypted,
  metrics_encrypted: s.metricsEncrypted,
  quality_flags_encrypted: s.qualityFlagsEncrypted,
  config_version: s.configVersion,
  config_snapshot_encrypted: s.configSnapshotEncrypted,
  engine_version: s.engineVersion,
  scoring_version: s.scoringVersion,
  random_seed: s.randomSeed,
  completion_key: s.completionKey,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
})

const trialRow = (trialIndex: number, payload: unknown) => ({
  id: `t-${trialIndex}`,
  sessionId: 'session-1',
  trialIndex,
  payloadEncrypted: encryptCognitivePayload(payload),
  payloadHash: 'hash',
  createdAt: new Date(),
})

const withTrials = (trials: { trialIndex: number; payload: unknown }[]) => {
  mockPrisma.cognitiveTrial.findMany.mockResolvedValue(trials.map((t) => trialRow(t.trialIndex, t.payload)))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  mockPrisma.$queryRaw.mockResolvedValue([rawRow()])
  mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(null)
})

describe('completeSession happy path', () => {
  it('scores 3 trials with 2 correct -> score ~66.67, writes encrypted result, closes session', async () => {
    withTrials([
      { trialIndex: 0, payload: { correct: true, rtMs: 400 } },
      { trialIndex: 1, payload: { correct: true, rtMs: 500 } },
      { trialIndex: 2, payload: { correct: false, rtMs: 600 } },
    ])
    mockPrisma.cognitiveSession.updateMany.mockResolvedValue({ count: 1 })

    const result = await completeSession('student-1', 'session-1')

    expect(result.status).toBe('COMPLETED')
    expect(result.score).toBeCloseTo(66.67, 2)
    expect(result.metrics).toEqual({
      trialCount: 3,
      correctCount: 2,
      accuracy: expect.any(Number),
      meanRtMs: 500,
    })
    expect(result.qualityFlags).toEqual({})

    // updateMany 条件写：where id + status=IN_PROGRESS；data 三列加密
    const update = mockPrisma.cognitiveSession.updateMany.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'session-1', status: 'IN_PROGRESS' })
    expect(update.data.status).toBe('COMPLETED')
    // 非明文：完整 envelope 明文 JSON（含真实值）不得出现在密文中（避免短子串随机撞中）
    const scoreEnvelopeJson = JSON.stringify({ version: 1, value: result.score })
    const metricsEnvelopeJson = JSON.stringify({
      version: 1,
      value: { trialCount: 3, correctCount: 2, accuracy: result.metrics.accuracy, meanRtMs: 500 },
    })
    expect(update.data.scoreEncrypted).not.toContain(scoreEnvelopeJson)
    expect(update.data.metricsEncrypted).not.toContain(metricsEnvelopeJson)
    expect(update.data.qualityFlagsEncrypted).toBeTruthy()
    // decrypt 后 == 写入值
    expect(decryptCognitivePayload<number>(update.data.scoreEncrypted)).toBeCloseTo(66.67, 2)
    expect(decryptCognitivePayload<Record<string, unknown>>(update.data.metricsEncrypted).correctCount).toBe(2)
  })
})

describe('completeSession rejects premature/malformed input', () => {
  it('rejects only 2 of 3 trials and keeps session IN_PROGRESS (no updateMany)', async () => {
    withTrials([
      { trialIndex: 0, payload: { correct: true, rtMs: 400 } },
      { trialIndex: 1, payload: { correct: true, rtMs: 500 } },
    ])
    await expect(completeSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveSession.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an index gap and keeps session IN_PROGRESS', async () => {
    withTrials([
      { trialIndex: 0, payload: { correct: true, rtMs: 400 } },
      { trialIndex: 1, payload: { correct: true, rtMs: 500 } },
      { trialIndex: 3, payload: { correct: false, rtMs: 600 } },
    ])
    await expect(completeSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveSession.updateMany).not.toHaveBeenCalled()
  })

  it('rejects rtMs above maxRtMs and keeps session IN_PROGRESS', async () => {
    withTrials([
      { trialIndex: 0, payload: { correct: true, rtMs: 400 } },
      { trialIndex: 1, payload: { correct: true, rtMs: 500 } },
      { trialIndex: 2, payload: { correct: false, rtMs: 60001 } },
    ])
    await expect(completeSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveSession.updateMany).not.toHaveBeenCalled()
  })
})

describe('completeSession status/ownership', () => {
  it('rejects cross-user completion', async () => {
    await expect(completeSession('student-2', 'session-1')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects ABANDONED / INVALID sessions', async () => {
    for (const status of ['ABANDONED', 'INVALID']) {
      mockPrisma.$queryRaw.mockResolvedValue([rawRow(sessionRow({ status }))])
      await expect(completeSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('is idempotent for COMPLETED sessions: returns stored result without re-scoring', async () => {
    const stored = { score: 100, metrics: { trialCount: 3, correctCount: 3 }, qualityFlags: {} }
    mockPrisma.$queryRaw.mockResolvedValue([
      rawRow(
        sessionRow({
          status: 'COMPLETED',
          finishedAt: new Date('2026-01-01'),
          scoreEncrypted: encryptCognitivePayload(stored.score),
          metricsEncrypted: encryptCognitivePayload(stored.metrics),
          qualityFlagsEncrypted: encryptCognitivePayload(stored.qualityFlags),
        })
      ),
    ])
    const result = await completeSession('student-1', 'session-1')
    expect(result.status).toBe('COMPLETED')
    expect(result.score).toBe(100)
    expect(mockPrisma.cognitiveTrial.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.cognitiveSession.updateMany).not.toHaveBeenCalled()
  })

  it('handles concurrent close: updateMany count=0 + reload COMPLETED returns stored result', async () => {
    withTrials([
      { trialIndex: 0, payload: { correct: true, rtMs: 400 } },
      { trialIndex: 1, payload: { correct: true, rtMs: 500 } },
      { trialIndex: 2, payload: { correct: false, rtMs: 600 } },
    ])
    mockPrisma.cognitiveSession.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(
      sessionRow({
        status: 'COMPLETED',
        finishedAt: new Date('2026-01-01'),
        scoreEncrypted: encryptCognitivePayload(66.66666666666667),
        metricsEncrypted: encryptCognitivePayload({ trialCount: 3, correctCount: 2, accuracy: 2 / 3, meanRtMs: 500 }),
        qualityFlagsEncrypted: encryptCognitivePayload({}),
      })
    )
    const result = await completeSession('student-1', 'session-1')
    expect(result.status).toBe('COMPLETED')
    expect(result.score).toBeCloseTo(66.67, 2)
  })
})
