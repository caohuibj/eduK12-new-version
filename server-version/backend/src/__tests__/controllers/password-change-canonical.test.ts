import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), compare: vi.fn(), hash: vi.fn(), clear: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { user: { findUnique: mocks.find, updateMany: mocks.update } } }))
vi.mock('../../utils/password', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/password')>(), comparePassword: mocks.compare, hashPassword: mocks.hash }))
vi.mock('../../utils/authCookies', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/authCookies')>(), clearSessionCookie: mocks.clear }))
import { authController } from '../../controllers/authController'
import { userController } from '../../controllers/userController'
function response() { const res: any = { statusCode: 200 }; res.status = (code: number) => { res.statusCode = code; return res }; res.json = (body: any) => { res.body = body; return res }; return res }
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue({ passwordHash: 'previous', tokenVersion: 3 }); mocks.compare.mockResolvedValue(true); mocks.hash.mockResolvedValue('new-hash'); mocks.update.mockResolvedValue({ count: 1 }) })
describe('one password mutation contract', () => {
  it('exports exactly the same handler for both URL aliases', () => { expect(authController.changePassword).toBe(userController.changePassword) })
  it.each([authController.changePassword, userController.changePassword])('invalidates existing sessions and clears first-login state through either alias', async handler => {
    const res = response()
    await handler({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.body.code).toBe(0)
    expect(mocks.compare).toHaveBeenCalledWith('OldPass1', 'previous')
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'one', tokenVersion: 3 }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 }, mustChangePassword: false } })
    expect(mocks.clear).toHaveBeenCalledOnce()
  })
  it.each([null, 42, 'x'.repeat(129)])('rejects invalid old password input before lookup or hashing (%s)', async oldPassword => {
    const res = response()
    await authController.changePassword({ user: { userId: 'one' }, body: { oldPassword, newPassword: 'NewPass2' } } as any, res)
    expect(res.statusCode).toBe(400); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled()
  })
  it('rejects a wrong password without changing credentials or clearing the session', async () => {
    mocks.compare.mockResolvedValue(false)
    const res = response()
    await userController.changePassword({ user: { userId: 'one' }, body: { oldPassword: 'WrongPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.statusCode).toBe(400); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled()
  })

  it.each(['verify', 'hash'])('preserves a trusted reset committed while the old-password change waits to %s', async phase => {
    let state = { passwordHash: 'previous', tokenVersion: 3, mustChangePassword: false }
    mocks.find.mockImplementation(async () => ({ ...state }))
    mocks.update.mockImplementation(async ({ where, data }) => {
      if (where.tokenVersion !== state.tokenVersion) return { count: 0 }
      state = { passwordHash: data.passwordHash, tokenVersion: state.tokenVersion + 1, mustChangePassword: data.mustChangePassword }
      return { count: 1 }
    })
    let unblock!: () => void
    let entered!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve })
    const paused = new Promise<void>(resolve => { unblock = resolve })
    if (phase === 'verify') mocks.compare.mockImplementation(async () => { entered(); await paused; return true })
    else mocks.hash.mockImplementation(async () => { entered(); await paused; return 'new-hash' })
    const res = response()
    const pending = authController.changePassword({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, res)
    await waiting
    state = { passwordHash: 'trusted-reset', tokenVersion: 4, mustChangePassword: true }
    unblock()
    await pending
    expect(res.statusCode).toBe(409)
    expect(state).toEqual({ passwordHash: 'trusted-reset', tokenVersion: 4, mustChangePassword: true })
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it('allows only one transition when both aliases race from the same credential version', async () => {
    let state = { passwordHash: 'previous', tokenVersion: 3, mustChangePassword: false }
    mocks.find.mockImplementation(async () => ({ ...state }))
    mocks.update.mockImplementation(async ({ where, data }) => {
      if (where.tokenVersion !== state.tokenVersion) return { count: 0 }
      state = { passwordHash: data.passwordHash, tokenVersion: state.tokenVersion + 1, mustChangePassword: data.mustChangePassword }
      return { count: 1 }
    })
    const responses = [response(), response()]
    await Promise.all([authController.changePassword, userController.changePassword].map((handler, index) =>
      handler({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, responses[index])))
    expect(responses.map(res => res.statusCode).sort()).toEqual([200, 409])
    expect(state).toEqual({ passwordHash: 'new-hash', tokenVersion: 4, mustChangePassword: false })
    expect(mocks.clear).toHaveBeenCalledOnce()
  })

  it('retains unauthenticated behavior for a deleted user', async () => {
    mocks.find.mockResolvedValue(null)
    const res = response()
    await authController.changePassword({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.statusCode).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
