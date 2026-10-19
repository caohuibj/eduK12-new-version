import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lock: vi.fn(), retain: vi.fn() }))
vi.mock('../../services/assetStorage', () => ({ lockStoredAssetRows: mocks.lock }))
vi.mock('../../modules/assessment-media/assessment-asset', () => ({ retainAssessmentAssetReferences: mocks.retain }))
import { assertSjtAuthorMedia, retainSjtAuthorReleaseMedia, SJT_AUTHOR_MAX_IMAGE_BYTES, SJT_AUTHOR_MEDIA_SCOPE } from '../../modules/situational/authoring/media'

const image = () => ({ asset: { assetId: 'image-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
  altText: '学生讨论课堂安排', rightsStatus: 'self_authored', rightsNote: '作者原创，允许本工具呈现', caption: '讨论现场' })
const template = (picture = image()) => ({ templateVersion: 'sjt-online-v1', display: { scenes: [{ image: picture }] } })
const stored = () => ({ id: 'image-1', ownerId: 'author', accessScope: 'PRIVATE', scopeId: SJT_AUTHOR_MEDIA_SCOPE,
  provider: 'local', objectKey: 'assets/image-1.png', deletedAt: null, mimeType: 'image/png', sha256: 'a'.repeat(64), sizeBytes: 10 })
const tx = { storedAsset: { findMany: vi.fn() } }
const adaptSource = () => ({ template: template(), sourceOwnerId: 'author', grantId: 'adapt-grant', provenance: {
  protocol: 'sjt-adaptation-v1', sourceDraftId: 'source-draft', sourceAuthorId: 'author', receipt: {
    policy: 'COURSE_GRANT_V1', grantId: 'adapt-grant', grantVersion: 1, permission: 'ADAPT',
    releaseId: 'source-release', instrumentKey: 'source', instrumentVersion: '1.0.0', definitionHash: 'a'.repeat(64), contentDigest: 'b'.repeat(64),
    granteeTeacherId: 'adapter', courseId: 'course-1', purpose: 'TRAINING_COURSE',
    validFrom: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z', admittedAt: '2026-10-18T00:00:00.000Z',
  },
} })
describe('online SJT author image ownership and exact adaptation provenance', () => {
  beforeEach(() => { vi.clearAllMocks(); tx.storedAsset.findMany.mockResolvedValue([stored()]) })
  it('locks stable logical IDs before checking owner, identity and release retention in the same transaction', async () => {
    await retainSjtAuthorReleaseMedia(tx as never, 'author', 'release-1', template())
    expect(mocks.lock).toHaveBeenCalledWith(tx, ['image-1'])
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(tx.storedAsset.findMany.mock.invocationCallOrder[0])
    expect(mocks.retain).toHaveBeenCalledWith({ db: tx, references: [image().asset],
      owner: { entityType: 'SjtAuthorRelease', entityId: 'release-1', field: 'media' } })
  })
  it.each([
    ['owner', { ownerId: 'someone-else' }], ['product scope', { scopeId: 'survey-project' }],
    ['public scope', { accessScope: 'PUBLIC_CHECKIN' }], ['deleted', { deletedAt: new Date() }],
    ['digest', { sha256: 'b'.repeat(64) }], ['MIME', { mimeType: 'image/jpeg' }],
    ['GIF', { mimeType: 'image/gif' }], ['zero bytes', { sizeBytes: 0 }],
    ['oversized', { sizeBytes: SJT_AUTHOR_MAX_IMAGE_BYTES + 1 }], ['provider', { provider: 'external' }],
    ['storage identity', { objectKey: '' }],
  ])('rejects invalid %s at every media-validation hook', async (_name, changes) => {
    tx.storedAsset.findMany.mockResolvedValue([{ ...stored(), ...changes }])
    await expect(assertSjtAuthorMedia(tx as never, 'author', template())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.retain).not.toHaveBeenCalled()
  })
  it('requires actual catalog rows, alt text and private rights evidence even for drafts', async () => {
    tx.storedAsset.findMany.mockResolvedValue([])
    await expect(assertSjtAuthorMedia(tx as never, 'author', template())).rejects.toThrow()
    tx.storedAsset.findMany.mockResolvedValue([stored()])
    for (const invalid of [{ altText: '' }, { rightsStatus: 'unknown' }, { rightsNote: '' }])
      await expect(assertSjtAuthorMedia(tx as never, 'author', template({ ...image(), ...invalid }))).rejects.toThrow()
  })
  it('accepts only exact source images under explicit ADAPT provenance, never ID/hash knowledge alone', async () => {
    const authorized = template({ ...image(), rightsStatus: 'authorized' })
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized)).rejects.toThrow()
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized, { adaptSource: adaptSource() })).resolves.toEqual([image().asset])
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', template(), { adaptSource: adaptSource() })).rejects.toThrow()
    const distribute = adaptSource(); distribute.provenance.receipt.permission = 'DISTRIBUTE'
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized, { adaptSource: distribute })).rejects.toThrow()
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized, { adaptSource: { ...adaptSource(), grantId: 'forged' } })).rejects.toThrow()
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized, { adaptSource: { ...adaptSource(), template: template({ ...image(), asset: { ...image().asset, contentHash: 'b'.repeat(64) } }) } })).rejects.toThrow()
    await expect(assertSjtAuthorMedia(tx as never, 'adapter', authorized, { adaptSource: { ...adaptSource(), sourceOwnerId: 'forged' } })).rejects.toThrow()
  })
  it('keeps text and historical upload documents free of media DB work', async () => {
    await expect(assertSjtAuthorMedia(tx as never, 'author', { templateVersion: 'sjt-upload-v1' })).resolves.toEqual([])
    await expect(assertSjtAuthorMedia(tx as never, 'author', { templateVersion: 'sjt-online-v1', display: { scenes: [] } })).resolves.toEqual([])
    expect(mocks.lock).not.toHaveBeenCalled(); expect(tx.storedAsset.findMany).not.toHaveBeenCalled()
  })
})
