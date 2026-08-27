import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAssessment: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  hashQuestionnaireResumeToken,
  questionnaireResumeTokenService,
} from '../../services/questionnaireResumeTokenService'

describe('questionnaire resume capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.questionnaireAssessment.update.mockResolvedValue({})
    mockPrisma.questionnaireAssessment.updateMany.mockResolvedValue({ count: 1 })
  })

  it('generates a high-entropy token and stores only its hash', async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const token = await questionnaireResumeTokenService.issue('assessment-1', expiresAt)
    const update = mockPrisma.questionnaireAssessment.update.mock.calls[0][0]

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(update.where).toEqual({ id: 'assessment-1' })
    expect(update.data.resumeTokenHash).toBe(hashQuestionnaireResumeToken(token))
    expect(update.data.resumeTokenHash).not.toBe(token)
    expect(update.data.resumeTokenExpiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 24 * 60 * 60 * 1000,
    )
  })

  it('does not extend the capability beyond the source access token', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await questionnaireResumeTokenService.issue('assessment-1', expiresAt)
    const storedExpiry = mockPrisma.questionnaireAssessment.update.mock.calls[0][0]
      .data.resumeTokenExpiresAt as Date

    expect(storedExpiry.getTime()).toBeLessThanOrEqual(expiresAt.getTime())
  })

  it('rotates only the currently presented capability', async () => {
    const currentToken = 'current-resume-token'
    const token = await questionnaireResumeTokenService.rotate(
      'assessment-1',
      currentToken,
      new Date(Date.now() + 60 * 60 * 1000),
    )
    const update = mockPrisma.questionnaireAssessment.updateMany.mock.calls[0][0]

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(update.where).toEqual(expect.objectContaining({
      id: 'assessment-1',
      resumeTokenHash: hashQuestionnaireResumeToken(currentToken),
      status: 'IN_PROGRESS',
    }))
    expect(update.data.resumeTokenHash).toBe(hashQuestionnaireResumeToken(token!))
  })

  it('reports a failed compare-and-swap when another request already rotated the token', async () => {
    mockPrisma.questionnaireAssessment.updateMany.mockResolvedValue({ count: 0 })

    await expect(questionnaireResumeTokenService.rotate(
      'assessment-1',
      'stale-resume-token',
      new Date(Date.now() + 60 * 60 * 1000),
    )).resolves.toBeNull()
  })

  it('treats missing and past expiry values as expired', () => {
    expect(questionnaireResumeTokenService.isExpired(null)).toBe(true)
    expect(questionnaireResumeTokenService.isExpired(new Date(Date.now() - 1))).toBe(true)
    expect(questionnaireResumeTokenService.isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })
})
