import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { encryptField, safeDecrypt } from '../utils/encryption'
import { normalizeScaleConfig, scaleLabelsError } from '../utils/scaleLabels'

// ==================== Validation Schemas ====================

const labelSchema = z.object({
  value: z.number().int().min(1),
  label: z.string().min(1, '选项文字不能为空'),
})

const createScaleSchema = z.object({
  code: z.string().min(1, '量表编码不能为空'),
  name: z.string().min(1, '量表名称不能为空'),
  description: z.string().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  config: z.object({
    points: z.number().int().min(2).max(10).optional(),
    labels: z.array(labelSchema).optional(),
    randomizeItems: z.boolean().optional(),
    randomizeOptions: z.boolean().optional(),
  }).optional(),
  estimatedTime: z.number().int().positive().optional(),
  instruction: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
})

const updateScaleSchema = z.object({
  name: z.string().min(1, '量表名称不能为空').optional(),
  description: z.string().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  config: z.object({
    points: z.number().int().min(2).max(10).optional(),
    labels: z.array(labelSchema).optional(),
    randomizeItems: z.boolean().optional(),
    randomizeOptions: z.boolean().optional(),
  }).optional(),
  estimatedTime: z.number().int().positive().optional(),
  instruction: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
})

// ==================== Controller ====================

export const scaleController = {
  // 获取量表列表（管理端）
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, status } = req.query
      const pagination = getPaginationParams(req)

      let where: any = {}

      // 按课程筛选
      if (courseId) {
        where.courseScales = { some: { courseId: courseId as string } }
      }

      // 按状态筛选
      if (status) {
        where.status = status as string
      }

      // 教师只能看到自己创建的量表
      if (userRole === UserRole.TEACHER) {
        where.creatorId = userId
      }

      // 并行查询量表列表和总数
      const [scales, total] = await Promise.all([
        prisma.scale.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                nickname: true,
              }
            },
            courseScales: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                  }
                }
              }
            },
            _count: {
              select: {
                items: true,
                dimensions: true,
                assessments: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.scale.count({ where }),
      ])

      const result = buildPaginatedResult(scales, total, pagination)
      return success(res, result)
    } catch (err) {
      logger.error('获取量表列表错误', err)
      return error(res, '获取量表列表失败')
    }
  },

  // 创建量表
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createScaleSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { code, name, description, visibility, estimatedTime, instruction } = result.data
      const config = normalizeScaleConfig(result.data.config)

      // 检查编码是否已存在
      const existingScale = await prisma.scale.findUnique({
        where: { code }
      })

      if (existingScale) {
        return error(res, '量表编码已存在')
      }

      const scale = await prisma.scale.create({
        data: {
          code,
          name,
          description,
          visibility: visibility || 'HIDDEN',
          config: config as any,
          estimatedTime,
          instruction,
          creatorId: userId,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            }
          },
          courseScales: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                }
              }
            }
          }
        }
      })

      return success(res, scale, '量表创建成功')
    } catch (err) {
      logger.error('创建量表错误', err)
      return error(res, '创建量表失败')
    }
  },

  // 获取量表详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const scale = await prisma.scale.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            }
          },
          courseScales: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                }
              }
            }
          },
          items: {
            orderBy: {
              sortOrder: 'asc'
            }
          },
          dimensions: true,
          _count: {
            select: {
              assessments: true,
            }
          }
        }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      return success(res, scale)
    } catch (err) {
      logger.error('获取量表详情错误', err)
      return error(res, '获取量表详情失败')
    }
  },

  // 更新量表
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateScaleSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const scale = await prisma.scale.findUnique({
        where: { id }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 权限检查：只有创建者和管理员可以修改
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      // 已发布的量表不能修改核心配置
      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      const payload = {
        ...result.data,
        config: result.data.config ? normalizeScaleConfig(result.data.config) : undefined,
      }

      const updated = await prisma.scale.update({
        where: { id },
        data: payload,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            }
          },
          courseScales: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                }
              }
            }
          }
        }
      })

      return success(res, updated, '量表更新成功')
    } catch (err) {
      logger.error('更新量表错误', err)
      return error(res, '更新量表失败')
    }
  },

  // 删除量表
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const scale = await prisma.scale.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              assessments: true,
            }
          }
        }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 权限检查
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此量表')
      }

      // 检查是否有关联的测评记录
      if (scale._count.assessments > 0) {
        return error(res, '该量表已有测评记录，无法删除')
      }

      await prisma.scale.delete({
        where: { id }
      })

      return success(res, null, '量表已删除')
    } catch (err) {
      logger.error('删除量表错误', err)
      return error(res, '删除量表失败')
    }
  },

  // 发布量表
  async publish(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const scale = await prisma.scale.findUnique({
        where: { id },
        include: {
          items: true,
          dimensions: true,
        }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 权限检查
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限发布此量表')
      }

      // 发布前验证
      if (scale.items.length === 0) {
        return error(res, '量表必须包含至少一个题目')
      }

      if (scale.dimensions.length === 0) {
        return error(res, '量表必须包含至少一个维度')
      }

      const normalized = normalizeScaleConfig(scale.config as { points?: number; labels?: Array<{ value: number; label: string }> } | null)
      const labelsError = scaleLabelsError(normalized.points, scale.config ? (scale.config as { labels?: Array<{ value: number; label: string }> }).labels : null)
      if (labelsError) {
        return error(res, labelsError + '。请在编辑页为 1 到 ' + normalized.points + ' 每一档填写文字后再发布')
      }

      const updated = await prisma.scale.update({
        where: { id },
        data: { status: 'PUBLISHED', config: normalized }
      })

      return success(res, updated, '量表发布成功')
    } catch (err) {
      logger.error('发布量表错误', err)
      return error(res, '发布量表失败')
    }
  },

  // 废弃量表
  async deprecate(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const scale = await prisma.scale.findUnique({
        where: { id }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 权限检查
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限废弃此量表')
      }

      const updated = await prisma.scale.update({
        where: { id },
        data: { status: 'DEPRECATED' }
      })

      return success(res, updated, '量表已废弃')
    } catch (err) {
      logger.error('废弃量表错误', err)
      return error(res, '废弃量表失败')
    }
  },

  // 归档量表
  async archive(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const scale = await prisma.scale.findUnique({
        where: { id }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 权限检查
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限归档此量表')
      }

      const updated = await prisma.scale.update({
        where: { id },
        data: { status: 'ARCHIVED' }
      })

      return success(res, updated, '量表已归档')
    } catch (err) {
      logger.error('归档量表错误', err)
      return error(res, '归档量表失败')
    }
  },

  // 获取学生可用的量表列表
  async available(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      // 可见性规则：
      // 1. PUBLIC：全体可见
      // 2. COURSE：关联课程后，该课程学生可见
      // 3. HIDDEN：未关联不可见

      let where: any = {
        status: 'PUBLISHED'
      }

      if (userRole === UserRole.STUDENT) {
        // 获取学生所在的所有课程ID
        const courseStudents = await prisma.courseStudent.findMany({
          where: {
            studentId: userId,
            status: { in: ['ACTIVE', 'APPROVED'] }
          },
          select: { courseId: true }
        })
        const courseIds = courseStudents.map(cs => cs.courseId)

        // 学生可见条件：
        // 1. visibility = PUBLIC（全体可见）
        // 2. visibility = COURSE 且关联到学生所在课程
        where.OR = [
          { visibility: 'PUBLIC' },
          {
            visibility: 'COURSE',
            courseScales: { some: { courseId: { in: courseIds } } }
          }
        ]
      }

      const scales = await prisma.scale.findMany({
        where,
        include: {
          courseScales: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                }
              }
            }
          },
          _count: {
            select: {
              items: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 优化：批量查询所有已完成的测评（消除 N+1 查询）
      const completedAssessments = await prisma.assessment.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          scaleId: { in: scales.map(s => s.id) }
        },
        select: { id: true, scaleId: true, completedAt: true }
      })

      const completedMap = new Map(
        completedAssessments.map(a => [a.scaleId, { id: a.id, completedAt: a.completedAt }])
      )

      const scalesWithStatus = scales.map(scale => ({
        id: scale.id,
        code: scale.code,
        name: scale.name,
        description: scale.description,
        visibility: scale.visibility,
        estimatedTime: scale.estimatedTime,
        courses: scale.courseScales.map(cs => cs.course),
        itemCount: scale._count.items,
        completed: completedMap.has(scale.id),
        completedAt: completedMap.get(scale.id)?.completedAt || null,
        assessmentId: completedMap.get(scale.id)?.id || null,
      }))

      return success(res, {
        list: scalesWithStatus,
        total: scalesWithStatus.length,
      })
    } catch (err) {
      logger.error('获取可用量表列表错误', err)
      return error(res, '获取可用量表列表失败')
    }
  },

  // ==================== 维度管理 ====================

  // 获取维度列表
  async listDimensions(req: Request, res: Response) {
    try {
      const { scaleId } = req.params

      const dimensions = await prisma.dimension.findMany({
        where: { scaleId },
        include: {
          _count: {
            select: {
              itemDimensions: true,
            }
          }
        },
        orderBy: {
          code: 'asc'
        }
      })

      return success(res, {
        list: dimensions,
        total: dimensions.length,
      })
    } catch (err) {
      logger.error('获取维度列表错误', err)
      return error(res, '获取维度列表失败')
    }
  },

  // 创建维度
  async createDimension(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params

      const { code, name, description, scoringMethod, weight, minScore, maxScore } = req.body

      if (!code || !name) {
        return error(res, '维度编码和名称不能为空')
      }

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      // 检查编码是否已存在
      const existingDimension = await prisma.dimension.findFirst({
        where: {
          scaleId,
          code
        }
      })

      if (existingDimension) {
        return error(res, '维度编码已存在')
      }

      const dimension = await prisma.dimension.create({
        data: {
          scaleId,
          code,
          name,
          description,
          scoringMethod: scoringMethod || 'sum',
          weight: weight || 1.0,
          minScore: minScore !== undefined ? minScore : null,
          maxScore: maxScore !== undefined ? maxScore : null,
        }
      })

      return success(res, dimension, '维度创建成功')
    } catch (err) {
      logger.error('创建维度错误', err)
      return error(res, '创建维度失败')
    }
  },

  // 更新维度
  async updateDimension(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, dimensionId } = req.params

      const { name, description, scoringMethod, weight, minScore, maxScore } = req.body

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      const dimension = await prisma.dimension.findUnique({
        where: { id: dimensionId }
      })

      if (!dimension || dimension.scaleId !== scaleId) {
        return notFound(res, '维度不存在')
      }

      const updateData: any = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (scoringMethod !== undefined) updateData.scoringMethod = scoringMethod
      if (weight !== undefined) updateData.weight = weight
      if (minScore !== undefined) updateData.minScore = minScore
      if (maxScore !== undefined) updateData.maxScore = maxScore

      const updated = await prisma.dimension.update({
        where: { id: dimensionId },
        data: updateData
      })

      return success(res, updated, '维度更新成功')
    } catch (err) {
      logger.error('更新维度错误', err)
      return error(res, '更新维度失败')
    }
  },

  // 删除维度
  async deleteDimension(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, dimensionId } = req.params

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      await prisma.dimension.delete({
        where: { id: dimensionId }
      })

      return success(res, null, '维度已删除')
    } catch (err) {
      logger.error('删除维度错误', err)
      return error(res, '删除维度失败')
    }
  },

  // ==================== 题目管理 ====================

  // 获取题目列表
  async listItems(req: Request, res: Response) {
    try {
      const { scaleId } = req.params

      const items = await prisma.scaleItem.findMany({
        where: { scaleId },
        include: {
          itemDimensions: {
            include: {
              dimension: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                }
              }
            }
          }
        },
        orderBy: {
          sortOrder: 'asc'
        }
      })

      return success(res, {
        list: items,
        total: items.length,
      })
    } catch (err) {
      logger.error('获取题目列表错误', err)
      return error(res, '获取题目列表失败')
    }
  },

  // 创建题目
  async createItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params

      const { itemCode, content, type, reverse, required, weight, sortOrder, options, randomizeOptions, dimensions } = req.body

      if (!content) {
        return error(res, '题目内容不能为空')
      }

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      // 获取当前最大排序号
      const maxSortOrder = await prisma.scaleItem.aggregate({
        where: { scaleId },
        _max: { sortOrder: true }
      })

      const item = await prisma.scaleItem.create({
        data: {
          scaleId,
          itemCode: itemCode || `Q${(maxSortOrder._max.sortOrder || 0) + 1}`,
          content,
          type: type || 'single',
          reverse: reverse || false,
          required: required !== false,
          weight: weight || 1.0,
          sortOrder: sortOrder || (maxSortOrder._max.sortOrder || 0) + 1,
          options: options as any,
          randomizeOptions: randomizeOptions || false,
        },
        include: {
          itemDimensions: {
            include: {
              dimension: true
            }
          }
        }
      })

      // 如果提供了维度关联，创建关联
      if (dimensions && Array.isArray(dimensions) && dimensions.length > 0) {
        await prisma.itemDimension.createMany({
          data: dimensions.map((dim: any) => ({
            itemId: item.id,
            dimensionId: dim.dimensionId,
            weight: dim.weight || 1.0,
            reverse: dim.reverse || false,
          }))
        })
      }

      return success(res, item, '题目创建成功')
    } catch (err) {
      logger.error('创建题目错误', err)
      return error(res, '创建题目失败')
    }
  },

  // 更新题目
  async updateItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, itemId } = req.params

      const { itemCode, content, type, reverse, required, weight, sortOrder, options, randomizeOptions, dimensions } = req.body

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      const item = await prisma.scaleItem.findUnique({
        where: { id: itemId }
      })

      if (!item || item.scaleId !== scaleId) {
        return notFound(res, '题目不存在')
      }

      const updated = await prisma.scaleItem.update({
        where: { id: itemId },
        data: {
          itemCode,
          content,
          type,
          reverse,
          required,
          weight,
          sortOrder,
          options: options as any,
          randomizeOptions,
        },
        include: {
          itemDimensions: {
            include: {
              dimension: true
            }
          }
        }
      })

      // 更新维度关联
      if (dimensions !== undefined) {
        // 删除旧的关联
        await prisma.itemDimension.deleteMany({
          where: { itemId }
        })

        // 创建新的关联
        if (Array.isArray(dimensions) && dimensions.length > 0) {
          await prisma.itemDimension.createMany({
            data: dimensions.map((dim: any) => ({
              itemId,
              dimensionId: dim.dimensionId,
              weight: dim.weight || 1.0,
              reverse: dim.reverse || false,
            }))
          })
        }
      }

      return success(res, updated, '题目更新成功')
    } catch (err) {
      logger.error('更新题目错误', err)
      return error(res, '更新题目失败')
    }
  },

  // 删除题目
  async deleteItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, itemId } = req.params

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      await prisma.scaleItem.delete({
        where: { id: itemId }
      })

      return success(res, null, '题目已删除')
    } catch (err) {
      logger.error('删除题目错误', err)
      return error(res, '删除题目失败')
    }
  },

  // 批量排序题目
  async reorderItems(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params

      const { items } = req.body // items: [{ id, sortOrder }, ...]

      if (!items || !Array.isArray(items)) {
        return error(res, '请提供题目排序数据')
      }

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      // 批量更新排序
      await prisma.$transaction(
        items.map((item: any) =>
          prisma.scaleItem.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder }
          })
        )
      )

      return success(res, null, '题目排序更新成功')
    } catch (err) {
      logger.error('题目排序错误', err)
      return error(res, '题目排序失败')
    }
  },

  // ==================== 测评流程 ====================

  // 开始测评
  async startAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { scaleId } = req.params

      // 检查量表是否存在且已发布
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          },
          dimensions: true,
        }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.status !== 'PUBLISHED') {
        return error(res, '量表未发布')
      }

      // 检查是否有进行中的测评
      const existingAssessment = await prisma.assessment.findFirst({
        where: {
          scaleId,
          userId,
          status: 'IN_PROGRESS'
        }
      })

      if (existingAssessment) {
        // 返回已有测评和量表信息
        return success(res, {
          assessment: existingAssessment,
          scale: {
            id: scale.id,
            name: scale.name,
            instruction: scale.instruction,
            estimatedTime: scale.estimatedTime,
            config: scale.config,
            items: scale.items,
            dimensions: scale.dimensions,
          }
        }, '继续未完成的测评')
      }

      // 创建新的测评记录
      const assessment = await prisma.assessment.create({
        data: {
          scaleId,
          userId: userId!,
          status: 'IN_PROGRESS',
          progress: 0,
          answers: [],
          startedAt: new Date(),
        }
      })

      return success(res, {
        assessment,
        scale: {
          id: scale.id,
          name: scale.name,
          instruction: scale.instruction,
          estimatedTime: scale.estimatedTime,
          config: scale.config,
          items: scale.items,
          dimensions: scale.dimensions,
        }
      }, '测评已开始')
    } catch (err) {
      logger.error('开始测评错误', err)
      return error(res, '开始测评失败')
    }
  },

  // 提交答案
  async submitAnswer(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const { itemId, value, responseTime } = req.body

      // 获取测评记录
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          scale: {
            include: {
              items: true,
            }
          }
        }
      })

      if (!assessment) {
        return notFound(res, '测评记录不存在')
      }

      if (assessment.userId !== userId) {
        return forbidden(res, '无权限操作此测评')
      }

      if (assessment.status !== 'IN_PROGRESS') {
        return error(res, '测评已结束')
      }

      // 验证题目是否存在
      const item = assessment.scale.items.find(i => i.id === itemId)
      if (!item) {
        return error(res, '题目不存在')
      }

      const scaleConfig = assessment.scale.config as { points?: number } | null
      const points = Number(scaleConfig?.points ?? 5)
      if (!Number.isInteger(value) || value < 1 || value > points) {
        return error(res, '答案超出量表点数范围')
      }

      // 更新答案
      const answers = (assessment.answers as any[]) || []
      const existingIndex = answers.findIndex(a => a.itemId === itemId)

      if (existingIndex >= 0) {
        // 更新已有答案
        answers[existingIndex] = {
          ...answers[existingIndex],
          value,
          answeredAt: new Date().toISOString(),
          changeCount: (answers[existingIndex].changeCount || 0) + 1,
          responseTime,
        }
      } else {
        // 添加新答案
        answers.push({
          itemId,
          value,
          answeredAt: new Date().toISOString(),
          firstAnsweredAt: new Date().toISOString(),
          changeCount: 0,
          responseTime,
        })
      }

      // 计算进度
      const totalItems = assessment.scale.items.length
      const progress = Math.round((answers.length / totalItems) * 100)

      // 保存
      const updated = await prisma.assessment.update({
        where: { id: assessmentId },
        data: {
          answers: answers as any,
          progress,
        }
      })

      return success(res, updated, '答案已保存')
    } catch (err) {
      logger.error('提交答案错误', err)
      return error(res, '提交答案失败')
    }
  },

  // 完成测评
  async completeAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params

      // 获取测评记录
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          scale: {
            include: {
              items: {
                include: {
                  itemDimensions: {
                    include: {
                      dimension: true
                    }
                  }
                }
              },
              dimensions: true,
            }
          }
        }
      })

      if (!assessment) {
        return notFound(res, '测评记录不存在')
      }

      if (assessment.userId !== userId) {
        return forbidden(res, '无权限操作此测评')
      }

      if (assessment.status === 'COMPLETED') {
        // 解密已完成的测评数据
        const decryptedAssessment = {
          ...assessment,
          answers: safeDecrypt<any[]>(assessment.answers as string) || assessment.answers,
          scores: safeDecrypt<any[]>(assessment.scores as string) || assessment.scores,
          feedback: safeDecrypt<any>(assessment.feedback as string) || assessment.feedback,
        }
        return success(res, decryptedAssessment, '测评已完成')
      }

      // 计算分数
      const { calculateScores, generateFeedbackWithLevels } = await import('../services/scoringService')
      
      // 解密已有的答案数据（支持渐进式迁移）
      const answers = safeDecrypt<any[]>(assessment.answers as string) || assessment.answers as any[]
      
      const scores = calculateScores(
        answers,
        assessment.scale.items,
        assessment.scale.dimensions,
        assessment.scale.config as any
      )

      // 生成反馈（使用自定义等级配置）
      const feedback = generateFeedbackWithLevels(
        scores, 
        assessment.scale.dimensions,
        assessment.scale.name
      )

      // 计算总时间
      const totalTime = Date.now() - new Date(assessment.startedAt).getTime()

      // 加密敏感数据后存储
      const encryptedAnswers = encryptField(answers)
      const encryptedScores = encryptField(scores)
      const encryptedFeedback = encryptField(feedback)

      // 更新测评记录
      const updated = await prisma.assessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          answers: encryptedAnswers as any,
          scores: encryptedScores as any,
          feedback: encryptedFeedback as any,
          completedAt: new Date(),
          totalTime,
          progress: 100,
        }
      })

      // 返回解密后的数据给客户端
      return success(res, {
        ...updated,
        answers,
        scores,
        feedback,
      }, '测评已完成')
    } catch (err) {
      logger.error('完成测评错误', err)
      return error(res, '完成测评失败')
    }
  },

  // 获取测评结果
  async getAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params

      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              config: true,
            }
          }
        }
      })

      if (!assessment) {
        return notFound(res, '测评记录不存在')
      }

      if (assessment.userId !== userId) {
        return forbidden(res, '无权限查看此测评')
      }

      // 解密敏感数据
      const decryptedAssessment = {
        ...assessment,
        answers: safeDecrypt<any[]>(assessment.answers as string) || assessment.answers,
        scores: safeDecrypt<any[]>(assessment.scores as string) || assessment.scores,
        feedback: safeDecrypt<any>(assessment.feedback as string) || assessment.feedback,
      }

      return success(res, decryptedAssessment)
    } catch (err) {
      logger.error('获取测评结果错误', err)
      return error(res, '获取测评结果失败')
    }
  },

  // 获取用户的测评历史
  async listMyAssessments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId

      const assessments = await prisma.assessment.findMany({
        where: { userId },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
            }
          }
        },
        orderBy: {
          startedAt: 'desc'
        }
      })

      return success(res, {
        list: assessments,
        total: assessments.length,
      })
    } catch (err) {
      logger.error('获取测评历史错误', err)
      return error(res, '获取测评历史失败')
    }
  },

  // 获取量表的所有测评记录（教师/管理员）
  async listScaleAssessments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此量表的测评记录')
      }

      const assessments = await prisma.assessment.findMany({
        where: { scaleId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
            }
          }
        },
        orderBy: {
          startedAt: 'desc'
        }
      })

      return success(res, {
        list: assessments,
        total: assessments.length,
      })
    } catch (err) {
      logger.error('获取量表测评记录错误', err)
      return error(res, '获取量表测评记录失败')
    }
  },

  // ==================== 课程关联管理 ====================

  // 获取量表关联的课程列表
  async listCourseScales(req: Request, res: Response) {
    try {
      const { scaleId } = req.params

      const courseScales = await prisma.courseScale.findMany({
        where: { scaleId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
              status: true,
            }
          }
        }
      })

      return success(res, {
        list: courseScales.map(cs => cs.course),
        total: courseScales.length,
      })
    } catch (err) {
      logger.error('获取关联课程错误', err)
      return error(res, '获取关联课程失败')
    }
  },

  // 添加课程关联
  async addCourseScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params
      const { courseIds } = req.body

      if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
        return error(res, '请选择要关联的课程')
      }

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      // 检查课程是否存在
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } }
      })

      if (courses.length !== courseIds.length) {
        return error(res, '部分课程不存在')
      }

      // 批量创建关联（忽略已存在的）
      const created = await prisma.courseScale.createMany({
        data: courseIds.map(courseId => ({
          scaleId,
          courseId
        })),
        skipDuplicates: true
      })

      return success(res, { added: created.count }, '课程关联成功')
    } catch (err) {
      logger.error('添加课程关联错误', err)
      return error(res, '添加课程关联失败')
    }
  },

  // 删除课程关联
  async removeCourseScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, courseId } = req.params

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      await prisma.courseScale.delete({
        where: {
          courseId_scaleId: {
            courseId,
            scaleId
          }
        }
      })

      return success(res, null, '取消关联成功')
    } catch (err) {
      logger.error('删除课程关联错误', err)
      return error(res, '删除课程关联失败')
    }
  },

  // 获取维度反馈配置
  async getDimensionFeedback(req: Request, res: Response) {
    try {
      const { scaleId, dimensionId } = req.params

      const dimension = await prisma.dimension.findFirst({
        where: {
          id: dimensionId,
          scaleId
        },
        include: {
          _count: {
            select: {
              itemDimensions: true
            }
          }
        }
      })

      if (!dimension) {
        return notFound(res, '维度不存在')
      }

      // 获取量表配置
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        select: { config: true }
      })

      const points = (scale?.config as any)?.points || 5
      const itemCount = dimension._count.itemDimensions

      // 计算分数范围
      const minScore = itemCount * 1
      const maxScore = itemCount * points

      return success(res, {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        scoringMethod: dimension.scoringMethod,
        itemCount,
        scoreRange: { min: minScore, max: maxScore },
        levelFeedback: dimension.levelFeedback || { levels: [] }
      })
    } catch (err) {
      logger.error('获取维度反馈配置错误', err)
      return error(res, '获取维度反馈配置失败')
    }
  },

  // 更新维度反馈配置
  async updateDimensionFeedback(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId, dimensionId } = req.params
      const { levelFeedback } = req.body

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }
      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改')
      }

      // 检查维度是否存在
      const dimension = await prisma.dimension.findFirst({
        where: {
          id: dimensionId,
          scaleId
        }
      })

      if (!dimension) {
        return notFound(res, '维度不存在')
      }

      // 验证等级配置
      if (levelFeedback?.levels && Array.isArray(levelFeedback.levels)) {
        const levels = levelFeedback.levels
        
        // 检查必填字段
        for (const level of levels) {
          if (!level.name?.trim()) {
            return error(res, '等级名称不能为空')
          }
          if (level.min === undefined || level.max === undefined) {
            return error(res, '分数区间不能为空')
          }
          if (level.min > level.max) {
            return error(res, `等级 "${level.name}" 分数下限不能大于上限`)
          }
          if (!level.interpretation?.trim()) {
            return error(res, `等级 "${level.name}" 解读文本不能为空`)
          }
        }

        // 检查区间重叠
        const sorted = [...levels].sort((a: any, b: any) => a.min - b.min)
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i] as any).min <= (sorted[i-1] as any).max) {
            return error(res, `等级 "${(sorted[i-1] as any).name}" 和 "${(sorted[i] as any).name}" 分数区间重叠`)
          }
        }
      }

      const updated = await prisma.dimension.update({
        where: { id: dimensionId },
        data: {
          levelFeedback: levelFeedback || { levels: [] }
        }
      })

      return success(res, updated, '维度反馈配置更新成功')
    } catch (err) {
      logger.error('更新维度反馈配置错误', err)
      return error(res, '更新维度反馈配置失败')
    }
  },

  // 导出量表数据
  async exportScaleData(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params
      const {
        anonymize: requestAnonymize = true,
        includeProgress = false,
        minProgress = 100,
        dateRange,
        format = 'csv'  // 'csv' | 'sav' | 'spss'
      } = req.body

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        select: { id: true, name: true, creatorId: true }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出此量表数据')
      }

      // 权限控制：教师必须脱敏，只有管理员可以导出非脱敏数据
      const anonymize = userRole === UserRole.ADMIN ? requestAnonymize : true

      // 动态导入导出服务
      const { exportService } = await import('../services/exportService')

      // 获取导出数据预览
      const exportData = await exportService.getScaleExportData(scaleId, {
        anonymize,
        includeProgress,
        minProgress,
        dateRange
      })

      // 保存导出文件
      const files = await exportService.saveExportFiles(scaleId, {
        anonymize,
        includeProgress,
        minProgress,
        dateRange
      }, format as 'csv' | 'sav' | 'spss')

      logger.info(`量表数据导出成功: ${scale.name}, 记录数: ${exportData.rows.length}, 格式: ${format}, 脱敏: ${anonymize}`)

      const result: any = {
        recordCount: exportData.rows.length,
        fieldCount: exportData.fields.length,
        fields: exportData.fields.map(f => ({
          name: f.name,
          label: f.label,
          type: f.type
        })),
        format,
        anonymize  // 返回实际使用的脱敏状态
      }

      // 根据格式返回文件路径
      if (files.csvPath) {
        result.fileName = path.basename(files.csvPath)
        result.csvPath = files.csvPath
      }
      if (files.savPath) {
        result.fileName = path.basename(files.savPath)
        result.savPath = files.savPath
      }
      if (files.spsPath) {
        result.spsPath = files.spsPath
      }

      return success(res, result, '导出成功')
    } catch (err) {
      logger.error('导出量表数据错误', err)
      return error(res, '导出量表数据失败: ' + (err as Error).message)
    }
  },

  // 获取导出预览
  async getExportPreview(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { scaleId } = req.params

      // 检查量表是否存在和权限
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        include: {
          items: { orderBy: { sortOrder: 'asc' }, take: 5 },
          dimensions: true,
          _count: {
            select: {
              items: true,
              assessments: { where: { status: 'COMPLETED' } }
            }
          }
        }
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此量表')
      }

      // 动态导入导出服务
      const { exportService } = await import('../services/exportService')

      // 获取字段预览
      const previewData = await exportService.getScaleExportData(scaleId, {
        anonymize: true,
        minProgress: 100
      })

      // 只返回前5行数据
      const sampleRows = previewData.rows.slice(0, 5)

      return success(res, {
        scaleName: scale.name,
        totalRecords: previewData.rows.length,
        completedCount: scale._count.assessments,
        itemCount: scale._count.items,
        dimensionCount: scale.dimensions.length,
        fields: previewData.fields,
        sampleData: sampleRows
      })
    } catch (err) {
      logger.error('获取导出预览错误', err)
      return error(res, '获取导出预览失败')
    }
  },

  // 下载导出文件
  async downloadExportFile(req: Request, res: Response) {
    try {
      const { fileName } = req.params
      // 使用 __dirname 确保路径正确
      const exportDir = path.join(__dirname, '../../exports')
      const filePath = path.join(exportDir, fileName)

      logger.info(`下载导出文件: ${filePath}`)

      if (!fs.existsSync(filePath)) {
        logger.error(`文件不存在: ${filePath}`)
        return notFound(res, '文件不存在')
      }

      return res.download(filePath)
    } catch (err) {
      logger.error('下载导出文件错误', err)
      return error(res, '下载文件失败')
    }
  },

  // 获取所有量表标签（去重）
  async getTags(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      let where: any = {}

      // 教师只能看自己创建的量表标签
      if (userRole === UserRole.TEACHER) {
        where.creatorId = userId
      }

      const scales = await prisma.scale.findMany({
        where,
        select: { tags: true }
      })

      const allTags = [...new Set(scales.flatMap(s => s.tags))]

      return success(res, { tags: allTags })
    } catch (err) {
      logger.error('获取量表标签错误', err)
      return error(res, '获取量表标签失败')
    }
  }
}
