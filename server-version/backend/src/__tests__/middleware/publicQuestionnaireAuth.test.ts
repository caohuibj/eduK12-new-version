import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAssessment: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { requireQuestionnaireResume } from '../../middleware/publicQuestionnaireAuth'
import { hashQuestionnaireResumeToken } from '../../services/questionnaireResumeTokenService'

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

const makeReq = (authorization?: string, sessionId = 'session-1') => ({
  headers: authorization ? { authorization } : {},
  params: { sessionId },
}) as any

describe('public questionnaire capability middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a request without a resume capability', async () => {
    const res = makeRes()
    const next = vi.fn()

    await requireQuestionnaireResume(makeReq(), res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
    expect(mockPrisma.questionnaireAssessment.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a capability bound to another session or an expired row', async () => {
    const token = 'resume-token'
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      sessionId: 'other-session',
      resumeTokenExpiresAt: new Date(Date.now() - 1),
    })
    const res = makeRes()
    const next = vi.fn()

    await requireQuestionnaireResume(makeReq(`Bearer ${token}`), res, next)

    expect(mockPrisma.questionnaireAssessment.findUnique).toHaveBeenCalledWith({
      where: { resumeTokenHash: hashQuestionnaireResumeToken(token) },
      select: expect.any(Object),
    })
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows only a non-expired capability for the requested session', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      sessionId: 'session-1',
      resumeTokenExpiresAt: new Date(Date.now() + 60_000),
    })
    const res = makeRes()
    const next = vi.fn()

    await requireQuestionnaireResume(makeReq('Bearer resume-token'), res, next)

    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })
})
