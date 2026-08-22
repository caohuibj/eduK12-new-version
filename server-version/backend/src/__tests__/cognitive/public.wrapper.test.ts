import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveAssignment: { findUnique: vi.fn() },
    cognitiveAccessToken: { findUnique: vi.fn(), create: vi.fn() },
    cognitiveSession: { findFirst: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { createAccessTokenForAssignment, getPublicAssignmentInfo, startPublicSession } from '../../modules/cognitive/public.service'

const wrapper = {
  id: 'asg-1',
  createdBy: 'teacher-1',
  status: 'PUBLISHED',
  listedStandalone: false,
  config: { status: 'PUBLISHED', testType: 'fake', engineVersion: '1.0.0', scoringVersion: '1.0.0', config: {} },
  course: { id: 'c1' },
}

beforeEach(() => vi.clearAllMocks())

describe('public wrapper gates', () => {
  it('rejects creating a public token for a wrapper', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(wrapper)
    await expect(createAccessTokenForAssignment('teacher-1', UserRole.TEACHER, 'asg-1', new Date(Date.now() + 60_000).toISOString(), 0))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects public info for a historical wrapper token', async () => {
    mockPrisma.cognitiveAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 0,
      usedCount: 0,
      assignment: wrapper,
    })
    await expect(getPublicAssignmentInfo('token-value')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects starting a public session for a wrapper token', async () => {
    mockPrisma.cognitiveAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 0,
      usedCount: 0,
      assignment: wrapper,
    })
    await expect(startPublicSession('token-value')).rejects.toMatchObject({ statusCode: 403 })
  })
})
