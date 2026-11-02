import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), compare: vi.fn(), hash: vi.fn(), clear: vi.fn(), principal: vi.fn(), revoked: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: mocks.principal, user: { findUnique: mocks.find, updateMany: mocks.update } } }))
vi.mock('../../utils/password', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/password')>(), comparePassword: mocks.compare, hashPassword: mocks.hash }))
vi.mock('../../utils/authCookies', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/authCookies')>(), clearSessionCookie: mocks.clear }))
vi.mock('../../utils/sessionRevocation', () => ({ isSessionRevoked: mocks.revoked, revokeCurrentSession: vi.fn() }))
import { authController } from '../../controllers/authController'
import { userController } from '../../controllers/userController'
import { csrfProtection } from '../../middleware/csrf'
import authRoutes from '../../routes/auth'
import userRoutes from '../../routes/users'
import { changeOwnPassword } from '../../services/passwordChangeService'
import { UserRole } from '../../types'
import { generateToken } from '../../utils/jwt'
function response() { const res: any = { statusCode: 200 }; res.status = (code: number) => { res.statusCode = code; return res }; res.json = (body: any) => { res.body = body; return res }; return res }
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue({ passwordHash: 'previous', tokenVersion: 3 }); mocks.compare.mockImplementation(async password => password === 'OldPass1'); mocks.hash.mockResolvedValue('new-hash'); mocks.update.mockResolvedValue({ count: 1 }) })
describe('one password mutation contract', () => {
  it('exports exactly the same handler for both URL aliases', () => { expect(authController.changePassword).toBe(userController.changePassword) })
  it.each([authController.changePassword, userController.changePassword])('invalidates existing sessions and clears first-login state through either alias', async handler => {
    const res = response()
    await handler({ user: { userId: 'one' }, body: { oldPassword: 'OldPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.body.code).toBe(0)
    expect(mocks.compare).toHaveBeenCalledWith('OldPass1', 'previous')
    expect(mocks.compare).toHaveBeenCalledWith('NewPass2', 'previous')
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'one', tokenVersion: 3 }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 }, mustChangePassword: false } })
    expect(mocks.clear).toHaveBeenCalledOnce()
  })
  it.each([null, 42, 'x'.repeat(129)])('rejects invalid old password input before lookup or hashing (%s)', async oldPassword => {
    const res = response()
    await authController.changePassword({ user: { userId: 'one' }, body: { oldPassword, newPassword: 'NewPass2' } } as any, res)
    expect(res.statusCode).toBe(400); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled()
  })
  it.each([true, false])('rejects an unchanged password without changing account state (forced=%s)', async mustChangePassword => {
    const state = { passwordHash: 'previous', tokenVersion: 3, mustChangePassword }
    mocks.find.mockResolvedValue(state)
    await expect(changeOwnPassword('one', 'OldPass1', 'OldPass1')).rejects.toMatchObject({
      statusCode: 400, message: '新密码不能与旧密码相同',
    })
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.compare).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(state).toEqual({ passwordHash: 'previous', tokenVersion: 3, mustChangePassword })
  })
  it('rejects a wrong password without changing credentials or clearing the session', async () => {
    mocks.compare.mockResolvedValue(false)
    const res = response()
    await userController.changePassword({ user: { userId: 'one' }, body: { oldPassword: 'WrongPass1', newPassword: 'NewPass2' } } as any, res)
    expect(res.statusCode).toBe(400); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.compare).toHaveBeenCalledExactlyOnceWith('WrongPass1', 'previous')
  })

  it('rejects a different UTF-8 password that bcrypt treats as the same credential', async () => {
    const oldPassword = 'Aa1' + '界'.repeat(23)
    const newPassword = oldPassword + '2'
    expect(Buffer.byteLength(oldPassword, 'utf8')).toBe(72)
    expect(oldPassword.length).toBeLessThan(72)
    expect(Buffer.byteLength(newPassword, 'utf8')).toBe(73)
    expect(newPassword).not.toBe(oldPassword)
    const passwordHash = await bcrypt.hash(oldPassword, 4)
    expect(await bcrypt.compare(newPassword, passwordHash)).toBe(true)
    const state = { passwordHash, tokenVersion: 3, mustChangePassword: true }
    mocks.find.mockResolvedValue(state)
    mocks.compare.mockImplementation(async (password: string, hash: string) => bcrypt.compare(password, hash))

    await expect(changeOwnPassword('one', oldPassword, newPassword)).rejects.toMatchObject({
      statusCode: 400, message: '新密码不能与旧密码相同',
    })
    expect(mocks.compare).toHaveBeenNthCalledWith(1, oldPassword, passwordHash)
    expect(mocks.compare).toHaveBeenNthCalledWith(2, newPassword, passwordHash)
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(state).toEqual({ passwordHash, tokenVersion: 3, mustChangePassword: true })
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
    if (phase === 'verify') mocks.compare.mockImplementation(async password => { if (password !== 'OldPass1') return false; entered(); await paused; return true })
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

describe('forced password changes through both URL aliases', () => {
  let server: Server
  let baseUrl: string
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api', csrfProtection)
    app.use('/api/auth', authRoutes)
    app.use('/api/users', userRoutes)
    server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it.each(['/api/auth/change-password', '/api/users/change-password'])('%s preserves forced state on rejection and invalidates the old session only after a real change', async path => {
    let state = {
      id: 'one', username: 'one', accountDomain: 'TRAINING' as const,
      role: UserRole.STUDENT, platformRole: 'STANDARD', entryGrants: [],
      isActive: true, isFrozen: false, expiresAt: null, teacherApproved: true,
      passwordHash: 'previous', tokenVersion: 3, mustChangePassword: true,
    }
    mocks.revoked.mockResolvedValue(false)
    mocks.principal.mockImplementation(async () => [{ ...state, userId: state.id }])
    mocks.find.mockImplementation(async () => ({ ...state }))
    mocks.update.mockImplementation(async ({ where, data }) => {
      if (where.id !== state.id || where.tokenVersion !== state.tokenVersion) return { count: 0 }
      state = { ...state, passwordHash: data.passwordHash, tokenVersion: state.tokenVersion + 1, mustChangePassword: data.mustChangePassword }
      return { count: 1 }
    })
    const token = generateToken({
      userId: state.id, username: state.username, accountDomain: state.accountDomain,
      role: state.role, tokenVersion: state.tokenVersion, mustChangePassword: true,
    })
    const call = (newPassword: string) => fetch(baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Connection: 'close',
        Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=synthetic-csrf`,
        'X-CSRF-Token': 'synthetic-csrf',
      },
      body: JSON.stringify({ oldPassword: 'OldPass1', newPassword }),
    })

    const rejected = await call('OldPass1')
    expect(rejected.status).toBe(400)
    expect((await rejected.json() as { message: string }).message).toBe('新密码不能与旧密码相同')
    expect(rejected.headers.getSetCookie()).toEqual([])
    expect(state).toMatchObject({ passwordHash: 'previous', tokenVersion: 3, mustChangePassword: true })
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.compare).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()

    const changed = await call('NewPass2')
    expect(changed.status).toBe(200)
    expect((await changed.json() as { code: number }).code).toBe(0)
    expect(state).toMatchObject({ passwordHash: 'new-hash', tokenVersion: 4, mustChangePassword: false })
    expect(mocks.compare).toHaveBeenCalledWith('OldPass1', 'previous')
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'one', tokenVersion: 3 }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 }, mustChangePassword: false } })
    expect(mocks.clear).toHaveBeenCalledOnce()

    const staleSession = await call('AnotherPass3')
    expect(staleSession.status).toBe(401)
    expect((await staleSession.json() as { message: string }).message).toContain('令牌已失效')
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.hash).toHaveBeenCalledOnce()
  })
})
