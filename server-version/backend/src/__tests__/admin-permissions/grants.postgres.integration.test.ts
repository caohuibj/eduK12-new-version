import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const enabled = process.env.ADMIN_PERMISSIONS_ISOLATED_TEST === '1'
const suite = enabled ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let service: typeof import('../../modules/admin-permissions/service')
let systemId: string, legacyId: string, teacherId: string
suite('explicit entry grants, real PostgreSQL', () => {
  beforeAll(async () => {
    if (!/eduk12_admin_permissions_/.test(new URL(process.env.DATABASE_URL!).pathname))
      throw new Error('Dedicated disposable admin-permissions database required')
    db = (await import('../../config/database')).prisma
    service = await import('../../modules/admin-permissions/service')
    for (const kind of ['system', 'legacy', 'teacher']) {
      const u = await db.user.create({ data: { username: 'admin-test-' + randomUUID(), passwordHash: 'unusable-synthetic-hash',
        role: kind === 'teacher' ? 'TEACHER' : 'ADMIN', platformRole: kind === 'system' ? 'SYSTEM_ADMIN' : 'STANDARD' } })
      if (kind === 'system') systemId = u.id
      if (kind === 'legacy') legacyId = u.id
      if (kind === 'teacher') teacherId = u.id
    }
  })
  afterAll(async () => { await db?.$disconnect() })
  const change = (entry: 'TRAINING' | 'SURVEY', active: boolean, expectedVersion: number, actorUserId = systemId) =>
    service.changeEntryGrant({ actorUserId, targetUserId: teacherId, entry, active, expectedVersion, reason: 'synthetic integration fixture' })
  it('default deny: old ADMIN is not system or entry administrator', async () => {
    await expect(service.assertEntryAdmin(db, legacyId, 'TRAINING')).rejects.toMatchObject({ statusCode: 403 })
    await expect(change('TRAINING', true, 0, legacyId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.adminEntryGrant.count({ where: { userId: legacyId } })).toBe(0)
  })
  it('one entry does not confer another entry or alter business identity', async () => {
    expect(await change('TRAINING', true, 0)).toMatchObject({ version: 1, changed: true })
    await service.assertEntryAdmin(db, teacherId, 'TRAINING')
    await expect(service.assertEntryAdmin(db, teacherId, 'SURVEY')).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.user.findUniqueOrThrow({ where: { id: teacherId } })).toMatchObject({ role: 'TEACHER', platformRole: 'STANDARD', tokenVersion: 1 })
  })
  it('a retry is idempotent; conflicting stale state is rejected', async () => {
    expect(await change('TRAINING', true, 0)).toMatchObject({ version: 1, changed: false })
    await expect(change('TRAINING', false, 0)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.adminAuthorizationAudit.count({ where: { targetUserId: teacherId } })).toBe(1)
  })
  it('multi-entry authority is explicit; revoke preserves the other grant', async () => {
    await change('SURVEY', true, 0)
    await change('TRAINING', false, 1)
    await expect(service.assertEntryAdmin(db, teacherId, 'TRAINING')).rejects.toMatchObject({ statusCode: 403 })
    await service.assertEntryAdmin(db, teacherId, 'SURVEY')
    expect(await db.user.findUniqueOrThrow({ where: { id: teacherId } })).toMatchObject({ tokenVersion: 3 })
  })
  it('stale racing re-grants cannot undo committed revocation', async () => {
    const result = await Promise.allSettled([change('SURVEY', false, 1), change('SURVEY', true, 0)])
    expect(result[0].status).toBe('fulfilled')
    await expect(service.assertEntryAdmin(db, teacherId, 'SURVEY')).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.adminEntryGrant.findUniqueOrThrow({ where: { userId_entry: { userId: teacherId, entry: 'SURVEY' } } })).version).toBe(2)
  })
  it('ordinary admins cannot grant themselves system authority; audits are immutable', async () => {
    await expect(change('TRAINING', true, 2, teacherId)).rejects.toMatchObject({ statusCode: 403 })
    const event = await db.adminAuthorizationAudit.findFirstOrThrow({ where: { targetUserId: teacherId } })
    await expect(db.adminAuthorizationAudit.update({ where: { id: event.id }, data: { reason: 'tampered' } })).rejects.toThrow()
    await expect(db.adminAuthorizationAudit.delete({ where: { id: event.id } })).rejects.toThrow()
  })
})
