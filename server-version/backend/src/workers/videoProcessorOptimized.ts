/**
 * 视频处理 Worker - 统一版本（优化并发）
 * 优化：统一处理队列，限制全局并发为 1，避免 CPU 占满
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'

// canvas 模块可选（本地开发可能不可用）
let createCanvas: any = null
try {
  createCanvas = require('canvas').createCanvas
} catch {
  logger.warn('[VideoProcessor] canvas 模块不可用，水印功能将被禁用')
}

import { videoQueue } from '../config/queue'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { downloadVideo, validateVideoFile, VideoValidationResult } from '../utils/videoDownloader'
import { attachAssetReference, discardUnreferencedAsset, getSignedAssetUrl, storeAssetFromFile } from '../services/assetStorage'

const VIDEO_PROCESSING_FAILURE_MESSAGE = '视频处理失败，请稍后重试或联系管理员'

// 处理策略类型
interface ProcessingStrategy {
  mode: 'watermark-only' | 'transcode'
  preset: string
  crf: number
  resolution: string
  reason: string
}

// 配置选项 - 优化压缩配置
const PROCESSING_CONFIG = {
  // 硬件负担最小模式 - 低配服务器配置
  lowPowerMode: process.env.VIDEO_LOW_POWER_MODE === 'true',

  // 分辨率设置 - 强制480p
  resolution: '480p',

  // 编码速度预设 (影响CPU使用和压缩率)
  // ultrafast = 最快, 文件大 | veryfast = 较快 | faster = 更好压缩率 | veryslow = 最慢, 文件小
  // 优化：使用 veryfast 提升处理速度 30-50%
  preset: 'veryfast',

  // CRF 质量 (18-28, 越小质量越好, 文件越大)
  // 优化：降低 CRF 值补偿质量
  crf: 26,

  // 视频码率 (480p推荐800k，适配6M带宽)
  videoBitrate: '800k',

  // 音频码率
  audioBitrate: '96k',

  // 全局并发处理数（关键优化：限制为1）
  concurrency: 1,

  // 启用压缩优化 - 如果原文件比处理后小，保留原文件
  smartCompression: true,
}

// 分辨率映射 - 适配6M带宽
const RESOLUTION_MAP: Record<string, { size: string; bitrate: string }> = {
  '360p': { size: '640x360', bitrate: '500k' },   // 极低带宽
  '480p': { size: '854x480', bitrate: '800k' },   // 低配推荐，6M带宽支持6路
  '720p': { size: '1280x720', bitrate: '1200k' }, // 标准质量，6M带宽支持4路
  '1080p': { size: '1920x1080', bitrate: '2500k' }, // 高清，需要CDN
}

/**
 * 处理策略决策器 - 强制全部转码到480P
 * 所有视频统一压缩到480P并添加水印
 */
function determineProcessingStrategy(videoInfo: VideoValidationResult): ProcessingStrategy {
  const { height, codec } = videoInfo

  // 强制转码到480P，增加压缩比
  return {
    mode: 'transcode',
    preset: PROCESSING_CONFIG.preset,
    crf: PROCESSING_CONFIG.crf,
    resolution: '480p',
    reason: `统一压缩策略: ${height}p/${codec} -> 480p/H.264`
  }
}

// 检查 FFmpeg 是否可用
let ffmpegAvailable = false
ffmpeg.getAvailableCodecs((err) => {
  ffmpegAvailable = !err
  if (ffmpegAvailable) {
    logger.info('✅ FFmpeg 已就绪')
    logger.info(`📊 视频处理配置: ${JSON.stringify(PROCESSING_CONFIG, null, 2)}`)
  } else {
    logger.warn('⚠️ FFmpeg 未安装，视频处理功能将不可用')
  }
})

// 统一的视频处理器（支持本地上传和URL下载）
videoQueue.process('transcode', PROCESSING_CONFIG.concurrency, async (job) => {
  const {
    videoId,
    originalUrl,
    teacherId,
    watermarkText = '慧育空间教学专属视频',
    videoUrl,  // 如果存在，表示从URL下载
    downloadOptions = {}
  } = job.data

  const isUrlMode = !!videoUrl

  logger.info(`🎬 开始处理视频: ${videoId} (${isUrlMode ? 'URL下载' : '本地上传'})`)

  // 如果 FFmpeg 不可用，直接标记为失败
  if (!ffmpegAvailable) {
    await markVideoFailed(videoId, 'VIDEO_PROCESSOR_UNAVAILABLE')
    throw new Error('FFmpeg 未安装')
  }

  const tempDir = path.join('/tmp', `video-${videoId}`)
  const derivativeAssets: Array<{ id: string; objectKey: string; provider: string }> = []

  try {
    // 更新状态为处理中
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'PROCESSING',
        ...(isUrlMode && { originalUrl: videoUrl })
      }
    })

    await job.progress(5)

    // 创建临时目录
    await fs.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'input.mp4')
    const outputPath = path.join(tempDir, 'output.mp4')
    const cornerWatermarkPath = path.join(tempDir, 'watermark-corner.png')
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg')

    let originalFileSize = 0

    // 步骤1：获取输入文件
    if (isUrlMode) {
      // 从URL下载
      logger.info(`[${videoId}] 步骤 1/6: 从URL下载视频...`)
      const downloadResult = await downloadVideo(videoUrl, {
        maxFileSize: downloadOptions.maxFileSize || 2 * 1024 * 1024 * 1024,
        timeout: downloadOptions.timeout || 10 * 60 * 1000,
        tempDir
      })

      if (!downloadResult.success) {
        throw new Error(`视频下载失败: ${downloadResult.error}`)
      }

      await fs.rename(downloadResult.localPath!, inputPath)
      originalFileSize = downloadResult.fileSize!
      logger.info(`[${videoId}] 下载完成: ${(originalFileSize / 1024 / 1024).toFixed(2)}MB`)
    } else {
      // 从本地上传
      logger.info(`[${videoId}] 步骤 1/6: 准备本地视频...`)
      const localPath = originalUrl.replace('file://', '')
      await fs.copyFile(localPath, inputPath)
      const stat = await fs.stat(inputPath)
      originalFileSize = stat.size
      logger.info(`[${videoId}] 文件大小: ${(originalFileSize / 1024 / 1024).toFixed(2)}MB`)
    }

    // URL imports do not have a database asset until the download succeeds.
    // Store the downloaded original before producing derivatives.
    if (isUrlMode) {
      const originalAsset = await storeAssetFromFile({
        filePath: inputPath,
        originalName: `${videoId}-original${path.extname(inputPath) || '.mp4'}`,
        mimeType: 'video/mp4',
        ownerId: teacherId,
      })
      await prisma.$transaction(async (tx) => {
        await tx.video.update({
          where: { id: videoId },
          data: { originalAssetId: originalAsset.id, filePath: originalAsset.objectKey, originalUrl: null },
        })
        await attachAssetReference({ assetId: originalAsset.id, entityType: 'Video', entityId: videoId, field: 'original' }, tx)
      })
    }

    await job.progress(10)

    // 步骤2：验证视频信息并确定处理策略
    logger.info(`[${videoId}] 步骤 2/6: 分析视频信息...`)
    const videoInfo = await validateVideoFile(inputPath)
    if (!videoInfo.valid) {
      throw new Error(`视频验证失败: ${videoInfo.error}`)
    }
    const strategy = determineProcessingStrategy(videoInfo)
    logger.info(`[${videoId}] 处理策略: ${strategy.reason}`)
    await job.progress(20)

    // 获取目标分辨率尺寸
    const resConfig = RESOLUTION_MAP[strategy.resolution] || RESOLUTION_MAP['480p']
    const [targetWidth, targetHeight] = resConfig.size.split('x').map(Number)

    // 步骤3：生成底部居中水印
    logger.info(`[${videoId}] 步骤 3/6: 生成水印...`)
    await generateBottomCenterWatermarkFile(cornerWatermarkPath, targetWidth)
    await job.progress(30)

    // 步骤4：转码 + 添加水印 (核心步骤)
    logger.info(`[${videoId}] 步骤 4/6: 转码 (${strategy.resolution}, preset: ${strategy.preset}, crf: ${strategy.crf})...`)
    await transcodeVideoOptimized(inputPath, outputPath, cornerWatermarkPath, strategy, (progress) => {
      const jobProgress = 30 + Math.floor(progress * 0.4)
      job.progress(jobProgress).catch(() => { })
    })
    await job.progress(70)

    // 智能压缩检查
    const processedFileSize = (await fs.stat(outputPath)).size
    if (PROCESSING_CONFIG.smartCompression && processedFileSize >= originalFileSize && strategy.mode === 'transcode') {
      logger.info(`[${videoId}] 压缩后文件变大，改用仅水印模式`)
      const watermarkOnlyStrategy: ProcessingStrategy = {
        mode: 'watermark-only',
        preset: 'ultrafast',
        crf: 18,
        resolution: strategy.resolution,
        reason: '压缩后文件变大，改用仅水印模式'
      }
      await transcodeVideoOptimized(inputPath, outputPath, cornerWatermarkPath, watermarkOnlyStrategy, (progress) => {
        const jobProgress = 70 + Math.floor(progress * 0.1)
        job.progress(jobProgress).catch(() => { })
      })
      const finalSize = (await fs.stat(outputPath)).size
      logger.info(`[${videoId}] 仅水印模式完成: ${(originalFileSize/1024/1024).toFixed(2)}MB -> ${(finalSize/1024/1024).toFixed(2)}MB`)
    } else {
      const compressionRatio = ((originalFileSize - processedFileSize) / originalFileSize * 100).toFixed(1)
      logger.info(`[${videoId}] 压缩完成: ${(originalFileSize/1024/1024).toFixed(2)}MB -> ${(processedFileSize/1024/1024).toFixed(2)}MB (节省 ${compressionRatio}%)`)
    }

    // 步骤5：生成缩略图
    logger.info(`[${videoId}] 步骤 5/6: 生成缩略图...`)
    await generateThumbnailOptimized(inputPath, thumbnailPath)
    await job.progress(85)

    // 步骤6：上传存储
    logger.info(`[${videoId}] 步骤 6/6: 上传存储...`)
    // Keep a precise list of assets created by this job. If the parent
    // transaction later fails, only these unreferenced derivatives are
    // compensated; pre-existing originals and other jobs are untouched.
    const processedAsset = await storeAssetFromFile({
      filePath: outputPath,
      originalName: `${videoId}-processed.mp4`,
      mimeType: 'video/mp4',
      ownerId: teacherId,
    })
    derivativeAssets.push(processedAsset)
    const thumbnailAsset = await storeAssetFromFile({
      filePath: thumbnailPath,
      originalName: `${videoId}-thumbnail.jpg`,
      mimeType: 'image/jpeg',
      ownerId: teacherId,
    })
    derivativeAssets.push(thumbnailAsset)
    const processedUrl = await getSignedAssetUrl(processedAsset.id)
    const thumbnailUrl = await getSignedAssetUrl(thumbnailAsset.id)

    await job.progress(95)

    // 获取视频信息
    const duration = await getVideoDuration(outputPath)
    const fileSize = (await fs.stat(outputPath)).size

    // Update the video and attach both derivatives atomically.
    await prisma.$transaction(async (tx) => {
      await tx.video.update({
        where: { id: videoId },
        data: {
          status: 'COMPLETED',
          processedUrl: null,
          thumbnailUrl: null,
          processedAssetId: processedAsset.id,
          thumbnailAssetId: thumbnailAsset.id,
          resolution: PROCESSING_CONFIG.resolution,
          duration,
          fileSize,
          processedAt: new Date()
        }
      })
      await attachAssetReference({ assetId: processedAsset.id, entityType: 'Video', entityId: videoId, field: 'processed' }, tx)
      await attachAssetReference({ assetId: thumbnailAsset.id, entityType: 'Video', entityId: videoId, field: 'thumbnail' }, tx)
    })

    await job.progress(100)

    // 清理临时文件
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })

    logger.info(`✅ 视频处理完成: ${videoId} (分辨率: ${PROCESSING_CONFIG.resolution})`)

    return { videoId, processedUrl, thumbnailUrl, duration, fileSize }

  } catch (error: any) {
    logger.error(`❌ 视频处理失败: ${videoId}`, error)
    await Promise.all(derivativeAssets.map((asset) => discardUnreferencedAsset(asset)))
    // Never persist ffmpeg, filesystem, URL, or dependency details; the
    // status endpoint is visible to teachers.
    await markVideoFailed(videoId, VIDEO_PROCESSING_FAILURE_MESSAGE)
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })
    throw error
  }
})

// 标记视频处理失败
async function markVideoFailed(videoId: string, errorMessage: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: 'FAILED',
      errorMessage
    }
  })
}

/**
 * 生成底部居中水印
 */
async function generateBottomCenterWatermark(videoWidth: number): Promise<Buffer> {
  // 如果 canvas 不可用，返回空 Buffer
  if (!createCanvas) {
    logger.warn('[VideoProcessor] canvas 不可用，跳过水印生成')
    return Buffer.from('')
  }
  
  const text = '慧育空间专属教学资料'
  const targetTextWidth = videoWidth * 0.5 * 0.7
  const fontSize = Math.max(12, Math.min(56, Math.floor(targetTextWidth / 10)))

  const tempCanvas = createCanvas(1, 1)
  const tempCtx = tempCanvas.getContext('2d')
  tempCtx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  const metrics = tempCtx.measureText(text)
  const textWidth = metrics.width
  const textHeight = fontSize * 1.2

  const padding = Math.floor(fontSize * 0.5)
  const canvas = createCanvas(textWidth + padding * 2, textHeight + padding)
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, textWidth, 0)
  gradient.addColorStop(0, 'rgba(100, 180, 255, 0.15)')
  gradient.addColorStop(0.5, 'rgba(66, 133, 244, 0.15)')
  gradient.addColorStop(1, 'rgba(25, 103, 210, 0.15)')

  ctx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.fillStyle = gradient
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padding, canvas.height / 2)

  return canvas.toBuffer('image/png')
}

async function generateBottomCenterWatermarkFile(
  watermarkPath: string,
  videoWidth: number
): Promise<void> {
  try {
    const watermarkBuffer = await generateBottomCenterWatermark(videoWidth)
    await fs.writeFile(watermarkPath, watermarkBuffer)
    logger.debug('底部居中水印生成成功')
  } catch (error) {
    logger.error('水印生成失败:', error)
    throw error
  }
}

function transcodeVideoOptimized(
  input: string,
  output: string,
  cornerWatermark: string,
  strategy: ProcessingStrategy,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalTime = 0
    const resConfig = RESOLUTION_MAP[strategy.resolution] || RESOLUTION_MAP['480p']

    ffmpeg(input).ffprobe((err, data) => {
      if (!err && data.format?.duration) {
        totalTime = data.format.duration
      }
    })

    const cmd = ffmpeg(input)
      .videoCodec('libx264')
      .videoBitrate(resConfig.bitrate)
      .audioCodec('aac')
      .audioBitrate(PROCESSING_CONFIG.audioBitrate)
      .outputOptions([
        `-preset ${strategy.preset}`,
        `-crf ${strategy.crf}`,
        '-movflags +faststart',
        '-threads 1',
        '-pix_fmt yuv420p',
        ...(strategy.mode === 'transcode' ? [
          '-tune fastdecode',
          '-profile:v baseline',
          '-level 3.0',
        ] : []),
      ])

    const [targetWidth, targetHeight] = resConfig.size.split('x').map(Number)

    const fs = require('fs')
    const hasCornerWatermark = cornerWatermark && fs.existsSync(cornerWatermark)

    if (hasCornerWatermark) {
      cmd.complexFilter([
        `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,` +
        `format=yuv420p[base]`,
        `[1:v]format=rgba[wm]`,
        `[base][wm]overlay=(W-w)/2:H-h-20:enable='between(t,0,999999)'`
      ])
      cmd.input(cornerWatermark)
    } else {
      cmd.complexFilter([
        `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,` +
        `format=yuv420p`
      ])
    }

    cmd
      .on('start', (cmdStr) => {
        logger.debug('FFmpeg 命令:', cmdStr)
      })
      .on('progress', (progress) => {
        if (totalTime > 0 && onProgress) {
          const time = progress.timemark?.split(':').reduce((acc: number, time: string) => (60 * acc) + parseFloat(time), 0) || 0
          const percent = Math.min(100, Math.round((time / totalTime) * 100))
          onProgress(percent)
        }
      })
      .on('end', () => {
        if (onProgress) onProgress(100)
        resolve()
      })
      .on('error', (err) => {
        reject(new Error(`FFmpeg 转码失败: ${err.message}`))
      })
      .save(output)
  })
}

function generateThumbnailOptimized(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .screenshots({
        timestamps: ['10%'],
        filename: path.basename(output),
        folder: path.dirname(output),
        size: '640x360'
      })
      .on('end', () => resolve())
      .on('error', reject)
  })
}

function getVideoDuration(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, metadata) => {
      if (err) {
        reject(new Error(`获取视频信息失败: ${err.message}`))
      } else {
        resolve(Math.floor(metadata.format.duration || 0))
      }
    })
  })
}

// 队列监控
setInterval(async () => {
  try {
    const counts = await videoQueue.getJobCounts()

    if (counts.waiting > 10) {
      logger.warn(`视频处理队列积压: ${counts.waiting} 个任务等待中`)
    }

    if (counts.completed % 10 === 0 && counts.completed > 0) {
      logger.info(`视频处理统计: 完成 ${counts.completed}, 失败 ${counts.failed}`)
    }
  } catch (e) {
    // 忽略错误
  }
}, 60000)

logger.info('🎬 视频处理 Worker (优化版) 已启动')
logger.info('📥 统一处理模式: 本地上传 + URL下载')
logger.info(`⚙️ 全局并发: ${PROCESSING_CONFIG.concurrency}, 配置: ${PROCESSING_CONFIG.resolution}, ${PROCESSING_CONFIG.preset}, CRF ${PROCESSING_CONFIG.crf}`)
