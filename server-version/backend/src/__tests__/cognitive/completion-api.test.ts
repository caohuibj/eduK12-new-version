import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserRole } from '@prisma/client'

vi.mock('../../modules/cognitive/completion.service', () => ({
  completeSession: vi.fn(),
}))
vi.mock('../../modules/cognitive/session.service', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  restartSession: vi.fn(),
}))
vi.mock('../../modules/cognitive/trial.service', () => ({
  appendTrial: vi.fn(),
}))
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

import * as completionService from '../../modules/cognitive/completion.service'
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

describe('cognitive completion API', () => {
  it('accepts an empty body', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: {} })
    const res = makeRes()
    ;(completionService.completeSession as any).mockResolvedValue({
      sessionId: 'session-1',
      status: 'COMPLETED',
      score: 66.67,
      metrics: {},
      qualityFlags: {},
    })
    await cognitiveController.completeSession(req, res)
    expect(res.body.code).toBe(0)
    expect(res.body.data.status).toBe('COMPLETED')
  })

  it('rejects client-supplied score/metrics/rawData (strict empty body)', async () => {
    const req = makeReq({
      params: { id: 'session-1' },
      body: { score: 100, metrics: { x: 1 }, rawData: { y: 2 } },
    })
    const res = makeRes()
    await cognitiveController.completeSession(req, res)
    expect(res.statusCode).toBe(400)
    expect(completionService.completeSession).not.toHaveBeenCalled()
  })

  it('maps premature-completion 400 with session kept IN_PROGRESS', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: {} })
    const res = makeRes()
    ;(completionService.completeSession as any).mockRejectedValue({
      statusCode: 400,
      message: 'fake v1 expects exactly 3 trials, got 2',
    })
    await cognitiveController.completeSession(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('maps 404 for missing session', async () => {
    const req = makeReq({ params: { id: 'nope' }, body: {} })
    const res = makeRes()
    ;(completionService.completeSession as any).mockRejectedValue({ statusCode: 404, message: 'CognitiveSession not found' })
    await cognitiveController.completeSession(req, res)
    expect(res.statusCode).toBe(404)
  })
})
