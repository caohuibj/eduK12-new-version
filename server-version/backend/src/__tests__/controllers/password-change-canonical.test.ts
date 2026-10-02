import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), compare: vi.fn(), hash: vi.fn(), clear: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { user: { findUnique: mocks.find, update: mocks.update } } }))
vi.mock('../../utils/password', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/password')>(), comparePassword: mocks.compare, hashPassword: mocks.hash }))
vi.mock('../../utils/authCookies', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/authCookies')>(), clearSessionCookie: mocks.clear }))
import { authController } from '../../controllers/authController'
import { userController } from '../../controllers/userController'
function response() { const res: any = { statusCode: 200 }; res.status = (code: number) => { res.statusCode = code; return res }; res.json = (body: any) => { res.body = body; return res }; return res }
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue({ passwordHash: 'previous' }); mocks.compare.mockResolvedValue(true); mocks.hash.mockResolvedValue('new-hash') })
describe('one password mutation contract', () => {
  it('exports exactly the same handler for both URL aliases', () => { expect(authController.changePassword).toBe(userController.changePassword) })
  it.each([authController.changePassword, userController.changePassword])('invalidates existing sessions and clears first-login state through either alias', async handler => {
    const res = response()
    await handler({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.body.code).toBe(0)
    expect(mocks.compare).toHaveBeenCalledWith('OldPass1', 'previous')
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'one' }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 }, mustChangePassword: false } })
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
})
