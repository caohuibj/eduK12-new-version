import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAccessToken: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { tokenService } from '../../services/tokenService'

describe('questionnaire access token quota handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a resume flow to use an exhausted quota without granting a new start', async () => {
    mockPrisma.questionnaireAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      token: 'qn_test',
      questionnaireId: 'questionnaire-1',
      createdBy: 'teacher-1',
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 1,
      usedCount: 1,
      isActive: true,
      questionnaire: { id: 'questionnaire-1' },
    })

    const validation = await tokenService.validateToken('qn_test', { allowOverLimit: true })

    expect(validation.valid).toBe(true)
    expect(validation.overLimit).toBe(true)
  })

  it('continues to reject an exhausted quota for a new session', async () => {
    mockPrisma.questionnaireAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      token: 'qn_test',
      questionnaireId: 'questionnaire-1',
      createdBy: 'teacher-1',
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 1,
      usedCount: 1,
      isActive: true,
      questionnaire: { id: 'questionnaire-1' },
    })

    const validation = await tokenService.validateToken('qn_test')

    expect(validation.valid).toBe(false)
    expect(validation.overLimit).toBe(true)
  })
})
