import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { video: { updateMany: vi.fn() } },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { markVideoFailed, markVideoProcessing } from '../../services/videoProcessingState'

describe('video processing state ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('claims only pending or same-job processing rows', async () => {
    mockPrisma.video.updateMany.mockResolvedValue({ count: 1 })

    await expect(markVideoProcessing('video-1', 'job-1')).resolves.toBe(true)

    expect(mockPrisma.video.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'video-1',
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [{ processingJobId: 'job-1' }, { processingJobId: null }],
      }),
      data: expect.objectContaining({
        status: 'PROCESSING',
        processingJobId: 'job-1',
      }),
    }))
  })

  it('does not report a failure transition when ownership was lost', async () => {
    mockPrisma.video.updateMany.mockResolvedValue({ count: 0 })

    await expect(markVideoFailed('video-1', 'old-job')).resolves.toBe(false)
    expect(mockPrisma.video.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'video-1',
        OR: [{ processingJobId: 'old-job' }, { processingJobId: null }],
      }),
    }))
  })
})
