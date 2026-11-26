import { createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../../middleware/errorHandler'

const handlers = vi.hoisted(() => ({ serve: vi.fn(), issue: vi.fn(), media: vi.fn(), fixture: vi.fn() }))
vi.mock('../../middleware/auth', () => ({ authenticate: (_req: unknown, _res: unknown, next: () => void) => next() }))
vi.mock('../../services/assetStorage', () => ({
  issuePrivateAssetUrl: handlers.issue, issuePublicAssetUrl: handlers.issue, serveAsset: handlers.serve,
}))
vi.mock('../../modules/assessment-media/assessment-video-delivery', () => ({
  AssessmentMediaCapabilityError: class extends Error {}, AssessmentMediaDeliveryError: class extends Error {},
  serveAssessmentMediaCapabilityContent: handlers.media,
}))
vi.mock('../../modules/assessment-media/assessment-video-e2e-fixture', () => ({
  assessmentVideoE2EAuthenticatedCapabilities: handlers.fixture, assessmentVideoE2EPublicCapabilities: handlers.fixture,
}))

describe('asset delivery routes', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('uses the Express error boundary for rejected deliveries and excludes test-only issuance in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ASSESSMENT_VIDEO_E2E_FIXTURE', 'true')
    const routes = await import('../../routes/assets')
    const app = express()
    app.use('/assets', routes.default)
    app.use('/public', routes.publicAssetRouter)
    app.use(errorHandler)
    const server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
      const failure = new Error('synthetic private storage detail')
      for (const fn of [handlers.issue, handlers.serve, handlers.media]) fn.mockRejectedValue(failure)
      for (const path of ['/assets/id/url', '/public/id/url', '/assets/id/content', '/public/id/content',
        '/assets/assessment-media/content?cap=synthetic']) {
        const response = await fetch(base + path)
        expect(response.status).toBe(500)
        expect((await response.json()).message).toBe('服务器内部错误')
      }
      for (const target of ['auth-capabilities', 'public-capabilities']) {
        expect((await fetch(base + '/assets/assessment-media/e2e/' + target)).status).toBe(404)
      }
      expect(handlers.fixture).not.toHaveBeenCalled()
      expect((await fetch(base + '/assets/assessment-media/content')).status).toBe(401)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
