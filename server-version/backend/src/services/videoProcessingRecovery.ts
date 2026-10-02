import { prisma } from '../config/database'
import { assertRemoteVideoCapacity, RemoteVideoAdmissionError, REMOTE_VIDEO_MAX_BYTES, REMOTE_VIDEO_TIMEOUT_MS } from './remoteVideoAdmission'
import { videoQueue } from '../config/queue'
import { runtimeResourceConfig } from '../config/runtimeResources'
import { logger } from '../utils/logger'
import { getLocalAssetPath } from './assetStorage'
import {
  VIDEO_PROCESSING_FAILURE_MESSAGE,
  associateVideoRetryJob,
  markVideoFailed,
} from './videoProcessingState'
import { isWorkerShutdownCancellationError } from '../workers/workerSubprocessRegistry'

const STALE_PROCESSING_AFTER_MS = runtimeResourceConfig.videoTimeoutSeconds * 1000 + 60_000
const PENDING_RECONCILE_AFTER_MS = 30_000
const ACTIVE_JOB_STATES = new Set(['active', 'waiting', 'delayed', 'paused'])
const stalledTimers = new Map<string, ReturnType<typeof setTimeout>>()
let registered = false

/** Processor catch observes attemptsMade before Bull increments it. */
export const isFinalVideoAttempt = (job: any): boolean => {
  const attempts = Math.max(1, Number(job?.opts?.attempts || 1))
  const attemptsMade = Math.max(0, Number(job?.attemptsMade || 0))
  return attemptsMade + 1 >= attempts
}

/** failed event observes attemptsMade after Bull increments it. */
const isFinalFailedEvent = (job: any): boolean => {
  const attempts = Math.max(1, Number(job?.opts?.attempts || 1))
  const attemptsMade = Math.max(0, Number(job?.attemptsMade || 0))
  return attemptsMade >= attempts
}

const reconcileJob = async (jobId: string, videoId: string, generation: number): Promise<void> => {
  const currentJob = await videoQueue.getJob(jobId)
  if (currentJob) {
    const state = await currentJob.getState()
    if (ACTIVE_JOB_STATES.has(state)) return
  }
  const recovered = await markVideoFailed(videoId, jobId, generation)
  if (recovered) logger.warn('视频处理任务已回收为失败状态', { videoId, jobId })
}

export const recoveryPayload = (row: { id: string; originalUrl: string | null; filePath: string; teacherId: string }) => {
  if (row.originalUrl && /^https?:\/\//i.test(row.originalUrl)) {
    return {
      videoId: row.id,
      videoUrl: row.originalUrl,
      teacherId: row.teacherId,
      watermarkText: '慧育空间教学专属视频',
      downloadOptions: { maxFileSize: REMOTE_VIDEO_MAX_BYTES, timeout: REMOTE_VIDEO_TIMEOUT_MS },
    }
  }
  return {
    videoId: row.id,
    originalUrl: `file://${getLocalAssetPath(row.filePath)}`,
    teacherId: row.teacherId,
  }
}

const ensurePendingVideoJob = async (row: {
  id: string
  originalUrl: string | null
  filePath: string
  teacherId: string
  processingJobId: string | null
}): Promise<boolean> => {
  if (row.processingJobId) {
    const current = await videoQueue.getJob(row.processingJobId)
    if (current && ACTIVE_JOB_STATES.has(await current.getState())) return false
    await prisma.video.updateMany({
      where: { id: row.id, status: 'PENDING', processingJobId: row.processingJobId },
      data: { processingJobId: null },
    })
  }

  const jobId = `video-recovery-${row.id}`
  let job = await videoQueue.getJob(jobId)
  if (job) {
    const state = await job.getState()
    if (!ACTIVE_JOB_STATES.has(state)) {
      try { await job.remove() } catch { /* a concurrent worker may have claimed it */ }
      job = await videoQueue.getJob(jobId)
    }
  }
  if (!job) {
    if (row.originalUrl && /^https?:\/\//i.test(row.originalUrl)) {
      try { await prisma.$transaction(tx => assertRemoteVideoCapacity(tx, row.teacherId, row.id)) }
      catch (error) { if (error instanceof RemoteVideoAdmissionError) return false; throw error }
    }
    job = await videoQueue.add('transcode', recoveryPayload(row), {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    })
  }
  await associateVideoRetryJob(row.id, String(job.id))
  return true
}

export function registerVideoProcessingRecovery(): void {
  if (registered) return
  registered = true

  videoQueue.on('failed', (job: any, failure: unknown) => {
    if (!job?.data?.videoId || isWorkerShutdownCancellationError(failure) || !isFinalFailedEvent(job)) return
    // The processor persists final FAILED with its exact generation. Do not
    // perform a generation-less fallback here: a stalled old attempt may emit
    // after a newer retry has already claimed the same Bull job id. A DB write
    // failure is recovered by the stale PROCESSING sweep below.
    logger.warn('视频最终 Bull attempt 失败；状态由 generation-fenced processor/stale sweep 收口', {
      videoId: job.data.videoId,
      jobId: job.id,
    })
  })

  videoQueue.on('stalled', (job: any) => {
    if (!job?.data?.videoId) return
    const jobId = String(job.id)
    if (stalledTimers.has(jobId)) return
    const timer = setTimeout(() => {
      stalledTimers.delete(jobId)
      void prisma.video.findUnique({
        where: { id: String(job.data.videoId) },
        select: { processingJobId: true, processingGeneration: true },
      }).then((row) => {
        if (!row || row.processingJobId !== jobId) return
        return reconcileJob(jobId, String(job.data.videoId), row.processingGeneration)
      }).catch(() => {
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
 * Recover PROCESSING rows stranded by a crash and PENDING rows whose enqueue
 * or shutdown-requeue window was interrupted. Work is bounded to 100 rows per
 * sweep; live Bull jobs are never duplicated.
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
    select: { id: true, processingJobId: true, processingGeneration: true },
    take: 100,
  })

  let recovered = 0
  for (const row of rows) {
    if (row.processingJobId) {
      const before = await prisma.video.findUnique({ where: { id: row.id }, select: { status: true } })
      await reconcileJob(row.processingJobId, row.id, row.processingGeneration)
      const after = await prisma.video.findUnique({ where: { id: row.id }, select: { status: true } })
      if (before?.status === 'PROCESSING' && after?.status === 'FAILED') recovered += 1
    } else if (await markVideoFailed(row.id, undefined, row.processingGeneration)) {
      recovered += 1
    }
  }

  const pendingCutoff = new Date(Date.now() - PENDING_RECONCILE_AFTER_MS)
  const pending = await prisma.video.findMany({
    where: { status: 'PENDING', updatedAt: { lt: pendingCutoff } },
    select: { id: true, originalUrl: true, filePath: true, teacherId: true, processingJobId: true },
    orderBy: { updatedAt: 'asc' },
    take: 100,
  })
  for (const row of pending) {
    try {
      if (await ensurePendingVideoJob(row)) recovered += 1
    } catch {
      logger.error('PENDING 视频 recovery enqueue 失败', { videoId: row.id })
    }
  }
  return recovered
}

export const stopVideoProcessingRecovery = (): void => {
  for (const timer of stalledTimers.values()) clearTimeout(timer)
  stalledTimers.clear()
}

export { VIDEO_PROCESSING_FAILURE_MESSAGE }
