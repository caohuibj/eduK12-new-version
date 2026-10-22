import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions,
  verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport } from '@simplewebauthn/server'
import { prisma } from '../../config/database'
import { loadCurrentPrincipal, type CurrentPrincipal } from '../organization/principal'
import { inactiveAccountMessage } from '../../utils/accountStatus'
import { generateToken } from '../../utils/jwt'
import { getCookie, setSessionCookie } from '../../utils/authCookies'
import { AdminPermissionError } from './service'
import { needsAdminKey } from './proof'
export { ADMIN_SESSION_SECONDS, ADMIN_STEP_UP_SECONDS, needsAdminKey, validAdminProof } from './proof'

const challengeCookie = 'eduk12_admin_challenge'
export const adminSecretHash = (value: string) => createHash('sha256').update(value).digest('hex')
export type AdminAuthenticationMethod = 'TOTP' | 'SECURITY_KEY'
export function adminAuthOrigin() {
  const origin = process.env.ADMIN_AUTH_ORIGIN || process.env.ADMIN_WEBAUTHN_ORIGIN
  if (!origin) throw new AdminPermissionError(503, '管理员认证来源尚未配置')
  let url: URL
  try { url = new URL(origin) } catch { throw new AdminPermissionError(503, '管理员认证来源配置无效') }
  const local = process.env.NODE_ENV !== 'production' && url.hostname === 'localhost'
  if (url.origin !== origin || (!local && origin !== 'https://training.eduk12.top')
    || (local && !['http:', 'https:'].includes(url.protocol)))
    throw new AdminPermissionError(503, '管理员认证来源配置无效')
  return origin
}
export function adminWebAuthnConfig() {
  const origin = adminAuthOrigin()
  const rpID = process.env.ADMIN_WEBAUTHN_RP_ID
  if (!origin || !rpID) throw new AdminPermissionError(503, '管理安全密钥尚未配置')
  const url = new URL(origin)
  const local = process.env.NODE_ENV !== 'production' && url.hostname === 'localhost'
  // A host header, body field or other product origin can never select the RP.
  if (url.origin !== origin || (!local && (origin !== 'https://training.eduk12.top' || rpID !== 'training.eduk12.top'))
    || (local && (rpID !== 'localhost' || !['http:', 'https:'].includes(url.protocol))))
    throw new AdminPermissionError(503, '管理安全密钥来源配置无效')
  return { origin, rpID }
}

function setChallengeCookie(req: Request, res: Response, secret: string) {
  const secure = req.secure || process.env.NODE_ENV === 'production'
  res.append('Set-Cookie', `${challengeCookie}=${secret}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=300${secure ? '; Secure' : ''}`)
}
export async function rememberChallenge(req: Request, res: Response, input: {
  userId: string; tokenVersion: number; challenge: string; purpose: 'LOGIN' | 'STEP_UP' | 'REGISTER' | 'TOTP_LOGIN' | 'TOTP_STEP_UP' | 'TOTP_REGISTER'
  sessionId?: string; enrollmentHash?: string
}) {
  const secret = randomBytes(32).toString('base64url')
  await prisma.$transaction(async tx => {
    // Bounded live state per account and purpose. Expired challenges are removed
    // here, without a recurring worker or an unbounded in-memory cache.
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${input.userId} FOR UPDATE`
    await tx.adminSecurityChallenge.deleteMany({ where: { userId: input.userId, purpose: input.purpose } })
    await tx.adminSecurityChallenge.create({ data: { ...input, idHash: adminSecretHash(secret), expiresAt: new Date(Date.now() + 300_000) } })
  })
  setChallengeCookie(req, res, secret)
}

export async function beginAdminLogin(req: Request, res: Response, userId: string, sessionId?: string, authenticatedPrincipal?: CurrentPrincipal, method?: AdminAuthenticationMethod) {
  adminAuthOrigin()
  const principal = authenticatedPrincipal ?? await loadCurrentPrincipal(userId)
  if (!principal || principal.userId!==userId || inactiveAccountMessage(principal) || !['LEGACY', 'TRAINING'].includes(principal.accountDomain) || !needsAdminKey(principal))
    throw new AdminPermissionError(403, '管理账号不可用')
  if (method !== 'SECURITY_KEY') {
    const enrolled = await prisma.adminTotpCredential.findUnique({ where: { userId }, select: { userId: true } })
    if (enrolled) {
      await rememberChallenge(req, res, { userId, tokenVersion: principal.tokenVersion, challenge: '',
        purpose: sessionId ? 'TOTP_STEP_UP' : 'TOTP_LOGIN', sessionId })
      return { adminTotpRequired: true as const }
    }
    if (method === 'TOTP') throw new AdminPermissionError(403, '请先使用受控登记票据绑定 Authenticator')
  }
  const { rpID } = adminWebAuthnConfig()
  const keys = await prisma.adminSecurityKey.findMany({ where: { userId } })
  if (!keys.length) throw new AdminPermissionError(403, '请先通过受控后台登记安全密钥')
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required',
    allowCredentials: keys.map(k => ({ id: k.id, transports: k.transports as AuthenticatorTransport[] })) })
  await rememberChallenge(req, res, { userId, tokenVersion: principal.tokenVersion, challenge: options.challenge,
    purpose: sessionId ? 'STEP_UP' : 'LOGIN', sessionId })
  return { adminKeyRequired: true, options }
}

async function consumeChallenge(req: Request, purposes: string[]) {
  const secret = getCookie(req, challengeCookie)
  if (!secret || secret.length !== 43) throw new AdminPermissionError(403, '安全密钥验证已过期，请重试')
  // A failed attempt consumes the challenge too; the same signed assertion can
  // never be raced or replayed, even with an authenticator that reports zero.
  const rows = await prisma.$queryRaw<Array<{ userId: string; tokenVersion: number; challenge: string;
    purpose: string; sessionId: string | null; enrollmentHash: string | null }>>`
    DELETE FROM "admin_security_challenges" WHERE "id_hash"=${adminSecretHash(secret)}
      AND "expires_at">statement_timestamp()
    RETURNING "user_id" AS "userId", "token_version" AS "tokenVersion", "challenge", "purpose",
      "session_id" AS "sessionId", "enrollment_hash" AS "enrollmentHash"
  `
  const challenge = rows[0]
  if (!challenge || !purposes.includes(challenge.purpose)) throw new AdminPermissionError(403, '安全密钥验证已过期或已使用')
  return challenge
}

export async function issueAdminSession(req: Request, res: Response, userId: string, expectedVersion: number, sessionId: string = randomUUID()) {
  const principal = await loadCurrentPrincipal(userId)
  if (!principal || inactiveAccountMessage(principal) || principal.tokenVersion !== expectedVersion || !needsAdminKey(principal))
    throw new AdminPermissionError(403, '管理权限已变化，请重新登录')
  const now = Math.floor(Date.now() / 1000)
  setSessionCookie(req, res, generateToken({ accountDomain: principal.accountDomain,
    userId, username: principal.username, role: principal.role, tokenVersion: principal.tokenVersion,
    mustChangePassword: principal.mustChangePassword, adminVerifiedAt: now, adminSessionId: sessionId }))
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, avatarUrl: true } })
  return { user: { id: userId, username: principal.username, role: principal.role, businessRole: principal.businessRole, platformRole: principal.platformRole,
    entryGrants: principal.entryGrants ?? [], mustChangePassword: principal.mustChangePassword, ...user } }
}

export async function finishAdminAuthentication(req: Request, res: Response, response: AuthenticationResponseJSON, sessionId?: string) {
  const { origin, rpID } = adminWebAuthnConfig()
  const challenge = await consumeChallenge(req, sessionId ? ['STEP_UP'] : ['LOGIN'])
  if ((sessionId && (challenge.sessionId !== sessionId || challenge.userId !== req.user?.userId)) || (!sessionId && challenge.sessionId))
    throw new AdminPermissionError(403, '验证不属于当前会话')
  const key = await prisma.adminSecurityKey.findUnique({ where: { id: response.id } })
  if (!key || key.userId !== challenge.userId) throw new AdminPermissionError(403, '安全密钥验证失败')
  let verified
  try {
    verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge,
      expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports as AuthenticatorTransport[] } })
  } catch { throw new AdminPermissionError(403, '安全密钥验证失败') }
  if (!verified.verified || !verified.authenticationInfo.userVerified || verified.authenticationInfo.credentialBackedUp
    || verified.authenticationInfo.credentialDeviceType !== 'singleDevice') throw new AdminPermissionError(403, '必须使用具有用户验证的独立安全密钥')
  await prisma.$transaction(async tx => {
    const [current] = await tx.$queryRaw<Array<{ tokenVersion: number }>>`SELECT "token_version" AS "tokenVersion" FROM "users" WHERE "id"=${key.userId} FOR UPDATE`
    if (current?.tokenVersion !== challenge.tokenVersion) throw new AdminPermissionError(403, '账号权限已变化，请重新登录')
    const updated = await tx.adminSecurityKey.updateMany({ where: { id: key.id, counter: key.counter }, data: { counter: BigInt(verified.authenticationInfo.newCounter) } })
    if (updated.count !== 1) throw new AdminPermissionError(403, '安全密钥状态已变化，请重试')
    await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), actorUserId: key.userId, targetUserId: key.userId,
      action: sessionId ? 'ADMIN_KEY_STEP_UP' : 'ADMIN_KEY_LOGIN', reason: 'WebAuthn UP+UV; single-device credential' } })
  })
  return issueAdminSession(req, res, key.userId, challenge.tokenVersion, sessionId)
}

export async function beginAdminRegistration(req: Request, res: Response, userId: string, enrollmentToken: string) {
  const { origin: _origin, rpID } = adminWebAuthnConfig()
  const principal = await loadCurrentPrincipal(userId)
  const ticket = await prisma.adminSecurityChallenge.findUnique({ where: { idHash: adminSecretHash(enrollmentToken) } })
  if (!principal || inactiveAccountMessage(principal) || !needsAdminKey(principal)
    || !ticket || ticket.purpose !== 'ENROLLMENT' || ticket.userId !== userId || ticket.expiresAt <= new Date()
    || ticket.tokenVersion !== principal.tokenVersion) throw new AdminPermissionError(403, '受控登记票据无效')
  const keys = await prisma.adminSecurityKey.findMany({ where: { userId } })
  if (keys.length >= 3) throw new AdminPermissionError(409, '安全密钥数量已达上限')
  const options = await generateRegistrationOptions({ rpName: 'eduK12 管理后台', rpID, userName: principal.username,
    userID: new TextEncoder().encode(userId), attestationType: 'none',
    authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'discouraged', userVerification: 'required' },
    supportedAlgorithmIDs: [-7, -257], excludeCredentials: keys.map(k => ({ id: k.id })) })
  await rememberChallenge(req, res, { userId, tokenVersion: principal.tokenVersion, purpose: 'REGISTER',
    challenge: options.challenge, enrollmentHash: ticket.idHash })
  return { options }
}

export async function finishAdminRegistration(req: Request, response: RegistrationResponseJSON) {
  const { origin, rpID } = adminWebAuthnConfig()
  const challenge = await consumeChallenge(req, ['REGISTER'])
  let verified
  try { verified = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: origin,
    expectedRPID: rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] }) }
  catch { throw new AdminPermissionError(403, '安全密钥登记验证失败') }
  if (!verified.verified || !verified.registrationInfo.userVerified || verified.registrationInfo.credentialBackedUp
    || verified.registrationInfo.credentialDeviceType !== 'singleDevice' || response.authenticatorAttachment !== 'cross-platform')
    throw new AdminPermissionError(403, '必须登记具有用户验证的独立安全密钥')
  const credential = verified.registrationInfo.credential
  await prisma.$transaction(async tx => {
    const [current] = await tx.$queryRaw<Array<{ tokenVersion: number }>>`SELECT "token_version" AS "tokenVersion" FROM "users" WHERE "id"=${challenge.userId} FOR UPDATE`
    if (current?.tokenVersion !== challenge.tokenVersion || !challenge.enrollmentHash) throw new AdminPermissionError(403, '账号状态已变化')
    const ticket = await tx.adminSecurityChallenge.deleteMany({ where: { idHash: challenge.enrollmentHash, purpose: 'ENROLLMENT',
      userId: challenge.userId, tokenVersion: challenge.tokenVersion, expiresAt: { gt: new Date() } } })
    if (ticket.count !== 1) throw new AdminPermissionError(403, '登记票据已失效或已使用')
    const count = await tx.adminSecurityKey.count({ where: { userId: challenge.userId } })
    if (count >= 3) throw new AdminPermissionError(409, '安全密钥数量已达上限')
    await tx.adminSecurityKey.create({ data: { id: credential.id, userId: challenge.userId, publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter), transports: credential.transports ?? [] } })
    await tx.adminAuthorizationAudit.create({ data: { id: randomUUID(), actorUserId: challenge.userId, targetUserId: challenge.userId,
      action: 'ADMIN_KEY_REGISTERED', reason: 'Operator ticket consumed; WebAuthn UP+UV; single-device credential' } })
  })
  // Registration never logs the account in. A fresh password + key assertion is required.
  return { registered: true }
}
