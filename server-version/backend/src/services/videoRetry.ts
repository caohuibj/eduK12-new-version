import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { prisma } from '../config/database'
import { videoQueue } from '../config/queue'
import { getLocalAssetPath } from './assetStorage'
import { recoveryPayload } from './videoProcessingRecovery'
import { VIDEO_PROCESSING_FAILURE_MESSAGE } from './videoProcessingState'

export class VideoRetryError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Retry an existing failed video; never create a second video or trust browser source URLs. */
export async function retryVideo(id: string, actor: { userId: string; role: string }) {
  const row = await prisma.video.findUnique({ where: { id }, include: { originalAsset: true } })
  if (!row || row.isDeleted) throw new VideoRetryError('视频不存在或已删除', 404)
  if (row.teacherId !== actor.userId && actor.role !== 'ADMIN') throw new VideoRetryError('无权限重试此视频', 403)
  if (row.status !== 'FAILED') throw new VideoRetryError('视频当前不是失败状态，请刷新处理状态', 409)
  if (row.originalAsset?.deletedAt || (row.originalAsset && row.originalAsset.provider !== 'local')) {
    throw new VideoRetryError('原始文件不可用于重试，请重新上传视频', 409)
  }
  const source = row.originalAsset
    ? { ...row, filePath: row.originalAsset.objectKey, originalUrl: null }
    : row
  if (!source.originalUrl || !/^https?:\/\//i.test(source.originalUrl)) {
    try { await access(getLocalAssetPath(source.filePath)) }
    catch { throw new VideoRetryError('原始文件已不可用，请重新上传视频', 409) }
  }
  const jobId = `video-manual-retry-${randomUUID()}`
  // Reserve the job identity before enqueueing: an old worker generation can
  // neither claim nor publish over this retry, and concurrent requests lose CAS.
  const claimed = await prisma.video.updateMany({
    where: { id, isDeleted: false, status: 'FAILED', processingGeneration: row.processingGeneration, teacherId: row.teacherId },
    data: { status: 'PENDING', processingJobId: jobId, processingStartedAt: null, errorMessage: null },
  })
  if (claimed.count !== 1) throw new VideoRetryError('视频状态已改变，请刷新后重试', 409)
  try {
    await videoQueue.add('transcode', recoveryPayload(source), { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 } })
  } catch (error) {
    // A lost queue acknowledgement may still have created the job. Retain
    // PENDING on an unknown outcome; the existing bounded recovery sweep owns it.
    const existing = await videoQueue.getJob(jobId).catch(() => undefined)
    if (existing === null) await prisma.video.updateMany({
      where: { id, status: 'PENDING', processingJobId: jobId, processingGeneration: row.processingGeneration },
      data: { status: 'FAILED', processingJobId: null, errorMessage: VIDEO_PROCESSING_FAILURE_MESSAGE },
    })
    if (!existing) throw error
  }
  return { id, status: 'PENDING' }
}
