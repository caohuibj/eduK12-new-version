import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { storedAsset: { findMany: mocks.findMany } } }))
vi.mock('../../middleware/uploadAdmission', () => ({
  boundedUpload: (_field: unknown, _size: unknown, _types: unknown, handler: unknown) => handler,
  uploadPrincipalRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}))
vi.mock('../../services/assetStorage', () => ({ storeAsset: vi.fn(), discardUnreferencedAsset: vi.fn(), softDeleteStoredAsset: vi.fn(), lockStoredAssetRows: vi.fn() }))
vi.mock('../../modules/assessment-media/assessment-asset', () => ({ retainAssessmentAssetReferences: vi.fn() }))
vi.mock('../../modules/assessment-media/assessment-image-delivery', () => ({
  AssessmentImageDeliveryError: class extends Error {}, serveAssessmentImageContent: vi.fn(),
}))
vi.mock('../../modules/situational/authoring/service', () => ({ getSjtDraft: vi.fn() }))
import router from '../../routes/sjtAuthoringMedia'
const handler = (router as any).stack.find((layer: any) => layer.route?.path === '/media/images' && layer.route.methods.get).route.stack[0].handle
const row = (id: string, time = '2026-10-18T01:00:00.000Z') => ({ id, createdAt: new Date(time), sha256: 'a'.repeat(64),
  mimeType: 'image/png', originalName: id + '.png', sizeBytes: 10 })
async function page(query: Record<string, unknown> = {}) {
  const res: any = { statusCode: 200, headersSent: false }
  res.status = vi.fn((status: number) => { res.statusCode = status; return res })
  res.json = vi.fn((body: unknown) => { res.body = body; return res })
  await handler({ query, user: { userId: 'current-author', role: 'TEACHER' } }, res, vi.fn())
  return res
}
describe('private SJT media cursor pagination', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([]) })
  it('defaults to a bounded first page and always filters the current owner and SJT scope inside the database', async () => {
    const result = await page()
    expect(result.body.data).toEqual({ items: [], nextCursor: null })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 31,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: expect.objectContaining({ ownerId: 'current-author', accessScope: 'PRIVATE', scopeId: 'sjt-authoring', deletedAt: null }),
    }))
  })
  it('returns only the requested page and a cursor from its last item, never from the lookahead row', async () => {
    mocks.findMany.mockResolvedValueOnce([row('c'), row('b'), row('a')])
    const first = await page({ pageSize: '2' })
    expect(first.body.data.items.map((item: any) => item.asset.assetId)).toEqual(['c', 'b'])
    const decoded = JSON.parse(Buffer.from(first.body.data.nextCursor, 'base64url').toString('utf8'))
    expect(decoded).toEqual({ createdAt: '2026-10-18T01:00:00.000Z', id: 'b' })
    expect(JSON.stringify(first.body)).not.toContain('createdAt')
    mocks.findMany.mockResolvedValueOnce([row('a')])
    const second = await page({ pageSize: '2', cursor: first.body.data.nextCursor })
    expect(second.body.data.items.map((item: any) => item.asset.assetId)).toEqual(['a'])
    expect(second.body.data.nextCursor).toBeNull()
    expect(mocks.findMany.mock.calls[1][0].where.OR).toEqual([
      { createdAt: { lt: new Date(decoded.createdAt) } }, { createdAt: new Date(decoded.createdAt), id: { lt: 'b' } },
    ])
    expect(mocks.findMany.mock.calls[1][0].where.ownerId).toBe('current-author')
  })
  it('uses a timestamp/id keyset without depending on the previous asset remaining in the catalog', async () => {
    const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-10-18T01:00:00.000Z', id: 'deleted-last-row' })).toString('base64url')
    const response = await page({ pageSize: '100', cursor })
    expect(response.statusCode).toBe(200)
    expect(mocks.findMany.mock.calls[0][0].take).toBe(101)
    expect(mocks.findMany.mock.calls[0][0]).not.toHaveProperty('skip')
    expect(mocks.findMany.mock.calls[0][0]).not.toHaveProperty('cursor')
  })
  it.each([
    { pageSize: '0' }, { pageSize: '101' }, { pageSize: '-1' }, { pageSize: '2.5' }, { pageSize: ['2'] },
    { cursor: '' }, { cursor: '%%%invalid' }, { cursor: 'bm90LWpzb24' },
    { cursor: Buffer.from(JSON.stringify({ createdAt: 'invalid', id: 'x' })).toString('base64url') },
    { ownerId: 'another-author' },
  ])('rejects malformed page parameters before querying: %j', async query => {
    const response = await page(query)
    expect(response.statusCode).toBe(400)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
