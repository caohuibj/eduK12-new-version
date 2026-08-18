import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'

const createCheckinSchema = z.object({
  courseId: z.string().min(1, '课程ID不能为空'),
  title: z.string().min(1, '打卡标题不能为空'),
  description: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
  videos: z.array(z.any()).optional().nullable().default([]),
  images: z.array(z.any()).optional().nullable().default([]),
  documents: z.array(z.any()).optional().nullable().default([]),
  endTime: z.string().optional(),
  allowViewOthers: z.boolean().optional().default(false),
})

const updateCheckinSchema = z.object({
  title: z.string().min(1, '打卡标题不能为空').optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
  videos: z.array(z.any()).optional().nullable(),
  images: z.array(z.any()).optional().nullable(),
  documents: z.array(z.any()).optional().nullable(),
  endTime: z.string().optional(),
  allowViewOthers: z.boolean().optional(),
})

const submitCheckinSchema = z.object({
  content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
  images: z.array(z.string()).optional(),
})

// 配置匿名打卡图片存储
const publicImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const imagesDir = path.join(config.uploadDir, 'images')
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }
    cb(null, imagesDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const publicImageUpload = multer({
  storage: publicImageStorage,
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

export const checkinController = {
  // 获取打卡列表（添加分页优化）
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, tags } = req.query
      const pagination = getPaginationParams(req)

      let where: any = {}
      if (courseId) {
        where.courseId = courseId as string
      }

      // 标签筛选
      if (tags) {
        const tagArray = (tags as string).split(',').map(t => t.trim()).filter(Boolean)
        if (tagArray.length > 0) {
          where.tags = { hasEvery: tagArray }
        }
      }

      // 教师只能看到自己课程的打卡，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        // 获取教师的所有课程ID
        const teacherCourses = await prisma.course.findMany({
          where: { creatorId: userId },
          select: { id: true }
        })
        const courseIds = teacherCourses.map(c => c.id)
        
        // 如果指定了courseId，检查是否属于该教师
        if (courseId) {
          if (!courseIds.includes(courseId as string)) {
            return success(res, buildPaginatedResult([], 0, pagination))
          }
        } else {
          // 未指定courseId，只看自己课程的打卡
          where.courseId = { in: courseIds }
        }
      }

      // 并行查询数据和总数
      const [checkins, total] = await Promise.all([
        prisma.checkin.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
              }
            },
            creator: {
              select: {
                id: true,
                nickname: true,
              }
            },
            _count: {
              select: {
                submissions: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.checkin.count({ where })
      ])

      return success(res, buildPaginatedResult(checkins, total, pagination))
    } catch (err) {
      logger.error('获取打卡列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建打卡
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { courseId, title, description, content, videos, images, documents, endTime, allowViewOthers, tags } = result.data

      // 检查课程
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return error(res, '课程不存在')
      }

      // 权限检查
      if (course.creatorId !== userId && req.user?.role !== UserRole.ADMIN) {
        return forbidden(res, '无权限在此课程创建打卡')
      }

      const checkin = await prisma.checkin.create({
        data: {
          courseId,
          title,
          description,
          content,
          videos: videos as any,
          images: images as any,
          documents: documents as any,
          endTime: endTime ? new Date(endTime) : null,
          allowViewOthers: allowViewOthers ?? false,
          tags: tags || [],
          creatorId: userId,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          },
          creator: {
            select: {
              id: true,
              nickname: true,
            }
          },
          _count: {
            select: {
              submissions: true
            }
          }
        }
      })

      return success(res, checkin, '打卡创建成功')
    } catch (err) {
      logger.error('创建打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取打卡详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          },
          creator: {
            select: {
              id: true,
              nickname: true,
            }
          },
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 回填视频URL：当videos中url为空但id存在时，从videos表补充有效URL
      if (checkin.videos && Array.isArray(checkin.videos)) {
        const videosNeedingUpdate = (checkin.videos as any[]).filter((v: any) => v.id && !v.url)
        if (videosNeedingUpdate.length > 0) {
          const videoIds = videosNeedingUpdate.map((v: any) => v.id)
          const videoRecords = await prisma.video.findMany({
            where: { id: { in: videoIds } },
            select: { id: true, processedUrl: true, originalUrl: true, fileName: true }
          })
          const videoMap = new Map(videoRecords.map(v => [v.id, v]))
          
          checkin.videos = (checkin.videos as any[]).map((v: any) => {
            if (v.id && !v.url) {
              const record = videoMap.get(v.id)
              if (record) {
                return {
                  ...v,
                  url: record.processedUrl || record.originalUrl || (record.fileName ? `/uploads/videos/${record.fileName}` : ''),
                  processedUrl: record.processedUrl || v.processedUrl,
                  originalUrl: record.originalUrl || v.originalUrl,
                  fileName: record.fileName || v.fileName,
                }
              }
            }
            return v
          }) as any
        }
      }

      return success(res, checkin)
    } catch (err) {
      logger.error('获取打卡详情错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 更新打卡
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.creatorId !== userId && checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此打卡')
      }

      const { title, description, content, videos, images, documents, endTime, allowViewOthers, tags } = result.data

      const updatedCheckin = await prisma.checkin.update({
        where: { id },
        data: {
          title,
          description,
          content,
          videos: videos as any,
          images: images as any,
          documents: documents as any,
          endTime: endTime ? new Date(endTime) : undefined,
          allowViewOthers,
          tags: tags || [],
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          },
          creator: {
            select: {
              id: true,
              nickname: true,
            }
          },
          _count: {
            select: {
              submissions: true
            }
          }
        }
      })

      return success(res, updatedCheckin, '打卡更新成功')
    } catch (err) {
      logger.error('更新打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 删除打卡
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.creatorId !== userId && checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此打卡')
      }

      await prisma.checkin.delete({
        where: { id }
      })

      return success(res, null, '打卡已删除')
    } catch (err) {
      logger.error('删除打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 提交打卡
  async submit(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const { id } = req.params

      const result = submitCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { content, images } = result.data

      // 检查打卡
      const checkin = await prisma.checkin.findUnique({
        where: { id }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 检查是否已提交
      const existing = await prisma.checkinSubmission.findFirst({
        where: {
          checkinId: id,
          studentId: userId
        }
      })

      if (existing) {
        // 更新
        const updated = await prisma.checkinSubmission.update({
          where: { id: existing.id },
          data: {
            content,
            images: images || [],
          }
        })
        return success(res, updated, '打卡更新成功')
      }

      // 创建新提交
      const submission = await prisma.checkinSubmission.create({
        data: {
          checkinId: id,
          studentId: userId,
          content,
          images: images || [],
        }
      })

      return success(res, submission, '打卡成功')
    } catch (err) {
      logger.error('提交打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取我的打卡提交（学生视角）
  async mySubmission(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      if (!userId) {
        return error(res, '未登录')
      }

      const submission = await prisma.checkinSubmission.findFirst({
        where: {
          checkinId: id,
          studentId: userId
        }
      })

      return success(res, submission)
    } catch (err) {
      logger.error('获取我的打卡提交错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取我的打卡（学生视角）
  async myCheckins(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      // 获取学生加入的所有课程ID
      const courseStudents = await prisma.courseStudent.findMany({
        where: {
          studentId: userId,
          status: { in: ['ACTIVE', 'APPROVED'] }
        },
        select: { courseId: true }
      })
      const courseIds = courseStudents.map(cs => cs.courseId)

      // 获取这些课程的所有打卡
      const checkins = await prisma.checkin.findMany({
        where: {
          courseId: { in: courseIds }
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          },
          submissions: {
            where: {
              studentId: userId
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据
      const formattedCheckins = checkins.map(checkin => ({
        ...checkin,
        submission: checkin.submissions.length > 0 ? checkin.submissions[0] : undefined
      }))

      return success(res, {
        list: formattedCheckins,
        total: formattedCheckins.length,
      })
    } catch (err) {
      logger.error('获取我的打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取打卡所有提交（教师用）
  async submissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              title: true,
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此打卡的提交')
      }

      const submissions = await prisma.checkinSubmission.findMany({
        where: { checkinId: id },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据，确保 images 是字符串数组
      const formattedSubmissions = submissions.map(sub => {
        let imageUrls: string[] = []
        if (sub.images) {
          // 处理可能的多种格式：字符串数组、对象数组、JSON字符串
          if (Array.isArray(sub.images)) {
            imageUrls = sub.images.map((img: any) => {
              if (typeof img === 'string') {
                return img
              }
              if (img && typeof img === 'object' && img.url) {
                return img.url
              }
              return String(img)
            }).filter(Boolean)
          } else if (typeof sub.images === 'string') {
            try {
              const parsed = JSON.parse(sub.images)
              if (Array.isArray(parsed)) {
                imageUrls = parsed.map((img: any) => {
                  if (typeof img === 'string') return img
                  if (img && img.url) return img.url
                  return String(img)
                }).filter(Boolean)
              }
            } catch {
              // 如果不是JSON，当作单个URL处理
              imageUrls = [sub.images]
            }
          }
        }
        return {
          ...sub,
          images: imageUrls,
        }
      })

      return success(res, {
        list: formattedSubmissions,
        total: submissions.length,
      })
    } catch (err) {
      logger.error('获取打卡提交列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取其他学生的打卡提交（学生用，当 allowViewOthers 为 true 时）
  async othersSubmissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              title: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 检查是否允许查看他人打卡
      if (!checkin.allowViewOthers) {
        return forbidden(res, '该打卡不允许查看他人提交')
      }

      // 获取其他学生的提交（排除自己）
      const submissions = await prisma.checkinSubmission.findMany({
        where: { 
          checkinId: id,
          studentId: { not: userId }
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据，确保 images 是字符串数组
      const formattedSubmissions = submissions.map(sub => {
        let imageUrls: string[] = []
        if (sub.images) {
          // 处理可能的多种格式：字符串数组、对象数组、JSON字符串
          if (Array.isArray(sub.images)) {
            imageUrls = sub.images.map((img: any) => {
              if (typeof img === 'string') {
                return img
              }
              if (img && typeof img === 'object' && img.url) {
                return img.url
              }
              return String(img)
            }).filter(Boolean)
          } else if (typeof sub.images === 'string') {
            try {
              const parsed = JSON.parse(sub.images)
              if (Array.isArray(parsed)) {
                imageUrls = parsed.map((img: any) => {
                  if (typeof img === 'string') return img
                  if (img && img.url) return img.url
                  return String(img)
                }).filter(Boolean)
              }
            } catch {
              // 如果不是JSON，当作单个URL处理
              imageUrls = [sub.images]
            }
          }
        }
        return {
          ...sub,
          images: imageUrls,
        }
      })

      return success(res, {
        list: formattedSubmissions,
        total: submissions.length,
      })
    } catch (err) {
      logger.error('获取他人打卡提交列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 导出打卡数据
  async export(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              title: true,
              creatorId: true,
            }
          },
          submissions: {
            include: {
              student: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出此打卡')
      }

      // 准备导出数据
      const exportData = checkin.submissions.map((sub, index) => {
        const images = (sub.images as string[]) || []
        return {
          '序号': index + 1,
          '学生姓名': sub.student?.nickname || sub.student?.username || (sub.isAnonymous ? '匿名用户' : '未知'),
          '学号': sub.student?.username || (sub.isAnonymous ? '匿名' : ''),
          '提交内容': sub.content || '',
          '图片数量': images.length,
          '图片链接': images.length > 0 ? images.join('\n') : '',
          '提交时间': sub.createdAt ? new Date(sub.createdAt).toLocaleString('zh-CN') : '',
        }
      })

      // 创建 Excel
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '打卡提交数据')

      // 设置响应头
      const fileName = `${checkin.course.title}_${checkin.title}_打卡数据.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)

      // 发送文件
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.send(buffer)
    } catch (err) {
      logger.error('导出打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取所有打卡标签（去重）
  async getTags(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      let where: any = {}

      // 教师只能看自己课程的打卡标签
      if (userRole === UserRole.TEACHER) {
        where.course = { creatorId: userId }
      }

      const checkins = await prisma.checkin.findMany({
        where,
        select: { tags: true }
      })

      const allTags = [...new Set(checkins.flatMap(c => c.tags))]

      return success(res, { tags: allTags })
    } catch (err) {
      logger.error('获取打卡标签错误', err)
      return error(res, '获取打卡标签失败')
    }
  },

  // ==================== 匿名打卡接口 ====================

  /**
   * 创建打卡访问令牌（教师）
   */
  async createAccessToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params
      const { expiresAt, maxUses } = req.body

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以创建令牌
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权为此打卡创建令牌')
      }

      // 检查打卡是否允许匿名
      if (!checkin.allowAnonymous) {
        return error(res, '此打卡不允许匿名提交，请先开启匿名打卡功能')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 创建令牌
      const token = await checkinTokenService.createToken({
        checkinId,
        createdBy: userId!,
        expiresAt: new Date(expiresAt),
        maxUses: maxUses || 0,
      })

      logger.info('教师创建打卡令牌', {
        tokenId: token.id,
        checkinId,
        createdBy: userId,
      })

      return success(res, token, '令牌创建成功')
    } catch (err) {
      logger.error('创建打卡令牌错误', err)
      return error(res, '创建令牌失败')
    }
  },

  /**
   * 获取打卡的所有令牌（教师）
   */
  async getAccessTokens(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以查看令牌
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权查看此打卡的令牌')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      const tokens = await checkinTokenService.getTokensByCheckin(checkinId)

      return success(res, tokens)
    } catch (err) {
      logger.error('获取打卡令牌错误', err)
      return error(res, '获取令牌失败')
    }
  },

  /**
   * 删除打卡令牌（教师）
   */
  async deleteAccessToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { tokenId } = req.params

      // 获取令牌信息
      const token = await prisma.checkinAccessToken.findUnique({
        where: { id: tokenId },
        include: {
          checkin: {
            include: { course: true },
          },
        },
      })

      if (!token) {
        return notFound(res, '令牌不存在')
      }

      // 验证权限：只有课程创建者可以删除令牌
      if (token.checkin.course.creatorId !== userId) {
        return forbidden(res, '无权删除此令牌')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      await checkinTokenService.deleteToken(tokenId)

      logger.info('教师删除打卡令牌', {
        tokenId,
        deletedBy: userId,
      })

      return success(res, null, '令牌已删除')
    } catch (err) {
      logger.error('删除打卡令牌错误', err)
      return error(res, '删除令牌失败')
    }
  },

  /**
   * 公开获取打卡详情（匿名用户，通过令牌访问）
   */
  async getPublicCheckin(req: Request, res: Response) {
    try {
      const { token } = req.params

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 验证令牌
      const validation = await checkinTokenService.validateToken(token)

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      // 记录访问
      await checkinTokenService.recordAccess(validation.token.id)

      // 获取打卡详情（不包含敏感信息）
      const checkin = await prisma.checkin.findUnique({
        where: { id: validation.checkin.id },
        select: {
          id: true,
          title: true,
          description: true,
          content: true,
          images: true,
          videos: true,
          documents: true,
          endTime: true,
          createdAt: true,
          allowViewOthers: true,
        },
      })

      // 生成会话ID（用于防重复提交）
      const sessionId = checkinTokenService.generateSessionId()

      logger.info('匿名用户访问打卡', {
        token: token.substring(0, 10) + '...',
        checkinId: checkin?.id,
      })

      return success(res, {
        checkin,
        sessionId,
        tokenId: validation.token.id,
      })
    } catch (err) {
      logger.error('公开获取打卡详情错误', err)
      return error(res, '获取打卡详情失败')
    }
  },

  /**
   * 公开上传图片（匿名用户，通过令牌访问）
   */
  async uploadPublicImage(req: Request, res: Response) {
    try {
      const { token } = req.params

      // 验证令牌
      const { checkinTokenService } = await import('../services/checkinTokenService')
      const validation = await checkinTokenService.validateToken(token)

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      // 使用 multer 处理上传
      publicImageUpload.single('file')(req, res, async (multerErr) => {
        if (multerErr) {
          logger.error('公开上传图片错误', multerErr)
          return error(res, multerErr.message || '上传失败')
        }

        const file = req.file
        if (!file) {
          return error(res, '请选择图片文件')
        }

        const imageUrl = `/uploads/images/${file.filename}`

        logger.info('匿名用户上传图片', {
          filename: file.filename,
          token: token.substring(0, 10) + '...',
        })

        return success(res, { url: imageUrl }, '上传成功')
      })
    } catch (err) {
      logger.error('公开上传图片错误', err)
      return error(res, '上传失败')
    }
  },

  /**
   * 公开提交打卡（匿名用户，通过令牌访问）
   */
  async submitPublicCheckin(req: Request, res: Response) {
    try {
      const { token } = req.params
      const { content, images, sessionId } = req.body

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 验证令牌
      const validation = await checkinTokenService.validateToken(token)

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      // 检查是否已提交（通过 sessionId 防重复）
      const existingSubmission = await prisma.checkinSubmission.findUnique({
        where: {
          checkinId_sessionId: {
            checkinId: validation.checkin.id,
            sessionId,
          },
        },
      })

      if (existingSubmission) {
        return error(res, '您已经提交过了')
      }

      // 检查打卡是否已结束
      if (validation.checkin.endTime && new Date() > validation.checkin.endTime) {
        return error(res, '打卡已结束')
      }

      // 创建匿名提交
      const submission = await prisma.checkinSubmission.create({
        data: {
          checkinId: validation.checkin.id,
          studentId: null, // 匿名提交
          content,
          images,
          sessionId,
          tokenId: validation.token.id,
          isAnonymous: true,
        },
      })

      logger.info('匿名用户提交打卡', {
        submissionId: submission.id,
        checkinId: validation.checkin.id,
        tokenId: validation.token.id,
      })

      return success(res, submission, '提交成功')
    } catch (err) {
      logger.error('公开提交打卡错误', err)
      return error(res, '提交打卡失败')
    }
  },

  /**
   * 切换打卡的匿名打卡功能（教师）
   */
  async toggleAllowAnonymous(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params
      const { allowAnonymous } = req.body

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以修改
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权修改此打卡')
      }

      // 更新打卡
      const updated = await prisma.checkin.update({
        where: { id: checkinId },
        data: { allowAnonymous },
      })

      logger.info('教师切换匿名打卡功能', {
        checkinId,
        allowAnonymous,
        updatedBy: userId,
      })

      return success(res, updated, allowAnonymous ? '已开启匿名打卡' : '已关闭匿名打卡')
    } catch (err) {
      logger.error('切换匿名打卡功能错误', err)
      return error(res, '修改失败')
    }
  }
}
