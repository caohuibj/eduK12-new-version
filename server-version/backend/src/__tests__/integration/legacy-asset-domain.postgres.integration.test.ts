import { randomUUID } from 'node:crypto'
import { type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'

const { principal } = vi.hoisted(() => ({ principal: { userId: 'legacy-admin', role: 'ADMIN' } }))
vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { ...principal }; next() },
  requireTeacher: (_req: any, _res: any, next: any) => next(),
}))
vi.mock('../../config/queue', () => ({ imageQueue: { getJobs: vi.fn(async () => []) } }))
import uploads from '../../routes/uploads'
import { issuePrivateAssetUrl, validateAssetReferencesForCourse, hydrateAssetReferences, hydrateAssetReferenceBatch } from '../../services/assetStorage'
import { authController } from '../../controllers/authController'
const dbUrl = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = dbUrl ? describe : describe.skip

suite('legacy asset and account target boundaries in PostgreSQL', () => {
  const users = ['LEGACY', 'TRAINING', 'SURVEY', 'SCHOOL'].map(accountDomain => ({ id: randomUUID(), accountDomain }))
  const assets = [...users.map(owner => ({ id: randomUUID(), ownerId: owner.id })), { id: randomUUID(), ownerId: null }]
  let server: Server, endpoint: string
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(dbUrl!)
    for (const user of users) await prisma.user.create({ data: { ...user, username: `boundary-${user.id}`, passwordHash: 'synthetic-hash', role: 'TEACHER', expiresAt: new Date('2026-12-01T00:00:00Z') } })
    for (const asset of assets) await prisma.storedAsset.create({ data: { ...asset, objectKey: `assets/${asset.id}.png`, mimeType: 'image/png', sizeBytes: 4, sha256: 'a'.repeat(64), accessScope: 'PRIVATE', originalName: `domain-boundary-${asset.id}.png` } })
    const app = express()
    app.use(express.json())
    app.use((req: any, _res, next) => { req.user = { ...principal }; next() })
    app.use('/uploads', uploads)
    app.get('/assets/:id/url', issuePrivateAssetUrl)
    app.post('/extend', authController.extendAccount)
    server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    await prisma.assetReference.deleteMany({ where: { assetId: { in: assets.map(a => a.id) } } })
    await prisma.storedAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } })
    await prisma.$disconnect()
  })
  it('filters product domains before library pagination and count, preserving both legacy products', async () => {
    principal.userId = 'legacy-admin'; principal.role = 'ADMIN'
    const first = await (await fetch(`${endpoint}/uploads/images?keyword=domain-boundary-&pageSize=1`)).json() as any
    const second = await (await fetch(`${endpoint}/uploads/images?keyword=domain-boundary-&pageSize=1&page=2`)).json() as any
    expect(first.code).toBe(0)
    expect(first.data.total).toBe(2)
    expect(second.data.total).toBe(2)
    expect(new Set([first.data.list[0].id, second.data.list[0].id])).toEqual(new Set(assets.slice(0, 2).map(a => a.id)))
    principal.userId = users[1].id; principal.role = 'TEACHER'
    const own = await (await fetch(`${endpoint}/uploads/images?keyword=domain-boundary-`)).json() as any
    expect(own.data.list.map((a: any) => a.id)).toEqual([assets[1].id])
  })
  it('rejects foreign and unknown private URL issuance, rename, deletion and course reuse without mutation', async () => {
    principal.userId = 'legacy-admin'; principal.role = 'ADMIN'
    for (const asset of assets.slice(2)) {
      expect((await fetch(`${endpoint}/assets/${asset.id}/url`)).status).toBe(403)
      expect((await fetch(`${endpoint}/uploads/images/${asset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: 'changed' }) })).status).toBe(403)
      expect((await fetch(`${endpoint}/uploads/images/${asset.id}`, { method: 'DELETE' })).status).toBe(403)
      await expect(validateAssetReferencesForCourse({ values: { images: [{ assetId: asset.id }] }, courseId: 'legacy-course', ownerId: principal.userId, role: 'ADMIN' as any })).rejects.toThrow('附件凭据')
      const unchanged = await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })
      expect(unchanged.originalName).toBe(`domain-boundary-${asset.id}.png`)
      expect(unchanged.deletedAt).toBeNull()
    }
  })
  it('does not revive foreign capabilities through references attached before the fix', async () => {
    const foreign = assets[2]
    await prisma.assetReference.create({ data: { assetId: foreign.id, entityType: 'Checkin', entityId: 'historical-reference', field: 'images' } })
    const item = { value: { images: [{ assetId: foreign.id }] }, context: { entityType: 'Checkin', entityId: 'historical-reference', parentAccess: true } }
    const single = await hydrateAssetReferences(item.value, false, item.context) as any
    const batch = await hydrateAssetReferenceBatch([item]) as any[]
    expect(single.images[0].url).toBeNull()
    expect(batch[0].images[0].url).toBeNull()
  })
  it('preserves authorized legacy ADMIN signing, renaming and exact-parent reference protection', async () => {
    const asset = assets[0]
    const url = await (await fetch(`${endpoint}/assets/${asset.id}/url`)).json() as any
    expect(url.data.url).toContain(`/api/assets/${asset.id}/content?`)
    expect((await fetch(`${endpoint}/uploads/images/${asset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: 'renamed' }) })).status).toBe(200)
    await expect(validateAssetReferencesForCourse({ values: { images: [{ assetId: asset.id }] }, courseId: 'legacy-course', ownerId: principal.userId, role: 'ADMIN' as any })).resolves.toHaveLength(1)
    await prisma.assetReference.create({ data: { assetId: asset.id, entityType: 'Checkin', entityId: 'protected-parent', field: 'images' } })
    expect((await fetch(`${endpoint}/uploads/images/${asset.id}`, { method: 'DELETE' })).status).toBe(409)
    expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt).toBeNull()
  })
  it('extends legacy teachers but leaves SCHOOL and SURVEY expiry unchanged', async () => {
    for (const [index, user] of users.entries()) {
      const response = await fetch(`${endpoint}/extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, months: 12 }) })
      expect(response.status).toBe(index < 2 ? 200 : 400)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).expiresAt?.toISOString()).toBe(index < 2 ? '2027-12-01T00:00:00.000Z' : '2026-12-01T00:00:00.000Z')
    }
  })
})
