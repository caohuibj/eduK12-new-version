/**
 * 图片处理 Worker - 异步队列版本
 * 特点：
 * - 不阻塞 API 响应，立即返回任务 ID
 * - 并发限制，防止 CPU/内存被占满
 * - 失败自动重试
 */
import fs from 'fs/promises'
import path from 'path'

// sharp 模块可选
let sharp: any = null
try {
  sharp = require('sharp')
} catch {
  logger.warn('[ImageProcessor] sharp 模块不可用，图片处理功能将被禁用')
}

import { imageQueue, RESOURCE_LIMITS } from '../config/queue'
import { config } from '../config'
import { logger } from '../utils/logger'
import { isCOSEnabled, uploadToCOS } from '../utils/cos'
import { generateSingleWatermark } from '../utils/watermark'

// 图片处理配置
const IMAGE_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1920,
  jpegQuality: 80,
  webpQuality: 75,
  // 并发数从配置中获取
  concurrency: RESOURCE_LIMITS.imageConcurrency,
}

// 图片任务数据类型
interface ImageJobData {
  imageId: string
  inputPath: string
  originalFilename: string
  mimetype: string
  originalSize: number
}

// 图片处理结果类型
interface ImageProcessResult {
  imageId: string
  filename: string
  url: string
  size: number
  originalSize: number
  compressed: boolean
  storage: 'local' | 'cos'
}

// 图片处理器
imageQueue.process('compress', IMAGE_CONFIG.concurrency, async (job) => {
  const { imageId, inputPath, originalFilename, mimetype, originalSize }: ImageJobData = job.data

  logger.info(`🖼️ 开始处理图片: ${imageId} (${originalFilename})`)

  // 如果 sharp 不可用，直接返回原图
  if (!sharp) {
    logger.warn(`[ImageProcessor] sharp 不可用，跳过处理: ${imageId}`)
    return {
      imageId,
      filename: path.basename(inputPath),
      url: `/uploads/images/${path.basename(inputPath)}`,
      size: originalSize,
      originalSize,
      compressed: false,
      storage: 'local' as const,
    }
  }

  const imagesDir = path.join(config.uploadDir, 'images')
  const isWebP = mimetype === 'image/webp'

  try {
    await job.progress(10)

    // 保存原始文件副本（用于上传到COS低频存储）
    const originalBackupPath = path.join('/tmp', `original-${imageId}${path.extname(inputPath)}`)
    await fs.copyFile(inputPath, originalBackupPath)

    // 获取图片元数据
    const metadata = await sharp(inputPath).metadata()
    const originalWidth = metadata.width || 0
    const originalHeight = metadata.height || 0

    await job.progress(20)

    // 判断是否需要处理
    const needsResize = originalWidth > IMAGE_CONFIG.maxWidth || originalHeight > IMAGE_CONFIG.maxHeight
    const needsCompression = originalSize > 500 * 1024 || needsResize

    let outputFilename: string
    let outputPath: string
    let outputSize: number
    let compressed = false

    if (needsCompression || !isWebP) {
      // 需要处理
      const ext = isWebP ? '.webp' : '.jpg'
      outputFilename = `${Date.now()}-${imageId}${ext}`
      outputPath = path.join(imagesDir, outputFilename)

      // 计算输出尺寸
      let outputWidth = originalWidth
      let outputHeight = originalHeight
      if (needsResize) {
        const scale = Math.min(
          IMAGE_CONFIG.maxWidth / originalWidth,
          IMAGE_CONFIG.maxHeight / originalHeight,
          1
        )
        outputWidth = Math.round(originalWidth * scale)
        outputHeight = Math.round(originalHeight * scale)
      }

      await job.progress(30)

      // 生成水印
      const watermarkBuffer = await generateSingleWatermark(outputWidth)

      await job.progress(40)

      // 构建 sharp 处理管道
      let pipeline = sharp(inputPath)

      // 调整尺寸
      if (needsResize) {
        pipeline = pipeline.resize(IMAGE_CONFIG.maxWidth, IMAGE_CONFIG.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
      }

      // 添加水印
      pipeline = pipeline.composite([{ input: watermarkBuffer, gravity: 'south' }])

      // 压缩输出
      if (isWebP) {
        pipeline = pipeline.webp({ quality: IMAGE_CONFIG.webpQuality })
      } else {
        pipeline = pipeline.jpeg({
          quality: IMAGE_CONFIG.jpegQuality,
          progressive: true,
          mozjpeg: true,
        })
      }

      await job.progress(60)

      // 执行处理
      await pipeline.toFile(outputPath)

      await job.progress(80)

      // 获取输出大小
      const stats = await fs.stat(outputPath)
      outputSize = stats.size
      compressed = true

      // 删除原文件
      await fs.unlink(inputPath).catch(() => {})

      logger.info(
        `[ImageProcessor] 压缩完成: ${originalFilename} | ${(originalSize / 1024).toFixed(1)}KB -> ${(outputSize / 1024).toFixed(1)}KB`
      )
    } else {
      // 小图只加水印
      const ext = isWebP ? '.webp' : '.jpg'
      outputFilename = `${Date.now()}-${imageId}${ext}`
      outputPath = path.join(imagesDir, outputFilename)

      const watermarkBuffer = await generateSingleWatermark(originalWidth)

      await sharp(inputPath)
        .composite([{ input: watermarkBuffer, gravity: 'south' }])
        .jpeg({ quality: 85, progressive: true })
        .toFile(outputPath)

      const stats = await fs.stat(outputPath)
      outputSize = stats.size
      compressed = false

      await fs.unlink(inputPath).catch(() => {})
    }

    await job.progress(90)

    // 上传到 COS
    let finalUrl: string
    let originalCosUrl: string | null = null
    let storageType: 'local' | 'cos' = 'local'

    if (isCOSEnabled()) {
      try {
        // 上传原始图片到低频存储（备份）
        const originalKey = `images/original/${Date.now()}-${imageId}${path.extname(originalFilename)}`
        try {
          originalCosUrl = await uploadToCOS(originalBackupPath, originalKey, 'STANDARD_IA')
          logger.info(`[ImageProcessor] 原始图片已上传到低频存储: ${originalKey}`)
        } catch (err) {
          logger.error('[ImageProcessor] 上传原始图片失败:', err)
        }
        
        // 上传处理后的图片到标准存储（CDN加速）
        const processedKey = `images/processed/${outputFilename}`
        finalUrl = await uploadToCOS(outputPath, processedKey, 'STANDARD')
        storageType = 'cos'
        logger.info(`[ImageProcessor] 处理后的图片已上传到标准存储: ${processedKey}`)
        
        // 删除本地处理后的文件
        await fs.unlink(outputPath).catch(() => {})
        
        // 删除原始文件备份
        await fs.unlink(originalBackupPath).catch(() => {})
      } catch (cosErr) {
        logger.error('[ImageProcessor] COS 上传失败，回退到本地存储:', cosErr)
        finalUrl = `/uploads/images/${outputFilename}`
      }
    } else {
      finalUrl = `/uploads/images/${outputFilename}`
    }

    await job.progress(100)

    const result: ImageProcessResult = {
      imageId,
      filename: outputFilename,
      url: finalUrl,
      size: outputSize,
      originalSize,
      compressed,
      storage: storageType,
    }

    logger.info(`✅ 图片处理完成: ${imageId}`)
    return result
  } catch (error: any) {
    logger.error(`❌ 图片处理失败: ${imageId}`, error)

    // 清理临时文件
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(path.join('/tmp', `original-${imageId}${path.extname(inputPath)}`)).catch(() => {})

    throw error
  }
})

// 队列监控
setInterval(async () => {
  try {
    const counts = await imageQueue.getJobCounts()

    if (counts.waiting > 20) {
      logger.warn(`图片处理队列积压: ${counts.waiting} 个任务等待中`)
    }

    if (counts.completed > 0 && counts.completed % 50 === 0) {
      logger.info(`图片处理统计: 完成 ${counts.completed}, 失败 ${counts.failed}`)
    }
  } catch (e) {
    // 忽略错误
  }
}, 60000)

logger.info('🖼️ 图片处理 Worker 已启动')
logger.info(`⚙️ 并发数: ${IMAGE_CONFIG.concurrency}, 超时: ${RESOURCE_LIMITS.imageTimeout}s`)
