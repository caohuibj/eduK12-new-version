/**
 * 视频处理 Worker
 * 处理视频转码、添加水印、生成缩略图
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { createCanvas } from 'canvas'
import { videoQueue } from '../config/queue'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { config } from '../config'
import { validateVideoFile, VideoValidationResult } from '../utils/videoDownloader'

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
  resolution: process.env.VIDEO_RESOLUTION || '480p', // 480p
  preset: process.env.VIDEO_PRESET || 'veryfast',     // veryfast - 更好的压缩率
  crf: parseInt(process.env.VIDEO_CRF || '26'),       // 26 - 质量与压缩平衡
  videoBitrate: process.env.VIDEO_BITRATE || '800k',  // 800k
  audioBitrate: '96k',
  smartCompression: true, // 智能压缩 - 如果处理后文件更大则使用原文件
}

// 分辨率映射
const RESOLUTION_MAP: Record<string, { size: string; bitrate: string }> = {
  '360p': { size: '640x360', bitrate: '500k' },
  '480p': { size: '854x480', bitrate: '800k' },
  '720p': { size: '1280x720', bitrate: '1200k' },
  '1080p': { size: '1920x1080', bitrate: '2500k' },
}

/**
 * 智能处理策略决策器
 * 根据视频编码和分辨率选择最优处理策略
 */
function determineProcessingStrategy(videoInfo: VideoValidationResult): ProcessingStrategy {
  const { isH264, is480pOrLower, height, codec } = videoInfo

  // 策略1: H.264 + 480p或更低 → 只加水印（快速模式）
  if (isH264 && is480pOrLower) {
    return {
      mode: 'watermark-only',
      preset: 'ultrafast',
      crf: 18,
      resolution: PROCESSING_CONFIG.resolution,
      reason: `原视频已是H.264编码且分辨率${height}p≤480p，仅添加水印`
    }
  }

  // 策略2: H.264 但分辨率过高 → 压缩到480p + 水印
  if (isH264 && !is480pOrLower) {
    return {
      mode: 'transcode',
      preset: PROCESSING_CONFIG.preset,
      crf: PROCESSING_CONFIG.crf,
      resolution: '480p',
      reason: `原视频是H.264但分辨率${height}p>480p，压缩到480p并添加水印`
    }
  }

  // 策略3: 非H.264 → 需要转码 + 压缩
  return {
    mode: 'transcode',
    preset: PROCESSING_CONFIG.preset,
    crf: PROCESSING_CONFIG.crf,
    resolution: PROCESSING_CONFIG.resolution,
    reason: `原视频编码为${codec}（非H.264），转码为H.264并添加水印`
  }
}

// 检查 FFmpeg 是否可用
let ffmpegAvailable = false
try {
  ffmpeg.getAvailableCodecs((err) => {
    ffmpegAvailable = !err
    if (ffmpegAvailable) {
      logger.info('✅ FFmpeg 已就绪')
    } else {
      logger.warn('⚠️ FFmpeg 未安装，视频处理功能将不可用')
    }
  })
} catch {
  logger.warn('⚠️ FFmpeg 检查失败，视频处理功能将不可用')
}

// 处理视频任务
videoQueue.process('transcode', 2, async (job) => {
  const { videoId, originalUrl, teacherId } = job.data

  logger.info(`🎬 开始处理视频: ${videoId}`)

  // 获取视频记录
  const video = await prisma.video.findUnique({
    where: { id: videoId }
  })
  
  if (!video) {
    throw new Error('视频记录不存在')
  }

  // 如果 FFmpeg 不可用，直接标记为失败
  if (!ffmpegAvailable) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'FAILED',
        errorMessage: 'FFmpeg 未安装，无法处理视频'
      }
    })
    throw new Error('FFmpeg 未安装')
  }

  try {
    // 更新状态为处理中
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING' }
    })

    // 更新任务进度
    await job.progress(10)

    // 创建临时目录
    const tempDir = path.join('/tmp', `video-${videoId}`)
    await fs.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'input.mp4')
    const outputPath = path.join(tempDir, 'output.mp4')
    const cornerWatermarkPath = path.join(tempDir, 'watermark-corner.png')
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg')

    // 1. 下载原始视频
    logger.info(`[${videoId}] 下载原始视频...`)
    await downloadFile(originalUrl, inputPath)
    const originalFileSize = (await fs.stat(inputPath)).size
    await job.progress(15)

    // 2. 验证视频信息并确定处理策略
    logger.info(`[${videoId}] 分析视频信息...`)
    const videoInfo = await validateVideoFile(inputPath)
    if (!videoInfo.valid) {
      throw new Error(`视频验证失败: ${videoInfo.error}`)
    }
    const strategy = determineProcessingStrategy(videoInfo)
    logger.info(`[${videoId}] 处理策略: ${strategy.reason}`)
    await job.progress(25)

    // 获取目标分辨率尺寸
    const resConfig = RESOLUTION_MAP[strategy.resolution] || RESOLUTION_MAP['480p']
    const [targetWidth, targetHeight] = resConfig.size.split('x').map(Number)

    // 3. 生成单水印（右下角）
    logger.info(`[${videoId}] 生成水印...`)
    const cornerBuffer = await generateCornerWatermark(targetWidth)
    await fs.writeFile(cornerWatermarkPath, cornerBuffer)
    await job.progress(35)

    // 4. FFmpeg 转码 + 添加水印
    logger.info(`[${videoId}] 开始转码 (${strategy.mode}, ${strategy.resolution}, preset: ${strategy.preset}, crf: ${strategy.crf})...`)
    await transcodeVideo(inputPath, outputPath, cornerWatermarkPath, strategy, (progress) => {
      // 转码进度 35% -> 70%
      const jobProgress = 35 + Math.floor(progress * 0.35)
      job.progress(jobProgress).catch(() => { })
    })
    await job.progress(70)

    // 5. 智能压缩检查 - 如果压缩后更大且不是仅水印模式，改用仅水印模式
    const processedFileSize = (await fs.stat(outputPath)).size
    if (PROCESSING_CONFIG.smartCompression && processedFileSize >= originalFileSize && strategy.mode === 'transcode') {
      logger.info(`[${videoId}] 压缩后文件(${processedFileSize})大于原文件(${originalFileSize})，改用仅水印模式`)
      const watermarkOnlyStrategy: ProcessingStrategy = {
        mode: 'watermark-only',
        preset: 'ultrafast',
        crf: 18,
        resolution: strategy.resolution,
        reason: '压缩后文件变大，改用仅水印模式'
      }
      await transcodeVideo(inputPath, outputPath, cornerWatermarkPath, watermarkOnlyStrategy, (progress) => {
        const jobProgress = 70 + Math.floor(progress * 0.1)
        job.progress(jobProgress).catch(() => { })
      })
      const finalSize = (await fs.stat(outputPath)).size
      logger.info(`[${videoId}] 仅水印模式完成: ${(originalFileSize/1024/1024).toFixed(2)}MB -> ${(finalSize/1024/1024).toFixed(2)}MB`)
    } else {
      const compressionRatio = ((originalFileSize - processedFileSize) / originalFileSize * 100).toFixed(1)
      logger.info(`[${videoId}] 压缩完成: ${(originalFileSize/1024/1024).toFixed(2)}MB -> ${(processedFileSize/1024/1024).toFixed(2)}MB (节省 ${compressionRatio}%)`)
    }

    // 4. 生成缩略图
    logger.info(`[${videoId}] 生成缩略图...`)
    await generateThumbnail(inputPath, thumbnailPath)
    await job.progress(80)

    // 5. 上传到 COS (如果配置了)
    let processedUrl: string
    let thumbnailUrl: string
    let originalCosUrl: string | null = null
    let originalCosKey: string | null = null

    if (config.cosSecretId && config.cosBucket) {
      logger.info(`[${videoId}] 上传到 COS...`)
      
      // 动态导入 COS 工具
      const { uploadToCOS } = await import('../utils/cos')
      
      // 上传原始视频到低频存储（备份）- 带重试机制
      // 重要: 如果上传失败，originalCosUrl为null，清理逻辑不会删除本地文件，导致磁盘堆积
      if (fsSync.existsSync(inputPath)) {
        const originalKey = `videos/original/${Date.now()}-${videoId}.mp4`
        const maxUploadRetries = 3
        for (let attempt = 1; attempt <= maxUploadRetries; attempt++) {
          try {
            originalCosUrl = await uploadToCOS(inputPath, originalKey, 'STANDARD_IA')
            originalCosKey = originalKey
            logger.info(`[${videoId}] 原始视频已上传到低频存储: ${originalKey}`)
            break
          } catch (err) {
            logger.error(`[${videoId}] 上传原始视频失败 (尝试 ${attempt}/${maxUploadRetries}):`, err)
            if (attempt < maxUploadRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
            }
          }
        }
        if (!originalCosUrl) {
          logger.error(`[${videoId}] ⚠️ 原始视频COS上传最终失败，本地文件将保留待后续迁移脚本(migrate-videos.js)补传`)
        }
      }
      
      // 上传处理后的视频和缩略图到标准存储（CDN加速）
      const processedKey = `videos/processed/${Date.now()}-${videoId}.mp4`
      const thumbnailKey = `videos/thumbnails/${Date.now()}-${videoId}.jpg`

      const [procUrl, thumbUrl] = await Promise.all([
        uploadToCOS(outputPath, processedKey, 'STANDARD'),
        uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')
      ])

      processedUrl = procUrl
      thumbnailUrl = thumbUrl
      
      logger.info(`[${videoId}] 处理后的视频已上传到标准存储: ${processedKey}`)
    } else {
      // 没有 COS，移动到 uploads 目录提供本地访问
      const publicVideoDir = path.join(config.uploadDir, 'processed')
      const publicThumbDir = path.join(config.uploadDir, 'thumbnails')
      await fs.mkdir(publicVideoDir, { recursive: true })
      await fs.mkdir(publicThumbDir, { recursive: true })
      
      const publicVideoPath = path.join(publicVideoDir, `${videoId}.mp4`)
      const publicThumbDirPath = path.join(publicThumbDir, `${videoId}.jpg`)
      
      await fs.copyFile(outputPath, publicVideoPath)
      await fs.copyFile(thumbnailPath, publicThumbDirPath)
      
      // 返回可访问的 HTTP URL
      processedUrl = `/uploads/processed/${videoId}.mp4`
      thumbnailUrl = `/uploads/thumbnails/${videoId}.jpg`
      
      logger.info(`[${videoId}] 已保存到本地: ${processedUrl}`)
    }

    await job.progress(90)

    // 6. 获取视频信息
    const duration = await getVideoDuration(outputPath)
    const fileSize = (await fs.stat(outputPath)).size

    // 7. 更新数据库
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'COMPLETED',
        processedUrl,
        thumbnailUrl,
        resolution: PROCESSING_CONFIG.resolution,
        duration,
        fileSize,
        processedAt: new Date(),
        originalCosUrl,
        originalCosKey,
      }
    })

    await job.progress(100)

    // 8. 清理临时文件
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })
    
    // 9. 删除本地原始视频文件（已上传到COS）
    if (originalCosUrl && video.filePath && video.filePath !== 'pending_download' && fsSync.existsSync(video.filePath)) {
      let deleteSuccess = false
      const maxRetries = 3
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await fs.unlink(video.filePath)
          
          // 验证文件是否真的被删除
          if (!fsSync.existsSync(video.filePath)) {
            deleteSuccess = true
            logger.info(`[${videoId}] ✅ 已删除本地原始文件: ${video.fileName} (尝试 ${attempt}/${maxRetries})`)
            break
          } else {
            logger.warn(`[${videoId}] ⚠️  文件删除后仍存在: ${video.fileName} (尝试 ${attempt}/${maxRetries})`)
          }
        } catch (err: any) {
          logger.error(`[${videoId}] ❌ 删除本地原始文件失败 (尝试 ${attempt}/${maxRetries}):`, {
            error: err.message,
            code: err.code,
            path: video.filePath,
            filename: video.fileName,
          })
          
          // 如果不是最后一次尝试，等待一段时间后重试
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          }
        }
      }
      
      // 记录清理结果
      if (!deleteSuccess) {
        logger.error(`[${videoId}] 🚨 本地原始文件清理失败，需要手动处理`, {
          videoId,
          filename: video.fileName,
          filePath: video.filePath,
          cosUrl: originalCosUrl,
        })
        
        // 写入清理失败日志
        const cleanupLogPath = path.join(config.uploadDir, 'cleanup-failures.log')
        const logEntry = `${new Date().toISOString()} | ${videoId} | ${video.fileName} | ${video.filePath} | ${originalCosUrl}\n`
        await fs.appendFile(cleanupLogPath, logEntry).catch(() => {})
      }
    }

    logger.info(`✅ 视频处理完成: ${videoId}`)

    return { videoId, processedUrl, thumbnailUrl, duration }

  } catch (error: any) {
    logger.error(`❌ 视频处理失败: ${videoId}`, error)

    // 更新失败状态
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'FAILED',
        errorMessage: error.message || '处理失败'
      }
    })

    // 清理临时文件
    const tempDir = path.join('/tmp', `video-${videoId}`)
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { })

    throw error
  }
})

/**
 * 生成右下角单点水印
 * 文字"慧育空间专属教学资料"，渐变蓝色，20%不透明度
 */
async function generateCornerWatermark(videoWidth: number): Promise<Buffer> {
  const text = '慧育空间专属教学资料'

  // 计算字体大小：让文字长度约为视频宽度的一半
  const targetTextWidth = videoWidth * 0.5
  const fontSize = Math.max(16, Math.min(60, Math.floor(targetTextWidth / 10)))

  // 创建临时canvas计算文字尺寸
  const tempCanvas = createCanvas(1, 1)
  const tempCtx = tempCanvas.getContext('2d')
  tempCtx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  const metrics = tempCtx.measureText(text)
  const textWidth = metrics.width
  const textHeight = fontSize * 1.2

  // 创建水印canvas，留出边距
  const padding = Math.floor(fontSize * 0.5)
  const canvas = createCanvas(textWidth + padding * 2, textHeight + padding)
  const ctx = canvas.getContext('2d')

  // 透明背景
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 创建渐变蓝色 (从天蓝到深蓝)，20%不透明度
  const gradient = ctx.createLinearGradient(0, 0, textWidth, 0)
  gradient.addColorStop(0, 'rgba(100, 180, 255, 0.20)')
  gradient.addColorStop(0.5, 'rgba(66, 133, 244, 0.20)')
  gradient.addColorStop(1, 'rgba(25, 103, 210, 0.20)')

  // 设置文字样式
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.fillStyle = gradient
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // 绘制文字
  ctx.fillText(text, padding, canvas.height / 2)

  return canvas.toBuffer('image/png')
}

/**
 * 生成平铺水印
 * 文字"eduK12"，1%不透明度，斜向45度平铺
 */
async function generateTiledWatermark(videoWidth: number, videoHeight: number): Promise<Buffer> {
  const canvas = createCanvas(videoWidth, videoHeight)
  const ctx = canvas.getContext('2d')

  // 透明背景
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 设置文字样式 - 1%不透明度
  ctx.font = '24px "Arial", sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.01)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 保存当前状态
  ctx.save()

  // 旋转45度
  const angle = -45 * Math.PI / 180
  ctx.rotate(angle)

  // 计算平铺间距
  const spacingX = 200
  const spacingY = 150

  // 扩大绘制范围以覆盖旋转后的区域
  const diagonal = Math.sqrt(videoWidth * videoWidth + videoHeight * videoHeight)
  const startX = -diagonal
  const endX = diagonal
  const startY = -diagonal
  const endY = diagonal

  // 绘制平铺文字
  for (let y = startY; y < endY; y += spacingY) {
    for (let x = startX; x < endX; x += spacingX) {
      ctx.fillText('eduK12', x, y)
    }
  }

  // 恢复状态
  ctx.restore()

  return canvas.toBuffer('image/png')
}

// 生成双水印图片 - 已移除平铺水印，只保留下角水印
async function generateWatermark(
  cornerWatermarkPath: string,
  tiledWatermarkPath: string,
  videoWidth: number,
  videoHeight: number
): Promise<void> {
  try {
    // 只生成右下角单点水印（平铺水印已移除）
    const cornerBuffer = await generateCornerWatermark(videoWidth)
    await fs.writeFile(cornerWatermarkPath, cornerBuffer)
    logger.debug('右下角水印生成成功（平铺水印已禁用）')
  } catch (error) {
    logger.error('水印生成失败:', error)
    throw error
  }
}

// 视频转码 - 支持策略选择
function transcodeVideo(
  input: string,
  output: string,
  cornerWatermark: string,
  strategy: ProcessingStrategy,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalTime = 0
    const resConfig = RESOLUTION_MAP[strategy.resolution] || RESOLUTION_MAP['480p']

    ffmpeg(input)
      .ffprobe((err, data) => {
        if (!err && data.format?.duration) {
          totalTime = data.format.duration
        }
      })

    // 解析目标分辨率
    const [targetWidth, targetHeight] = resConfig.size.split('x').map(Number)

    // 构建 FFmpeg 命令 - 根据策略选择参数
    const cmd = ffmpeg(input)
      .videoCodec('libx264')
      .videoBitrate(resConfig.bitrate)
      .audioCodec('aac')
      .audioBitrate(PROCESSING_CONFIG.audioBitrate)
      .outputOptions([
        `-preset ${strategy.preset}`,
        `-crf ${strategy.crf}`,
        '-movflags +faststart',
        '-threads 2',
        '-pix_fmt yuv420p',
        ...(strategy.mode === 'transcode' ? [
          '-tune fastdecode',
          '-profile:v baseline',
          '-level 3.0',
        ] : []),
      ])

    // 检查水印文件是否存在
    const fs = require('fs')
    const hasCornerWatermark = cornerWatermark && fs.existsSync(cornerWatermark)

    if (hasCornerWatermark) {
      // 只有右下角水印 - 简化滤镜链
      cmd.complexFilter([
        `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,` +
        `format=yuv420p[base]`,
        `[1:v]format=rgba[wm]`,
        `[base][wm]overlay=W-w-20:H-h-20:enable='between(t,0,999999)'`
      ])
      cmd.input(cornerWatermark)
    } else {
      // 没有水印时，只进行缩放和填充
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
          const percent = Math.min(100, (progress.percent || 0))
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

// 生成缩略图
function generateThumbnail(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .screenshots({
        timestamps: ['10%'],      // 在 10% 位置截图
        filename: path.basename(output),
        folder: path.dirname(output),
        size: '640x360'           // 缩略图尺寸
      })
      .on('end', () => resolve())
      .on('error', (err) => {
        reject(new Error(`生成缩略图失败: ${err.message}`))
      })
  })
}

// 获取视频时长
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

// 下载文件
async function downloadFile(url: string, outputPath: string): Promise<void> {
  // 如果是本地文件，直接复制
  if (url.startsWith('file://')) {
    const localPath = url.replace('file://', '')
    await fs.copyFile(localPath, outputPath)
    return
  }

  // 如果是 HTTP/HTTPS，下载
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`)
  }
  const buffer = await response.arrayBuffer()
  await fs.writeFile(outputPath, Buffer.from(buffer))
}

logger.info('🎬 视频处理 Worker 已启动')
