import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashPassword } from '../../utils/password'
import { adminSecretHash } from './security'
import { AdminPermissionError, lockAdminMutation, type AdminEntry } from './service'
import type { AdminSessionProof } from './proof'

export const ADMIN_ENTRY_ACTIVATION = 'ENTRY_ACTIVATION'
const ENROLLMENT_LIFETIME_MS = 15 * 60 * 1000

type Operator = { actorUserId: string; actorSession: AdminSessionProof; reason: string }

async function enrollmentTicket(
  tx: Prisma.TransactionClient,
  user: { id: string; username: string; tokenVersion: number },
  initialActivation: boolean,
) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ENROLLMENT_LIFETIME_MS)
  await tx.adminSecurityChallenge.create({ data: {
    idHash: adminSecretHash(token), userId: user.id, tokenVersion: user.tokenVersion,
    purpose: 'ENROLLMENT', challenge: initialActivation ? ADMIN_ENTRY_ACTIVATION : '', expiresAt,
  } })
  return { username: user.username, enrollmentToken: token, initialActivation, expiresAt }
}

export async function createEntryAdmin(input: Operator & { username: string; entry: AdminEntry }) {
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
  try {
    return await prisma.$transaction(async tx => {
      await lockAdminMutation(tx, input)
      const user = await tx.user.create({ data: {
        username: input.username, passwordHash, accountDomain: 'TRAINING', platformRole: 'STANDARD',
        role: 'STUDENT', mustChangePassword: true,
      } })
      await tx.adminEntryGrant.create({ data: {
        id: randomUUID(), userId: user.id, entry: input.entry, grantedBy: input.actorUserId,
      } })
      await tx.adminAuthorizationAudit.create({ data: {
        id: randomUUID(), actorUserId: input.actorUserId, targetUserId: user.id,
        entry: input.entry, action: 'CREATE_ENTRY_ADMIN', version: 1, reason: input.reason,
      } })
      return enrollmentTicket(tx, user, true)
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AdminPermissionError(409, '账号已存在，请选择已有账号授权')
    throw error
  }
}

/** Reissue enrollment to an unbound entry manager. Factor loss uses controlled recovery. */
export async function issueEntryAdminEnrollment(input: Operator & { targetUserId: string }) {
  return prisma.$transaction(async tx => {
    const target = await lockAdminMutation(tx, input, input.targetUserId)
    if (!target || target.platformRole !== 'STANDARD' || !target.isActive || target.isFrozen
      || !['TRAINING', 'LEGACY'].includes(target.accountDomain) || (target.expiresAt && target.expiresAt <= new Date())
      || !await tx.adminEntryGrant.count({ where: { userId: input.targetUserId, revokedAt: null } }))
      throw new AdminPermissionError(403, '有效入口管理授权才可签发绑定码')
    if (await tx.adminTotpCredential.count({ where: { userId: target.id } })
      || await tx.adminSecurityKey.count({ where: { userId: target.id } }))
      throw new AdminPermissionError(409, '已有认证器，遗失时请使用受控恢复流程')
    const initialActivation = target.mustChangePassword && Boolean(await tx.adminAuthorizationAudit.findFirst({
      where: { targetUserId: target.id, action: 'CREATE_ENTRY_ADMIN' }, select: { id: true },
    }))
    const user = await tx.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } })
    await tx.adminSecurityChallenge.deleteMany({ where: { userId: target.id } })
    await tx.adminAuthorizationAudit.create({ data: {
      id: randomUUID(), actorUserId: input.actorUserId, targetUserId: target.id,
      action: 'ISSUE_ENROLLMENT', reason: input.reason,
    } })
    return enrollmentTicket(tx, user, initialActivation)
  })
}
