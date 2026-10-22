import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const suite = process.env.ADMIN_PERMISSIONS_ISOLATED_TEST === '1' ? describe : describe.skip
const base = process.env.ADMIN_SECURITY_TEST_BASE_URL || 'http://127.0.0.1:3198'
const origin = process.env.ADMIN_AUTH_ORIGIN || 'http://localhost:5197'
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function secretFromUri(uri: string) {
  let value = 0, bits = 0
  const bytes: number[] = []
  for (const char of new URL(uri).searchParams.get('secret')!) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255) }
  }
  return Buffer.from(bytes)
}
function code(secret: Buffer, offset = 0) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset))
  const mac = createHmac('sha1', secret).update(counter).digest(), at = mac[19] & 15
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
function client() {
  const cookies = new Map<string, string>()
  return { cookies, async call(url: string, method = 'GET', body?: unknown, requestOrigin = origin) {
    const response = await fetch(base + url, { method, headers: { Origin: requestOrigin, 'Content-Type': 'application/json',
      Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '),
      ...(cookies.has('ptool_csrf') ? { 'X-CSRF-Token': decodeURIComponent(cookies.get('ptool_csrf')!) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0], at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
    return { status: response.status, body: await response.json() as any }
  } }
}

suite('administrator Authenticator ceremonies on actual API / PostgreSQL / Redis', () => {
  let db: typeof import('../../config/database')['prisma']
  let hashPassword: typeof import('../../utils/password')['hashPassword']
  let security: typeof import('../../modules/admin-permissions/security')
  let totp: typeof import('../../modules/admin-permissions/totp')
  let jwt: typeof import('../../utils/jwt')
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_')) throw new Error('Dedicated synthetic DB required')
    db = (await import('../../config/database')).prisma
    hashPassword = (await import('../../utils/password')).hashPassword
    security = await import('../../modules/admin-permissions/security')
    totp = await import('../../modules/admin-permissions/totp')
    jwt = await import('../../utils/jwt')
    expect((await fetch(base + '/ready')).status).toBe(200)
  })
  afterAll(() => db?.$disconnect())
  async function fixture(system = true) {
    const password = 'Synthetic1!' + randomBytes(18).toString('hex'), token = randomBytes(32).toString('base64url')
    const user = await db.user.create({ data: { username: 'totp-test-' + randomUUID(), passwordHash: await hashPassword(password),
      accountDomain: 'TRAINING', role: 'STUDENT', platformRole: system ? 'SYSTEM_ADMIN' : 'STANDARD' } })
    await db.adminSecurityChallenge.create({ data: { idHash: security.adminSecretHash(token), userId: user.id, purpose: 'ENROLLMENT',
      challenge: '', tokenVersion: user.tokenVersion, expiresAt: new Date(Date.now() + 900_000) } })
    const c = client(); await c.call('/api/auth/csrf')
    return { user, password, token, c }
  }
  async function setup(f: Awaited<ReturnType<typeof fixture>>) {
    const response = await f.c.call('/api/admin/security/totp/registration/options', 'POST', {
      username: f.user.username, password: f.password, enrollmentToken: f.token })
    expect(response.status).toBe(200)
    return secretFromUri(response.body.data.otpauthUri)
  }
  async function enrolled() {
    const f = await fixture(), secret = await setup(f)
    expect((await f.c.call('/api/admin/security/totp/registration/verify', 'POST', { code: code(secret, -1) })).status).toBe(200)
    return { ...f, secret }
  }
  async function password(f: Awaited<ReturnType<typeof enrolled>>) {
    const response = await f.c.call('/api/auth/login', 'POST', { username: f.user.username, password: f.password, adminAuthMethod: 'TOTP' })
    expect(response.status).toBe(200); expect(response.body.data).toEqual({ adminTotpRequired: true })
  }
  async function login(f: Awaited<ReturnType<typeof enrolled>>) {
    await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(f.secret) })).status).toBe(200)
  }
  it('requires current password, one-use operator ticket and a valid administrator realm; QR alone has no authority', async () => {
    const f = await fixture(), ordinary = await fixture(false)
    for (const input of [{ username: f.user.username, password: 'WrongPassword1', enrollmentToken: f.token },
      { username: f.user.username, password: f.password, enrollmentToken: randomBytes(32).toString('base64url') },
      { username: ordinary.user.username, password: ordinary.password, enrollmentToken: ordinary.token }]) {
      expect((await f.c.call('/api/admin/security/totp/registration/options', 'POST', input)).status).toBe(403)
    }
    await setup(f)
    expect(f.c.cookies.get('ptool_session')).toBeUndefined()
    expect(await db.adminTotpCredential.count({ where: { userId: f.user.id } })).toBe(0)
    expect((await f.c.call('/api/admin/permissions/accounts')).status).toBe(401)
    expect((await f.c.call('/api/admin/security/totp/registration/options', 'POST', {
      username: f.user.username, password: f.password, enrollmentToken: f.token }, 'https://attacker.invalid')).status).toBe(403)
  })
  it('confirms encrypted binding without a session, consumes its ticket and refuses rebinding or replay', async () => {
    const f = await enrolled(), stored = await db.adminTotpCredential.findUniqueOrThrow({ where: { userId: f.user.id } })
    expect(stored.secretCipher).not.toContain(f.secret.toString('base64url'))
    expect(stored.secretCipher.split('.')).toHaveLength(3)
    expect(f.c.cookies.get('ptool_session')).toBeUndefined()
    expect(await db.adminSecurityChallenge.count({ where: { idHash: security.adminSecretHash(f.token) } })).toBe(0)
    expect((await f.c.call('/api/admin/security/totp/registration/verify', 'POST', { code: code(f.secret, -1) })).status).toBe(403)
    await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(f.secret, -1) })).status).toBe(403)
    await login(f)
    expect((await f.c.call('/api/admin/permissions/accounts')).status).toBe(200)
  })
  it('rejects malformed and incorrect codes and commits challenge consumption', async () => {
    const f = await enrolled()
    await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: 'bad' })).status).toBe(403)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(f.secret) })).status).toBe(403)
    expect(Boolean(f.c.cookies.get('ptool_session'))).toBe(false)
    await login(f)
  })
  it('allows only one concurrent verification and rejects the same code on a fresh password challenge', async () => {
    const f = await enrolled(); await password(f)
    const value = code(f.secret), results = await Promise.all([1, 2].map(() => f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: value })))
    expect(results.map(result => result.status).sort()).toEqual([200, 403])
    f.c.cookies.delete('ptool_session'); await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: value })).status).toBe(403)
    expect(Boolean(f.c.cookies.get('ptool_session'))).toBe(false)
  })
  it.each(['expired', 'version', 'frozen', 'demoted'])('rechecks %s state after password verification', async kind => {
    const f = await enrolled(); await password(f)
    if (kind === 'expired') await db.adminSecurityChallenge.updateMany({ where: { userId: f.user.id }, data: { expiresAt: new Date(0) } })
    if (kind === 'version') await db.user.update({ where: { id: f.user.id }, data: { tokenVersion: { increment: 1 } } })
    if (kind === 'frozen') await db.user.update({ where: { id: f.user.id }, data: { isFrozen: true } })
    if (kind === 'demoted') await db.user.update({ where: { id: f.user.id }, data: { platformRole: 'STANDARD' } })
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(f.secret) })).status).toBe(403)
    expect(Boolean(f.c.cookies.get('ptool_session'))).toBe(false)
  })
  it('rechecks ticket expiry at confirmation, rejects duplicate binding and binds encryption to the account', async () => {
    const a = await fixture(), secret = await setup(a)
    await db.adminSecurityChallenge.update({ where: { idHash: security.adminSecretHash(a.token) }, data: { expiresAt: new Date(0) } })
    expect((await a.c.call('/api/admin/security/totp/registration/verify', 'POST', { code: code(secret) })).status).toBe(403)
    expect(await db.adminTotpCredential.count({ where: { userId: a.user.id } })).toBe(0)
    const f = await enrolled(), other = await enrolled()
    const cipher = (await db.adminTotpCredential.findUniqueOrThrow({ where: { userId: other.user.id } })).secretCipher
    await db.adminTotpCredential.update({ where: { userId: f.user.id }, data: { secretCipher: cipher } })
    await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(other.secret) })).status).toBe(503)
    expect(Boolean(f.c.cookies.get('ptool_session'))).toBe(false)
  })
  it('renews an expired recent proof with a new code, preserving the signed account/session binding', async () => {
    const f = await enrolled(); await login(f)
    const claims = jwt.verifyToken(decodeURIComponent(f.c.cookies.get('ptool_session')!))!
    const old = jwt.generateToken({ userId: claims.userId, username: claims.username, role: claims.role, accountDomain: claims.accountDomain,
      tokenVersion: claims.tokenVersion, adminSessionId: claims.adminSessionId, adminVerifiedAt: Math.floor(Date.now() / 1000) - 301 })
    f.c.cookies.set('ptool_session', encodeURIComponent(old))
    const grant = { active: true, expectedVersion: 0, reason: 'Synthetic TOTP-sensitive authorization check' }
    const url = '/api/admin/permissions/accounts/' + f.user.id + '/entries/SURVEY'
    expect((await f.c.call(url, 'PUT', grant)).status).toBe(403)
    expect((await f.c.call('/api/admin/security/step-up/options', 'POST', { method: 'TOTP' })).status).toBe(200)
    expect((await f.c.call('/api/admin/security/totp/step-up/verify', 'POST', { code: code(f.secret, 1) })).status).toBe(200)
    expect((await f.c.call(url, 'PUT', grant)).status).toBe(200)
    // The grant increments tokenVersion. The previous session is immediately invalid.
    expect((await f.c.call('/api/admin/permissions/accounts')).status).toBe(401)
    const second = await enrolled(), req = { headers: {}, secure: false } as any
    const res = { append(_name: string, value: string) { req.headers.cookie = value.split(';')[0] } } as any
    await security.beginAdminLogin(req, res, second.user.id, 'original-session', undefined, 'TOTP')
    req.user = { userId: second.user.id }
    await expect(totp.finishAdminTotp(req, res, code(second.secret), 'STEP_UP', 'different-session')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('enforces the account attempt budget across newly issued password challenges', async () => {
    const f = await enrolled()
    for (let n = 0; n < 19; n++) {
      await password(f)
      expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: 'invalid' })).status).toBe(403)
    }
    await password(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(f.secret) })).status).toBe(429)
  })
  it('controlled recovery removes TOTP credentials and invalidates old sessions without changing authority', async () => {
    const f = await enrolled(); await login(f)
    const privateDir = mkdtempSync(path.join(tmpdir(), 'admin-totp-recovery-')), handoff = path.join(privateDir, 'ticket.json')
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/admin-security-bootstrap.ts'], { cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, ADMIN_SECURITY_BOOTSTRAP_ENABLED: 'true', ADMIN_SECURITY_HANDOFF_FILE: handoff },
      input: JSON.stringify({ action: 'RECOVER', username: f.user.username, reason: 'Synthetic Authenticator recovery acceptance' }) })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toMatchObject({ loginRequiresMfa: true, privateHandoffCreated: true })
    expect(await db.adminTotpCredential.count({ where: { userId: f.user.id } })).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).platformRole).toBe('SYSTEM_ADMIN')
    expect((await f.c.call('/api/admin/permissions/accounts')).status).toBe(401)
    const ticket = JSON.parse(readFileSync(handoff, 'utf8')).enrollmentToken
    expect((await f.c.call('/api/admin/security/totp/registration/options', 'POST', { username: f.user.username, password: f.password, enrollmentToken: ticket })).status).toBe(200)
  })
  it('additional boundary: rejects replacing an enrolled secret even with a new valid operator ticket', async () => {
    const f = await enrolled(), before = await db.adminTotpCredential.findUniqueOrThrow({ where: { userId: f.user.id } })
    const token = randomBytes(32).toString('base64url')
    await db.adminSecurityChallenge.create({ data: { idHash: security.adminSecretHash(token), userId: f.user.id, purpose: 'ENROLLMENT',
      challenge: '', tokenVersion: f.user.tokenVersion, expiresAt: new Date(Date.now() + 60_000) } })
    expect((await f.c.call('/api/admin/security/totp/registration/options', 'POST', { username: f.user.username, password: f.password, enrollmentToken: token })).status).toBe(409)
    expect((await db.adminTotpCredential.findUniqueOrThrow({ where: { userId: f.user.id } })).secretCipher).toBe(before.secretCipher)
  })
  it('additional boundary: a binding challenge cannot be exchanged for a login session', async () => {
    const f = await fixture(), secret = await setup(f)
    expect((await f.c.call('/api/admin/security/totp/authentication/verify', 'POST', { code: code(secret) })).status).toBe(403)
    expect(Boolean(f.c.cookies.get('ptool_session'))).toBe(false)
    expect(await db.adminTotpCredential.count({ where: { userId: f.user.id } })).toBe(0)
  })
  it('additional boundary: step-up cannot cross signed accounts even with a matching session identifier', async () => {
    const f = await enrolled(), other = await fixture()
    const req = { headers: {}, secure: false, user: { userId: other.user.id } } as any
    const res = { append(_name: string, value: string) { req.headers.cookie = value.split(';')[0] } } as any
    await security.beginAdminLogin(req, res, f.user.id, 'synthetic-session', undefined, 'TOTP')
    await expect(totp.finishAdminTotp(req, res, code(f.secret), 'STEP_UP', 'synthetic-session')).rejects.toMatchObject({ statusCode: 403 })
  })
})
