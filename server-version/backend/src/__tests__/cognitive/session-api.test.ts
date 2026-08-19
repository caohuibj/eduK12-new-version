import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserRole } from '@prisma/client'

// mock session service：api 测试聚焦 鉴权/参数解析/响应形状
vi.mock('../../modules/cognitive/session.service', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  restartSession: vi.fn(),
}))
// assignment.service 也会被 controller import（真实模块，不触 DB 逻辑路径）
vi.mock('../../modules/cognitive/assignment.service', () => ({
  createAssignment: vi.fn(),
  listTeacherAssignments: vi.fn(),
  listStudentAssignments: vi.fn(),
  getAssignmentForTeacher: vi.fn(),
  getAssignmentForStudent: vi.fn(),
  updateDraftAssignment: vi.fn(),
  publishAssignment: vi.fn(),
  archiveAssignment: vi.fn(),
}))

import * as sessionService from '../../modules/cognitive/session.service'
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
  body: {},
  query: {},
  params: {},
  ...overrides,
})

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cognitive session API', () => {
  it('rejects unauthenticated create', async () => {
    const req = makeReq({ user: undefined })
    const res = makeRes()
    await cognitiveController.createSession(req, res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects body with forged userId/participantKey/attemptNo/config', async () => {
    const req = makeReq({
      body: {
        assignmentId: 'asg-1',
        userId: 'other',
        participantKey: 'x',
        attemptNo: 5,
        config: {},
        randomSeed: 's',
      },
    })
    const res = makeRes()
    await cognitiveController.createSession(req, res)
    expect(res.statusCode).toBe(400) // strict schema 拒绝多余字段
  })

  it('returns 404 for missing session', async () => {
    const req = makeReq({ params: { id: 'nope' } })
    const res = makeRes()
    ;(sessionService.getSession as any).mockRejectedValue({ statusCode: 404, message: 'CognitiveSession not found' })
    await cognitiveController.getSession(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns code:0 with runner payload on create', async () => {
    const req = makeReq({ body: { assignmentId: 'asg-1' } })
    const res = makeRes()
    ;(sessionService.createSession as any).mockResolvedValue({
      sessionId: 'session-1',
      assignmentId: 'asg-1',
      testType: 'fake',
      attemptNo: 1,
      status: 'IN_PROGRESS',
      configVersion: '1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      config: { trialCount: 3 },
      randomSeed: 'seed',
    })
    await cognitiveController.createSession(req, res)
    expect(res.body.code).toBe(0)
    expect(res.body.data.sessionId).toBe('session-1')
    expect(res.body.data.participantKey).toBeUndefined()
    expect(res.body.data.configSnapshotEncrypted).toBeUndefined()
  })

  it('rejects restart with a non-empty body', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: { attemptNo: 9 } })
    const res = makeRes()
    await cognitiveController.restartSession(req, res)
    expect(res.statusCode).toBe(400)
  })
})
