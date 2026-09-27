import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  getJob: vi.fn(),
  markVideoFailed: vi.fn(),
  associateVideoRetryJob: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    video: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../config/queue', () => ({
  videoQueue: {
    getJob: mocks.getJob,
    add: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('../../services/videoProcessingState', () => ({
  VIDEO_PROCESSING_FAILURE_MESSAGE: 'failed',
  markVideoFailed: mocks.markVideoFailed,
  associateVideoRetryJob: mocks.associateVideoRetryJob,
}))

vi.mock('../../services/assetStorage', () => ({
  getLocalAssetPath: (value: string) => value,
}))

import { reconcileStaleProcessingVideos } from '../../services/videoProcessingRecovery'

describe('video processing recovery generation fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getJob.mockResolvedValue(null)
    mocks.markVideoFailed.mockResolvedValue(true)
    mocks.findUnique
      .mockResolvedValueOnce({ status: 'PROCESSING' })
      .mockResolvedValueOnce({ status: 'FAILED' })
  })

  it('passes the persisted generation into stale PROCESSING failure recovery', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{
        id: 'video-1',
        processingJobId: 'job-1',
        processingGeneration: 7,
      }])
      .mockResolvedValueOnce([])

    await expect(reconcileStaleProcessingVideos()).resolves.toBe(1)
    expect(mocks.markVideoFailed).toHaveBeenCalledWith('video-1', 'job-1', 7)
  })
})
