import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockWriteHandoff, mockRemoveHandoff, mockGenerateTempPassword } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockWriteHandoff: vi.fn(),
  mockRemoveHandoff: vi.fn(),
  mockGenerateTempPassword: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/password', () => ({
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  isValidPassword: vi.fn(() => true),
  hashPassword: vi.fn(async () => 'temporary-hash'),
  comparePassword: vi.fn(),
  generateTempPassword: mockGenerateTempPassword,
}))
vi.mock('../../utils/credentialHandoff', () => ({
  writeCredentialHandoff: mockWriteHandoff,
  removeCredentialHandoff: mockRemoveHandoff,
}))

import { userController } from '../../controllers/userController'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
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

describe('administrator password reset handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateTempPassword.mockReturnValue('Temporary2026')
    mockWriteHandoff.mockResolvedValue('/tmp/admin-password-reset.json')
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'student-1' })
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1' })
  })

  it('ignores a caller-supplied password and returns only the protected handoff filename', async () => {
    const res = makeRes()

    await userController.resetPassword({
      params: { id: 'user-1' },
      body: { newPassword: 'attacker-controlled-password' },
    } as any, res)

    expect(res.body.code).toBe(0)
    expect(res.body.data).toEqual({ handoffFile: 'admin-password-reset.json' })
    expect(JSON.stringify(res.body)).not.toContain('Temporary2026')
    expect(mockWriteHandoff).toHaveBeenCalledWith([
      { username: 'student-1', temporaryPassword: 'Temporary2026' },
    ], 'admin-password-reset')
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        passwordHash: 'temporary-hash',
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
      }),
    }))
  })

  it('removes the handoff file if the database update fails', async () => {
    const handoffFile = '/tmp/admin-password-reset-failed.json'
    mockWriteHandoff.mockResolvedValue(handoffFile)
    mockPrisma.user.update.mockRejectedValue(new Error('database unavailable'))
    const res = makeRes()

    await userController.resetPassword({ params: { id: 'user-1' }, body: {} } as any, res)

    expect(res.statusCode).toBe(400)
    expect(mockRemoveHandoff).toHaveBeenCalledWith(handoffFile)
  })
})
