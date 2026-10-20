/** Business acceptance precondition only. Never imported by application code.
 * This server-signed fixture is NOT evidence of WebAuthn authentication.
 * The administrator browser gate separately performs real virtual CTAP2.
 */
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('../../backend/node_modules/@prisma/client')
const jwt = require('../../backend/node_modules/jsonwebtoken')

function assertSyntheticDatabase() {
  assert.equal(process.env.NODE_ENV, 'test', 'Synthetic administrator sessions require test mode')
  const db = new URL(process.env.DATABASE_URL || '')
  assert.ok(['localhost', '127.0.0.1'].includes(db.hostname), 'Loopback test database required')
  assert.ok(/^\/eduk12_admin_permissions_[a-z0-9_]+$/.test(db.pathname)
    || (process.env.CI === 'true' && db.pathname === '/ptool'), 'Dedicated synthetic test database required')
  assert.ok(process.env.JWT_SECRET?.length >= 32, 'Explicit test signing key required')
}
async function restoreSyntheticAdminSession(page, { baseUrl, username }) {
  assertSyntheticDatabase()
  const origin = new URL(baseUrl)
  assert.ok(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname), 'HTTP loopback browser required')
  assert.ok(/^(pr5_scenario_|q1-browser-admin-)/.test(username), 'Known synthetic business fixture required')
  const db = new PrismaClient()
  try {
    const user = await db.user.findUnique({ where: { username }, select: {
      id: true, role: true, accountDomain: true, platformRole: true, tokenVersion: true,
      isActive: true, isFrozen: true, mustChangePassword: true, expiresAt: true,
    } })
    assert.ok(user?.isActive && !user.isFrozen && !user.mustChangePassword
      && (!user.expiresAt || user.expiresAt > new Date()), 'Active synthetic fixture required')
    assert.ok(['LEGACY', 'TRAINING'].includes(user.accountDomain), 'Management identity domain required')
    const grants = await db.adminEntryGrant.count({ where: { userId: user.id, revokedAt: null } })
    assert.ok(user.platformRole === 'SYSTEM_ADMIN' || grants > 0, 'Explicit current management authority required')
    const token = jwt.sign({ userId: user.id, role: user.role, accountDomain: user.accountDomain,
      tokenVersion: user.tokenVersion, adminVerifiedAt: Math.floor(Date.now() / 1000), adminSessionId: randomUUID(),
    }, process.env.JWT_SECRET, { expiresIn: '1h', jwtid: randomUUID() })
    await page.context().addCookies([{ name: 'ptool_session', value: token, url: origin.origin,
      httpOnly: true, sameSite: 'Lax', secure: false }])
    await page.goto(origin.origin + '/admin/entrances')
    const response = await page.request.get(origin.origin + '/api/auth/me')
    assert.equal(response.status(), 200, 'Synthetic precondition must pass current server authority checks')
    assert.equal((await response.json()).data?.id, user.id, 'Synthetic session identity must match')
  } finally { await db.$disconnect() }
}
module.exports = { assertSyntheticDatabase, restoreSyntheticAdminSession }
