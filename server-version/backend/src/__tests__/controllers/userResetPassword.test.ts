import { beforeEach, describe, expect, it, vi } from 'vitest'

const { delegatedReset, unsafeUserUpdate } = vi.hoisted(() => ({
  delegatedReset: vi.fn(),
  unsafeUserUpdate: vi.fn(),
}))
vi.mock('../../controllers/platformAccountController', () => ({
  resetPasswordForPlatformAdmin: delegatedReset,
}))
vi.mock('../../config/database', () => ({
  prisma: { user: { update: unsafeUserUpdate } },
}))

import { userController } from '../../controllers/userController'

describe('legacy user-controller reset is a secure platform alias', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delegatedReset.mockResolvedValue({ marker: 'handled by canonical platform flow' })
  })

  it('passes the exact target and current actor context to the canonical reset', async () => {
    const request = {
      params: { id: 'learner-1' },
      user: { userId: 'system-actor', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' },
      body: { newPassword: 'must never write this value directly' },
    } as any
    const response = {} as any
    await userController.resetPassword(request, response)
    expect(delegatedReset).toHaveBeenCalledOnce()
    expect(delegatedReset).toHaveBeenCalledWith(request, response, 'learner-1')
    expect(unsafeUserUpdate).not.toHaveBeenCalled()
  })

  it('propagates the authoritative rejection instead of performing fallback writes', async () => {
    const response = { statusCode: 403 }
    delegatedReset.mockResolvedValueOnce(response)
    const result = await userController.resetPassword({ params: { id: 'learner-2' } } as any, {} as any)
    expect(result).toBe(response)
    expect(unsafeUserUpdate).not.toHaveBeenCalled()
  })
})
