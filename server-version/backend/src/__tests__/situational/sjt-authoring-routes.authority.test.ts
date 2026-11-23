import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type RequestHandler } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'

const mocks = vi.hoisted(() => ({
  principal: undefined as Record<string, unknown> | undefined,
  listSjtDrafts: vi.fn(),
  createSjtOnlineDraft: vi.fn(),
  reviewSjtDraft: vi.fn(),
  listSjtControlledReleases: vi.fn(),
  listSjtReleaseGrants: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../middleware/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../middleware/auth')>(),
  authenticate: ((req, res, next) => {
    if (!mocks.principal) return res.status(401).json({ code: -1 })
    req.user = { ...mocks.principal } as typeof req.user
    next()
  }) satisfies RequestHandler,
}))
vi.mock('../../modules/situational/authoring/service', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/situational/authoring/service')>(),
  listSjtDrafts: mocks.listSjtDrafts,
  createSjtOnlineDraft: mocks.createSjtOnlineDraft,
  reviewSjtDraft: mocks.reviewSjtDraft,
}))
vi.mock('../../modules/situational/authoring/grants', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/situational/authoring/grants')>(),
  listSjtControlledReleases: mocks.listSjtControlledReleases,
  listSjtReleaseGrants: mocks.listSjtReleaseGrants,
}))
vi.mock('../../routes/sjtAuthoringMedia', async () => ({
  default: (await import('express')).Router(),
}))

import sjtAuthoringRouter from '../../routes/sjtAuthoring'

const digest = 'a'.repeat(64)
const draftId = '00000000-0000-4000-8000-000000000001'
const user = (overrides: Record<string, unknown> = {}) => ({
  userId: 'actor-1',
  username: 'actor-1',
  accountDomain: 'TRAINING',
  role: UserRole.TEACHER,
  businessRole: UserRole.TEACHER,
  platformRole: 'STANDARD',
  teacherApproved: true,
  mustChangePassword: false,
  tokenVersion: 1,
  ...overrides,
})

describe('SJT authoring HTTP authority boundary (Admin-only + single-admin publish)', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/situational/authoring', sjtAuthoringRouter)
    server = createServer(app)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.principal = undefined
    mocks.listSjtDrafts.mockResolvedValue([])
    mocks.createSjtOnlineDraft.mockResolvedValue({ id: draftId, status: 'DRAFT' })
    mocks.reviewSjtDraft.mockResolvedValue({ id: draftId, status: 'PUBLISHED' })
    mocks.listSjtControlledReleases.mockResolvedValue({ items: [], nextCursor: null })
    mocks.listSjtReleaseGrants.mockResolvedValue({ items: [], nextCursor: null })
  })

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}/api/situational/authoring${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, body: await res.json() as any }
  }

  it('rejects unauthenticated callers on authoring and release discovery routes', async () => {
    expect((await call('GET', '/drafts')).status).toBe(401)
    expect((await call('GET', '/releases')).status).toBe(401)
  })

  it('blocks ordinary teachers from all SJT authoring routes while allowing read-only release grant listing', async () => {
    mocks.principal = user({ role: UserRole.TEACHER, platformRole: 'STANDARD' })
    for (const [method, path, body] of [
      ['GET', '/drafts', undefined],
      ['POST', '/online/drafts', { template: {} }],
      ['POST', `/drafts/${draftId}/publish`, { revision: 1, contentDigest: digest }],
      ['POST', `/drafts/${draftId}/review`, { revision: 1, contentDigest: digest, approve: true, note: 'ok' }],
      ['POST', `/drafts/${draftId}/retire`, { note: 'retire' }],
      ['POST', `/releases/${draftId}/adapt`, {}],
    ] as const) {
      const res = await call(method, path, body)
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.code).toBe('SJT_ADMIN_REQUIRED')
    }
    expect(mocks.listSjtDrafts).not.toHaveBeenCalled()
    expect(mocks.reviewSjtDraft).not.toHaveBeenCalled()

    expect((await call('GET', '/releases')).status).toBe(200)
    expect(mocks.listSjtControlledReleases).toHaveBeenCalledWith({ userId: 'actor-1', admin: false }, { pageSize: 50 })
    expect((await call('GET', `/releases/${draftId}/grants`)).status).toBe(200)
    expect(mocks.listSjtReleaseGrants).toHaveBeenCalledWith({ userId: 'actor-1', admin: false }, draftId, { pageSize: 50 })
  })

  it.each([
    { name: 'ADMIN role', overrides: { role: UserRole.ADMIN, businessRole: UserRole.ADMIN } },
    { name: 'SYSTEM_ADMIN with TEACHER businessRole', overrides: { role: UserRole.TEACHER, businessRole: UserRole.TEACHER, platformRole: 'SYSTEM_ADMIN' } },
  ])('allows $name to author and directly publish SJT packages', async ({ overrides }) => {
    mocks.principal = user(overrides)
    expect((await call('GET', '/drafts')).status).toBe(200)
    expect(mocks.listSjtDrafts).toHaveBeenCalledWith({ userId: 'actor-1', admin: true })

    const pub = await call('POST', `/drafts/${draftId}/publish`, { revision: 1, contentDigest: digest })
    expect(pub.status).toBe(200)
    expect(mocks.reviewSjtDraft).toHaveBeenCalledWith(
      { userId: 'actor-1', admin: true },
      draftId,
      1,
      digest,
      true,
      '管理员确认发布',
    )
  })
})
