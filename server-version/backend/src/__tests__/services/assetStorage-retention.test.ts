import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const tx = { $queryRaw: vi.fn(), storedAsset: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    assetReference: { upsert: vi.fn(), createMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() } }
  return { tx, db: { ...tx, $transaction: vi.fn() } }
})
vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../config', () => ({ config: { uploadDir: '/tmp/c13-asset-retention-unit', assetSigningSecret: 'synthetic-test-only' } }))
vi.mock('../../utils/cos', () => ({ cos: {}, getCOSSignedUrl: vi.fn(), isCOSEnabled: () => false, uploadBufferToCOS: vi.fn(), uploadAssetFileToCOS: vi.fn(), deleteFromCOS: vi.fn() }))
import { attachAssetReference, attachAssetReferences, lockStoredAssetRows, softDeleteStoredAsset, syncAssetReferences } from '../../services/assetStorage'
const reference = { assetId: 'b', entityType: 'Course', entityId: 'course-1', field: 'media' }
const asset = { id: 'b', ownerId: 'author', scopeId: 'sjt-authoring', deletedAt: null }
describe('all shared asset writers participate in the logical lock protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.$transaction.mockImplementation(async run => run(mocks.tx))
    mocks.tx.storedAsset.findUnique.mockResolvedValue(asset)
    mocks.tx.storedAsset.findMany.mockResolvedValue([asset, { ...asset, id: 'a' }])
    mocks.tx.assetReference.count.mockResolvedValue(0)
    mocks.tx.assetReference.upsert.mockResolvedValue(reference)
  })
  it('locks only sorted, unique stable IDs and does not take content or physical locks', async () => {
    await lockStoredAssetRows(mocks.tx as never, ['b', 'a', 'b'])
    const query = mocks.tx.$queryRaw.mock.calls[0][0]
    expect(query.values).toEqual(['a', 'b'])
    expect(query.sql).toContain('ORDER BY id FOR SHARE')
    expect(query.sql).not.toContain('pg_advisory')
  })
  it('atomic standalone attach reuses a parent transaction when supplied and rechecks deletion after locking', async () => {
    await attachAssetReference(reference)
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.storedAsset.findUnique.mock.invocationCallOrder[0])
    await attachAssetReference(reference, mocks.tx as never)
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    for (const unavailable of [null, { ...asset, deletedAt: new Date() }]) {
      mocks.tx.storedAsset.findUnique.mockResolvedValueOnce(unavailable)
      await expect(attachAssetReference(reference, mocks.tx as never)).rejects.toThrow('附件不存在或已删除')
    }
    expect(mocks.tx.assetReference.upsert).toHaveBeenCalledTimes(2)
  })
  it('does not silently skip unavailable locking capabilities', async () => {
    await expect(attachAssetReference(reference, { storedAsset: mocks.tx.storedAsset, assetReference: mocks.tx.assetReference } as never)).rejects.toThrow()
    expect(mocks.tx.assetReference.upsert).not.toHaveBeenCalled()
  })
  it('checks current ownership and references under the same lock before soft deletion', async () => {
    const authorize = vi.fn(async () => true)
    expect(await softDeleteStoredAsset({ assetId: 'b', authorize, db: mocks.tx as never })).toBe('deleted')
    expect(authorize).toHaveBeenCalledWith(asset, mocks.tx)
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(authorize.mock.invocationCallOrder[0])
    mocks.tx.assetReference.count.mockResolvedValueOnce(1)
    expect(await softDeleteStoredAsset({ assetId: 'b', authorize, db: mocks.tx as never })).toBe('referenced')
    expect(await softDeleteStoredAsset({ assetId: 'b', authorize: async () => false, db: mocks.tx as never })).toBe('forbidden')
    expect(mocks.tx.storedAsset.update).toHaveBeenCalledTimes(1)
  })
  it('prelocks a complete sync set in stable order before replacing references', async () => {
    await syncAssetReferences({ entityType: 'Course', entityId: 'course-1', values: { content: [{ assetId: 'b' }, { assetId: 'a' }] } })
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.calls[0][0].values).toEqual(['a', 'b'])
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.assetReference.deleteMany.mock.invocationCallOrder[0])
    expect(mocks.tx.assetReference.createMany).toHaveBeenCalledTimes(1)
  })
  it('batch retention reads once and inserts deduplicated identities in stable unique-key order', async () => {
    const validate = vi.fn()
    await attachAssetReferences([reference, { ...reference, assetId: 'a' }, reference], mocks.tx as never, validate)
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.storedAsset.findMany).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledTimes(1)
    expect(mocks.tx.storedAsset.findUnique).not.toHaveBeenCalled()
    expect(mocks.tx.assetReference.upsert).not.toHaveBeenCalled()
    expect(mocks.tx.assetReference.createMany).toHaveBeenCalledWith({
      data: [{ ...reference, assetId: 'a' }, reference], skipDuplicates: true,
    })
    mocks.tx.storedAsset.findMany.mockResolvedValueOnce([{ ...asset, deletedAt: new Date() }])
    await expect(attachAssetReferences([reference], mocks.tx as never, () => undefined)).rejects.toThrow('附件不存在或已删除')
    expect(mocks.tx.assetReference.createMany).toHaveBeenCalledTimes(1)
  })
  it('only deletion requests UPDATE locks, while ordinary attaches never upgrade shared locks', async () => {
    await softDeleteStoredAsset({ assetId: 'b', authorize: async () => true, db: mocks.tx as never })
    expect(mocks.tx.$queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE')
    await attachAssetReference(reference, mocks.tx as never)
    expect(mocks.tx.$queryRaw.mock.calls[1][0].sql).toContain('FOR SHARE')
  })

})
