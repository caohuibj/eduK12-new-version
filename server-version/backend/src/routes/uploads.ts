import { Router } from 'express'
import { success, error } from '../utils/response'
import { authenticate } from '../middleware/auth'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

import { config } from '../config'
import { imageQueue } from '../config/queue'
import { isCOSEnabled, uploadToCOS, deleteFromCOS, cos } from '../utils/cos'

const router = Router()

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
const imagesDir = path.join(config.uploadDir, 'images')
const videosDir = path.join(config.uploadDir, 'videos')
console.log('[Upload] Images directory:', imagesDir)
console.log('[Upload] Videos directory:', videosDir)

try {
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true })
    console.log('[Upload] Created upload root directory:', config.uploadDir)
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
    console.log('[Upload] Created images directory:', imagesDir)
  }
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true })
    console.log('[Upload] Created videos directory:', videosDir)
  }
} catch (err) {
  console.error('[Upload] Failed to create directories:', err)
}

// 配置图片存储
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const imageUpload = multer({
  storage: imageStorage,
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

// 获取图片列表
router.get('/images', authenticate, async (req, res) => {
  try {
    const images: any[] = []
    
    // 1. 从本地文件系统获取旧图片
    const imagesDir = path.join(config.uploadDir, 'images')
    if (fs.existsSync(imagesDir)) {
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
    if (isCOSEnabled()) {
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
        console.error('[Upload] 获取队列图片失败:', queueErr)
      }
    }
    
    // 按创建时间降序排序
    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return success(res, {
      list: images,
      total: images.length,
    })
  } catch (err) {
    console.error('获取图片列表错误:', err)
    return error(res, '获取图片列表失败')
  }
})

// 删除图片
router.delete('/images/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params
    const filePath = path.join(config.uploadDir, 'images', filename)
    
    // 先尝试删除本地文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    
    // 如果启用了 COS，也尝试删除 COS 上的文件
    if (isCOSEnabled()) {
      try {
        const cosKey = `images/${filename}`
        await deleteFromCOS(cosKey)
        console.log(`[Upload] 已从 COS 删除: ${cosKey}`)
      } catch (cosErr) {
        // COS 删除失败不影响返回成功（可能文件本来就不在 COS）
        console.log(`[Upload] COS 删除 skipped: ${filename}`)
      }
    }
    
    return success(res, null, '删除成功')
  } catch (err) {
    console.error('删除图片错误:', err)
    return error(res, '删除失败')
  }
})

// 重命名图片
router.put('/images/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params
    const { newName } = req.body
    
    if (!newName || !newName.trim()) {
      return error(res, '新名称不能为空')
    }
    
    const trimmedName = newName.trim()
    
    // 获取文件扩展名
    const ext = path.extname(filename)
    const newFilename = `${trimmedName}${ext}`
    
    const oldPath = path.join(config.uploadDir, 'images', filename)
    
    // 检查是本地文件还是 COS 文件
    const isLocalFile = fs.existsSync(oldPath)
    
    if (isLocalFile) {
      // 本地文件重命名
      const newPath = path.join(config.uploadDir, 'images', newFilename)
      
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
          
          console.log(`[Upload] COS 重命名: ${oldCosKey} -> ${newCosKey}`)
        } catch (cosErr) {
          console.error('[Upload] COS 重命名失败:', cosErr)
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
    console.error('重命名图片错误:', err)
    return error(res, '重命名失败')
  }
})
// 上传图片（异步处理）- 立即返回，后台队列处理
router.post('/image', authenticate, imageUpload.single('image'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return error(res, '请选择图片文件')
    }

    const imageId = uuidv4()
    const inputPath = file.path

    // 初始化状态
    imageStatusCache.set(imageId, {
      status: 'pending',
      originalSize: file.size,
    })

    // 添加到处理队列
    const job = await imageQueue.add('compress', {
      imageId,
      inputPath,
      originalFilename: file.originalname,
      mimetype: file.mimetype,
      originalSize: file.size,
    })

    console.log(`[Upload] 图片已加入处理队列: ${imageId}, job: ${job.id}`)

    // 立即返回，前端通过状态接口轮询结果
    return success(res, {
      imageId,
      jobId: job.id,
      status: 'pending',
      message: '图片已上传，正在处理中',
      pollUrl: `/uploads/image/status/${imageId}`,
    })
  } catch (err) {
    console.error('上传图片错误:', err)
    return error(res, '上传失败')
  }
})

// 查询图片处理状态
router.get('/image/status/:imageId', authenticate, async (req, res) => {
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
            error: job.failedReason || '处理失败',
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
    console.error('查询图片状态错误:', err)
    return error(res, '查询失败')
  }
})

export default router
