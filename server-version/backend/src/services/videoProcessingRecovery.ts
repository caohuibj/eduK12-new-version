import { prisma } from '../config/database'
import { videoQueue } from '../config/queue'
import { logger } from '../utils/logger'
import { VIDEO_PROCESSING_FAILURE_MESSAGE, markVideoFailed } from './videoProcessingState'

const configuredTimeoutSeconds = Number(process.env.VIDEO_TIMEOUT || 1800)
const STALE_PROCESSING_AFTER_MS =
  (Number.isFinite(configuredTimeoutSeconds) && configuredTimeoutSeconds > 0
    ? configuredTimeoutSeconds
    : 1800) * 1000 + 60_000

const ACTIVE_JOB_STATES = new Set(['active', 'waiting', 'delayed', 'paused'])
const stalledTimers = new Map<string, ReturnType<typeof setTimeout>>()
let registered = false

export const isFinalVideoAttempt = (job: any): boolean => {
  const attempts = Math.max(1, Number(job?.opts?.attempts || 1))
  const attemptsMade = Math.max(0, Number(job?.attemptsMade || 0))
  // Bull emits the failed event after incrementing attemptsMade, while the
  // processor catch path observes the count before that increment.
  return attemptsMade + 1 >= attempts
}

const reconcileJob = async (jobId: string, videoId: string): Promise<void> => {
  const currentJob = await videoQueue.getJob(jobId)
  if (currentJob) {
    const state = await currentJob.getState()
    if (ACTIVE_JOB_STATES.has(state)) return
  }

  const recovered = await markVideoFailed(videoId, jobId)
  if (recovered) {
    logger.warn('视频处理任务已回收为失败状态', { videoId, jobId })
  }
}

export function registerVideoProcessingRecovery(): void {
  if (registered) return
  registered = true

  videoQueue.on('failed', (job: any) => {
    if (!job?.data?.videoId || !isFinalVideoAttempt(job)) return
    void markVideoFailed(String(job.data.videoId), String(job.id)).catch(() => {
      // A later stale sweep will retry the same conditional transition.
      logger.error('视频最终失败状态写入失败', { videoId: job.data.videoId, jobId: job.id })
    })
  })

  videoQueue.on('stalled', (job: any) => {
    if (!job?.data?.videoId) return
    const jobId = String(job.id)
    if (stalledTimers.has(jobId)) return

    const timer = setTimeout(() => {
      stalledTimers.delete(jobId)
      void reconcileJob(jobId, String(job.data.videoId)).catch(() => {
        logger.error('视频停滞任务回收检查失败', { videoId: job.data.videoId, jobId })
      })
    }, 60_000)
    timer.unref?.()
    stalledTimers.set(jobId, timer)
  })

  const clearTimer = (job: any) => {
    const jobId = String(job?.id || '')
    const timer = stalledTimers.get(jobId)
    if (timer) clearTimeout(timer)
    stalledTimers.delete(jobId)
  }
  videoQueue.on('completed', clearTimer)
  videoQueue.on('failed', clearTimer)
}

/**
 * Recover rows stranded by a process crash. Jobs still present in an active,
 * waiting, or delayed state are left alone; missing/terminal jobs are marked
 * failed so the API cannot report PROCESSING forever.
 */
export async function reconcileStaleProcessingVideos(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_AFTER_MS)
  const rows = await prisma.video.findMany({
    where: {
      status: 'PROCESSING',
      OR: [
        { processingStartedAt: { lt: cutoff } },
        { processingStartedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, processingJobId: true },
    take: 100,
  })

  let recovered = 0
  for (const row of rows) {
    if (row.processingJobId) {
      const before = await prisma.video.findUnique({
        where: { id: row.id },
        select: { status: true },
      })
      await reconcileJob(row.processingJobId, row.id)
      const after = await prisma.video.findUnique({
        where: { id: row.id },
        select: { status: true },
      })
      if (before?.status === 'PROCESSING' && after?.status === 'FAILED') recovered += 1
    } else if (await markVideoFailed(row.id)) {
      recovered += 1
    }
  }
  return recovered
}

export { VIDEO_PROCESSING_FAILURE_MESSAGE }
