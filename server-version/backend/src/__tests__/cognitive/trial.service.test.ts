import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'

// 密钥注入：加密/HMAC 依赖（64-hex 占位）
beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveSession: { findUnique: vi.fn() },
    cognitiveTrial: { create: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { appendTrial } from '../../modules/cognitive/trial.service'
import { decryptCognitivePayload, hashTrialPayload } from '../../modules/cognitive/cognitive.security'

const SESSION = {
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
  configSnapshotEncrypted: 'y',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  randomSeed: 'seed',
  completionKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const TRIAL = (overrides: any = {}) => ({
  id: 'trial-1',
  sessionId: 'session-1',
  trialIndex: 0,
  payloadEncrypted: 'enc',
  payloadHash: 'hash',
  createdAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cognitiveSession.findUnique.mockResolvedValue(SESSION)
})

describe('appendTrial validation', () => {
  it('rejects a missing session', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(null)
    await expect(appendTrial('student-1', 'nope', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects cross-user access', async () => {
    await expect(appendTrial('student-2', 'session-1', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects non-IN_PROGRESS sessions (COMPLETED/ABANDONED/INVALID)', async () => {
    for (const status of ['COMPLETED', 'ABANDONED', 'INVALID']) {
      mockPrisma.cognitiveSession.findUnique.mockResolvedValue({ ...SESSION, status })
      await expect(appendTrial('student-1', 'session-1', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
        .rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('rejects an invalid fake payload', async () => {
    await expect(appendTrial('student-1', 'session-1', { trialIndex: 0, payload: { correct: 'yes', rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('appendTrial persistence', () => {
  it('stores only encrypted payload + keyed hash, decryptable back to validated payload', async () => {
    mockPrisma.cognitiveTrial.create.mockImplementation(async ({ data }: any) =>
      TRIAL({ trialIndex: data.trialIndex, payloadEncrypted: data.payloadEncrypted, payloadHash: data.payloadHash })
    )
    const payload = { correct: true, rtMs: 420 }
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 0, payload })

    expect(result.trialIndex).toBe(0)
    const data = mockPrisma.cognitiveTrial.create.mock.calls[0][0].data
    // 密文非明文
    expect(data.payloadEncrypted).not.toContain('true')
    expect(data.payloadEncrypted).not.toContain('420')
    // decrypt 后 == validated payload
    expect(decryptCognitivePayload(data.payloadEncrypted)).toEqual(payload)
    // hash == 服务端 keyed HMAC
    expect(data.payloadHash).toBe(hashTrialPayload(payload))
  })

  it('produces same hash for same normalized payload, different hash for different payload', () => {
    const p1 = { correct: true, rtMs: 420 }
    const p2 = { correct: false, rtMs: 420 }
    expect(hashTrialPayload(p1)).toBe(hashTrialPayload({ rtMs: 420, correct: true })) // 键序无关
    expect(hashTrialPayload(p1)).not.toBe(hashTrialPayload(p2))
  })

  it('replays an identical trial (same index + same payload) without inserting', async () => {
    const payload = { correct: true, rtMs: 420 }
    mockPrisma.cognitiveTrial.create.mockRejectedValue({ code: 'P2002' })
    mockPrisma.cognitiveTrial.findUnique.mockResolvedValue(
      TRIAL({ trialIndex: 1, payloadHash: hashTrialPayload(payload) })
    )
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 1, payload })
    expect(result.trialId).toBe('trial-1')
    expect(result.trialIndex).toBe(1)
  })

  it('returns 409 for same index with different payload and never overwrites', async () => {
    mockPrisma.cognitiveTrial.create.mockRejectedValue({ code: 'P2002' })
    mockPrisma.cognitiveTrial.findUnique.mockResolvedValue(
      TRIAL({ trialIndex: 1, payloadHash: hashTrialPayload({ correct: true, rtMs: 420 }) })
    )
    await expect(
      appendTrial('student-1', 'session-1', { trialIndex: 1, payload: { correct: false, rtMs: 999 } })
    ).rejects.toMatchObject({ statusCode: 409 })
    // 不允许 UPDATE/DELETE 重插：只调用过 findUnique 读取
    expect(mockPrisma.cognitiveTrial.findUnique).toHaveBeenCalledTimes(1)
  })

  it('allows out-of-order index arrival (index 2 before index 1)', async () => {
    mockPrisma.cognitiveTrial.create.mockImplementation(async ({ data }: any) =>
      TRIAL({ id: 'trial-3', trialIndex: data.trialIndex })
    )
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 2, payload: { correct: true, rtMs: 400 } })
    expect(result.trialIndex).toBe(2)
  })
})
