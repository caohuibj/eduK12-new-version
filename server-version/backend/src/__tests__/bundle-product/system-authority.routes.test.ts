import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type RequestHandler } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  principal: undefined as Record<string, unknown> | undefined,
  listDrafts: vi.fn(), preview: vi.fn(), save: vi.fn(), getDraft: vi.fn(), approve: vi.fn(),
  listProducts: vi.fn(), publishConfig: vi.fn(), retireConfig: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../middleware/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../middleware/auth')>(),
  // Trusted-principal fixture only: session/JWT validation is covered separately.
  // Keep the production role guards and actual Express routers in this test.
  authenticate: ((req, res, next) => {
    if (!fixture.principal) return res.status(401).json({ code: -1 })
    req.user = { ...fixture.principal } as typeof req.user
    next()
  }) satisfies RequestHandler,
}))
vi.mock('../../modules/bundle-product/admin-authoring', () => ({
  listPackageDrafts: fixture.listDrafts, previewPackage: fixture.preview,
  savePackage: fixture.save, getPackageDraft: fixture.getDraft, approvePackage: fixture.approve,
  refreshPublishedPackages: vi.fn(),
}))
vi.mock('../../modules/bundle-product/service', () => ({
  bundleDefinitionProvider: {}, bundleProductService: {
    list: fixture.listProducts, catalog: vi.fn(), create: vi.fn(), detail: vi.fn(),
    publish: vi.fn(), nextWave: vi.fn(), archive: vi.fn(), eligible: vi.fn(),
  },
}))
vi.mock('../../modules/bundle-product/analysis', () => ({
  history: vi.fn(), authorizeStaff: vi.fn(), readReport: vi.fn(), reanalyze: vi.fn(), processAnalysis: vi.fn(),
}))
vi.mock('../../modules/cognitive/cognitive-release.controller', () => ({
  cognitiveReleaseController: { publishConfig: fixture.publishConfig, retireConfig: fixture.retireConfig },
}))
vi.mock('../../modules/cognitive/cognitive.controller', () => ({
  cognitiveController: new Proxy({}, { get: () => vi.fn() }),
}))
// Unrelated media handlers are inert fixtures; no media implementation is loaded.
vi.mock('../../modules/cognitive/cognitive-image.controller', () => ({
  cognitiveImageController: new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('../../modules/cognitive/cognitive-video.controller', () => ({
  cognitiveVideoController: new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('../../modules/cognitive/profile-configurations.routes', async () => ({
  cognitiveProfileConfigurationsRouter: (await import('express')).Router(),
}))
vi.mock('../../modules/cognitive/product-eligibility', () => ({ assertCognitiveNewAdmissionEnabled: vi.fn() }))
vi.mock('../../modules/assessment-runtime/shared-control-records', () => ({
  sharedControlRequestContext: ((_req, _res, next) => next()) satisfies RequestHandler,
}))
vi.mock('../../modules/assessment-run/runtimeAccess', () => ({
  runOrLegacyRespondentAccess: () => ((_req, _res, next) => next()) satisfies RequestHandler,
}))
vi.mock('../../services/assessmentExportHttp', () => ({
  assessmentExportHttp: () => ((_req, _res, next) => next()) satisfies RequestHandler,
}))

import bundleRoutes from '../../modules/bundle-product/routes'
import cognitiveRoutes from '../../modules/cognitive/cognitive.routes'

const principal = (overrides: Record<string, unknown>) => ({
  userId: 'synthetic-current-account', username: 'synthetic-current-account', accountDomain: 'TRAINING',
  role: 'TEACHER', businessRole: 'TEACHER', platformRole: 'STANDARD', entryGrants: [],
  teacherApproved: true, mustChangePassword: false, tokenVersion: 3, ...overrides,
})
const denied = [
  { name: 'STANDARD Training entry admin', value: principal({ role: 'ADMIN', businessRole: 'TEACHER', entryGrants: [{ entry: 'TRAINING', version: 1 }] }) },
  { name: 'raw ADMIN without system authority', value: principal({ role: 'ADMIN', businessRole: 'ADMIN' }) },
  { name: 'ordinary teacher', value: principal({}) },
]
const bundleAdminRequests = [
  ['GET', '/api/bundle-products/admin/definitions'],
  ['POST', '/api/bundle-products/admin/preview'],
  ['POST', '/api/bundle-products/admin/definitions'],
  ['GET', '/api/bundle-products/admin/definitions/synthetic/1.0.0'],
  ['POST', '/api/bundle-products/admin/definitions/synthetic/1.0.0/approve'],
] as const

describe('global content routes with trusted-principal authentication fixtures and real role guards', () => {
  let server: Server
  let baseUrl: string
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/bundle-products', bundleRoutes)
    app.use('/api/cognitive', cognitiveRoutes)
    server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.principal = undefined
    for (const handler of [fixture.listDrafts, fixture.preview, fixture.save, fixture.getDraft, fixture.approve]) handler.mockResolvedValue({ accepted: true })
    fixture.listProducts.mockResolvedValue([])
    fixture.publishConfig.mockImplementation((_req, res) => res.json({ code: 0 }))
    fixture.retireConfig.mockImplementation((_req, res) => res.json({ code: 0 }))
  })
  async function call(method: string, path: string) {
    const response = await fetch(baseUrl + path, {
      method, headers: { 'Content-Type': 'application/json', Connection: 'close' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    })
    await response.json()
    return response.status
  }

  it.each(['TEACHER', 'STUDENT'])('allows SYSTEM_ADMIN with %s business identity on every Bundle admin route', async role => {
    fixture.principal = principal({ role, businessRole: role, platformRole: 'SYSTEM_ADMIN' })
    for (const [method, path] of bundleAdminRequests) expect(await call(method, path), path).toBe(200)
    for (const handler of [fixture.listDrafts, fixture.preview, fixture.save, fixture.getDraft, fixture.approve]) expect(handler).toHaveBeenCalledOnce()
  })
  it.each(denied)('denies $name before Bundle authoring work', async ({ value }) => {
    fixture.principal = value
    for (const [method, path] of bundleAdminRequests) expect(await call(method, path), path).toBe(403)
    for (const handler of [fixture.listDrafts, fixture.preview, fixture.save, fixture.getDraft, fixture.approve]) expect(handler).not.toHaveBeenCalled()
  })
  it.each(['TEACHER', 'STUDENT'])('allows SYSTEM_ADMIN with %s business identity to publish and retire Cognitive configs', async role => {
    fixture.principal = principal({ role, businessRole: role, platformRole: 'SYSTEM_ADMIN' })
    for (const action of ['publish', 'retire']) expect(await call('POST', `/api/cognitive/configs/synthetic-config/${action}`)).toBe(200)
    expect(fixture.publishConfig).toHaveBeenCalledOnce()
    expect(fixture.retireConfig).toHaveBeenCalledOnce()
  })
  it.each(denied)('denies $name before Cognitive publication or retirement', async ({ value }) => {
    fixture.principal = value
    for (const action of ['publish', 'retire']) expect(await call('POST', `/api/cognitive/configs/synthetic-config/${action}`)).toBe(403)
    expect(fixture.publishConfig).not.toHaveBeenCalled()
    expect(fixture.retireConfig).not.toHaveBeenCalled()
  })
  it('preserves the ordinary teacher Bundle business route', async () => {
    fixture.principal = principal({})
    expect(await call('GET', '/api/bundle-products')).toBe(200)
    expect(fixture.listProducts).toHaveBeenCalledWith(expect.objectContaining({ role: 'TEACHER', platformRole: 'STANDARD' }))
    expect(fixture.listDrafts).not.toHaveBeenCalled()
  })
})
