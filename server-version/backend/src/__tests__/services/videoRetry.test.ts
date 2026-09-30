import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), add: vi.fn(), getJob: vi.fn(), access: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { video: { findUnique: mocks.find, updateMany: mocks.update } } }))
vi.mock('../../config/queue', () => ({ videoQueue: { add: mocks.add, getJob: mocks.getJob } }))
vi.mock('node:fs/promises', () => ({ access: mocks.access }))
vi.mock('../../services/assetStorage', () => ({ getLocalAssetPath: (key: string) => `/safe/${key}` }))
import { retryVideo } from '../../services/videoRetry'

const actor = { userId: 'owner', role: 'TEACHER' }
const row = { id: 'video', teacherId: 'owner', status: 'FAILED', isDeleted: false, processingGeneration: 4,
  filePath: 'legacy.mp4', originalUrl: null, originalAsset: { objectKey: 'original.mp4', provider: 'local', deletedAt: null } }
describe('manual failed video recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.find.mockResolvedValue(row)
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.access.mockResolvedValue(undefined)
    mocks.add.mockResolvedValue({ id: 'job' })
    mocks.getJob.mockResolvedValue(null)
  })
  it('reuses the retained original asset and reserves a fenced job before enqueue', async () => {
    await expect(retryVideo('video', actor)).resolves.toEqual({ id: 'video', status: 'PENDING' })
    expect(mocks.access).toHaveBeenCalledWith('/safe/original.mp4')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'video', isDeleted: false, status: 'FAILED', processingGeneration: 4, teacherId: 'owner' } }))
    const reservation = mocks.update.mock.calls[0][0].data.processingJobId
    expect(mocks.add).toHaveBeenCalledWith('transcode', { videoId: 'video', originalUrl: 'file:///safe/original.mp4', teacherId: 'owner' }, expect.objectContaining({ jobId: reservation }))
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0])
  })
  it.each([
    [null, 404], [{ ...row, isDeleted: true }, 404], [{ ...row, teacherId: 'other' }, 403],
    [{ ...row, status: 'PROCESSING' }, 409], [{ ...row, originalAsset: { ...row.originalAsset, deletedAt: new Date() } }, 409],
  ])('rejects an unavailable or unauthorized video without writes', async (value, status) => {
    mocks.find.mockResolvedValue(value)
    await expect(retryVideo('video', actor)).rejects.toMatchObject({ status })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.add).not.toHaveBeenCalled()
  })
  it('permits an administrator and rejects missing local source files', async () => {
    mocks.access.mockRejectedValue(new Error('ENOENT'))
    await expect(retryVideo('video', { userId: 'admin', role: 'ADMIN' })).rejects.toMatchObject({ status: 409 })
    expect(mocks.add).not.toHaveBeenCalled()
    mocks.access.mockResolvedValue(undefined)
    await retryVideo('video', { userId: 'admin', role: 'ADMIN' })
    expect(mocks.add).toHaveBeenCalledTimes(1)
  })
  it('enqueues only the CAS winner when requests race', async () => {
    mocks.update.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const results = await Promise.allSettled([retryVideo('video', actor), retryVideo('video', actor)])
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(mocks.add).toHaveBeenCalledTimes(1)
  })
  it('rolls back a definite queue failure only while the reserved generation is unclaimed', async () => {
    mocks.add.mockRejectedValue(new Error('offline'))
    await expect(retryVideo('video', actor)).rejects.toThrow('offline')
    expect(mocks.update.mock.calls[1][0].where).toMatchObject({ status: 'PENDING', processingGeneration: 4, processingJobId: mocks.update.mock.calls[0][0].data.processingJobId })
    expect(mocks.update.mock.calls[1][0].data.status).toBe('FAILED')
  })
  it('preserves accepted and unknown queue outcomes for recovery instead of overwriting a worker', async () => {
    mocks.add.mockRejectedValue(new Error('ack lost'))
    mocks.getJob.mockResolvedValue({ id: 'accepted' })
    await expect(retryVideo('video', actor)).resolves.toMatchObject({ status: 'PENDING' })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    mocks.getJob.mockRejectedValue(new Error('redis unavailable'))
    await expect(retryVideo('video', actor)).rejects.toThrow('ack lost')
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })
})
