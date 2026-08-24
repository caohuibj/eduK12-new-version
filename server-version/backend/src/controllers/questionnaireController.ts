import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { canUseScale } from '../services/materialGrant'
import { logger } from '../utils/logger'
import { safeDecrypt } from '../utils/encryption'
import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs'
import { buildFormBackgroundReport, buildScaleUnitReport } from '../modules/reporting/scale-unit-report'

/**
 * Build the collection-only questionnaire envelope.  The legacy JSON column
 * is accepted as an input for old records, but only its individual scale
 * reports are projected into the current response.
 */
function buildQuestionnaireCollectionReport(qa: any): any {
  const questionnaireScales = [...(qa.questionnaire?.questionnaireScales || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const assessments = Array.isArray(qa.scaleAssessments) ? qa.scaleAssessments : []
  const storedScaleReports = Array.isArray(qa.aggregateReport?.scaleReports)
    ? qa.aggregateReport.scaleReports
    : []
  const seen = new Set<string>()
  const unitReports = [
    ...questionnaireScales.map((questionnaireScale: any) => {
      const scaleId = questionnaireScale.scaleId
      seen.add(scaleId)
      const assessment = assessments.find((candidate: any) => candidate.scaleId === scaleId)
      const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === scaleId)
      const scale = questionnaireScale.scale || assessment?.scale
      return buildScaleUnitReport({
        itemId: questionnaireScale.id || scaleId,
        scaleId,
        scaleCode: scale?.code,
        scaleName: scale?.name || stored?.scaleName || '未知量表',
        scores: stored?.dimensionScores ?? assessment?.scores,
        feedback: stored?.feedback ?? assessment?.feedback,
        dimensions: scale?.dimensions,
        completedAt: assessment?.completedAt ?? stored?.completedAt,
        totalTime: assessment?.totalTime ?? stored?.totalTime,
      })
    }),
    ...assessments
      .filter((assessment: any) => !seen.has(assessment.scaleId))
      .map((assessment: any) => {
        const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === assessment.scaleId)
        return buildScaleUnitReport({
          itemId: assessment.id,
          scaleId: assessment.scaleId,
          scaleCode: assessment.scale?.code,
          scaleName: assessment.scale?.name || stored?.scaleName || '未知量表',
          scores: stored?.dimensionScores ?? assessment.scores,
          feedback: stored?.feedback ?? assessment.feedback,
          dimensions: assessment.scale?.dimensions,
          completedAt: assessment.completedAt ?? stored?.completedAt,
          totalTime: assessment.totalTime ?? stored?.totalTime,
        })
      }),
    ...storedScaleReports
      .filter((stored: any) => !seen.has(stored.scaleId) && !assessments.some((assessment: any) => assessment.scaleId === stored.scaleId))
      .map((stored: any) => buildScaleUnitReport({
        itemId: stored.scaleId,
        scaleId: stored.scaleId,
        scaleName: stored.scaleName || '未知量表',
        scores: stored.dimensionScores,
        feedback: stored.feedback,
        completedAt: stored.completedAt,
        totalTime: stored.totalTime,
      })),
  ]

  const formItems = [...(qa.questionnaire?.formItems || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const formAnswers = new Map((qa.formAnswers || []).map((answer: any) => [answer.formItemId, answer.value]))
  const backgroundValues = formItems.map((item: any) => buildFormBackgroundReport({
    itemId: item.id,
    label: item.label,
    value: formAnswers.has(item.id) ? String(formAnswers.get(item.id)) : null,
  }))
  const totalDimensions = unitReports.reduce((sum: number, report: any) => sum + report.dimensionScores.length, 0)

  return {
    questionnaireName: qa.questionnaire?.name || '问卷',
    totalDimensions,
    backgroundValues,
    unitReports,
  }
}

const collectionReportForStorage = (report: any) => ({
  reportDefinitionVersion: 'collection-only-v1',
  scaleReports: report.unitReports,
  totalDimensions: report.totalDimensions,
})

// ==================== Validation Schemas ====================

const createQuestionnaireSchema = z.object({
  code: z.string().min(1, '问卷编码不能为空'),
  name: z.string().min(1, '问卷名称不能为空'),
  description: z.string().nullable().optional(),
  instruction: z.string().nullable().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  estimatedTime: z.number().int().positive().nullable().optional(),
})

const updateQuestionnaireSchema = z.object({
  name: z.string().min(1, '问卷名称不能为空').optional(),
  description: z.string().nullable().optional(),
  instruction: z.string().nullable().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  estimatedTime: z.number().int().positive().nullable().optional(),
})

const addScaleSchema = z.object({
  scaleId: z.string().min(1, '量表ID不能为空'),
  position: z.number().int().optional(),
})

const reorderScalesSchema = z.object({
  scales: z.array(z.object({
    scaleId: z.string(),
    position: z.number().int(),
  })),
})

const addCourseSchema = z.object({
  courseIds: z.array(z.string()).min(1, '请选择要关联的课程'),
})

// ==================== Controller ====================

export const questionnaireController = {
  // ==================== 问卷管理 ====================

  // 获取问卷列表（管理端）
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { status, courseId } = req.query

      let where: any = {}

      // 按状态筛选
      if (status) {
        where.status = status as string
      }

      // 按课程筛选
      if (courseId) {
        where.courseQuestionnaires = { some: { courseId: courseId as string } }
      }

      // 教师只能看到自己创建的问卷
      if (userRole === UserRole.TEACHER) {
        where.creatorId = userId
      }

      const questionnaires = await prisma.questionnaire.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          questionnaireScales: {
            include: {
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  status: true,
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          courseQuestionnaires: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          _count: {
            select: {
              assessments: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      // 计算每个问卷的总题数（表单题目 + 量表题目）
      const questionnairesWithStats = await Promise.all(
        questionnaires.map(async (qn) => {
          const scaleIds = qn.questionnaireScales.map(qs => qs.scaleId)
          
          // 量表题目数量
          const scaleItemCount = await prisma.scaleItem.count({
            where: {
              scaleId: { in: scaleIds },
            },
          })
          
          // 表单题目数量
          const formItemCount = await prisma.questionnaireFormItem.count({
            where: {
              questionnaireId: qn.id,
            },
          })
          
          return {
            ...qn,
            scaleCount: qn.questionnaireScales.length,
            totalItems: formItemCount + scaleItemCount, // 总题目数 = 表单 + 量表
          }
        })
      )

      return success(res, {
        list: questionnairesWithStats,
        total: questionnairesWithStats.length,
      })
    } catch (err) {
      logger.error('获取问卷列表错误', err)
      return error(res, '获取问卷列表失败')
    }
  },

  // 创建问卷
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createQuestionnaireSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { code, name, description, instruction, visibility, estimatedTime } = result.data

      // 检查编码是否已存在
      const existingQuestionnaire = await prisma.questionnaire.findUnique({
        where: { code },
      })

      if (existingQuestionnaire) {
        return error(res, '问卷编码已存在')
      }

      const questionnaire = await prisma.questionnaire.create({
        data: {
          code,
          name,
          description,
          instruction,
          visibility: visibility || 'HIDDEN',
          estimatedTime,
          creatorId: userId,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      })

      return success(res, questionnaire, '问卷创建成功')
    } catch (err) {
      logger.error('创建问卷错误', err)
      return error(res, '创建问卷失败')
    }
  },

  // 获取问卷详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          questionnaireScales: {
            include: {
              scale: {
                include: {
                  _count: {
                    select: {
                      items: true,
                      dimensions: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          courseQuestionnaires: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  courseCode: true,
                },
              },
            },
          },
          _count: {
            select: {
              assessments: true,
            },
          },
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      return success(res, questionnaire)
    } catch (err) {
      logger.error('获取问卷详情错误', err)
      return error(res, '获取问卷详情失败')
    }
  },

  // 更新问卷
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateQuestionnaireSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      // 已发布的问卷不能修改核心配置
      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: result.data,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      })

      return success(res, updated, '问卷更新成功')
    } catch (err) {
      logger.error('更新问卷错误', err)
      return error(res, '更新问卷失败')
    }
  },

  // 删除问卷
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              assessments: true,
            },
          },
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此问卷')
      }

      // 检查是否有关联的测评记录
      if (questionnaire._count.assessments > 0) {
        return error(res, '该问卷已有测评记录，无法删除')
      }

      await prisma.questionnaire.delete({
        where: { id },
      })

      return success(res, null, '问卷已删除')
    } catch (err) {
      logger.error('删除问卷错误', err)
      return error(res, '删除问卷失败')
    }
  },

  // 发布问卷
  async publish(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          questionnaireScales: {
            include: {
              scale: true,
            },
          },
          formItems: true,
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限发布此问卷')
      }

      // 发布前验证：检查是否包含量表或表单题目
      const hasContent = questionnaire.questionnaireScales.length > 0 || questionnaire.formItems.length > 0
      if (!hasContent) {
        return error(res, '问卷必须包含至少一个量表或表单题目')
      }

      // 如果包含量表，检查所有量表是否已发布
      if (questionnaire.questionnaireScales.length > 0) {
        const unpublishedScales = questionnaire.questionnaireScales.filter(
          qs => qs.scale.status !== 'PUBLISHED'
        )
        if (unpublishedScales.length > 0) {
          return error(res, '问卷中的所有量表必须先发布')
        }
      }

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: { status: 'PUBLISHED' },
      })

      return success(res, updated, '问卷发布成功')
    } catch (err) {
      logger.error('发布问卷错误', err)
      return error(res, '发布问卷失败')
    }
  },

  // 废弃问卷
  async deprecate(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限废弃此问卷')
      }

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: { status: 'DEPRECATED' },
      })

      return success(res, updated, '问卷已废弃')
    } catch (err) {
      logger.error('废弃问卷错误', err)
      return error(res, '废弃问卷失败')
    }
  },

  // 复制问卷
  async duplicate(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      if (!userId) {
        return error(res, '未登录')
      }

      // 查询原问卷
      const original = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          formItems: true,
          questionnaireScales: true,
        },
      })

      if (!original) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (original.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限复制此问卷')
      }

      // 使用事务创建新问卷
      const newQuestionnaire = await prisma.$transaction(async (tx) => {
        // 创建问卷
        const questionnaire = await tx.questionnaire.create({
          data: {
            code: `${original.code}_copy_${Date.now()}`,
            name: `${original.name}（副本）`,
            description: original.description,
            instruction: original.instruction,
            visibility: 'HIDDEN',
            status: 'DRAFT',
            estimatedTime: original.estimatedTime,
            creatorId: userId,
          },
        })

        // 复制表单题目
        if (original.formItems.length > 0) {
          await tx.questionnaireFormItem.createMany({
            data: original.formItems.map((item) => ({
              questionnaireId: questionnaire.id,
              type: item.type,
              label: item.label,
              placeholder: item.placeholder,
              required: item.required,
              position: item.position,
              options: item.options as any,
            })),
          })
        }

        // 复制量表关联
        if (original.questionnaireScales.length > 0) {
          await tx.questionnaireScale.createMany({
            data: original.questionnaireScales.map((qs) => ({
              questionnaireId: questionnaire.id,
              scaleId: qs.scaleId,
              position: qs.position,
            })),
          })
        }

        return questionnaire
      })

      logger.info('问卷复制成功', {
        originalId: id,
        newId: newQuestionnaire.id,
        userId,
      })

      return success(res, newQuestionnaire, '问卷复制成功')
    } catch (err: any) {
      logger.error('问卷复制错误', err)

      // 处理唯一性冲突
      if (err.code === 'P2002') {
        return error(res, '问卷编码重复，请稍后重试')
      }

      return error(res, '复制失败，请稍后重试')
    }
  },

  // ==================== 量表关联管理 ====================

  // 获取问卷关联的量表列表
  async listScales(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaireScales = await prisma.questionnaireScale.findMany({
        where: { questionnaireId: id },
        include: {
          scale: {
            include: {
              _count: {
                select: {
                  items: true,
                  dimensions: true,
                },
              },
            },
          },
        },
        orderBy: {
          position: 'asc',
        },
      })

      return success(res, {
        list: questionnaireScales,
        total: questionnaireScales.length,
      })
    } catch (err) {
      logger.error('获取关联量表列表错误', err)
      return error(res, '获取关联量表列表失败')
    }
  },

  // 添加量表到问卷
  async addScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = addScaleSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { scaleId, position } = result.data

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          questionnaireScales: true,
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // 检查量表是否存在
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (!userId || !userRole || !(await canUseScale(userId, userRole, scale))) {
        return forbidden(res, '无权限使用此量表')
      }

      // 检查是否已关联
      const existing = await prisma.questionnaireScale.findUnique({
        where: {
          questionnaireId_scaleId: {
            questionnaireId: id,
            scaleId,
          },
        },
      })

      if (existing) {
        return error(res, '该量表已关联到此问卷')
      }

      // 计算排序号
      const maxPosition = questionnaire.questionnaireScales.length > 0
        ? Math.max(...questionnaire.questionnaireScales.map(qs => qs.position))
        : -1

      const questionnaireScale = await prisma.questionnaireScale.create({
        data: {
          questionnaireId: id,
          scaleId,
          position: position !== undefined ? position : maxPosition + 1,
        },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })

      return success(res, questionnaireScale, '量表添加成功')
    } catch (err) {
      logger.error('添加量表错误', err)
      return error(res, '添加量表失败')
    }
  },

  // 移除量表
  async removeScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, scaleId } = req.params

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      await prisma.questionnaireScale.delete({
        where: {
          questionnaireId_scaleId: {
            questionnaireId: id,
            scaleId,
          },
        },
      })

      return success(res, null, '量表已移除')
    } catch (err) {
      logger.error('移除量表错误', err)
      return error(res, '移除量表失败')
    }
  },

  // 量表排序
  async reorderScales(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = reorderScalesSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { scales } = result.data

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // 批量更新排序
      await prisma.$transaction(
        scales.map((s) =>
          prisma.questionnaireScale.update({
            where: {
              questionnaireId_scaleId: {
                questionnaireId: id,
                scaleId: s.scaleId,
              },
            },
            data: { position: s.position },
          })
        )
      )

      return success(res, null, '量表排序更新成功')
    } catch (err) {
      logger.error('量表排序错误', err)
      return error(res, '量表排序失败')
    }
  },

  // ==================== 表单题目管理 ====================

  // 获取表单题目列表
  async listFormItems(req: Request, res: Response) {
    try {
      const { id } = req.params

      const formItems = await prisma.questionnaireFormItem.findMany({
        where: { questionnaireId: id },
        orderBy: { position: 'asc' },
      })

      return success(res, {
        list: formItems,
        total: formItems.length,
      })
    } catch (err) {
      logger.error('获取表单题目列表错误', err)
      return error(res, '获取表单题目列表失败')
    }
  },

  // 添加表单题目
  async addFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const addFormItemSchema = z.object({
        type: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input']),
        label: z.string().min(1, '题目标签不能为空'),
        placeholder: z.string().nullable().optional(),
        required: z.boolean().optional().default(true),
        position: z.number().int().optional(),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })).nullish(),
      })

      const result = addFormItemSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { type, label, placeholder, required, position, options } = result.data

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          formItems: true,
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // 计算排序位置
      const maxPosition = questionnaire.formItems.length > 0
        ? Math.max(...questionnaire.formItems.map(fi => fi.position))
        : -1

      const formItem = await prisma.questionnaireFormItem.create({
        data: {
          questionnaireId: id,
          type,
          label,
          placeholder: placeholder || null,
          required: required ?? true,
          position: position !== undefined ? position : maxPosition + 1,
          options: options ? JSON.parse(JSON.stringify(options)) : null,
        },
      })

      logger.info('添加表单题目', { questionnaireId: id, formItemId: formItem.id, userId })

      return success(res, formItem, '表单题目添加成功')
    } catch (err) {
      logger.error('添加表单题目错误', err)
      return error(res, '添加表单题目失败')
    }
  },

  // 更新表单题目
  async updateFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, itemId } = req.params

      const updateFormItemSchema = z.object({
        type: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input']).optional(),
        label: z.string().min(1, '题目标签不能为空').optional(),
        placeholder: z.string().nullable().optional(),
        required: z.boolean().optional(),
        position: z.number().int().optional(),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })).nullish(),
      })

      const result = updateFormItemSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      // 检查问卷是否存在和权限
      const formItem = await prisma.questionnaireFormItem.findUnique({
        where: { id: itemId },
        include: { questionnaire: true },
      })

      if (!formItem) {
        return notFound(res, '表单题目不存在')
      }

      if (formItem.questionnaireId !== id) {
        return error(res, '表单题目不属于此问卷')
      }

      if (formItem.questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // 处理 options 字段的 JSON 类型
      const updateData: any = { ...result.data }
      if (updateData.options !== undefined) {
        updateData.options = updateData.options ? JSON.parse(JSON.stringify(updateData.options)) : null
      }

      const updated = await prisma.questionnaireFormItem.update({
        where: { id: itemId },
        data: updateData,
      })

      logger.info('更新表单题目', { questionnaireId: id, formItemId: itemId, userId })

      return success(res, updated, '表单题目更新成功')
    } catch (err) {
      logger.error('更新表单题目错误', err)
      return error(res, '更新表单题目失败')
    }
  },

  // 删除表单题目
  async removeFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, itemId } = req.params

      // 检查问卷是否存在和权限
      const formItem = await prisma.questionnaireFormItem.findUnique({
        where: { id: itemId },
        include: { questionnaire: true },
      })

      if (!formItem) {
        return notFound(res, '表单题目不存在')
      }

      if (formItem.questionnaireId !== id) {
        return error(res, '表单题目不属于此问卷')
      }

      if (formItem.questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      await prisma.questionnaireFormItem.delete({
        where: { id: itemId },
      })

      logger.info('删除表单题目', { questionnaireId: id, formItemId: itemId, userId })

      return success(res, null, '表单题目删除成功')
    } catch (err) {
      logger.error('删除表单题目错误', err)
      return error(res, '删除表单题目失败')
    }
  },

  // 统一排序（表单题目和量表混合排序）
  async reorderContent(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const reorderSchema = z.object({
        items: z.array(z.object({
          type: z.enum(['form', 'scale']),
          id: z.string(),
          position: z.number().int(),
        })),
      })

      const result = reorderSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // 批量更新排序
      await prisma.$transaction(
        result.data.items.map((item) => {
          if (item.type === 'form') {
            return prisma.questionnaireFormItem.update({
              where: { id: item.id },
              data: { position: item.position },
            })
          } else {
            return prisma.questionnaireScale.update({
              where: { id: item.id },
              data: { position: item.position },
            })
          }
        })
      )

      logger.info('内容排序更新', { questionnaireId: id, userId })

      return success(res, null, '内容排序更新成功')
    } catch (err) {
      logger.error('内容排序错误', err)
      return error(res, '内容排序失败')
    }
  },

  // 保存表单答案
  async saveFormAnswer(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params

      const saveFormAnswerSchema = z.object({
        formItemId: z.string().min(1, '表单题目ID不能为空'),
        value: z.union([
          z.string(),              // 单选、填空：单个值
          z.array(z.string())      // 多选：数组
        ]),
      })

      const result = saveFormAnswerSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { formItemId, value } = result.data

      // 处理多选题答案格式：数组转JSON字符串
      const valueToStore = Array.isArray(value) 
        ? JSON.stringify(value)  // 多选：数组转字符串
        : value;                  // 单选、填空：直接存储

      // 检查问卷测评是否存在
      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { id: assessmentId },
        include: {
          questionnaire: {
            include: {
              formItems: true,
            },
          },
        },
      })

      if (!qa) {
        return notFound(res, '问卷测评不存在')
      }

      if (qa.userId !== userId) {
        return forbidden(res, '无权限操作此测评')
      }

      // 检查表单题目是否存在
      const formItem = qa.questionnaire.formItems.find(fi => fi.id === formItemId)
      if (!formItem) {
        return error(res, '表单题目不存在')
      }

      // 保存或更新表单答案
      const formAnswer = await prisma.questionnaireFormAnswer.upsert({
        where: {
          questionnaireAssessmentId_formItemId: {
            questionnaireAssessmentId: assessmentId,
            formItemId,
          },
        },
        create: {
          questionnaireAssessmentId: assessmentId,
          formItemId,
          value: valueToStore,
        },
        update: {
          value: valueToStore,
        },
      })

      logger.info('保存表单答案', { assessmentId, formItemId, userId })

      return success(res, formAnswer, '表单答案保存成功')
    } catch (err) {
      logger.error('保存表单答案错误', err)
      return error(res, '保存表单答案失败')
    }
  },

  // 批量保存表单答案
  async saveFormAnswers(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params

      const saveFormAnswersSchema = z.object({
        answers: z.array(z.object({
          formItemId: z.string(),
          value: z.string(),
        })),
      })

      const result = saveFormAnswersSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { answers } = result.data

      // 检查问卷测评是否存在
      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { id: assessmentId },
      })

      if (!qa) {
        return notFound(res, '问卷测评不存在')
      }

      if (qa.userId !== userId) {
        return forbidden(res, '无权限操作此测评')
      }

      // 批量保存表单答案
      await prisma.$transaction(
        answers.map(answer => {
          // 处理多选题答案格式：数组转JSON字符串
          const valueToStore = Array.isArray(answer.value) 
            ? JSON.stringify(answer.value)
            : answer.value;

          return prisma.questionnaireFormAnswer.upsert({
            where: {
              questionnaireAssessmentId_formItemId: {
                questionnaireAssessmentId: assessmentId,
                formItemId: answer.formItemId,
              },
            },
            create: {
              questionnaireAssessmentId: assessmentId,
              formItemId: answer.formItemId,
              value: valueToStore,
            },
            update: {
              value: valueToStore,
            },
          })
        })
      )

      logger.info('批量保存表单答案', { assessmentId, count: answers.length, userId })

      return success(res, { saved: answers.length }, '表单答案保存成功')
    } catch (err) {
      logger.error('批量保存表单答案错误', err)
      return error(res, '保存表单答案失败')
    }
  },

  // 获取问卷所有内容项（表单题目和量表混合列表）
  async listContent(req: Request, res: Response) {
    try {
      const { id } = req.params

      // 并行获取表单题目和量表
      const [formItems, scales] = await Promise.all([
        prisma.questionnaireFormItem.findMany({
          where: { questionnaireId: id },
          orderBy: { position: 'asc' },
        }),
        prisma.questionnaireScale.findMany({
          where: { questionnaireId: id },
          include: {
            scale: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                _count: {
                  select: { items: true },
                },
              },
            },
          },
          orderBy: { position: 'asc' },
        }),
      ])

      // 合并并排序
      const contents = [
        ...formItems.map((item) => ({
          type: 'form',
          id: item.id,
          position: item.position,
          data: item,
        })),
        ...scales.map((scale) => ({
          type: 'scale',
          id: scale.id,
          position: scale.position,
          data: scale,
        })),
      ].sort((a, b) => a.position - b.position)

      return success(res, {
        list: contents,
        total: contents.length,
      })
    } catch (err) {
      logger.error('获取问卷内容列表错误', err)
      return error(res, '获取问卷内容列表失败')
    }
  },

  // ==================== 课程关联管理 ====================

  // 获取问卷关联的课程列表
  async listCourses(req: Request, res: Response) {
    try {
      const { id } = req.params

      const courseQuestionnaires = await prisma.courseQuestionnaire.findMany({
        where: { questionnaireId: id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
              status: true,
            },
          },
        },
      })

      return success(res, {
        list: courseQuestionnaires.map(cq => cq.course),
        total: courseQuestionnaires.length,
      })
    } catch (err) {
      logger.error('获取关联课程列表错误', err)
      return error(res, '获取关联课程列表失败')
    }
  },

  // 添加课程关联
  async addCourses(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = addCourseSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { courseIds } = result.data

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      // 检查课程是否存在
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
      })

      if (courses.length !== courseIds.length) {
        return error(res, '部分课程不存在')
      }

      // 批量创建关联
      const created = await prisma.courseQuestionnaire.createMany({
        data: courseIds.map(courseId => ({
          questionnaireId: id,
          courseId,
        })),
        skipDuplicates: true,
      })

      // 如果问卷的 visibility 是 HIDDEN，自动改为 COURSE
      if (questionnaire.visibility === 'HIDDEN' && created.count > 0) {
        await prisma.questionnaire.update({
          where: { id },
          data: { visibility: 'COURSE' },
        })
        return success(res, { added: created.count, visibilityUpdated: true }, '课程关联成功，问卷可见性已自动更新为"关联课程后可见"')
      }

      return success(res, { added: created.count }, '课程关联成功')
    } catch (err) {
      logger.error('添加课程关联错误', err)
      return error(res, '添加课程关联失败')
    }
  },

  // 移除课程关联
  async removeCourse(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, courseId } = req.params

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此问卷')
      }

      await prisma.courseQuestionnaire.delete({
        where: {
          courseId_questionnaireId: {
            courseId,
            questionnaireId: id,
          },
        },
      })

      return success(res, null, '取消关联成功')
    } catch (err) {
      logger.error('移除课程关联错误', err)
      return error(res, '移除课程关联失败')
    }
  },

  // ==================== 学生端接口 ====================

  // 获取可用的问卷列表
  async available(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId } = req.query

      let where: any = {
        status: 'PUBLISHED',
      }

      if (userRole === UserRole.STUDENT) {
        // 获取学生所在的所有课程ID
        const courseStudents = await prisma.courseStudent.findMany({
          where: {
            studentId: userId,
            status: { in: ['ACTIVE', 'APPROVED'] },
          },
          select: { courseId: true },
        })
        const studentCourseIds = courseStudents.map(cs => cs.courseId)

        // 如果传入 courseId，验证学生是否在该课程中
        if (courseId) {
          if (!studentCourseIds.includes(courseId as string)) {
            // 学生不在该课程中，返回空列表
            return success(res, { list: [], total: 0 })
          }
          // 只返回该课程的问卷
          where.OR = [
            { visibility: 'PUBLIC' },
            {
              visibility: 'COURSE',
              courseQuestionnaires: { some: { courseId: courseId as string } },
            },
          ]
        } else {
          // 未传入 courseId，返回学生所有课程的问卷
          where.OR = [
            { visibility: 'PUBLIC' },
            {
              visibility: 'COURSE',
              courseQuestionnaires: { some: { courseId: { in: studentCourseIds } } },
            },
          ]
        }
      } else if (userRole === UserRole.TEACHER) {
        // 教师：
        // - 传入courseId时：只显示已关联到该课程的（课程详情页展示）
        // - 未传courseId时：显示自己创建的（问卷列表页）
        if (courseId) {
          where.courseQuestionnaires = { some: { courseId: courseId as string } }
        } else {
          where.creatorId = userId
        }
      } else if (userRole === UserRole.ADMIN) {
        // 管理员：
        // - 传入courseId时：按课程过滤
        // - 未传courseId时：显示所有
        if (courseId) {
          where.courseQuestionnaires = { some: { courseId: courseId as string } }
        }
      }

      const questionnaires = await prisma.questionnaire.findMany({
        where,
        include: {
          questionnaireScales: {
            include: {
              scale: {
                select: {
                  id: true,
                  name: true,
                  _count: {
                    select: { items: true },
                  },
                },
              },
            },
            orderBy: { position: 'asc' },
          },
          formItems: true,  // 添加表单题目查询
          courseQuestionnaires: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      // 获取所有问卷测评（包括进行中和已完成）
      const allAssessments = await prisma.questionnaireAssessment.findMany({
        where: {
          userId,
          questionnaireId: { in: questionnaires.map(q => q.id) },
        },
        select: { id: true, questionnaireId: true, status: true, completedAt: true },
      })

      // 建立映射：questionnaireId -> assessment
      const assessmentMap = new Map<string, { id: string; status: string; completedAt: Date | null }>()
      allAssessments.forEach(a => {
        const existing = assessmentMap.get(a.questionnaireId)
        // 优先保留已完成的，否则保留进行中的
        if (!existing || a.status === 'COMPLETED') {
          assessmentMap.set(a.questionnaireId, { id: a.id, status: a.status, completedAt: a.completedAt })
        }
      })

      // 计算总题数（表单题目 + 量表题目）
      const questionnairesWithStatus = questionnaires.map(qn => {
        // 量表题目数量
        const scaleItemCount = qn.questionnaireScales.reduce(
          (sum, qs) => sum + (qs.scale._count?.items || 0),
          0
        )
        
        // 表单题目数量
        const formItemCount = qn.formItems ? qn.formItems.length : 0
        
        // 总题目数 = 表单 + 量表
        const totalItems = formItemCount + scaleItemCount
        
        const assessment = assessmentMap.get(qn.id)
        return {
          id: qn.id,
          code: qn.code,
          name: qn.name,
          description: qn.description,
          instruction: qn.instruction,
          estimatedTime: qn.estimatedTime,
          scaleCount: qn.questionnaireScales.length,
          totalItems,
          courses: qn.courseQuestionnaires.map(cq => cq.course),
          completed: assessment?.status === 'COMPLETED',
          inProgress: assessment?.status === 'IN_PROGRESS',
          completedAt: assessment?.completedAt || null,
          assessmentId: assessment?.id || null,
        }
      })

      return success(res, {
        list: questionnairesWithStatus,
        total: questionnairesWithStatus.length,
      })
    } catch (err) {
      logger.error('获取可用问卷列表错误', err)
      return error(res, '获取可用问卷列表失败')
    }
  },

  // 开始/继续问卷测评
  async startAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      // 检查问卷是否存在且已发布
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          formItems: {
            orderBy: { position: 'asc' },
          },
          questionnaireScales: {
            include: {
              scale: {
                include: {
                  items: {
                    orderBy: { sortOrder: 'asc' },
                  },
                  dimensions: true,
                },
              },
            },
            orderBy: { position: 'asc' },
          },
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.status !== 'PUBLISHED') {
        return error(res, '问卷未发布')
      }

      // 合并表单题目和量表，按 position 排序
      const contentItems = [
        ...questionnaire.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
        ...questionnaire.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
      ].sort((a, b) => a.position - b.position)

      // 检查是否有进行中的问卷测评
      const existingQA = await prisma.questionnaireAssessment.findFirst({
        where: {
          questionnaireId: id,
          userId,
          status: 'IN_PROGRESS',
        },
        include: {
          scaleAssessments: {
            include: {
              scale: true,
            },
            orderBy: {
              startedAt: 'asc',
            },
          },
          formAnswers: true,
        },
      })

      if (existingQA) {
        // 构建已完成的表单答案映射
        const formAnswerMap = new Map(existingQA.formAnswers.map(fa => [fa.formItemId, fa]))
        
        // 找到第一个未完成的内容项
        let currentIndex = -1
        let currentItem: any = null

        for (let i = 0; i < contentItems.length; i++) {
          const item = contentItems[i]
          if (item.type === 'form') {
            const answer = formAnswerMap.get(item.data.id)
            if (!answer) {
              currentIndex = i
              currentItem = item
              break
            }
          } else {
            const sa = existingQA.scaleAssessments.find(s => s.scaleId === item.data.scaleId)
            if (!sa || sa.status !== 'COMPLETED') {
              currentIndex = i
              currentItem = item
              break
            }
          }
        }

        // 如果找到了未完成的项目
        if (currentItem && currentIndex >= 0) {
          if (currentItem.type === 'form') {
            return success(res, {
              questionnaireAssessment: {
                id: existingQA.id,
                status: existingQA.status,
                progress: existingQA.progress,
                currentIndex,
              },
              currentFormItem: currentItem.data,
              currentScale: null,
              totalItems: contentItems.length,
              contentItems: contentItems.map((item, idx) => ({
                type: item.type,
                position: item.position,
                id: item.type === 'form' ? item.data.id : item.data.id,
                label: item.type === 'form' ? item.data.label : item.data.scale?.name,
                completed: idx < currentIndex,
              })),
            }, '继续问卷测评')
          } else {
            const sa = existingQA.scaleAssessments.find(s => s.scaleId === currentItem.data.scaleId)
            return success(res, {
              questionnaireAssessment: {
                id: existingQA.id,
                status: existingQA.status,
                progress: existingQA.progress,
                currentIndex,
              },
              currentFormItem: null,
              currentScale: {
                ...currentItem.data.scale,
                scaleAssessmentId: sa?.id,
                assessment: sa,
              },
              totalItems: contentItems.length,
              contentItems: contentItems.map((item, idx) => ({
                type: item.type,
                position: item.position,
                id: item.type === 'form' ? item.data.id : item.data.id,
                label: item.type === 'form' ? item.data.label : item.data.scale?.name,
                completed: idx < currentIndex,
              })),
            }, '继续问卷测评')
          }
        }

        // 所有项目都已完成，返回已完成状态
        return success(res, {
          questionnaireAssessment: {
            id: existingQA.id,
            status: existingQA.status,
            progress: existingQA.progress,
            currentIndex: contentItems.length,
          },
          currentFormItem: null,
          currentScale: null,
          totalItems: contentItems.length,
          contentItems: contentItems.map((item, idx) => ({
            type: item.type,
            position: item.position,
            id: item.type === 'form' ? item.data.id : item.data.id,
            label: item.type === 'form' ? item.data.label : item.data.scale?.name,
            completed: true,
          })),
        }, '问卷测评已完成')
      }

      // 创建新的问卷测评
      const qa = await prisma.questionnaireAssessment.create({
        data: {
          questionnaireId: id,
          userId: userId!,
          status: 'IN_PROGRESS',
          progress: 0,
        },
      })

      // 为每个量表创建 ScaleAssessment（批量创建优化）
      await prisma.assessment.createMany({
        data: questionnaire.questionnaireScales.map(qs => ({
          scaleId: qs.scaleId,
          userId: userId!,
          status: 'IN_PROGRESS',
          progress: 0,
          answers: [],
          questionnaireAssessmentId: qa.id,
        })),
      })

      // 查询刚创建的量表测评记录
      const scaleAssessments = await prisma.assessment.findMany({
        where: { questionnaireAssessmentId: qa.id },
        select: { id: true, scaleId: true },
      })

      // 返回第一个内容项信息
      const firstItem = contentItems[0]

      if (firstItem?.type === 'form') {
        return success(res, {
          questionnaireAssessment: {
            id: qa.id,
            status: qa.status,
            progress: qa.progress,
            currentIndex: 0,
          },
          currentFormItem: firstItem.data,
          currentScale: null,
          totalItems: contentItems.length,
          contentItems: contentItems.map((item, idx) => ({
            type: item.type,
            position: item.position,
            id: item.type === 'form' ? item.data.id : item.data.id,
            label: item.type === 'form' ? item.data.label : item.data.scale?.name,
            completed: idx < 0,
          })),
          scaleAssessments: scaleAssessments.map(sa => ({ id: sa.id, scaleId: sa.scaleId })),
        }, '开始问卷测评')
      } else {
        const firstScaleAssessment = scaleAssessments[0]
        return success(res, {
          questionnaireAssessment: {
            id: qa.id,
            status: qa.status,
            progress: qa.progress,
            currentIndex: 0,
          },
          currentFormItem: null,
          currentScale: {
            ...firstItem?.data.scale,
            scaleAssessmentId: firstScaleAssessment?.id,
          },
          totalItems: contentItems.length,
          contentItems: contentItems.map((item, idx) => ({
            type: item.type,
            position: item.position,
            id: item.type === 'form' ? item.data.id : item.data.id,
            label: item.type === 'form' ? item.data.label : item.data.scale?.name,
            completed: idx < 0,
          })),
          scaleAssessments: scaleAssessments.map(sa => ({ id: sa.id, scaleId: sa.scaleId })),
        }, '开始问卷测评')
      }
    } catch (err) {
      logger.error('开始问卷测评错误', err)
      return error(res, '开始问卷测评失败')
    }
  },

  // 获取问卷测评状态
  async getAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { id },
        include: {
          questionnaire: {
            include: {
              formItems: {
                orderBy: { position: 'asc' },
              },
              questionnaireScales: {
                include: {
                  scale: {
                    include: {
                      items: {
                        orderBy: { sortOrder: 'asc' },
                      },
                      dimensions: true,
                    },
                  },
                },
                orderBy: { position: 'asc' },
              },
            },
          },
          scaleAssessments: {
            orderBy: {
              startedAt: 'asc',
            },
          },
          formAnswers: true,
        },
      })

      if (!qa) {
        return notFound(res, '问卷测评不存在')
      }

      if (qa.userId !== userId) {
        return forbidden(res, '无权限查看此测评')
      }

      // 合并表单题目和量表，按 position 排序
      const contentItems = [
        ...qa.questionnaire.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
        ...qa.questionnaire.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
      ].sort((a, b) => a.position - b.position)

      // 建立映射
      const saMap = new Map(qa.scaleAssessments.map(sa => [sa.scaleId, sa]))
      const formAnswerMap = new Map(qa.formAnswers.map(fa => [fa.formItemId, fa]))

      // 找到第一个未完成的内容项
      let currentIndex = -1
      let currentItem: any = null

      for (let i = 0; i < contentItems.length; i++) {
        const item = contentItems[i]
        if (item.type === 'form') {
          const answer = formAnswerMap.get(item.data.id)
          if (!answer) {
            currentIndex = i
            currentItem = item
            break
          }
        } else {
          const sa = saMap.get(item.data.scaleId)
          if (!sa || sa.status !== 'COMPLETED') {
            currentIndex = i
            currentItem = item
            break
          }
        }
      }

      // 计算已完成的项目数
      const completedItems = currentIndex >= 0 ? currentIndex : contentItems.length
      const progress = contentItems.length > 0 
        ? Math.round((completedItems / contentItems.length) * 100)
        : 100

      // 检查是否所有内容都已完成
      const allCompleted = currentIndex < 0

      // 如果所有内容都完成了，保存单项报告集合并更新问卷测评状态
      if (allCompleted && qa.status !== 'COMPLETED') {
        const collectionReport = buildQuestionnaireCollectionReport(qa)
        const totalTime = Date.now() - new Date(qa.startedAt).getTime()

        await prisma.questionnaireAssessment.update({
          where: { id: qa.id },
          data: {
            status: 'COMPLETED',
            progress: 100,
            completedAt: new Date(),
            totalTime,
            aggregateReport: collectionReportForStorage(collectionReport) as any,
          },
        })

        logger.info('问卷测评自动完成', {
          questionnaireAssessmentId: qa.id,
          totalItems: contentItems.length,
        })
      }

      // 返回结果
      return success(res, {
        questionnaireAssessment: {
          id: qa.id,
          status: allCompleted ? 'COMPLETED' : qa.status,
          progress: allCompleted ? 100 : progress,
          currentIndex: allCompleted ? contentItems.length : currentIndex,
          startedAt: qa.startedAt,
          completedAt: qa.completedAt,
          totalTime: qa.totalTime,
        },
        questionnaire: {
          id: qa.questionnaire.id,
          name: qa.questionnaire.name,
          instruction: qa.questionnaire.instruction,
          totalItems: contentItems.length,
        },
        currentFormItem: currentItem?.type === 'form' ? currentItem.data : null,
        currentScale: currentItem?.type === 'scale' ? {
          ...currentItem.data.scale,
          scaleAssessmentId: saMap.get(currentItem.data.scaleId)?.id,
          assessment: saMap.get(currentItem.data.scaleId),
        } : null,
        totalItems: contentItems.length,
        contentItems: contentItems.map((item, idx) => ({
          type: item.type,
          position: item.position,
          id: item.type === 'form' ? item.data.id : item.data.id,
          label: item.type === 'form' ? item.data.label : item.data.scale?.name,
          completed: idx < (allCompleted ? contentItems.length : currentIndex),
        })),
        scaleAssessments: qa.scaleAssessments.map((sa) => {
          const qs = qa.questionnaire.questionnaireScales.find(qs => qs.scaleId === sa.scaleId)
          return {
            id: sa.id,
            scaleId: sa.scaleId,
            status: sa.status,
            progress: sa.progress,
            scaleName: qs?.scale.name || '未知量表',
          }
        }),
      })
    } catch (err) {
      logger.error('获取问卷测评状态错误', err)
      return error(res, '获取问卷测评状态失败')
    }
  },

  // 完成问卷测评
  async completeAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { id },
        include: {
          questionnaire: {
            include: {
              formItems: {
                orderBy: { position: 'asc' },
              },
              questionnaireScales: {
                include: {
                  scale: {
                    include: {
                      dimensions: true,
                    },
                  },
                },
                orderBy: { position: 'asc' },
              },
            },
          },
          scaleAssessments: {
            include: {
              scale: {
                include: {
                  items: {
                    include: {
                      itemDimensions: {
                        include: {
                          dimension: true,
                        },
                      },
                    },
                  },
                  dimensions: true,
                },
              },
            },
          },
          formAnswers: true,
        },
      })

      if (!qa) {
        return notFound(res, '问卷测评不存在')
      }

      if (qa.userId !== userId) {
        return forbidden(res, '无权限操作此测评')
      }

      if (qa.status === 'COMPLETED') {
        return success(res, {
          questionnaireId: qa.questionnaireId,
          completedAt: qa.completedAt,
          totalTime: qa.totalTime,
          ...buildQuestionnaireCollectionReport(qa),
        }, '问卷测评已完成')
      }

      // 检查所有量表是否完成（如果有量表的话）
      if (qa.scaleAssessments.length > 0) {
        const incompleteScales = qa.scaleAssessments.filter(
          sa => sa.status !== 'COMPLETED'
        )
        if (incompleteScales.length > 0) {
          return error(res, '还有量表未完成')
        }
      }

      const collectionReport = buildQuestionnaireCollectionReport(qa)

      // 计算总时间
      const totalTime = Date.now() - new Date(qa.startedAt).getTime()

      // 更新问卷测评
      const updated = await prisma.questionnaireAssessment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          totalTime,
          aggregateReport: collectionReportForStorage(collectionReport) as any,
        },
      })

      const { aggregateReport: _legacyAggregateReport, ...safeUpdated } = updated as any
      return success(res, {
        ...safeUpdated,
        ...collectionReport,
      }, '问卷测评已完成')
    } catch (err) {
      logger.error('完成问卷测评错误', err)
      return error(res, '完成问卷测评失败')
    }
  },

  // 获取问卷独立结果
  async getReport(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { id },
        include: {
          questionnaire: {
            include: {
              formItems: {
                orderBy: { position: 'asc' },
              },
              questionnaireScales: {
                include: {
                  scale: {
                    include: {
                      dimensions: {
                        include: {
                          itemDimensions: {
                            include: {
                              item: true
                            }
                          }
                        }
                      },
                      items: true,
                    }
                  }
                }
              }
            }
          },
          scaleAssessments: true,
          formAnswers: true,
        },
      })

      if (!qa) {
        return notFound(res, '问卷测评不存在')
      }

      if (qa.userId !== userId) {
        return forbidden(res, '无权限查看此测评')
      }

      if (qa.status !== 'COMPLETED') {
        return error(res, '问卷测评未完成')
      }

      const collectionReport = buildQuestionnaireCollectionReport(qa)

      return success(res, {
        questionnaireId: qa.questionnaireId,
        completedAt: qa.completedAt,
        totalTime: qa.totalTime,
        ...collectionReport,
      })
    } catch (err) {
      logger.error('获取问卷独立结果错误', err)
      return error(res, '获取问卷独立结果失败')
    }
  },

  // ==================== 数据导出 ====================

  // 导出问卷数据
  async exportData(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const {
        anonymize: requestAnonymize = true,
        includeProgress = false,
        minProgress = 100,
        dateRange,
        format = 'csv'
      } = req.body

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        select: { id: true, name: true, creatorId: true }
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出此问卷数据')
      }

      // 权限控制：教师必须脱敏，只有管理员可以导出非脱敏数据
      const anonymize = userRole === UserRole.ADMIN ? requestAnonymize : true

      const { exportService } = await import('../services/exportService')

      const exportData = await exportService.getQuestionnaireExportData(id, {
        anonymize,
        includeProgress,
        minProgress,
        dateRange
      })

      const files = await exportService.saveQuestionnaireExportFiles(id, {
        anonymize,
        includeProgress,
        minProgress,
        dateRange
      }, format as 'csv' | 'sav')

      logger.info(`问卷数据导出成功: ${questionnaire.name}, 记录数: ${exportData.rows.length}, 格式: ${format}, 脱敏: ${anonymize}`)

      const result: any = {
        recordCount: exportData.rows.length,
        fieldCount: exportData.fields.length,
        format,
        anonymize  // 返回实际使用的脱敏状态
      }

      if (files.csvPath) {
        result.fileName = path.basename(files.csvPath)
        result.csvPath = files.csvPath
      }
      if (files.savPath) {
        result.fileName = path.basename(files.savPath)
        result.savPath = files.savPath
      }

      return success(res, result, '导出成功')
    } catch (err) {
      logger.error('导出问卷数据错误', err)
      return error(res, '导出问卷数据失败: ' + (err as Error).message)
    }
  },

  // 获取导出预览
  async getExportPreview(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id },
        include: {
          questionnaireScales: {
            include: {
              scale: {
                select: {
                  id: true,
                  name: true,
                  _count: {
                    select: { items: true, dimensions: true }
                  }
                }
              }
            },
            orderBy: { position: 'asc' }
          },
          _count: {
            select: {
              assessments: { where: { status: 'COMPLETED' } }
            }
          }
        }
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (questionnaire.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此问卷')
      }

      const { exportService } = await import('../services/exportService')

      const previewData = await exportService.getQuestionnaireExportData(id, {
        anonymize: true,
        minProgress: 100
      })

      const totalItems = questionnaire.questionnaireScales.reduce(
        (sum, qs) => sum + (qs.scale._count?.items || 0), 0
      )
      const totalDimensions = questionnaire.questionnaireScales.reduce(
        (sum, qs) => sum + (qs.scale._count?.dimensions || 0), 0
      )

      return success(res, {
        questionnaireName: questionnaire.name,
        totalRecords: previewData.rows.length,
        completedCount: questionnaire._count.assessments,
        scaleCount: questionnaire.questionnaireScales.length,
        totalItems,
        totalDimensions,
        fields: previewData.fields,
        scales: questionnaire.questionnaireScales.map(qs => ({
          id: qs.scale.id,
          name: qs.scale.name,
          itemCount: qs.scale._count?.items || 0,
          dimensionCount: qs.scale._count?.dimensions || 0
        }))
      })
    } catch (err) {
      logger.error('获取问卷导出预览错误', err)
      return error(res, '获取导出预览失败')
    }
  },

  // 下载导出文件
  async downloadExportFile(req: Request, res: Response) {
    try {
      const { fileName } = req.params
      const exportDir = path.join(__dirname, '../../exports')
      const filePath = path.join(exportDir, fileName)

      if (!fs.existsSync(filePath)) {
        return notFound(res, '文件不存在')
      }

      return res.download(filePath)
    } catch (err) {
      logger.error('下载导出文件错误', err)
      return error(res, '下载文件失败')
    }
  },
}
