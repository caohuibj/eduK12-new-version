import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const { db, discard } = vi.hoisted(() => ({
  db: { assetReference: { findMany: vi.fn(), deleteMany: vi.fn() }, storedAsset: { findMany: vi.fn() } },
  discard: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/assetStorage', () => ({ discardUnreferencedAsset: discard }))
import { cleanupStalePublicUploadAssets, PUBLIC_UPLOAD_STAGING_TTL_MS } from '../../services/checkinUploadCleanup'
afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  vi.resetAllMocks()
  db.assetReference.findMany.mockResolvedValue([])
  db.assetReference.deleteMany.mockResolvedValue({ count: 1 })
  db.storedAsset.findMany.mockResolvedValue([])
  discard.mockResolvedValue(false)
})

describe('bounded sweep preserves existing retirement semantics', () => {
  it('retains the exact three staging categories and 24-hour strict cutoff', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValueOnce(now)
    await cleanupStalePublicUploadAssets(3)
    expect(PUBLIC_UPLOAD_STAGING_TTL_MS).toBe(86_400_000)
    expect(db.assetReference.findMany).toHaveBeenCalledWith({
      where: { entityType: { in: ['CheckinUploadSession', 'CheckinStudentUploadSession', 'CheckinStudentUploadPending'] },
        createdAt: { lt: new Date(now - 86_400_000) } },
      select: { id: true, asset: { select: { id: true, objectKey: true, provider: true } } },
      orderBy: { createdAt: 'asc' }, take: 3,
    })
    expect(db.storedAsset.findMany).toHaveBeenCalledWith({
      where: { accessScope: 'PUBLIC_CHECKIN', deletedAt: null, createdAt: { lt: new Date(now - 86_400_000) }, references: { none: {} } },
      select: { id: true, objectKey: true, provider: true }, orderBy: { createdAt: 'asc' }, take: 3,
    })
  })
  it('deletes only selected expired reference IDs then serially uses the existing guarded discard', async () => {
    const first = { id: 'first', objectKey: 'assets/first', provider: 'cos' }
    const second = { id: 'second', objectKey: 'assets/second', provider: 'local' }
    db.assetReference.findMany.mockResolvedValue([{ id: 'ref-1', asset: first }])
    db.storedAsset.findMany.mockResolvedValue([second])
    discard.mockImplementation(async asset => {
      expect(db.assetReference.deleteMany).toHaveBeenCalledOnce()
      if (asset === first) expect(db.storedAsset.findMany).not.toHaveBeenCalled()
      return false // retained by a concurrent reference, not a successful deletion
    })
    await cleanupStalePublicUploadAssets(1)
    expect(db.assetReference.deleteMany).toHaveBeenCalledWith({ where: {
      id: { in: ['ref-1'] }, createdAt: { lt: expect.any(Date) },
    } })
    expect(discard.mock.calls).toEqual([[first], [second]])
  })
  it('does not erase selected references when discovery fails', async () => {
    db.assetReference.findMany.mockRejectedValue(new Error('unavailable'))
    await expect(cleanupStalePublicUploadAssets(1)).rejects.toThrow('unavailable')
    expect(db.assetReference.deleteMany).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
  })
  it('rejects an unbounded direct invocation before database work', async () => {
    await expect(cleanupStalePublicUploadAssets(100)).rejects.toThrow()
    expect(db.assetReference.findMany).not.toHaveBeenCalled()
  })
})

describe('request and lifecycle wiring contract', () => {
  const source = (file: string) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8')
  it('keeps all three handlers free of periodic sweeps and keeps upload failure compensation', () => {
    const controller = source('controllers/checkinController.ts')
    expect(controller).not.toContain('runPublicUploadCleanup')
    for (const method of ['uploadStudentSubmissionImage', 'uploadPublicImage', 'submitPublicCheckin']) {
      const body = controller.slice(controller.indexOf(`async ${method}(`)).split('\n  },')[0]
      expect(body).not.toContain('cleanupStalePublicUploadAssets')
      if (method !== 'submitPublicCheckin') expect(body).toContain('discardUnreferencedAsset')
    }
  })
  it('removes only this sweep from the hourly timer and drains before Prisma disconnect', () => {
    const index = source('index.ts')
    const hourly = index.slice(index.indexOf('exportCleanupTimer = setInterval'), index.indexOf('exportCleanupTimer.unref'))
    expect(hourly).not.toContain('cleanupStalePublicUploadAssets')
    expect(hourly).toContain('cleanupExpiredExportArtifacts')
    expect(hourly).toContain('60 * 60 * 1000')
    expect(index.indexOf('await uploadCleanupDrain')).toBeLessThan(index.indexOf('prisma.$disconnect()'))
    expect(index).toContain('stopCheckinUploadCleanup = startCheckinUploadCleanupScheduler(')
  })
})
