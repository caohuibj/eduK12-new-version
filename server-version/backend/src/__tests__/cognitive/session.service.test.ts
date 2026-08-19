import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'

// 密钥注入：加密/participantKey 依赖（64-hex 占位）
beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

// 绝不连真实 DB：mock config/database 单例
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveAssignment: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    courseStudent: { findUnique: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
    cognitiveSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  createSession,
  getSession,
  restartSession,
} from '../../modules/cognitive/session.service'
import { decryptCognitivePayload, encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'

const PUBLISHED_ASSIGNMENT = {
  id: 'asg-1',
  courseId: 'course-1',
  courseSnapshot: null,
  configId: 'config-1',
  createdBy: 'teacher-1',
  title: 'Fake',
  instruction: null,
  status: 'PUBLISHED',
  opensAt: null,
  dueAt: null,
  maxAttempts: 2,
  required: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
}

const CONFIG = {
  id: 'config-1',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake 1.0.0',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}

const sessionRow = (overrides: any = {}) => ({
  id: 'session-1',
  userId: 'student-1',
  participantKey: 'pkey',
  participantSnapshotEncrypted: 'enc-snap',
  assignmentId: 'asg-1',
  configId: 'config-1',
  testType: 'fake',
  attemptNo: 1,
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  finishedAt: null,
  scoreEncrypted: null,
  metricsEncrypted: null,
  qualityFlagsEncrypted: null,
  configVersion: '1.0.0',
  // 必须为真实密文（toRunnerPayload / getSession 会严格解密）
  configSnapshotEncrypted: encryptCognitivePayload({
    trialCount: 3,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  }),
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  randomSeed: 'seed',
  completionKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(PUBLISHED_ASSIGNMENT)
  mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1', title: 'C1' })
  mockPrisma.courseStudent.findUnique.mockResolvedValue({ status: 'ACTIVE' })
  mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(CONFIG)
  mockPrisma.user.findUnique.mockResolvedValue({ nickname: 'Student 1' })
  // $transaction 透传同一 mock 作为 tx
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
})

describe('createSession eligibility', () => {
  it('rejects a missing assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(null)
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a non-PUBLISHED assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...PUBLISHED_ASSIGNMENT, status: 'DRAFT' })
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an assignment without course', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...PUBLISHED_ASSIGNMENT, courseId: null })
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a missing course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(null)
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a PENDING membership', async () => {
    mockPrisma.courseStudent.findUnique.mockResolvedValue({ status: 'PENDING' })
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects a not-yet-open assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...PUBLISHED_ASSIGNMENT,
      opensAt: new Date(Date.now() + 3600_000),
    })
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a past-due assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...PUBLISHED_ASSIGNMENT,
      dueAt: new Date(Date.now() - 3600_000),
    })
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('createSession data', () => {
  it('creates a session with participantKey, encrypted snapshots, randomSeed, attemptNo=1', async () => {
    mockPrisma.cognitiveSession.findFirst.mockResolvedValue(null) // no existing IN_PROGRESS
    mockPrisma.cognitiveSession.count.mockResolvedValue(0)
    mockPrisma.cognitiveSession.create.mockImplementation(async ({ data }: any) =>
      sessionRow({ participantKey: data.participantKey, randomSeed: data.randomSeed, attemptNo: data.attemptNo })
    )

    const result = await createSession('student-1', 'asg-1')

    expect(result.sessionId).toBe('session-1')
    expect(result.attemptNo).toBe(1)
    expect(result.randomSeed).toBeTruthy()
    expect((result as any).participantKey).toBeUndefined()
    expect((result as any).configSnapshotEncrypted).toBeUndefined()
    expect((result as any).userId).toBeUndefined()

    const createData = mockPrisma.cognitiveSession.create.mock.calls[0][0].data
    expect(createData.participantKey).toMatch(/^[0-9a-f]{64}$/)
    expect(createData.participantKey).not.toBe('student-1')
    // participantSnapshot 密文非明文
    expect(createData.participantSnapshotEncrypted).not.toContain('Student 1')
    expect(decryptCognitivePayload<{ nickname: string | null }>(createData.participantSnapshotEncrypted).nickname).toBe('Student 1')
    // configSnapshot 密文非明文，decrypt 后等于 validated config
    expect(createData.configSnapshotEncrypted).not.toContain('trialCount')
    expect(decryptCognitivePayload<Record<string, unknown>>(createData.configSnapshotEncrypted).trialCount).toBe(3)
    expect(createData.randomSeed).toMatch(/^[0-9a-f]{32}$/)
    // version 字段与 config row 一致
    expect(createData.configVersion).toBe('1.0.0')
    expect(createData.engineVersion).toBe('1.0.0')
    expect(createData.scoringVersion).toBe('1.0.0')
  })

  it('returns the existing IN_PROGRESS session without creating a new one', async () => {
    mockPrisma.cognitiveSession.findFirst.mockResolvedValue(sessionRow({ attemptNo: 2 }))
    const result = await createSession('student-1', 'asg-1')
    expect(result.attemptNo).toBe(2)
    expect(mockPrisma.cognitiveSession.create).not.toHaveBeenCalled()
  })

  it('rejects when maxAttempts reached', async () => {
    mockPrisma.cognitiveSession.findFirst.mockResolvedValue(null)
    mockPrisma.cognitiveSession.count.mockResolvedValue(2) // maxAttempts=2
    await expect(createSession('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('advances attemptNo after completed/abandoned sessions', async () => {
    // 第一次 findFirst：无 IN_PROGRESS；第二次 findFirst：上一 attempt 为 1
    mockPrisma.cognitiveSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ attemptNo: 1 })
    mockPrisma.cognitiveSession.count.mockResolvedValue(1)
    mockPrisma.cognitiveSession.create.mockImplementation(async ({ data }: any) =>
      sessionRow({ attemptNo: data.attemptNo })
    )
    const result = await createSession('student-1', 'asg-1')
    expect(result.attemptNo).toBe(2)
  })
})

describe('getSession', () => {
  it('rejects cross-user access', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(sessionRow())
    await expect(getSession('student-2', 'session-1')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns run info with decrypted config and randomSeed, no score/metrics for IN_PROGRESS', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(
      sessionRow({ randomSeed: 'rnd' })
    )
    const result = await getSession('student-1', 'session-1')
    expect(result.sessionId).toBe('session-1')
    expect(result.randomSeed).toBe('rnd')
    expect((result as any).score).toBeUndefined()
    expect((result as any).metrics).toBeUndefined()
  })
})

describe('restartSession', () => {
  it('abandons the old session and creates attemptNo+1', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(sessionRow({ attemptNo: 1 }))
    mockPrisma.cognitiveSession.count.mockResolvedValue(1) // maxAttempts=2
    mockPrisma.cognitiveSession.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.cognitiveSession.create.mockImplementation(async ({ data }: any) =>
      sessionRow({ attemptNo: data.attemptNo, status: data.status })
    )

    const result = await restartSession('student-1', 'session-1')

    expect(mockPrisma.cognitiveSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1', status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED', finishedAt: expect.any(Date) },
      })
    )
    expect(result.attemptNo).toBe(2)
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('rejects restart when maxAttempts reached', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(sessionRow({ attemptNo: 2 }))
    mockPrisma.cognitiveSession.count.mockResolvedValue(2)
    await expect(restartSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects restarting a non-IN_PROGRESS session', async () => {
    mockPrisma.cognitiveSession.findUnique.mockResolvedValue(sessionRow({ status: 'COMPLETED' }))
    await expect(restartSession('student-1', 'session-1')).rejects.toMatchObject({ statusCode: 400 })
  })
})
