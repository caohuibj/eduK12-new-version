import { Router, Request } from 'express'
import { success, error } from '../utils/response'
import { authenticate, requireTeacher } from '../middleware/auth'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

import { config } from '../config'
import { imageQueue } from '../config/queue'
import { isCOSEnabled, uploadToCOS, deleteFromCOS } from '../utils/cos'
import { logger } from '../utils/logger'
import { getLocalAssetPath, getSignedAssetUrl, storeAsset } from '../services/assetStorage'
import { prisma } from '../config/database'
import { UserRole } from '../types'

const router = Router()
router.use(authenticate, requireTeacher)

// 图片处理状态存储（内存缓存，重启后清空）
// 生产环境应使用 Redis 存储
const imageStatusCache = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  filename?: string
  url?: string
  size?: number
  originalSize?: number
  error?: string
}>()

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
const imageUpload = multer({
  // New uploads go straight into StoredAsset. Memory storage prevents a
  // partially handled file from appearing in the legacy public /uploads tree.
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('只支持 JPG、PNG、GIF、WebP 格式的图片'))
    }
  }
})

const canManageAsset = (req: Request, ownerId: string | null): boolean =>
  req.user?.role === UserRole.ADMIN || ownerId === req.user?.userId

// 获取图片列表
router.get('/images', async (req, res) => {
  try {
    const images: any[] = []

    const assetWhere = {
      mimeType: { startsWith: 'image/' },
      deletedAt: null,
      ...(req.user?.role === UserRole.TEACHER ? { ownerId: req.user.userId } : {}),
    }
    const assets = await prisma.storedAsset.findMany({ where: assetWhere, orderBy: { createdAt: 'desc' } })
    images.push(...await Promise.all(assets.map(async (asset) => ({
      id: asset.id,
      assetId: asset.id,
      url: await getSignedAssetUrl(asset.id),
      filename: asset.id,
      name: asset.originalName || asset.id,
      size: asset.sizeBytes,
      createdAt: asset.createdAt,
      storage: asset.provider,
    }))))
    
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
      list: images,
      total: images.length,
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
      if (!canManageAsset(req, asset.ownerId)) return error(res, '无权限删除此图片', -1, 403)
      await prisma.storedAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } })
      if (asset.provider === 'local') {
        await fs.promises.rm(getLocalAssetPath(asset.objectKey), { force: true }).catch(() => undefined)
      }
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
      if (!canManageAsset(req, asset.ownerId)) return error(res, '无权限修改此图片', -1, 403)
      const extension = path.extname(asset.originalName || '')
      const updated = await prisma.storedAsset.update({
        where: { id: asset.id },
        data: { originalName: `${trimmedName}${extension}` },
      })
      return success(res, {
        oldFilename: asset.id,
        newFilename: updated.id,
        url: await getSignedAssetUrl(updated.id),
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
// Upload into the unified StoredAsset catalog. The current disk middleware is
// retained as a staging layer for compatibility; the staged file is removed
// before the request completes.
router.post('/image', imageUpload.single('image'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return error(res, '请选择图片文件')
    }

    const asset = await storeAsset({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      ownerId: req.user?.userId,
    })

    return success(res, {
      id: asset.id,
      assetId: asset.id,
      filename: asset.id,
      name: asset.originalName || file.originalname,
      size: asset.sizeBytes,
      createdAt: asset.createdAt,
      url: await getSignedAssetUrl(asset.id),
      storage: asset.provider,
      status: 'completed',
    }, '图片上传成功')
  } catch (err) {
    logger.error('上传图片错误', err)
    return error(res, '上传失败')
  }
})

// 查询图片处理状态
router.get('/image/status/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params

    // 先检查内存缓存
    const cached = imageStatusCache.get(imageId)
    if (cached && cached.status === 'completed') {
      return success(res, cached)
    }

    if (cached && cached.status === 'failed') {
      return success(res, cached)
    }

    // 查询队列状态
    const jobs = await imageQueue.getJobs(['active', 'waiting', 'completed', 'failed'])
    const job = jobs.find((j) => j.data.imageId === imageId)

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
          imageStatusCache.set(imageId, completedData)
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
          imageStatusCache.set(imageId, failedData)
          return success(res, failedData)
      }
    }

    return success(res, {
      imageId,
      status,
    })
  } catch (err) {
    logger.error('查询图片状态错误', err)
    return error(res, '查询失败')
  }
})

export default router
