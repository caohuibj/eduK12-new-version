import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ actor: vi.fn(), target: vi.fn(), hash: vi.fn(), handoff: vi.fn(), remove: vi.fn(), reset: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { user: { findUnique: m.target }, $queryRaw: m.actor, $transaction: async (fn: any) => fn({ $queryRaw: m.actor }) } }))
vi.mock('../../utils/password', () => ({ generateTempPassword: () => 'SyntheticOnly2026', hashPassword: m.hash }))
vi.mock('../../utils/credentialHandoff', () => ({ writeCredentialHandoff: m.handoff, removeCredentialHandoff: m.remove }))
vi.mock('../../services/accountAuthorityService', async importOriginal => { const actual: any = await importOriginal(); return { ...actual, forceResetPasswordBySystemAdmin: m.reset } })
import { platformAccountController } from '../../controllers/platformAccountController'
import { AccountAuthorityError } from '../../services/accountAuthorityService'
const response = () => { const res: any = { statusCode: 200 }; res.status = vi.fn((code: number) => { res.statusCode = code; return res }); res.json = vi.fn(); return res }
describe('platform reset authorizes current database role before expensive work', () => {
 beforeEach(() => { vi.clearAllMocks(); m.actor.mockResolvedValue([{ platformRole: 'STANDARD' }]); m.target.mockResolvedValue({ id: 'target', username: 'synthetic' }); m.hash.mockResolvedValue('hash'); m.handoff.mockResolvedValue('/private/admin-reset.json'); m.reset.mockResolvedValue({ id: 'target' }) })
 it('rejects an ordinary or revoked admin without lookup, hashing, or handoff', async () => {
   const res = response()
   await platformAccountController.resetPassword({ user: { userId: 'actor', platformRole: 'SYSTEM_ADMIN' }, params: { id: 'target' } } as any, res)
   expect(res.statusCode).toBe(403); expect(m.target).not.toHaveBeenCalled(); expect(m.hash).not.toHaveBeenCalled(); expect(m.handoff).not.toHaveBeenCalled(); expect(m.reset).not.toHaveBeenCalled()
 })
 it('keeps a current SYSTEM_ADMIN reset and returns only the handoff basename', async () => {
   m.actor.mockResolvedValue([{ platformRole: 'SYSTEM_ADMIN' }]); const res = response()
   await platformAccountController.resetPassword({ user: { userId: 'actor' }, params: { id: 'target' } } as any, res)
   expect(res.statusCode).toBe(200); expect(m.hash).toHaveBeenCalledTimes(1); expect(m.reset).toHaveBeenCalledWith({ actorUserId: 'actor', targetUserId: 'target', passwordHash: 'hash' })
   expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { handoffFile: 'admin-reset.json' } }))
 })
 it('cleans the handoff if authorization is revoked before the persistence transaction', async () => {
   m.actor.mockResolvedValue([{ platformRole: 'SYSTEM_ADMIN' }]); m.reset.mockRejectedValue(new AccountAuthorityError('SYSTEM_ADMIN_REQUIRED', 'denied', 403)); const res = response()
   await platformAccountController.resetPassword({ user: { userId: 'actor' }, params: { id: 'target' } } as any, res)
   expect(res.statusCode).toBe(403); expect(m.remove).toHaveBeenCalledWith('/private/admin-reset.json')
 })
})
