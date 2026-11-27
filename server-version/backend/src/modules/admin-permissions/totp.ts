import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import type { Request, Response, RequestHandler } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { getCookie } from '../../utils/authCookies'
import { inactiveAccountMessage } from '../../utils/accountStatus'
import { logger } from '../../utils/logger'
import { encodeTotpSecret, matchTotpStep } from '../../utils/totp'
import { cacheService } from '../../services/cacheService'
import { loadCurrentPrincipal } from '../organization/principal'
import { AdminPermissionError } from './service'
import { ADMIN_ENTRY_ACTIVATION } from './provisioning'
import { adminAuthOrigin, adminSecretHash, issueAdminSession, needsAdminKey } from './security'

const pendingCookie = 'eduk12_admin_challenge'
function encryptionKey() {
  const key = process.env.ADMIN_MFA_ENCRYPTION_KEY || ''
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new AdminPermissionError(503, '管理员 Authenticator 加密密钥尚未配置')
  return Buffer.from(key, 'hex')
}
function encryptSecret(userId: string, secret: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from('eduK12:admin-totp:v1:' + userId))
  const data = Buffer.concat([cipher.update(secret), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.')
}
function decryptSecret(userId: string, value: string): Buffer {
  const parts = value.split('.').map(part => Buffer.from(part, 'base64url'))
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16 || parts[2].length !== 20)
    throw new AdminPermissionError(503, '管理员 Authenticator 凭据暂不可用')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), parts[0])
  decipher.setAAD(Buffer.from('eduK12:admin-totp:v1:' + userId)); decipher.setAuthTag(parts[1])
  try { return Buffer.concat([decipher.update(parts[2]), decipher.final()]) }
  catch { throw new AdminPermissionError(503, '管理员 Authenticator 凭据暂不可用') }
}
async function lockedAdmin(tx: Prisma.TransactionClient, userId: string, version: number) {
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`
  const principal = await loadCurrentPrincipal(userId, tx)
  if (!principal || inactiveAccountMessage(principal) || !['LEGACY', 'TRAINING'].includes(principal.accountDomain)
    || !needsAdminKey(principal) || principal.tokenVersion !== version) return null
  return principal
}

/** A server-issued ticket and the current password authorize initial binding.
 * Neither merely displaying the QR nor confirming it creates a login session.
 */
export async function beginAdminTotpRegistration(req: Request, res: Response, userId: string, enrollmentToken: string, initialPasswordHash?: string) {
  adminAuthOrigin(); encryptionKey()
  const ticketHash = adminSecretHash(enrollmentToken)
  const result = await prisma.$transaction(async tx => {
    const ticket = await tx.adminSecurityChallenge.findUnique({ where: { idHash: ticketHash } })
    if (!ticket || ticket.userId !== userId || ticket.purpose !== 'ENROLLMENT' || ticket.expiresAt <= new Date()) return null
    const principal = await lockedAdmin(tx, userId, ticket.tokenVersion)
    if (!principal) return null
    const activation = ticket.challenge === ADMIN_ENTRY_ACTIVATION
    if (activation ? !initialPasswordHash || !principal.mustChangePassword : ticket.challenge !== '' || initialPasswordHash)
      return null
    if (await tx.adminTotpCredential.findUnique({ where: { userId } }))
      throw new AdminPermissionError(409, 'Authenticator 已绑定；更换设备请使用受控恢复流程')
    const secret = randomBytes(20), pending = randomBytes(32).toString('base64url')
    await tx.adminSecurityChallenge.deleteMany({ where: { userId, purpose: 'TOTP_REGISTER' } })
    await tx.adminSecurityChallenge.create({ data: { idHash: adminSecretHash(pending), userId, tokenVersion: principal.tokenVersion,
      purpose: 'TOTP_REGISTER', challenge: initialPasswordHash
        ? encryptSecret(userId, secret) + '|' + initialPasswordHash : encryptSecret(userId, secret),
      enrollmentHash: ticketHash,
      expiresAt: new Date(Math.min(ticket.expiresAt.getTime(), Date.now() + 300_000)) } })
    return { pending, secret, username: principal.username }
  })
  if (!result) throw new AdminPermissionError(403, '受控登记票据无效或账号权限已变化')
  // Reuse the existing HttpOnly, Strict, five-minute admin challenge cookie.
  res.append('Set-Cookie', `${pendingCookie}=${result.pending}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=300${req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  const issuer = 'eduK12 Admin', label = encodeURIComponent(issuer + ':' + result.username)
  return { otpauthUri: `otpauth://totp/${label}?secret=${encodeTotpSecret(result.secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` }
}

export async function finishAdminTotp(req: Request, res: Response, code: string, kind: 'REGISTER' | 'LOGIN' | 'STEP_UP', sessionId?: string) {
  const raw = getCookie(req, pendingCookie)
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new AdminPermissionError(403, '动态码验证已过期，请重新开始')
  const idHash = adminSecretHash(raw)
  const peek = await prisma.adminSecurityChallenge.findUnique({ where: { idHash } })
  if (!peek) throw new AdminPermissionError(403, '动态码验证已过期或已使用')
  const result = await prisma.$transaction(async tx => {
    // User -> challenge -> credential is the same lock order as enrollment,
    // account revocation and controlled recovery. Concurrent codes cannot win twice.
    const principal = await lockedAdmin(tx, peek.userId, peek.tokenVersion)
    const consumed = await tx.adminSecurityChallenge.deleteMany({ where: { idHash, expiresAt: { gt: new Date() } } })
    if (consumed.count !== 1) return { failure: 'challenge_expired' } as const
    if (!principal || peek.purpose !== 'TOTP_' + kind
      || (kind === 'STEP_UP' ? !sessionId || peek.sessionId !== sessionId || principal.userId !== req.user?.userId : Boolean(peek.sessionId)))
      return { failure: 'challenge_context_changed' } as const
    const credential = await tx.adminTotpCredential.findUnique({ where: { userId: principal.userId } })
    if (kind === 'REGISTER' ? Boolean(credential) : !credential) return { failure: 'binding_state_changed' } as const
    if (!code) return { failure: 'missing_or_malformed_input' } as const
    const [pendingCipher, initialPasswordHash] = kind === 'REGISTER' ? peek.challenge.split('|') : []
    const secretCipher = kind === 'REGISTER' ? pendingCipher : credential!.secretCipher
    const step = matchTotpStep(decryptSecret(principal.userId, secretCipher), code, credential?.lastUsedStep ?? -1n)
    if (step === null) return { failure: 'step_did_not_match' } as const
    if (kind === 'REGISTER') {
      if (!peek.enrollmentHash || (initialPasswordHash && !principal.mustChangePassword)) return { failure: 'enrollment_state_changed' } as const
      const ticket = await tx.adminSecurityChallenge.deleteMany({ where: { idHash: peek.enrollmentHash, userId: principal.userId,
        purpose: 'ENROLLMENT', challenge: initialPasswordHash ? ADMIN_ENTRY_ACTIVATION : '',
        tokenVersion: principal.tokenVersion, expiresAt: { gt: new Date() } } })
      if (ticket.count !== 1) return { failure: 'enrollment_ticket_unavailable' } as const
      await tx.adminTotpCredential.create({ data: { userId: principal.userId, secretCipher, lastUsedStep: BigInt(step) } })
      if (initialPasswordHash) {
        await tx.user.update({ where: { id: principal.userId }, data: {
          passwordHash: initialPasswordHash, mustChangePassword: false, tokenVersion: { increment: 1 },
        } })
      }
    } else {
      const changed = await tx.adminTotpCredential.updateMany({ where: { userId: principal.userId, lastUsedStep: credential!.lastUsedStep }, data: { lastUsedStep: BigInt(step) } })
      if (changed.count !== 1) return { failure: 'step_already_consumed' } as const
    }
    await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), actorUserId: principal.userId, targetUserId: principal.userId,
      action: 'ADMIN_TOTP_' + (kind === 'REGISTER' ? 'REGISTERED' : kind), reason: 'Authenticator TOTP; encrypted account-bound secret; one-use time step' } })
    return { userId: principal.userId, tokenVersion: principal.tokenVersion }
  })
  // Returning a failure from the transaction commits challenge consumption.
  // A wrong code must never roll it back and allow unlimited retries.
  if (result.failure) {
    logger.info('Admin Authenticator verification rejected', { phase: kind, outcome: result.failure, requestId: req.requestId })
    if (kind === 'REGISTER') {
      if (result.failure === 'challenge_expired') throw new AdminPermissionError(403, '本次绑定二维码已过期')
      if (result.failure === 'enrollment_ticket_unavailable') throw new AdminPermissionError(403, '本次登记票据已失效')
      if (result.failure === 'missing_or_malformed_input') throw new AdminPermissionError(403, '动态码没有完整提交，请输入六位数字')
      if (result.failure === 'step_did_not_match') throw new AdminPermissionError(403, '动态码与本次绑定二维码不匹配')
    }
    throw new AdminPermissionError(403, '动态码错误、已使用或验证已失效，请重新开始并使用新的动态码')
  }
  if (kind === 'REGISTER') return { registered: true as const }
  return issueAdminSession(req, res, result.userId, result.tokenVersion, 'TOTP', sessionId)
}

/** Attempts are counted across newly issued challenges for the same account.
 * Redis/identity failures fail closed, including for local acceptance.
 */
export const adminTotpAttemptLimiter: RequestHandler = async (req, res, next) => {
  try {
    const raw = getCookie(req, pendingCookie)
    const challenge = raw && /^[A-Za-z0-9_-]{43}$/.test(raw)
      ? await prisma.adminSecurityChallenge.findFirst({ where: { idHash: adminSecretHash(raw), expiresAt: { gt: new Date() }, purpose: { in: ['TOTP_REGISTER', 'TOTP_LOGIN', 'TOTP_STEP_UP'] } }, select: { userId: true } }) : null
    for (const [key, limit] of [
      ['ip:' + adminSecretHash(req.ip || req.socket.remoteAddress || 'unknown'), 600],
      ...(challenge ? [['account:' + adminSecretHash(challenge.userId), 20] as const] : []),
    ] as const) {
      const budget = await cacheService.consumeRateLimit('ratelimit:admin-totp:' + key, limit, 900)
      if (!budget) return void res.status(503).json({ code: -1, message: '动态码验证暂不可用' })
      if (!budget.allowed) {
        res.setHeader('Retry-After', String(budget.retryAfterSeconds))
        return void res.status(429).json({ code: -1, message: '动态码尝试过于频繁，请稍后再试' })
      }
    }
    next()
  } catch { res.status(503).json({ code: -1, message: '动态码验证暂不可用' }) }
}
