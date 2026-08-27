import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { videoQueue } from '../config/queue'
import { logger } from '../utils/logger'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { z } from 'zod'
import { validateRemoteUrl } from '../utils/videoDownloader'
import { attachAssetReference, getLocalAssetPath, getSignedAssetUrl, storeAsset } from '../services/assetStorage'

const updateVideoSchema = z.object({
  title: z.string().min(1, '视频标题不能为空'),
})

export const videoController = {
  // 获取视频列表（添加分页优化）
  async list(req: Request, res: Response) {
    try {
      const { keyword, includeDeleted, tags } = req.query
      const userId = req.user?.userId
      const userRole = req.user?.role
      const pagination = getPaginationParams(req)

      let where: any = {}

      // 默认不显示已删除的视频，除非明确指定
      if (includeDeleted !== 'true') {
        where.isDeleted = false
      }

      if (keyword) {
        where.title = { contains: keyword as string }
      }

      // 标签筛选
      if (tags) {
        const tagArray = (tags as string).split(',').map(t => t.trim()).filter(Boolean)
        if (tagArray.length > 0) {
          where.tags = { hasEvery: tagArray }
        }
      }

      // 教师只能看到自己的视频，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        where.teacherId = userId
      }

      // 并行查询数据和总数
      const [videos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          include: {
            teacher: {
              select: {
                id: true,
                nickname: true,
                username: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.video.count({ where })
      ])

      // 添加视频URL - 优先使用处理后的URL
      const videosWithUrl = await Promise.all(videos.map(async video => {
        // Legacy URLs remain a migration-window fallback. New rows only use
        // short-lived signed asset URLs.
        const processedUrl = video.processedAssetId
          ? await getSignedAssetUrl(video.processedAssetId)
          : (video.processedUrl && !video.processedUrl.startsWith('file://') ? video.processedUrl : null)
        const originalUrl = video.originalAssetId
          ? await getSignedAssetUrl(video.originalAssetId)
          : `/uploads/videos/${video.fileName}`
        const thumbnailUrl = video.thumbnailAssetId
          ? await getSignedAssetUrl(video.thumbnailAssetId)
          : video.thumbnailUrl
        return {
          ...video,
          url: processedUrl || originalUrl || '',
          originalUrl,
          processedUrl,
          thumbnailUrl,
          isProcessed: !!processedUrl,
        }
      }))

      return success(res, buildPaginatedResult(videosWithUrl, total, pagination))
    } catch (err) {
      logger.error('获取视频列表错误', err)
      return error(res, '获取视频列表失败')
    }
  },

  // 上传视频 - 异步处理版本
  async upload(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const file = req.file
      if (!file) {
        return error(res, '请选择视频文件')
      }

      const { title } = req.body
      if (!title) {
        return error(res, '请输入视频标题')
      }

      const detectedMimeType = (file as Express.Multer.File & { detectedMimeType?: string }).detectedMimeType || file.mimetype

      const originalAsset = await storeAsset({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: detectedMimeType,
        ownerId: userId,
        provider: 'local',
      })
      const processingInput = `file://${getLocalAssetPath(originalAsset.objectKey)}`

      // Keep the video pointer and asset reference atomic. The asset itself
      // is already stored, so a failed transaction leaves only an unreachable
      // asset for later garbage collection, never a half-linked video.
      const video = await prisma.$transaction(async (tx) => {
        const created = await tx.video.create({
          data: {
            title,
            filePath: originalAsset.objectKey,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: detectedMimeType,
            teacherId: userId,
            originalAssetId: originalAsset.id,
            status: 'PENDING',
          },
          include: {
            teacher: {
              select: {
                id: true,
                nickname: true,
                username: true,
              }
            }
          }
        })
        await attachAssetReference({ assetId: originalAsset.id, entityType: 'Video', entityId: created.id, field: 'original' }, tx)
        return created
      })

      // 添加到视频处理队列
      await videoQueue.add('transcode', {
        videoId: video.id,
        originalUrl: processingInput,
        teacherId: userId,
      }, {
        delay: 1000, // 延迟1秒确保文件写入完成
        priority: 1,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      })

      logger.info(`视频已加入处理队列: ${video.id}`)

      return success(res, {
        id: video.id,
        title: video.title,
        status: 'PENDING',
        originalUrl: await getSignedAssetUrl(originalAsset.id),
        message: '视频上传成功，正在后台处理中...',
      }, '视频上传成功，转码处理中')
    } catch (err) {
      logger.error('上传视频错误', err)
      return error(res, '上传视频失败')
    }
  },

  // 从URL下载并处理视频
  async uploadFromUrl(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const { title, videoUrl, watermarkText } = req.body

      // 参数验证
      if (!title) {
        return error(res, '请输入视频标题')
      }
      if (!videoUrl) {
        return error(res, '请输入视频链接')
      }

      // URL格式验证
      const urlSchema = z.string().url('请输入有效的URL')
      const urlResult = urlSchema.safeParse(videoUrl)
      if (!urlResult.success) {
        return error(res, '视频链接格式不正确')
      }

      try {
        await validateRemoteUrl(urlResult.data)
      } catch {
        return error(res, '视频链接必须指向可访问的公网 HTTP(S) 地址')
      }

      const parsedVideoUrl = new URL(urlResult.data)
      logger.info(`用户 ${userId} 提交视频链接`, { host: parsedVideoUrl.hostname })

      // 创建数据库记录
      const video = await prisma.video.create({
        data: {
          title,
          filePath: 'pending_download', // 占位符，下载后会更新
          fileName: 'pending_download',
          fileSize: 0,
          mimeType: 'video/mp4',
          teacherId: userId,
          originalUrl: urlResult.data,
          status: 'PENDING',
        },
        include: {
          teacher: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // The worker consumes the named transcode job and detects URL mode from videoUrl.
      await videoQueue.add('transcode', {
        videoId: video.id,
        videoUrl: urlResult.data, // 视频链接
        teacherId: userId,
        watermarkText: watermarkText || '慧育空间教学专属视频',
        downloadOptions: {
          maxFileSize: 2 * 1024 * 1024 * 1024,  // 2GB
          timeout: 15 * 60 * 1000,              // 15分钟
        }
      }, {
        delay: 1000,
        priority: 1,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      })

      logger.info(`视频链接已加入处理队列: ${video.id}`)

      return success(res, {
        id: video.id,
        title: video.title,
        status: 'PENDING',
        videoUrl: videoUrl.substring(0, 50) + '...',
        message: '视频链接已提交，正在后台下载并处理中...',
      }, '视频链接提交成功，下载处理中')
    } catch (err) {
      logger.error('提交视频链接错误', err)
      return error(res, '提交视频链接失败')
    }
  },

  // 获取视频处理状态
  async getStatus(req: Request, res: Response) {
    try {
      const { id } = req.params
      const userId = req.user?.userId
      const userRole = req.user?.role

      const video = await prisma.video.findUnique({
        where: { id },
        include: {
          teacher: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查：只有上传者或管理员可以查看
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此视频')
      }

      // 获取队列中的任务进度
      let progress = 0
      if (video.status === 'PROCESSING') {
        const jobs = await videoQueue.getJobs(['active', 'waiting'])
        const job = jobs.find(j => j.data.videoId === id)
        if (job) {
          progress = job.progress() as number || 0
        }
      }

      return success(res, {
        id: video.id,
        title: video.title,
        status: video.status,
        progress,
        originalUrl: video.originalAssetId
          ? await getSignedAssetUrl(video.originalAssetId)
          : (video.originalUrl ? `/uploads/videos/${video.fileName}` : null),
        processedUrl: video.processedAssetId
          ? await getSignedAssetUrl(video.processedAssetId)
          : video.processedUrl,
        thumbnailUrl: video.thumbnailAssetId
          ? await getSignedAssetUrl(video.thumbnailAssetId)
          : video.thumbnailUrl,
        resolution: video.resolution,
        duration: video.duration,
        fileSize: video.fileSize,
        processedAt: video.processedAt,
        // Older rows may contain dependency/filesystem details. Never return
        // persisted worker error text to the browser.
        errorMessage: video.status === 'FAILED'
          ? '视频处理失败，请稍后重试或联系管理员'
          : null,
        createdAt: video.createdAt,
      })
    } catch (err) {
      logger.error('获取视频状态错误', err)
      return error(res, '获取视频状态失败')
    }
  },

  // 更新视频信息
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateVideoSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const video = await prisma.video.findUnique({
        where: { id }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查：只有上传者或管理员可以修改
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此视频')
      }

      const updated = await prisma.video.update({
        where: { id },
        data: { title: result.data.title },
        include: {
          teacher: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      return success(res, {
        ...updated,
        url: updated.originalAssetId
          ? await getSignedAssetUrl(updated.originalAssetId)
          : `/uploads/videos/${updated.fileName}`,
      }, '视频更新成功')
    } catch (err) {
      logger.error('更新视频错误', err)
      return error(res, '更新视频失败')
    }
  },

  // 更新视频标签
  async updateTags(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const { tags } = req.body

      if (!Array.isArray(tags)) {
        return error(res, '标签格式错误')
      }

      const video = await prisma.video.findUnique({
        where: { id }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此视频')
      }

      const updated = await prisma.video.update({
        where: { id },
        data: { tags: tags.map(t => t.trim()).filter(Boolean) },
        include: {
          teacher: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      return success(res, {
        ...updated,
        url: updated.originalAssetId
          ? await getSignedAssetUrl(updated.originalAssetId)
          : `/uploads/videos/${updated.fileName}`,
      }, '标签更新成功')
    } catch (err) {
      logger.error('更新标签错误', err)
      return error(res, '更新标签失败')
    }
  },

  // 检查视频引用情况
  async checkReferences(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const video = await prisma.video.findUnique({
        where: { id }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此视频')
      }

      // 查询引用此视频的活跃作业（PUBLISHED状态）
      const assignments = await prisma.assignment.findMany({
        where: {
          status: 'PUBLISHED',
          videos: {
            path: ['$[*]', 'id'],
            array_contains: id
          }
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          }
        }
      })

      // 查询引用此视频的打卡
      const checkins = await prisma.checkin.findMany({
        where: {
          videos: {
            path: ['$[*]', 'id'],
            array_contains: id
          }
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          }
        }
      })

      return success(res, {
        assignments: assignments.map(a => ({
          id: a.id,
          title: a.title,
          course: a.course,
        })),
        checkins: checkins.map(c => ({
          id: c.id,
          title: c.title,
          course: c.course,
        })),
        total: assignments.length + checkins.length,
      }, '获取引用情况成功')
    } catch (err) {
      logger.error('检查引用错误', err)
      return error(res, '检查引用失败')
    }
  },

  // 删除视频（软删除）
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const { force } = req.query // force=true 强制删除（无视引用）

      const video = await prisma.video.findUnique({
        where: { id }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查：上传者或管理员可以删除
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此视频')
      }

      // 检查是否已被删除
      if (video.isDeleted) {
        return error(res, '视频已被删除')
      }

      // 检查引用情况（除非强制删除）
      if (force !== 'true') {
        // 查询引用此视频的活跃作业
        const assignments = await prisma.assignment.findMany({
          where: {
            status: 'PUBLISHED',
            videos: {
              path: ['$[*]', 'id'],
              array_contains: id
            }
          },
          select: {
            id: true,
            title: true,
          }
        })

        // 查询引用此视频的打卡
        const checkins = await prisma.checkin.findMany({
          where: {
            videos: {
              path: ['$[*]', 'id'],
              array_contains: id
            }
          },
          select: {
            id: true,
            title: true,
          }
        })

        const totalRefs = assignments.length + checkins.length
        if (totalRefs > 0) {
          return error(res, `该视频被 ${totalRefs} 个活跃任务引用，无法删除。请先移除引用或联系管理员。`)
        }
      }

      // 软删除
      await prisma.video.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        }
      })

      return success(res, null, '视频已删除')
    } catch (err) {
      logger.error('删除视频错误', err)
      return error(res, '删除视频失败')
    }
  },

  // 恢复已删除的视频
  async restore(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const video = await prisma.video.findUnique({
        where: { id }
      })

      if (!video) {
        return notFound(res, '视频不存在')
      }

      // 权限检查
      if (video.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限恢复此视频')
      }

      if (!video.isDeleted) {
        return error(res, '视频未被删除')
      }

      await prisma.video.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
        }
      })

      return success(res, null, '视频已恢复')
    } catch (err) {
      logger.error('恢复视频错误', err)
      return error(res, '恢复视频失败')
    }
  }
}
