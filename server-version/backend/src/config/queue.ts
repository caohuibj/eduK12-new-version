/**
 * Redis 队列配置
 * 用于视频处理、图片处理等异步任务
 */
import Queue from 'bull'
import { logger } from '../utils/logger'
import { getBullRedisOptions } from './redis'

// Redis 连接配置（统一由 redis.ts 解析，禁止各自解析 REDIS_HOST/PORT）
const redisConfig = getBullRedisOptions()

// 资源限制配置 - 防止 CPU/内存被占满
export const RESOURCE_LIMITS = {
  // 视频处理：CPU 密集型，限制为 1 并发
  videoConcurrency: parseInt(process.env.VIDEO_CONCURRENCY || '1'),

  // 图片处理：相对轻量，允许 2 并发（PM2 2进程 × 1 = 2）
  imageConcurrency: parseInt(process.env.IMAGE_CONCURRENCY || '2'),

  // 单张图片处理超时（秒）
  imageTimeout: parseInt(process.env.IMAGE_TIMEOUT || '30'),

  // 单个视频处理超时（秒）- 30分钟
  videoTimeout: parseInt(process.env.VIDEO_TIMEOUT || '1800'),
}

// 视频处理队列
export const videoQueue = new Queue('video processing', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
    timeout: RESOURCE_LIMITS.videoTimeout * 1000,
  },
})

// 图片处理队列
export const imageQueue = new Queue('image processing', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2, // 图片处理失败重试2次
    backoff: {
      type: 'fixed',
      delay: 2000, // 2秒后重试
    },
    removeOnComplete: 200, // 保留最近200个完成的任务
    removeOnFail: 100, // 保留最近100个失败的任务
    timeout: RESOURCE_LIMITS.imageTimeout * 1000, // 30秒超时
  },
})

// 队列事件监听 - 视频
videoQueue.on('completed', (job, result) => {
  logger.info(`✅ 视频处理完成: ${job.id}`, { videoId: result?.videoId })
})

videoQueue.on('failed', (job, err) => {
  logger.error(`❌ 视频处理失败: ${job.id}`, { error: err.message, videoId: job.data?.videoId })
})

videoQueue.on('stalled', (job) => {
  logger.warn(`⚠️ 视频处理停滞: ${job.id}`, { videoId: job.data?.videoId })
})

// 队列事件监听 - 图片
imageQueue.on('completed', (job, result) => {
  logger.info(`✅ 图片处理完成: ${job.id}`, { imageId: result?.imageId, filename: result?.filename })
})

imageQueue.on('failed', (job, err) => {
  logger.error(`❌ 图片处理失败: ${job.id}`, { error: err.message, imageId: job.data?.imageId })
})

imageQueue.on('stalled', (job) => {
  logger.warn(`⚠️ 图片处理停滞: ${job.id}`, { imageId: job.data?.imageId })
})

// 优雅关闭
export const closeQueues = async () => {
  await Promise.all([videoQueue.close(), imageQueue.close()])
  logger.info('队列已关闭')
}

// 队列健康检查
export const checkQueueHealth = async () => {
  const [videoCounts, imageCounts] = await Promise.all([
    Promise.all([
      videoQueue.getWaitingCount(),
      videoQueue.getActiveCount(),
      videoQueue.getCompletedCount(),
      videoQueue.getFailedCount(),
    ]),
    Promise.all([
      imageQueue.getWaitingCount(),
      imageQueue.getActiveCount(),
      imageQueue.getCompletedCount(),
      imageQueue.getFailedCount(),
    ]),
  ])

  return {
    video: {
      waiting: videoCounts[0],
      active: videoCounts[1],
      completed: videoCounts[2],
      failed: videoCounts[3],
      total: videoCounts[0] + videoCounts[1] + videoCounts[2] + videoCounts[3],
    },
    image: {
      waiting: imageCounts[0],
      active: imageCounts[1],
      completed: imageCounts[2],
      failed: imageCounts[3],
      total: imageCounts[0] + imageCounts[1] + imageCounts[2] + imageCounts[3],
    },
  }
}
