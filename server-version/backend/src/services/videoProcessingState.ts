import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

export const VIDEO_PROCESSING_FAILURE_MESSAGE = '视频处理失败，请稍后重试或联系管理员'

type VideoDatabase = typeof prisma | Prisma.TransactionClient

const isClient = (db: VideoDatabase): db is typeof prisma =>
  typeof (db as typeof prisma).$transaction === 'function'

const claimWithDb = async (
  db: Prisma.TransactionClient,
  videoId: string,
  jobId: string,
): Promise<number | null> => {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: { in: ['PENDING', 'PROCESSING'] },
      OR: [{ processingJobId: jobId }, { processingJobId: null }],
    },
    data: {
      status: 'PROCESSING',
      processingJobId: jobId,
      processingGeneration: { increment: 1 },
      processingStartedAt: new Date(),
      errorMessage: null,
    },
  })
  if (updated.count !== 1) return null
  const row = await db.video.findUnique({
    where: { id: videoId },
    select: { processingGeneration: true },
  })
  return row?.processingGeneration ?? null
}

/**
 * Claim a pending/same-job row and advance the processing generation inside a
 * row-locked transaction. Bull retries can reuse job.id; generation separates
 * attempts so an old/stalled attempt cannot publish over the new one.
 */
export async function markVideoProcessing(
  videoId: string,
  jobId: string,
  db: VideoDatabase = prisma,
): Promise<number | null> {
  if (isClient(db)) {
    return db.$transaction((tx) => claimWithDb(tx, videoId, jobId))
  }
  return claimWithDb(db, videoId, jobId)
}

const exactOwnership = (jobId?: string, generation?: number) => ({
  ...(jobId ? { processingJobId: jobId } : {}),
  ...(generation !== undefined ? { processingGeneration: generation } : {}),
})

/** Persist only a safe user-facing failure message. Exact generation ownership
 * prevents a stale attempt from overwriting a newer retry. */
export async function markVideoFailed(
  videoId: string,
  jobId?: string,
  generation?: number,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: { in: ['PENDING', 'PROCESSING'] },
      ...exactOwnership(jobId, generation),
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

/** Release exact ownership after infrastructure cancellation without declaring
 * media invalid. A Bull retry or recovery job may claim the row again. */
export async function releaseVideoProcessingForRetry(
  videoId: string,
  jobId: string,
  generation: number,
  db: VideoDatabase = prisma,
): Promise<boolean> {
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: 'PROCESSING',
      processingJobId: jobId,
      processingGeneration: generation,
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
