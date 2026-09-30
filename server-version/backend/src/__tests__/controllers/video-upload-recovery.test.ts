import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), find: vi.fn(), queue: vi.fn(), store: vi.fn(), attach: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { video: { create: mocks.create, updateMany: mocks.update, findUnique: mocks.find }, $transaction: async (fn: (tx: unknown) => unknown) => fn({ video: { create: mocks.create } }) } }))
vi.mock('../../config/queue', () => ({ videoQueue: { add: mocks.queue } }))
vi.mock('../../services/assetStorage', () => ({ storeAssetFromFile: mocks.store, attachAssetReference: mocks.attach, getLocalAssetPath: (key: string) => `/safe/${key}`, getSignedAssetUrl: async () => '/signed', discardUnreferencedAsset: vi.fn() }))
vi.mock('../../services/videoRetry', () => ({ retryVideo: vi.fn(), VideoRetryError: class extends Error {} }))
import { videoController } from '../../controllers/videoController'

describe('persisted video survives an enqueue failure', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store.mockResolvedValue({ id: 'asset', objectKey: 'original.mp4' })
    mocks.create.mockResolvedValue({ id: 'saved-video', title: 'Lesson', processingGeneration: 0 })
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.find.mockResolvedValue({ status: 'FAILED' })
    mocks.queue.mockRejectedValue(new Error('redis offline'))
  })
  it('returns the retained video ID so the browser retries transcode instead of creating a duplicate', async () => {
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response
    const req = { user: { userId: 'owner', role: 'TEACHER' }, body: { title: 'Lesson' }, file: { path: '/temp', originalname: 'lesson.mp4', size: 123, detectedMimeType: 'video/mp4' } } as unknown as Request
    await videoController.upload(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { id: 'saved-video', title: 'Lesson', status: 'FAILED' } }))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'saved-video', status: 'PENDING', processingJobId: null, processingGeneration: 0 } }))
  })
  it('does not report a failed upload when a worker already owns or completed the saved video', async () => {
    mocks.update.mockResolvedValue({ count: 0 })
    mocks.find.mockResolvedValue({ status: 'COMPLETED' })
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response
    await videoController.upload({ user: { userId: 'owner', role: 'TEACHER' }, body: { title: 'Lesson' }, file: { path: '/temp', originalname: 'lesson.mp4', size: 123, detectedMimeType: 'video/mp4' } } as unknown as Request, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { id: 'saved-video', title: 'Lesson', status: 'COMPLETED' } }))
  })
})
