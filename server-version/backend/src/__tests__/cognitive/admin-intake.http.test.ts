import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const records = new Map<string, any>()
  const actor = { id: 'synthetic-system', platformRole: 'SYSTEM_ADMIN', isActive: true, isFrozen: false, expiresAt: null }
  const events: any[] = []
  const db: any = {
    user: { findUnique: vi.fn(async () => actor) },
    cognitiveTestConfig: {
      findUnique: vi.fn(async ({ where }: any) => records.get(JSON.stringify(where.testType_configVersion)) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'synthetic-config-' + records.size, ...data }
        records.set(JSON.stringify({ testType: data.testType, configVersion: data.configVersion }), row)
        return row
      }),
    },
    assessmentManagementEvent: { create: vi.fn(async ({ data }: any) => { events.push(data); return data }) },
  }
  db.$transaction = vi.fn(async (work: any) => work(db))
  return { db, actor, records, events }
})
vi.mock('../../config/database', () => ({ prisma: fixture.db }))
// Reuse the actual role/recency guards without starting authentication ceremonies.
vi.mock('../../modules/admin-permissions/security', () => ({ ADMIN_STEP_UP_SECONDS: 300 }))
import { requireSystemAdmin } from '../../modules/admin-permissions/guards'
import { csrfProtection } from '../../middleware/csrf'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { cognitiveIntakeAdminRouter } from '../../modules/cognitive/onboarding/admin.routes'

const selected = { testType: 'numberline', configVersion: '1.0.1', engineVersion: '1.0.1', scoringVersion: '1.0.0' }
const input = { schemaVersion: 1, items: [selected] }
let server: Server, base = ''
async function call(path: string, body?: unknown, role = 'SYSTEM_ADMIN', recent = true, csrf = true) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Synthetic-Role': role, 'X-Synthetic-Recent': recent ? 'yes' : 'no',
      ...(csrf ? { Cookie: 'ptool_csrf=synthetic-intake', 'X-CSRF-Token': 'synthetic-intake' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, value: await response.json() as any }
}

beforeAll(async () => {
  const app = express()
  app.use(express.json(), (req, _res, next) => {
    // A trusted-principal substitute, not a JWT/login/real-account claim.
    req.user = { userId: fixture.actor.id, platformRole: req.get('X-Synthetic-Role'),
      adminVerifiedAt: Math.floor(Date.now() / 1000) - (req.get('X-Synthetic-Recent') === 'yes' ? 0 : 301) } as any
    next()
  })
  app.use('/api', csrfProtection)
  app.use('/api/admin/permissions', requireSystemAdmin)
  app.use('/api/admin/permissions/cognitive-intake', cognitiveIntakeAdminRouter)
  app.use((_caught: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ code: -1, message: 'Unexpected intake failure' }))
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/admin/permissions/cognitive-intake'
})
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
beforeEach(() => { fixture.records.clear(); fixture.events.length = 0; fixture.actor.platformRole = 'SYSTEM_ADMIN'; vi.clearAllMocks() })

describe('registered draft Cognitive intake HTTP with synthetic principal and storage', () => {
  it('lists current selectors without duplicating resolved pending notes or writing draft records', async () => {
    const { status, value } = await call('')
    expect(status).toBe(200)
    const selectors = value.data.registered.map((row: any) => JSON.stringify([row.testType, row.configVersion, row.engineVersion, row.scoringVersion]))
    expect(selectors.length).toBeGreaterThan(0)
    expect(new Set(selectors).size).toBe(selectors.length)
    expect(value.data.registered.find((row: any) => row.testType === 'numberline')).toMatchObject({ ...selected, plan: { action: 'CREATE_DRAFT' } })
    // All formerly pending PR441 tools are now registered in this combination.
    expect(value.data.pending).toEqual([])
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
    expect(fixture.events).toHaveLength(0)
  })

  it('shows the explicitly selected report version without relabelling a legacy config', async () => {
    const current = cognitiveSeeds.find(seed => seed.testType === 'timecopy' && (seed.config.report as { reportVersion?: string })?.reportVersion === '3.0.0')!
    expect(current).toBeDefined()
    const result = await call('')
    expect(result.status).toBe(200)
    expect(result.value.data.registered.find((row: any) => row.testType === current.testType && row.configVersion === current.configVersion)).toMatchObject({ reportVersion: '3.0.0' })
    expect(result.value.data.registered.find((row: any) => row.testType === 'timecopy' && row.configVersion === '1.0.1')).toMatchObject({ reportVersion: '1.0.1' })
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
  })

  it('previews only a registered exact selector and rejects extra executable/config/actor fields', async () => {
    expect((await call('/preview', input)).value.data).toMatchObject({ mode: 'PREVIEW', rows: [{ ...selected, action: 'CREATE_DRAFT' }] })
    for (const body of [
      { ...input, path: '/not-an-input' }, { ...input, command: 'not-an-input' }, { ...input, code: 'not-an-input' },
      { ...input, actor: 'different-actor' }, { ...input, items: [{ ...selected, config: {} }] },
      { ...input, items: [{ ...selected, scoringVersion: 'other-version' }] },
    ]) expect((await call('/preview', body)).status).toBe(400)
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
  })

  it('installs the selected registered seed as a restricted draft and reads back the real stored lifecycle', async () => {
    const result = await call('/install', input)
    expect(result.status).toBe(200)
    expect(result.value.data).toMatchObject({ mode: 'APPLY', rows: [{ ...selected, action: 'CREATED_DRAFT', status: 'DRAFT' }] })
    expect([...fixture.records.values()]).toEqual([expect.objectContaining({ status: 'DRAFT', accessPolicy: 'GRANT' })])
    expect(fixture.events).toEqual([expect.objectContaining({ actorId: fixture.actor.id, action: 'COGNITIVE_CONFIG_INSTALL' })])
    const reread = await call('')
    expect(reread.value.data.registered.find((row: any) => row.testType === 'numberline').plan).toMatchObject({ action: 'ALREADY_PRESENT', status: 'DRAFT' })
  })

  it('keeps pending tasks noninstallable while an independent registered task remains installable', async () => {
    expect((await call('/install', { schemaVersion: 1, items: [{ ...selected, testType: 'readingcomp' }] })).status).toBe(400)
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
    expect((await call('/install', input)).status).toBe(200)
    expect(fixture.db.cognitiveTestConfig.create).toHaveBeenCalledTimes(1)
  })

  it('enforces the existing system role, recency and CSRF boundaries before writes', async () => {
    expect((await call('', undefined, 'STANDARD')).status).toBe(403)
    expect((await call('/install', input, 'STANDARD')).status).toBe(403)
    expect((await call('/install', input, 'SYSTEM_ADMIN', false)).status).toBe(403)
    expect((await call('/install', input, 'SYSTEM_ADMIN', true, false)).status).toBe(403)
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
  })

  it('rechecks the current actor through the unchanged installation core', async () => {
    fixture.actor.platformRole = 'STANDARD'
    expect((await call('/install', input)).status).toBe(403)
    expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
  })
  it('derives a newly registered draft version without a second hand-maintained allowlist', async () => {
    const source = cognitiveSeeds.find(seed => seed.testType === selected.testType && seed.configVersion === selected.configVersion)!
    const added = { ...source, configVersion: 'synthetic-next-config', name: 'Synthetic next registered config' }
    cognitiveSeeds.push(added)
    try {
      const catalog = await call('')
      expect(catalog.value.data.registered.find((row: any) => row.configVersion === added.configVersion)).toMatchObject({ testType: added.testType, plan: { action: 'CREATE_DRAFT' } })
      const install = await call('/install', { schemaVersion: 1, items: [{ ...selected, configVersion: added.configVersion }] })
      expect(install.status).toBe(200)
      expect(install.value.data.rows[0]).toMatchObject({ action: 'CREATED_DRAFT', status: 'DRAFT' })
    } finally { cognitiveSeeds.splice(cognitiveSeeds.indexOf(added), 1) }
  })

  it('shows a registered draft with a missing engine as blocked and never fabricates its database draft', async () => {
    const source = cognitiveSeeds.find(seed => seed.testType === selected.testType && seed.configVersion === selected.configVersion)!
    const added = { ...source, testType: 'synthetic-missing-engine', name: 'Synthetic missing engine' }
    cognitiveSeeds.push(added)
    try {
      const catalog = await call('')
      expect(catalog.value.data.registered.find((row: any) => row.testType === added.testType).plan).toMatchObject({ action: 'BLOCKED', reasons: ['EXECUTION_IDENTITY_NOT_REGISTERED'] })
      const install = await call('/install', { schemaVersion: 1, items: [{ ...selected, testType: added.testType }] })
      expect(install.status).toBe(200)
      expect(install.value.data.rows[0].action).toBe('BLOCKED')
      expect(fixture.db.cognitiveTestConfig.create).not.toHaveBeenCalled()
    } finally { cognitiveSeeds.splice(cognitiveSeeds.indexOf(added), 1) }
  })

})
