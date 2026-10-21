import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { boundedUpload, uploadPrincipalRateLimit, acceptedImageTypes } from '../middleware/uploadAdmission'
import { Router, Request } from 'express'
import { Prisma } from '@prisma/client'
import { success, error } from '../utils/response'
import { authenticate, requireTeacher } from '../middleware/auth'
import path from 'path'
import fs from 'fs'

import { config } from '../config'
import { imageQueue } from '../config/queue'
import { isCOSEnabled, uploadToCOS, deleteFromCOS } from '../utils/cos'
import { logger } from '../utils/logger'
import { discardUnreferencedAsset, softDeleteStoredAsset, legacyAssetOwnerIds, signKnownAsset, storeAsset } from '../services/assetStorage'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { detectMimeType } from '../utils/fileValidator'
import { BoundedAdmissionGate, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'

const router = Router()
router.use(authenticate, requireTeacher)

// Cache only transient historical statuses; the queue remains authoritative.
import NodeCache from 'node-cache'
const imageStatusCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 500, useClones: false })
const imageStatusLookup = new BoundedAdmissionGate({ name: 'legacy_image_status', maxConcurrent: 1, maxQueue: 0, maxWaitMs: 1000, retryAfterSeconds: 2 })

// 确保上传目录存在（使用绝对路径）
const imagesDir = path.resolve(config.uploadDir, 'images')
const videosDir = path.join(config.uploadDir, 'videos')
logger.info('[Upload] Upload directories configured', { imagesDir, videosDir })

try {
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true })
    logger.info('[Upload] Created upload root directory', { uploadDir: config.uploadDir })
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
    logger.info('[Upload] Created images directory', { imagesDir })
  }
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true })
    logger.info('[Upload] Created videos directory', { videosDir })
  }
} catch (err) {
  logger.error('[Upload] Failed to create directories', err)
}

const resolveImagePath = (filename: string): string | null => {
  if (!filename || filename.includes('\0')) return null

  const candidate = path.resolve(imagesDir, filename)
  if (candidate !== imagesDir && !candidate.startsWith(`${imagesDir}${path.sep}`)) {
    return null
  }

  return candidate
}

// 配置图片存储


const canManageAsset = async (req: Request, ownerId: string | null): Promise<boolean> => {
  if (!ownerId) return false
  if (ownerId === req.user?.userId) return true
  return req.user?.role === UserRole.ADMIN && (await legacyAssetOwnerIds([ownerId])).has(ownerId)
}

// 获取图片列表
router.get('/images', async (req, res) => {
  try {
    const images: any[] = []
    const pagination = getPaginationParams(req)
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.slice(0, 200) : ''

    // Product filtering happens inside PostgreSQL before LIMIT/count, never
    // after pagination and never by loading every owner's ID into the API.
    const libraryFilter = Prisma.sql`
      a.mime_type LIKE 'image/%' AND a.deleted_at IS NULL
      AND a.access_scope <> 'PUBLIC_CHECKIN'
      AND u.account_domain IN ('LEGACY', 'TRAINING')
      AND (${req.user?.role === UserRole.ADMIN} OR a.owner_id = ${req.user?.userId ?? ''})
      AND POSITION(LOWER(${keyword}) IN LOWER(COALESCE(a.original_name, ''))) > 0
    `
    const [assets, counts] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; originalName: string | null; sizeBytes: number; createdAt: Date; provider: string; accessScope: string; deletedAt: Date | null }>>(Prisma.sql`
        SELECT a.id, a.original_name AS "originalName", a.size_bytes AS "sizeBytes",
          a.created_at AS "createdAt", a.provider, a.access_scope AS "accessScope", a.deleted_at AS "deletedAt"
        FROM stored_assets a JOIN users u ON u.id = a.owner_id
        WHERE ${libraryFilter} ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${pagination.take} OFFSET ${pagination.skip}
      `),
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total FROM stored_assets a JOIN users u ON u.id = a.owner_id
        WHERE ${libraryFilter}
      `),
    ])
    const total = Number(counts[0]?.total ?? 0)
    images.push(...await Promise.all(assets.map(async (asset) => ({
      id: asset.id,
      assetId: asset.id,
      url: signKnownAsset(asset),
      filename: asset.id,
      name: asset.originalName || asset.id,
      size: asset.sizeBytes,
      createdAt: asset.createdAt,
      storage: asset.provider,
    }))))

    if (!config.legacyUploadsEnabled) return success(res, buildPaginatedResult(images, total, pagination))
    // 1. 从本地文件系统获取旧图片 during the migration window only.
    const imagesDir = path.join(config.uploadDir, 'images')
    if (config.legacyUploadsEnabled && fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir)
      const localImages = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase()
          return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
        })
        .map(file => {
          const stats = fs.statSync(path.join(imagesDir, file))
          return {
            id: file,
            url: `/uploads/images/${file}`,
            filename: file,
            name: file,
            size: stats.size,
            createdAt: stats.birthtime,
            storage: 'local' as const,
          }
        })
      images.push(...localImages)
    }
    
    // 2. 从 Redis 队列获取已上传到 COS 的图片
    if (config.legacyUploadsEnabled && isCOSEnabled()) {
      try {
        const jobs = await imageQueue.getJobs(['completed'], 0, 200)
        const completedJobs = jobs
          .filter(job => job.returnvalue && job.returnvalue.storage === 'cos')
          .map(job => {
            const result = job.returnvalue
            return {
              id: result.filename,
              url: result.url,
              filename: result.filename,
              name: result.filename,
              size: result.size,
              createdAt: new Date(parseInt(job.timestamp as any)).toISOString(),
              storage: 'cos' as const,
              compressed: result.compressed,
              originalSize: result.originalSize,
            }
          })
        
        // 去重：移除本地已存在的文件（避免重复）
        const localFilenames = new Set(images.map(img => img.filename))
        const uniqueCompletedJobs = completedJobs.filter(img => !localFilenames.has(img.filename))
        images.push(...uniqueCompletedJobs)
      } catch (queueErr) {
        logger.error('[Upload] 获取队列图片失败', queueErr)
      }
    }
    
    // 按创建时间降序排序
    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return success(res, {
      ...buildPaginatedResult(images.slice(0, pagination.take), total + Math.max(0, images.length - assets.length), pagination),
    })
  } catch (err) {
    logger.error('获取图片列表错误', err)
    return error(res, '获取图片列表失败')
  }
})

// 删除图片
router.delete('/images/:filename', async (req, res) => {
  try {
    const { filename } = req.params

    const asset = await prisma.storedAsset.findUnique({ where: { id: filename } })
    if (asset) {
      const deleted = await softDeleteStoredAsset({
        assetId: asset.id,
        authorize: async (current, tx) => {
          if (!current.ownerId) return false
          if (current.ownerId === req.user?.userId) return true
          return req.user?.role === UserRole.ADMIN && (await legacyAssetOwnerIds([current.ownerId], tx)).has(current.ownerId)
        },
      })
      if (deleted === 'forbidden') return error(res, '无权限删除此图片', -1, 403)
      if (deleted === 'missing') return error(res, '图片不存在', -1, 404)
      if (deleted === 'referenced') return error(res, '文件仍被内容或测评引用，请先移除引用', -1, 409)
      return success(res, null, '删除成功')
    }

    if (req.user?.role !== UserRole.ADMIN || !config.legacyUploadsEnabled) {
      return error(res, '旧图片只能由管理员在迁移窗口内管理', -1, 403)
    }
    const filePath = resolveImagePath(filename)
    if (!filePath) {
      return error(res, '非法文件名', -1, 400)
    }
    
    // 先尝试删除本地文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    
    // 如果启用了 COS，也尝试删除 COS 上的文件
    if (isCOSEnabled()) {
      try {
        const cosKey = `images/${filename}`
        await deleteFromCOS(cosKey)
        logger.info('[Upload] 已从 COS 删除', { cosKey })
      } catch {
        // COS 删除失败不影响返回成功（可能文件本来就不在 COS）
        logger.warn('[Upload] COS 删除 skipped', { filename })
      }
    }
    
    return success(res, null, '删除成功')
  } catch (err) {
    logger.error('删除图片错误', err)
    return error(res, '删除失败')
  }
})

// 重命名图片
router.put('/images/:filename', async (req, res) => {
  try {
    const { filename } = req.params
    const { newName } = req.body
    
    if (!newName || !newName.trim()) {
      return error(res, '新名称不能为空')
    }
    
    const trimmedName = newName.trim()
    if (trimmedName === '.' || trimmedName === '..' || /[\\/\0]/.test(trimmedName)) {
      return error(res, '文件名包含非法字符', -1, 400)
    }

    const asset = await prisma.storedAsset.findUnique({ where: { id: filename } })
    if (asset) {
      if (!(await canManageAsset(req, asset.ownerId))) return error(res, '无权限修改此图片', -1, 403)
      const extension = path.extname(asset.originalName || '')
      const updated = await prisma.storedAsset.update({
        where: { id: asset.id },
        data: { originalName: `${trimmedName}${extension}` },
      })
      return success(res, {
        oldFilename: asset.id,
        newFilename: updated.id,
        url: signKnownAsset(updated),
      }, '重命名成功')
    }

    if (req.user?.role !== UserRole.ADMIN || !config.legacyUploadsEnabled) {
      return error(res, '旧图片只能由管理员在迁移窗口内管理', -1, 403)
    }
    
    // 获取文件扩展名
    const ext = path.extname(filename)
    const newFilename = `${trimmedName}${ext}`
    
    const oldPath = resolveImagePath(filename)
    if (!oldPath) {
      return error(res, '非法文件名', -1, 400)
    }
    
    // 检查是本地文件还是 COS 文件
    const isLocalFile = fs.existsSync(oldPath)
    
    if (isLocalFile) {
      // 本地文件重命名
      const newPath = resolveImagePath(newFilename)
      if (!newPath) {
        return error(res, '文件名包含非法字符', -1, 400)
      }
      
      // 检查新文件名是否已存在
      if (fs.existsSync(newPath) && filename !== newFilename) {
        return error(res, '该名称已被使用，请换一个名称')
      }
      
      // 重命名文件
      fs.renameSync(oldPath, newPath)
      
      // 如果启用了 COS，也需要重命名 COS 上的文件
      if (isCOSEnabled()) {
        try {
          const oldCosKey = `images/${filename}`
          const newCosKey = `images/${newFilename}`
          
          // 读取新文件并上传
          await uploadToCOS(newPath, newCosKey)
          
          // 删除旧文件
          await deleteFromCOS(oldCosKey)
          
          logger.info('[Upload] COS 重命名', { oldCosKey, newCosKey })
        } catch (cosErr) {
          logger.error('[Upload] COS 重命名失败', cosErr)
          // COS 失败不影响本地重命名结果
        }
      }
      
      return success(res, {
        oldFilename: filename,
        newFilename,
        url: `/uploads/images/${newFilename}`,
      }, '重命名成功')
    } else {
      // COS 文件暂不支持重命名
      // 因为队列历史记录无法修改，且COS需要复杂的复制+删除操作
      return error(res, '云存储图片暂不支持重命名，请联系管理员')
    }
  } catch (err) {
    logger.error('重命名图片错误', err)
    return error(res, '重命名失败')
  }
})
// Upload into the unified StoredAsset catalog using bounded memory storage.
// The 10 MB route limit keeps this compatibility endpoint below the ordinary
// API body ceiling while the bytes are validated before persistence.
router.post('/image', uploadPrincipalRateLimit, boundedUpload('image', 10 * 1024 * 1024, acceptedImageTypes, async (req, res) => {
  let asset: Awaited<ReturnType<typeof storeAsset>> | undefined
  try {
    const file = req.file
    if (!file) {
      return error(res, '请选择图片文件')
    }
    const detectedMimeType = detectMimeType(file.buffer.subarray(0, 16))
    if (!detectedMimeType || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(detectedMimeType)) {
      return error(res, '图片内容类型无效')
    }

    const storedAsset = await storeAsset({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: detectedMimeType,
      ownerId: req.user?.userId,
    })
    asset = storedAsset

    const url = signKnownAsset(storedAsset)
    if (!url) throw new Error('图片签名 URL 生成失败')

    return success(res, {
      id: storedAsset.id,
      assetId: storedAsset.id,
      contentHash: storedAsset.sha256,
      mimeType: storedAsset.mimeType,
      filename: storedAsset.id,
      name: storedAsset.originalName || file.originalname,
      size: storedAsset.sizeBytes,
      createdAt: storedAsset.createdAt,
      url,
      storage: storedAsset.provider,
      status: 'completed',
    }, '图片上传成功')
  } catch (err) {
    if (asset) await discardUnreferencedAsset(asset).catch(() => undefined)
    logger.error('上传图片错误', err)
    return error(res, '上传失败')
  }
}))

function cacheImageStatus(id: string, value: unknown) {
  if (imageStatusCache.keys().length >= 500) imageStatusCache.del(imageStatusCache.keys()[0])
  imageStatusCache.set(id, value)
}

// 查询图片处理状态
router.get('/image/status/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(imageId)) return error(res, '非法图片任务编号', -1, 400)

    // 先检查内存缓存
    const cached = imageStatusCache.get<{ status: string }>(imageId)
    if (cached && cached.status === 'completed') {
      return success(res, cached)
    }

    if (cached && cached.status === 'failed') {
      return success(res, cached)
    }

    // 查询队列状态
    const lookup = await imageStatusLookup.run(async () => {
      let truncated = false
      for (const [state, limit] of [['active', 100], ['waiting', 100], ['completed', 200], ['failed', 100]] as const) {
        const jobs = await imageQueue.getJobs([state], 0, limit - 1)
        const job = jobs.find(candidate => candidate?.data.imageId === imageId)
        if (job) return { job, truncated: false }
        if (jobs.length === limit) truncated = true
      }
      return { job: null, truncated }
    })
    const job = lookup.job
    // An unscanned historical task is busy, never falsely reported absent.
    if (!job && lookup.truncated) {
      res.setHeader('Retry-After', '2')
      return error(res, '历史图片任务查询繁忙，请稍后重试', -1, 503)
    }

    if (!job && !cached) {
      return error(res, '图片任务不存在')
    }

    // 根据任务状态返回
    let status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending'

    if (job) {
      const state = await job.getState()

      switch (state) {
        case 'waiting':
          status = 'pending'
          break
        case 'active':
          status = 'processing'
          break
        case 'completed':
          status = 'completed'
          const result = job.returnvalue
          const completedData: {
            status: 'completed'
            filename: string
            url: string
            size: number
            originalSize: number
            compressed: boolean
            storage: 'local' | 'cos'
          } = {
            status: 'completed',
            filename: result.filename,
            url: result.url,
            size: result.size,
            originalSize: result.originalSize,
            compressed: result.compressed,
            storage: result.storage,
          }
          // 缓存结果
          cacheImageStatus(imageId, completedData)
          return success(res, completedData)
        case 'failed':
          status = 'failed'
          const failedData: {
            status: 'failed'
            error: string
          } = {
            status: 'failed',
            // Queue failure reasons may contain filesystem, dependency, or
            // request details. They are for server logs only, never a client
            // response.
            error: '图片处理失败，请稍后重试或联系管理员',
          }
          cacheImageStatus(imageId, failedData)
          return success(res, failedData)
      }
    }

    return success(res, {
      imageId,
      status,
    })
  } catch (err) {
    if (isBoundedAdmissionBusyError(err)) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds))
      return error(res, '历史图片任务查询繁忙，请稍后重试', -1, 503)
    }
    logger.error('查询图片状态错误', err)
    return error(res, '查询失败')
  }
})

export default router
