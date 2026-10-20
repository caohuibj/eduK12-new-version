// Operator-only. No HTTP route can create/promote a SYSTEM_ADMIN or issue an
// enrollment/recovery ticket. Real-account execution needs separate approval.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../config/database'
import { hashPassword, isValidPassword } from '../utils/password'
import { adminSecretHash } from '../modules/admin-permissions/security'

async function main() {
  if (process.env.ADMIN_SECURITY_BOOTSTRAP_ENABLED !== 'true') throw new Error('ADMIN_SECURITY_BOOTSTRAP_DISABLED')
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_SECURITY_PRODUCTION_APPROVED !== 'true')
    throw new Error('Production account or credential changes require separate approval')
  const input = z.object({ action: z.enum(['CREATE_SYSTEM_ADMIN','ISSUE_ENROLLMENT','RECOVER']),
    username: z.string().regex(/^[A-Za-z0-9_.-]{4,64}$/), password: z.string().max(128).refine(isValidPassword).optional(),
    reason: z.string().trim().min(1).max(500) }).strict().parse(JSON.parse(readFileSync(0, 'utf8')))
  const handoff = process.env.ADMIN_SECURITY_HANDOFF_FILE
  if (!handoff || !handoff.startsWith('/') || handoff.includes('\0')) throw new Error('Private absolute handoff file is required')
  if (input.action === 'CREATE_SYSTEM_ADMIN' && !input.password) throw new Error('Initial password required')
  const token = randomBytes(32).toString('base64url')
  // Reserve a fresh private file before changing any DB state. Never overwrite
  // an existing handoff, print a ticket, or put credentials in process arguments.
  writeFileSync(handoff, JSON.stringify({ enrollmentToken: token, expiresInMinutes: 15 }), { mode: 0o600, flag: 'wx' })
  try {
    const passwordHash = input.password ? await hashPassword(input.password) : undefined
    const userId = await prisma.$transaction(async tx => {
      let user
      if (input.action === 'CREATE_SYSTEM_ADMIN') {
        user = await tx.user.create({ data: { username: input.username, passwordHash: passwordHash!, role: 'STUDENT',
          accountDomain: 'TRAINING', platformRole: 'SYSTEM_ADMIN', teacherApproved: true } })
      } else {
        const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "users" WHERE "username"=${input.username} FOR UPDATE`
        if (!row) throw new Error('Management account not found')
        user = await tx.user.findUniqueOrThrow({ where: { id: row.id } })
        const grants = await tx.adminEntryGrant.count({ where: { userId: row.id, revokedAt: null } })
        if (!['LEGACY','TRAINING'].includes(user.accountDomain) || !user.isActive || user.isFrozen
          || (user.expiresAt && user.expiresAt <= new Date()) || (user.platformRole !== 'SYSTEM_ADMIN' && !grants))
          throw new Error('Active management authority required; recovery never grants authority')
        user = await tx.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 }, ...(passwordHash ? { passwordHash } : {}) } })
        await tx.adminSecurityChallenge.deleteMany({ where: { userId: user.id } })
        if (input.action === 'RECOVER') await tx.adminSecurityKey.deleteMany({ where: { userId: user.id } })
      }
      await tx.adminSecurityChallenge.create({ data: { idHash: adminSecretHash(token), userId: user.id, purpose: 'ENROLLMENT',
        challenge: '', tokenVersion: user.tokenVersion, expiresAt: new Date(Date.now() + 900_000) } })
      await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), targetUserId: user.id,
        action: input.action, reason: input.reason } })
      return user.id
    })
    console.log(JSON.stringify({ userId, action: input.action, privateHandoffCreated: true, loginRequiresSecurityKey: true }))
  } catch (e) { unlinkSync(handoff); throw e }
}
void main().catch(() => { console.error('受控后台操作失败；请检查输入与私有配置，未输出秘密'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
