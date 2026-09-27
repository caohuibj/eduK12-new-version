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


/** Release ownership after infrastructure cancellation without declaring the
 * media invalid. A Bull retry or recovery job may claim the row again. */
export async function releaseVideoProcessingForRetry(
  videoId: string,
  jobId: string,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: 'PROCESSING',
      processingJobId: jobId,
    },
    data: {
      status: 'PENDING',
      processingJobId: null,
      processingStartedAt: null,
      errorMessage: null,
    },
  })
  return updated.count === 1
}

/** Associate a queued recovery job when the row is still unowned. */
export async function associateVideoRetryJob(
  videoId: string,
  jobId: string,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: { id: videoId, status: 'PENDING', processingJobId: null },
    data: { processingJobId: jobId },
  })
  if (updated.count === 1) return true
  const current = await db.video.findUnique({
    where: { id: videoId },
    select: { processingJobId: true, status: true },
  })
  return current?.processingJobId === jobId || current?.status === 'COMPLETED'
}
