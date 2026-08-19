import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserRole } from '@prisma/client'

vi.mock('../../modules/cognitive/trial.service', () => ({
  appendTrial: vi.fn(),
}))
vi.mock('../../modules/cognitive/session.service', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  restartSession: vi.fn(),
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

import * as trialService from '../../modules/cognitive/trial.service'
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

describe('cognitive trial API', () => {
  it('rejects body with forged sessionId/payloadHash/payloadEncrypted', async () => {
    const req = makeReq({
      params: { id: 'session-1' },
      body: {
        trialIndex: 0,
        payload: { correct: true, rtMs: 400 },
        sessionId: 'other',
        payloadHash: 'h',
        payloadEncrypted: 'e',
      },
    })
    const res = makeRes()
    await cognitiveController.appendTrial(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects negative trialIndex', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: { trialIndex: -1, payload: {} } })
    const res = makeRes()
    await cognitiveController.appendTrial(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns {trialId, trialIndex, createdAt} on success', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: { trialIndex: 0, payload: { correct: true, rtMs: 400 } } })
    const res = makeRes()
    ;(trialService.appendTrial as any).mockResolvedValue({
      trialId: 'trial-1',
      trialIndex: 0,
      createdAt: new Date('2026-01-01'),
    })
    await cognitiveController.appendTrial(req, res)
    expect(res.body.code).toBe(0)
    expect(res.body.data.trialId).toBe('trial-1')
    expect(res.body.data.trialIndex).toBe(0)
  })

  it('maps service 409 conflict to HTTP 409', async () => {
    const req = makeReq({ params: { id: 'session-1' }, body: { trialIndex: 1, payload: { correct: true, rtMs: 400 } } })
    const res = makeRes()
    ;(trialService.appendTrial as any).mockRejectedValue({
      statusCode: 409,
      message: 'Trial index 1 already exists with different content',
    })
    await cognitiveController.appendTrial(req, res)
    expect(res.statusCode).toBe(409)
  })
})
