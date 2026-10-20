import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertCurrentSystemAdmin } from '../../services/accountAuthorityService'

export const ADMIN_ENTRIES = ['TRAINING', 'SURVEY', 'HUISCHOOL', 'HUITEACHER'] as const
export type AdminEntry = typeof ADMIN_ENTRIES[number]
export class AdminPermissionError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message) }
}

export async function assertEntryAdmin(db: Prisma.TransactionClient, userId: string, entry: AdminEntry) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id" FROM "users" u JOIN "admin_entry_grants" g ON g."user_id"=u."id"
    WHERE u."id"=${userId} AND g."entry"=${entry} AND g."revoked_at" IS NULL
      AND u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password"
      AND u."account_domain" IN ('LEGACY','TRAINING')
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp()) LIMIT 1
  `
  if (!rows.length) throw new AdminPermissionError(403, '缺少当前入口管理授权')
}

// The caller supplies the version it actually reviewed. Retrying a committed
// operation is idempotent; an older command cannot silently undo newer state.
export async function changeEntryGrant(input: {
  actorUserId: string; targetUserId: string; entry: AdminEntry
  active: boolean; expectedVersion: number; reason: string
}) {
  return prisma.$transaction(async tx => {
    // Stable user lock order serializes grants and account deactivation without
    // a global lock. The actor is rechecked after locking, inside this mutation.
    const ids = [...new Set([input.actorUserId, input.targetUserId])].sort()
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
    await assertCurrentSystemAdmin(tx, input.actorUserId)
    const target = await tx.user.findUnique({ where: { id: input.targetUserId }, select: { accountDomain: true } })
    if (!target || !['LEGACY', 'TRAINING'].includes(target.accountDomain))
      throw new AdminPermissionError(404, '管理账号不存在或不属于管理身份域')
    const current = await tx.adminEntryGrant.findUnique({ where: { userId_entry: { userId: input.targetUserId, entry: input.entry } } })
    const version = current?.version ?? 0
    const active = Boolean(current && !current.revokedAt)
    if (input.expectedVersion !== version) {
      if (version === input.expectedVersion + 1 && active === input.active)
        return { entry: input.entry, active, version, changed: false }
      throw new AdminPermissionError(409, '授权已变化，请刷新后重新操作')
    }
    if (active === input.active) return { entry: input.entry, active, version, changed: false }
    const nextVersion = version + 1
    if (current) await tx.adminEntryGrant.update({ where: { id: current.id }, data: {
      version: nextVersion,
      ...(input.active ? { grantedBy: input.actorUserId, grantedAt: new Date(), revokedBy: null, revokedAt: null }
        : { revokedBy: input.actorUserId, revokedAt: new Date() }),
    } })
    else await tx.adminEntryGrant.create({ data: { id: randomUUID(), userId: input.targetUserId, entry: input.entry, grantedBy: input.actorUserId } })
    await tx.user.update({ where: { id: input.targetUserId }, data: { tokenVersion: { increment: 1 } } })
    await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), actorUserId: input.actorUserId,
      targetUserId: input.targetUserId, entry: input.entry, action: input.active ? 'ENTRY_GRANTED' : 'ENTRY_REVOKED',
      version: nextVersion, reason: input.reason } })
    return { entry: input.entry, active: input.active, version: nextVersion, changed: true }
  })
}

