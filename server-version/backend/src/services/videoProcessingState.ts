import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

export const VIDEO_PROCESSING_FAILURE_MESSAGE = '视频处理失败，请稍后重试或联系管理员'

type VideoDatabase = typeof prisma | Prisma.TransactionClient

const jobOwnershipFilter = (jobId?: string) => jobId
  ? { OR: [{ processingJobId: jobId }, { processingJobId: null }] }
  : {}

/** Claim a pending/previously-processing row for the current Bull job. */
export async function markVideoProcessing(
  videoId: string,
  jobId: string,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: { in: ['PENDING', 'PROCESSING'] },
      ...jobOwnershipFilter(jobId),
    },
    data: {
      status: 'PROCESSING',
      processingJobId: jobId,
      processingStartedAt: new Date(),
      errorMessage: null,
    },
  })
  return updated.count === 1
}

/**
 * Persist only a safe, user-facing failure message. Ownership is conditional
 * so an old/stale job cannot overwrite a newer job's result.
 */
export async function markVideoFailed(
  videoId: string,
  jobId?: string,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: { in: ['PENDING', 'PROCESSING'] },
      ...jobOwnershipFilter(jobId),
    },
    data: {
      status: 'FAILED',
      errorMessage: VIDEO_PROCESSING_FAILURE_MESSAGE,
      processingJobId: null,
      processingStartedAt: null,
    },
  })
  return updated.count === 1
}
