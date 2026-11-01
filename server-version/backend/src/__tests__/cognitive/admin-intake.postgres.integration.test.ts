import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { CANCELLATION_STIMULUS_SET_VERSION } from '../../modules/cognitive/tasks/cancellation/generator'

const url = integrationDatabaseUrl('COGNITIVE_INSTALL_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('registered intake through real PostgreSQL and HTTP authority', () => {
  let db: typeof import('../../config/database')['prisma'], sign: typeof import('../../utils/jwt')['generateToken']
  let server: Server, base: string
  const users = new Map<string, any>()
  const selected = ['numberline', 'cancellation'].map(testType => {
    const seed = cognitiveSeeds.find(s => s.testType === testType && s.configVersion === '1.0.1')!
    if (!seed) throw new Error('Expected exact registered fixture')
    return { testType: seed.testType, configVersion: seed.configVersion, engineVersion: seed.engineVersion, scoringVersion: seed.scoringVersion }
  })
  const input = { schemaVersion: 1, items: selected }
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = (await import('../../config/database')).prisma
    sign = (await import('../../utils/jwt')).generateToken
    for (const name of ['system', 'teacher']) users.set(name, await db.user.create({ data: {
      username: 'cog-intake-test-' + randomUUID(), passwordHash: 'synthetic-unusable',
      role: name === 'system' ? 'ADMIN' : 'TEACHER', accountDomain: 'TRAINING',
      platformRole: name === 'system' ? 'SYSTEM_ADMIN' : 'STANDARD',
    } }))
    const app = express(); app.use(express.json())
    app.use('/api', (await import('../../middleware/csrf')).csrfProtection)
    app.use('/api/admin/permissions', (await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
    app.use((await import('../../middleware/errorHandler')).errorHandler)
    server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/admin/permissions/cognitive-intake'
  }, 30000)
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
    await (await import('../../config/queue')).closeQueues(true)
    await db?.$disconnect()
  })
  async function call(path: string, body?: unknown, actor = 'system', age = 0) {
    const user = users.get(actor)
    // A server-signed synthetic session fixture; no login/MFA hardware ceremony is claimed.
    const token = sign({ userId: user.id, username: user.username, role: user.role, accountDomain: user.accountDomain,
      tokenVersion: user.tokenVersion, adminSessionId: randomUUID(), adminVerifiedAt: Math.floor(Date.now() / 1000) - age })
    const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      Cookie: 'ptool_session=' + token + '; ptool_csrf=synthetic-intake', Origin: 'http://localhost:5174',
      'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic-intake',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: r.status, body: await r.json() as any }
  }
  it('denies real current non-system role, expired step-up and unregistered exact version without writes', async () => {
    expect((await call('', undefined, 'teacher')).status).toBe(403)
    expect((await call('/install', input, 'system', 301)).status).toBe(403)
    expect((await call('/install', { schemaVersion: 1, items: [{ ...selected[0], engineVersion: 'unknown' }] })).status).toBe(400)
    expect(await db.cognitiveTestConfig.count()).toBe(0)
    expect(await db.assessmentManagementEvent.count()).toBe(0)
  })
  it('previews genuine readiness then installs exact registered drafts and preserves return/release pointers', async () => {
    const list = await call(''); expect(list.status).toBe(200)
    for (const item of selected) expect(list.body.data.registered.find((r: any) => r.testType === item.testType && r.configVersion === item.configVersion).plan.action).toBe('CREATE_DRAFT')
    const preview = await call('/preview', input); expect(preview.status).toBe(200)
    expect(preview.body.data.rows.map((r: any) => r.action)).toEqual(['CREATE_DRAFT', 'CREATE_DRAFT'])
    expect(await db.cognitiveTestConfig.count()).toBe(0)
    const installed = await call('/install', input); expect(installed.status).toBe(200)
    expect(installed.body.data.rows).toHaveLength(2)
    for (const row of installed.body.data.rows) {
      expect(row.action).toBe('CREATED_DRAFT')
      const stored = await db.cognitiveTestConfig.findUniqueOrThrow({ where: { id: row.configId } })
      const seed = cognitiveSeeds.find(s => s.testType === row.testType && s.configVersion === row.configVersion)!
      expect(stored).toMatchObject({ status: 'DRAFT', accessPolicy: 'GRANT', publishedAt: null, config: seed.config, engineVersion: row.engineVersion, scoringVersion: row.scoringVersion })
      const pointer = await db.$queryRaw<Array<{ measurement_release_id: string | null }>>`SELECT measurement_release_id FROM cognitive_test_configs WHERE id=${stored.id}`
      expect(pointer[0].measurement_release_id).toBeNull()
      if (row.testType === 'cancellation') expect((stored.config as any).stimulusSetVersion).toBe(CANCELLATION_STIMULUS_SET_VERSION)
      expect(await db.assessmentManagementEvent.count({ where: { resourceId: stored.id, action: 'COGNITIVE_CONFIG_INSTALL' } })).toBe(1)
    }
    const again = await call('/install', input); expect(again.body.data.rows.map((r: any) => r.action)).toEqual(['ALREADY_PRESENT', 'ALREADY_PRESENT'])
    expect(await db.cognitiveTestConfig.count()).toBe(2)
    expect(await db.assessmentManagementEvent.count()).toBe(2)
  })
  it('retains an immutable conflicting draft and refuses a frozen current system actor', async () => {
    const stored = await db.cognitiveTestConfig.findUniqueOrThrow({ where: { testType_configVersion: { testType: 'numberline', configVersion: '1.0.1' } } })
    await db.cognitiveTestConfig.update({ where: { id: stored.id }, data: { name: 'synthetic immutable conflict' } })
    const blocked = await call('/install', { schemaVersion: 1, items: [selected[0]] })
    expect(blocked.body.data.rows[0]).toMatchObject({ action: 'BLOCKED', configId: stored.id, reasons: ['IMMUTABLE_CONFIG_CONFLICT'] })
    expect((await db.cognitiveTestConfig.findUniqueOrThrow({ where: { id: stored.id } })).name).toBe('synthetic immutable conflict')
    await db.user.update({ where: { id: users.get('system').id }, data: { isFrozen: true } })
    expect((await call('/install', input)).status).toBe(401)
    expect(await db.assessmentManagementEvent.count()).toBe(2)
  })
})
