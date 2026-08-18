import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { uploadBufferToCOS, isCOSEnabled } from '../utils/cos'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { v4 as uuidv4 } from 'uuid'

export const documentController = {
  // 获取文档列表（添加分页和缓存优化）
  async list(req: Request, res: Response) {
    try {
      const { keyword, includeDeleted, tags } = req.query
      const userId = req.user?.userId
      const userRole = req.user?.role
      const pagination = getPaginationParams(req)

      let where: any = {}

      // 默认不显示已删除的文档，除非明确指定
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
      
      // 教师只能看到自己的文档，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        where.teacherId = userId
      }

      // 并行查询数据和总数
      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          include: {
            teacher: {
              select: { id: true, nickname: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.document.count({ where })
      ])

      // 添加URL（优先使用COS URL）
      const documentsWithUrl = documents.map(doc => ({
        ...doc,
        url: doc.cosUrl || `/uploads/documents/${doc.fileName}`,
      }))

      return success(res, buildPaginatedResult(documentsWithUrl, total, pagination))
    } catch (err) {
      logger.error('获取文档列表错误', err)
      return error(res, '获取文档列表失败')
    }
  },

  // 上传文档（使用COS存储）
  async upload(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const file = req.file
      if (!file) {
        return error(res, '请选择PDF文件')
      }

      const { title } = req.body

      // 检查COS是否启用
      if (!isCOSEnabled()) {
        logger.error('COS未配置，无法上传文档')
        return error(res, '文档存储服务未配置')
      }

      // 生成COS Key
      const cosKey = `documents/${Date.now()}-${uuidv4()}.pdf`

      try {
        // 上传到COS
        const cosUrl = await uploadBufferToCOS(file.buffer, cosKey)
        logger.info(`文档已上传到COS: ${cosUrl}`)

        // 保存到数据库
        const document = await prisma.document.create({
          data: {
            title: title || file.originalname.replace(/\.pdf$/i, ''),
            filePath: cosKey, // 存储COS Key
            fileName: file.originalname,
            fileSize: file.size,
            teacherId: userId,
            cosUrl: cosUrl,
            cosKey: cosKey,
          },
          include: {
            teacher: {
              select: { id: true, nickname: true, username: true }
            }
          }
        })

        return success(res, {
          ...document,
          url: cosUrl,
        }, '文档上传成功')
      } catch (uploadError) {
        logger.error('上传到COS失败', uploadError)
        return error(res, '文档上传失败')
      }
    } catch (err) {
      logger.error('上传文档错误', err)
      return error(res, '上传文档失败')
    }
  },

  // 获取文档详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          teacher: {
            select: { id: true, nickname: true, username: true }
          }
        }
      })

      if (!document) {
        return notFound(res, '文档不存在')
      }

      return success(res, {
        ...document,
        url: document.cosUrl || `/uploads/documents/${document.fileName}`,
      })
    } catch (err) {
      logger.error('获取文档详情错误', err)
      return error(res, '获取文档详情失败')
    }
  },

  // 更新文档信息
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const { title, tags } = req.body

      const document = await prisma.document.findUnique({
        where: { id }
      })

      if (!document) {
        return notFound(res, '文档不存在')
      }

      // 权限检查
      if (document.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此文档')
      }

      const updateData: any = {}
      if (title) updateData.title = title
      if (tags) updateData.tags = tags

      const updated = await prisma.document.update({
        where: { id },
        data: updateData,
        include: {
          teacher: {
            select: { id: true, nickname: true, username: true }
          }
        }
      })

      return success(res, {
        ...updated,
        url: updated.cosUrl || `/uploads/documents/${updated.fileName}`,
      }, '文档更新成功')
    } catch (err) {
      logger.error('更新文档错误', err)
      return error(res, '更新文档失败')
    }
  },

  // 删除文档（软删除）
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const document = await prisma.document.findUnique({
        where: { id }
      })

      if (!document) {
        return notFound(res, '文档不存在')
      }

      // 权限检查
      if (document.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此文档')
      }

      // 检查是否已被删除
      if (document.isDeleted) {
        return error(res, '文档已被删除')
      }

      // 软删除
      await prisma.document.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        }
      })

      return success(res, null, '文档已删除')
    } catch (err) {
      logger.error('删除文档错误', err)
      return error(res, '删除文档失败')
    }
  },

  // 恢复已删除的文档
  async restore(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const document = await prisma.document.findUnique({
        where: { id }
      })

      if (!document) {
        return notFound(res, '文档不存在')
      }

      // 权限检查
      if (document.teacherId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限恢复此文档')
      }

      if (!document.isDeleted) {
        return error(res, '文档未被删除')
      }

      await prisma.document.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
        }
      })

      return success(res, null, '文档已恢复')
    } catch (err) {
      logger.error('恢复文档错误', err)
      return error(res, '恢复文档失败')
    }
  }
}
