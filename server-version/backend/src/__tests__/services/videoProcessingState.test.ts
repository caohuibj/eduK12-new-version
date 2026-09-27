import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockVideo } = vi.hoisted(() => {
  const video = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  }
  const prisma = {
    video,
    $transaction: vi.fn(async (callback: (tx: { video: typeof video }) => unknown) => callback({ video })),
  }
  return { mockPrisma: prisma, mockVideo: video }
})

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  markVideoFailed,
  markVideoProcessing,
  releaseVideoProcessingForRetry,
} from '../../services/videoProcessingState'

describe('video processing state ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('claims pending/same-job rows and advances an attempt generation atomically', async () => {
    mockVideo.updateMany.mockResolvedValue({ count: 1 })
    mockVideo.findUnique.mockResolvedValue({ processingGeneration: 4 })

    await expect(markVideoProcessing('video-1', 'job-1')).resolves.toBe(4)

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
    expect(mockVideo.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'video-1',
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [{ processingJobId: 'job-1' }, { processingJobId: null }],
      }),
      data: expect.objectContaining({
        status: 'PROCESSING',
        processingJobId: 'job-1',
        processingGeneration: { increment: 1 },
      }),
    }))
  })

  it('does not report a failure transition when exact generation ownership was lost', async () => {
    mockVideo.updateMany.mockResolvedValue({ count: 0 })

    await expect(markVideoFailed('video-1', 'old-job', 2)).resolves.toBe(false)
    expect(mockVideo.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'video-1',
        processingJobId: 'old-job',
        processingGeneration: 2,
      }),
    }))
  })

  it('releases only the exact shutdown-cancelled generation for retry', async () => {
    mockVideo.updateMany.mockResolvedValue({ count: 1 })
    await expect(releaseVideoProcessingForRetry('video-1', 'job-1', 7)).resolves.toBe(true)
    expect(mockVideo.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'video-1',
        status: 'PROCESSING',
        processingJobId: 'job-1',
        processingGeneration: 7,
      }),
      data: expect.objectContaining({
        status: 'PENDING',
        processingJobId: null,
      }),
    }))
  })
})
