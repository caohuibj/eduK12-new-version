import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'

// 密钥注入：加密/HMAC 依赖（64-hex 占位）
beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveTrial: { create: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { appendTrial } from '../../modules/cognitive/trial.service'
import { decryptCognitivePayload, encryptCognitivePayload, hashTrialPayload } from '../../modules/cognitive/cognitive.security'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'

// D6.1：appendTrial 在 $transaction + FOR UPDATE 行锁内读取 session（$queryRaw 返回 raw 行）。
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
  resultSnapshotEncrypted: null,
  configVersion: '1.0.0',
  configSnapshotEncrypted: 'y',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  randomSeed: 'seed',
  completionKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const rawRow = (s: any = SESSION) => ({
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
  result_snapshot_encrypted: s.resultSnapshotEncrypted,
  config_version: s.configVersion,
  config_snapshot_encrypted: s.configSnapshotEncrypted,
  engine_version: s.engineVersion,
  scoring_version: s.scoringVersion,
  random_seed: s.randomSeed,
  completion_key: s.completionKey,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
})

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
  // 行锁路径：$transaction 透传同一 mock 作为 tx；$queryRaw 返回锁定的 session 行。
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  mockPrisma.$queryRaw.mockResolvedValue([rawRow()])
  mockPrisma.cognitiveTrial.findUnique.mockResolvedValue(null) // 锁内查重默认无冲突
})

describe('appendTrial validation (locked)', () => {
  it('rejects a missing session', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    await expect(appendTrial('student-1', 'nope', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects cross-user access', async () => {
    await expect(appendTrial('student-2', 'session-1', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects non-IN_PROGRESS sessions (COMPLETED/ABANDONED/INVALID)', async () => {
    for (const status of ['COMPLETED', 'ABANDONED', 'INVALID']) {
      mockPrisma.$queryRaw.mockResolvedValue([rawRow({ ...SESSION, status })])
      await expect(appendTrial('student-1', 'session-1', { trialIndex: 0, payload: { correct: true, rtMs: 400 } }))
        .rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('rejects an invalid fake payload', async () => {
    await expect(appendTrial('student-1', 'session-1', { trialIndex: 0, payload: { correct: 'yes', rtMs: 400 } }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('appendTrial persistence (locked)', () => {
  it('stores only encrypted payload + keyed hash, decryptable back to validated payload', async () => {
    mockPrisma.cognitiveTrial.create.mockImplementation(async ({ data }: any) =>
      TRIAL({ trialIndex: data.trialIndex, payloadEncrypted: data.payloadEncrypted, payloadHash: data.payloadHash })
    )
    const payload = { correct: true, rtMs: 420 }
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 0, payload })

    expect(result.trialIndex).toBe(0)
    const data = mockPrisma.cognitiveTrial.create.mock.calls[0][0].data
    // 密文非明文：完整 envelope 明文 JSON 不得出现在密文中（避免短子串随机撞中）
    const envelopeJson = JSON.stringify({ version: 1, value: payload })
    expect(data.payloadEncrypted).not.toContain(envelopeJson)
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
    // 锁内查重发现同 index + 同 hash → 返回 existing，不 create。
    mockPrisma.cognitiveTrial.findUnique.mockResolvedValue(
      TRIAL({ trialIndex: 1, payloadHash: hashTrialPayload(payload) })
    )
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 1, payload })
    expect(result.trialId).toBe('trial-1')
    expect(result.trialIndex).toBe(1)
    expect(mockPrisma.cognitiveTrial.create).not.toHaveBeenCalled()
  })

  it('returns 409 for same index with different payload and never overwrites', async () => {
    mockPrisma.cognitiveTrial.findUnique.mockResolvedValue(
      TRIAL({ trialIndex: 1, payloadHash: hashTrialPayload({ correct: true, rtMs: 420 }) })
    )
    await expect(
      appendTrial('student-1', 'session-1', { trialIndex: 1, payload: { correct: false, rtMs: 999 } })
    ).rejects.toMatchObject({ statusCode: 409 })
    // 不允许 UPDATE/DELETE 重插：create 从未被调用
    expect(mockPrisma.cognitiveTrial.create).not.toHaveBeenCalled()
  })

  it('allows out-of-order index arrival (index 2 before index 1)', async () => {
    mockPrisma.cognitiveTrial.create.mockImplementation(async ({ data }: any) =>
      TRIAL({ id: 'trial-3', trialIndex: data.trialIndex })
    )
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 2, payload: { correct: true, rtMs: 400 } })
    expect(result.trialIndex).toBe(2)
  })

  it('persists a v2 trial envelope and never accepts client scoring fields', async () => {
    const definition = getCognitiveV2TaskDefinition('fake', '1.0.0', '1.0.0')
    if (!definition) throw new Error('fake v2 definition missing')
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.0.0',
      config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
    })
    mockPrisma.$queryRaw.mockResolvedValue([
      rawRow({
        ...SESSION,
        configSnapshotEncrypted: encryptCognitivePayload(snapshot),
      }),
    ])
    mockPrisma.cognitiveTrial.create.mockImplementation(async ({ data }: any) =>
      TRIAL({ trialIndex: data.trialIndex, payloadEncrypted: data.payloadEncrypted, payloadHash: data.payloadHash })
    )

    const envelope = createTrialEnvelope({
      trialIndex: 0,
      phase: 'test',
      payload: { correct: true, rtMs: 420 },
      startedAtPerfMs: 100,
      endedAtPerfMs: 520,
    })
    const result = await appendTrial('student-1', 'session-1', { trialIndex: 0, payload: envelope })
    expect(result.trialIndex).toBe(0)
    const data = mockPrisma.cognitiveTrial.create.mock.calls[0][0].data
    expect(decryptCognitivePayload(data.payloadEncrypted)).toEqual(envelope)
    expect(data.payloadHash).toBe(hashTrialPayload(envelope))

    await expect(appendTrial('student-1', 'session-1', {
      trialIndex: 1,
      payload: createTrialEnvelope({
        trialIndex: 1,
        phase: 'test',
        payload: { correct: true, rtMs: 420, score: 100 },
        startedAtPerfMs: 600,
        endedAtPerfMs: 1020,
      }),
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('fails closed when the encrypted session config is corrupt', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      rawRow({ ...SESSION, configSnapshotEncrypted: '00:00:00' }),
    ])
    await expect(appendTrial('student-1', 'session-1', {
      trialIndex: 0,
      payload: { correct: true, rtMs: 420 },
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveTrial.create).not.toHaveBeenCalled()
  })
})
