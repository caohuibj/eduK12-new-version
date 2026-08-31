import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound, completionBusy } from '../utils/response'
import { UserRole } from '../types'
import { canUseScale } from '../services/materialGrant'
import { logger } from '../utils/logger'
import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs'
import { buildQuestionnaireCollectionReport } from '../modules/reporting/questionnaire-collection-report'
import {
  applyQuestionnaireProgressDelta,
  questionnaireProgressSelect,
  refreshQuestionnaireProgress,
  withQuestionnaireAssessmentAnswerTransaction,
  withQuestionnaireCompletionTransaction,
  withQuestionnaireSerializableTransaction,
  type QuestionnaireProgressSnapshot,
} from '../services/questionnaireProgressService'
import { encryptScaleAnswers, readScaleAnswers, scaleAssessmentForResponse, scaleRunnerFromRecord } from '../modules/scale/scale-workflow.service'
import { readContextFormAnswer, validateContextFormItem, validateContextFormItems, writeContextFormAnswer } from '../modules/assessment-context'
import {
  assertContextMutable,
  freezeQuestionnaireAssessmentContext,
  freezeQuestionnaireAssessmentContextFromSnapshot,
  isAssessmentContextServiceError,
} from '../services/assessmentContextService'
import { questionnaireAuthorizationService as questionnaireAuth } from '../services/questionnaireAuthorizationService'
import { createExportArtifact, getExportArtifactStatus, resolveArtifactForDownload } from '../services/exportArtifactService'
import { enqueueExportJob, EXPORT_ASYNC_RECORD_THRESHOLD } from '../services/exportJobService'
import { utcHalfOpenDateFilter } from '../services/exportService'
import { isFormAnswerComplete, isFormAnswerRequiredComplete } from '../services/questionnaireFormAnswerState'
import { normalizeQuestionnaireFormAnswer, validateQuestionnaireFormAnswer } from '../services/questionnaireFormAnswerValidation'
import { prepareFormAnswerChanges } from '../services/questionnaire-form-answer-concurrency'
import { cacheService } from '../services/cacheService'
import { isQuestionnaireCompletionAdmissionBusyError } from '../services/questionnaireCompletionAdmission'

const actorFromRequest = (req: Request) => req.user ? { userId: req.user.userId, role: req.user.role } : null

const courseQuestionnaire = async (id: string, include: any = undefined) => {
  const model: any = prisma.questionnaire as any
  if (typeof model.findFirst === 'function') return model.findFirst({ where: { id, type: 'COURSE' }, ...(include ? { include } : {}) })
  // Lightweight controller unit doubles from the pre-type-boundary API only
  // implement findUnique. Production always takes the discriminator path.
  return model.findUnique({ where: { id }, ...(include ? { include } : {}) })
}

const canManageCourseQuestionnaire = async (req: Request, questionnaire: any) => (
  Boolean(questionnaire && await questionnaireAuth.canManage(actorFromRequest(req), questionnaire))
)

const questionnaireScaleRunner = (scale: any) => {
  try {
    const { definition: _definition, ...metadata } = scale
    return { ...metadata, definition: scaleRunnerFromRecord(scale) }
  } catch {
    const { definition: _definition, ...metadata } = scale
    return { ...metadata, definition: null, definitionError: true }
  }
}

const assessmentContextState = (row: { contextSnapshotEncrypted?: string | null; contextSnapshotHash?: string | null; contextFrozenAt?: Date | null }) => ({
  status: row.contextSnapshotEncrypted && row.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
  frozenAt: row.contextFrozenAt?.toISOString() ?? null,
})

const scaleItemCountForScale = (scale: { definition?: unknown; itemCount?: number | null }): number => {
  if (typeof scale.itemCount === 'number') return scale.itemCount
  const definition = scale.definition as any
  return Array.isArray(definition?.items) ? definition.items.length : 0
}

const scaleDimensionCount = (scale: { definition?: unknown; dimensionCount?: number | null }): number => {
  if (typeof scale.dimensionCount === 'number') return scale.dimensionCount
  const definition = scale.definition as any
  return Array.isArray(definition?.scoring?.scores)
    ? definition.scoring.scores.filter((score: any) => score.type === 'dimension').length
    : 0
}

/**
 * Build the collection-only questionnaire envelope. A stored collection
 * snapshot may be present, but only v2 scale results are projected into the
 * current response.
 */
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

      // This controller is intentionally COURSE-only. GENERAL questionnaires
      // have a separate policy and token-gated controller.
      let where: any = { type: 'COURSE' }

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
                  definition: true,
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
          // ScaleDefinitionV2 是量表题目数量的唯一来源。
          const scaleItemCount = qn.questionnaireScales.reduce((sum, qs) => sum + scaleItemCountForScale(qs.scale), 0)
          
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
          type: 'COURSE',
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

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
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
                  instrumentClass: true,
                  instrumentVersion: true,
                  definition: true,
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

      if (!(await questionnaireAuth.canView(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限查看此问卷')
      }

      // Student responses receive only runner metadata and a safe definition
      // projection; scoring, transforms and report rules stay server-side.
      if (req.user?.role === UserRole.STUDENT) {
        return success(res, {
          ...questionnaire,
          questionnaireScales: questionnaire.questionnaireScales.map((entry: any) => ({
            ...entry,
            scale: questionnaireScaleRunner(entry.scale),
          })),
        })
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

      const questionnaire = await courseQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
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
      await cacheService.clearQuestionnaireCache(id)

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

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
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
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限删除此问卷')
      }

      // 检查是否有关联的测评记录
      if (questionnaire._count.assessments > 0) {
        return error(res, '该问卷已有测评记录，无法删除')
      }

      await prisma.questionnaire.delete({
        where: { id },
      })
      await cacheService.clearQuestionnaireCache(id)

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

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
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
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
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

      const contextIssues = validateContextFormItems(questionnaire.formItems, questionnaire.questionnaireScales.map((item) => item.position))
      if (contextIssues.length > 0) return error(res, contextIssues[0].message)

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: { status: 'PUBLISHED' },
      })
      await cacheService.clearQuestionnaireCache(id)

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

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限废弃此问卷')
      }

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: { status: 'DEPRECATED' },
      })
      await cacheService.clearQuestionnaireCache(id)

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
      const original = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
        include: {
          formItems: true,
          questionnaireScales: true,
        },
      })

      if (!original) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (!(await canManageCourseQuestionnaire(req, original))) {
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
            type: 'COURSE',
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
              contextKey: item.contextKey,
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

      const questionnaire = await courseQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

      const questionnaireScales = await prisma.questionnaireScale.findMany({
        where: { questionnaireId: id },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              instrumentClass: true,
              instrumentVersion: true,
              definition: true,
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
      const questionnaire = await courseQuestionnaire(id, { questionnaireScales: true })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
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
        ? Math.max(...questionnaire.questionnaireScales.map((qs: any) => qs.position))
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
      await cacheService.clearQuestionnaireCache(id)

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
      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
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
      await cacheService.clearQuestionnaireCache(id)

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
      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      // Validate every child before opening the write transaction. A foreign
      // id therefore results in zero writes rather than a partially reordered
      // questionnaire.
      const bound = await prisma.questionnaireScale.findMany({ where: { questionnaireId: id, scaleId: { in: scales.map((s) => s.scaleId) } }, select: { scaleId: true } })
      if (bound.length !== scales.length || new Set(bound.map((row) => row.scaleId)).size !== scales.length) {
        return error(res, '存在不属于此问卷的量表')
      }
      await prisma.$transaction(async (tx) => {
        for (const s of scales) {
          await tx.questionnaireScale.update({
            where: { questionnaireId_scaleId: { questionnaireId: id, scaleId: s.scaleId } },
            data: { position: s.position },
          })
        }
      })
      await cacheService.clearQuestionnaireCache(id)

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

      const questionnaire = await courseQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

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
        type: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input', 'year_month']),
        label: z.string().min(1, '题目标签不能为空'),
        placeholder: z.string().nullable().optional(),
        required: z.boolean().optional().default(true),
        position: z.number().int().optional(),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })).nullish(),
        contextKey: z.enum(['birthYearMonth', 'sexAtBirth', 'gradeLevel', 'primaryLanguage', 'countryOrRegion']).nullable().optional(),
      })

      const result = addFormItemSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { type, label, placeholder, required, position, options, contextKey } = result.data
      const contextIssues = validateContextFormItem({ id: 'new', type, label, required, position, contextKey, options })
      if (contextIssues.length > 0) return error(res, contextIssues[0].message)

      // 检查问卷是否存在和权限
      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
        include: {
          formItems: true,
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
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
          contextKey: contextKey ?? null,
        },
      })
      await cacheService.clearQuestionnaireCache(id)

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
        type: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input', 'year_month']).optional(),
        label: z.string().min(1, '题目标签不能为空').optional(),
        placeholder: z.string().nullable().optional(),
        required: z.boolean().optional(),
        position: z.number().int().optional(),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })).nullish(),
        contextKey: z.enum(['birthYearMonth', 'sexAtBirth', 'gradeLevel', 'primaryLanguage', 'countryOrRegion']).nullable().optional(),
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

      if (!(await canManageCourseQuestionnaire(req, formItem.questionnaire)) || formItem.questionnaire.type !== 'COURSE') {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      const candidate = {
        id: formItem.id,
        type: result.data.type ?? formItem.type,
        label: result.data.label ?? formItem.label,
        required: result.data.required ?? formItem.required,
        position: result.data.position ?? formItem.position,
        contextKey: result.data.contextKey !== undefined ? result.data.contextKey : formItem.contextKey,
        options: result.data.options !== undefined ? result.data.options : formItem.options,
      }
      const contextIssues = validateContextFormItem(candidate)
      if (contextIssues.length > 0) return error(res, contextIssues[0].message)

      // 处理 options 字段的 JSON 类型
      const updateData: any = { ...result.data }
      if (updateData.options !== undefined) {
        updateData.options = updateData.options ? JSON.parse(JSON.stringify(updateData.options)) : null
      }

      const updated = await prisma.questionnaireFormItem.update({
        where: { id: itemId },
        data: updateData,
      })
      await cacheService.clearQuestionnaireCache(id)

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

      if (!(await canManageCourseQuestionnaire(req, formItem.questionnaire)) || formItem.questionnaire.type !== 'COURSE') {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      await prisma.questionnaireFormItem.delete({
        where: { id: itemId },
      })
      await cacheService.clearQuestionnaireCache(id)

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
      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限修改此问卷')
      }

      if (questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      const formIds = result.data.items.filter((item) => item.type === 'form').map((item) => item.id)
      const scaleIds = result.data.items.filter((item) => item.type === 'scale').map((item) => item.id)
      const [forms, scales] = await Promise.all([
        prisma.questionnaireFormItem.findMany({ where: { id: { in: formIds }, questionnaireId: id }, select: { id: true } }),
        prisma.questionnaireScale.findMany({ where: { id: { in: scaleIds }, questionnaireId: id }, select: { id: true } }),
      ])
      if (forms.length !== formIds.length || scales.length !== scaleIds.length) return error(res, '存在不属于此问卷的内容项')
      await prisma.$transaction(async (tx) => {
        for (const item of result.data.items) {
          if (item.type === 'form') await tx.questionnaireFormItem.update({ where: { id: item.id }, data: { position: item.position } })
          else await tx.questionnaireScale.update({ where: { id: item.id }, data: { position: item.position } })
        }
      })
      await cacheService.clearQuestionnaireCache(id)

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
        action: z.enum(['answer', 'skip']).optional(),
        value: z.union([z.string(), z.array(z.string())]).optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
      }).superRefine((input, ctx) => {
        const action = input.action || 'answer'
        if (action === 'answer' && input.value === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: '回答值不能为空', path: ['value'] })
        }
      })

      const result = saveFormAnswerSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { formItemId } = result.data
      const action = result.data.action || 'answer'
      const value = result.data.value

      const outcome = await withQuestionnaireAssessmentAnswerTransaction(assessmentId, async (tx) => {
        const qa = await tx.questionnaireAssessment.findUnique({
          where: { id: assessmentId },
          include: {
            questionnaire: {
              include: {
                formItems: true,
                questionnaireScales: { select: { id: true } },
              },
            },
          },
        })

        if (!qa) return { kind: 'not-found' as const }
        if (qa.userId !== userId) return { kind: 'forbidden' as const }
        if (qa.status === 'COMPLETED') return { kind: 'completed' as const }
        if (qa.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        const formItem = qa.questionnaire.formItems.find(fi => fi.id === formItemId)
        if (!formItem) return { kind: 'form-not-found' as const }

        if (action === 'skip' && (formItem.required || formItem.contextKey)) {
          return { kind: 'skip-not-allowed' as const }
        }

        if (formItem.contextKey) {
          try {
            assertContextMutable(Boolean(qa.contextSnapshotEncrypted || qa.contextSnapshotHash))
          } catch (error) {
            if (isAssessmentContextServiceError(error)) return { kind: 'context-frozen' as const }
            throw error
          }
        }

        if (action === 'answer') {
          const validationMessage = validateQuestionnaireFormAnswer(formItem, value)
          if (validationMessage) return { kind: 'invalid-context-answer' as const, message: validationMessage }
        }

        const previousFormAnswer = await tx.questionnaireFormAnswer.findUnique({
          where: {
            questionnaireAssessmentId_formItemId: {
              questionnaireAssessmentId: assessmentId,
              formItemId,
            },
          },
          select: { formItemId: true, status: true, value: true, revision: true },
        })

        const normalizedValue = action === 'answer' && value !== undefined
          ? normalizeQuestionnaireFormAnswer(formItem, value)
          : value
        const valueToStore = action === 'skip'
          ? null
          : Array.isArray(normalizedValue)
            ? JSON.stringify(normalizedValue)
            : normalizedValue as string
        const previousForRevision = previousFormAnswer
          ? {
              ...previousFormAnswer,
              value: previousFormAnswer.value === null
                ? null
                : readContextFormAnswer(formItem.contextKey, previousFormAnswer.value),
            }
          : undefined
        const answerStatus = action === 'skip' ? 'SKIPPED' as const : 'ANSWERED' as const
        const prepared = prepareFormAnswerChanges(
          previousForRevision ? [previousForRevision] : [],
          [{
            formItemId,
            value: valueToStore,
            status: answerStatus,
            expectedRevision: result.data.expectedRevision,
          }],
        )
        if (prepared.kind === 'stale') return { kind: 'stale-answer' as const }
        const change = prepared.changes[0]
        const wasComplete = isFormAnswerComplete(formItem, change.previous)
        const storedValue = valueToStore === null ? null : writeContextFormAnswer(formItem.contextKey, valueToStore)
        const formAnswer = change.replay && previousFormAnswer
          ? previousFormAnswer
          : await tx.questionnaireFormAnswer.upsert({
              where: {
                questionnaireAssessmentId_formItemId: {
                  questionnaireAssessmentId: assessmentId,
                  formItemId,
                },
              },
              create: {
                questionnaireAssessmentId: assessmentId,
                formItemId,
                value: storedValue,
                status: answerStatus,
                revision: change.next.revision ?? 1,
              },
              update: {
                value: storedValue,
                status: answerStatus,
                revision: { increment: 1 },
              },
            })

        const isComplete = isFormAnswerComplete(formItem, formAnswer)
        const progress = await applyQuestionnaireProgressDelta(
          tx,
          qa,
          Number(isComplete) - Number(wasComplete),
          qa.questionnaire.formItems.length + qa.questionnaire.questionnaireScales.length,
        )
        return { kind: 'saved' as const, formAnswer, contextKey: formItem.contextKey, progress }
      })

      if (outcome.kind === 'not-found') return notFound(res, '问卷测评不存在')
      if (outcome.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (outcome.kind === 'completed') return error(res, '测评已完成，不能继续修改答案', -1, 409)
      if (outcome.kind === 'closed') return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      if (outcome.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (outcome.kind === 'form-not-found') return error(res, '表单题目不存在')
      if (outcome.kind === 'skip-not-allowed') return error(res, '必答题或人口学题目不能跳过', -1, 400)
      if (outcome.kind === 'context-frozen') return error(res, '人口学表单已冻结，不能继续修改答案', -1, 409)
      if (outcome.kind === 'invalid-context-answer') return error(res, outcome.message)

      logger.info('保存表单答案', { assessmentId, formItemId, userId })

      return success(res, {
        ...outcome.formAnswer,
        value: outcome.formAnswer.value === null
          ? null
          : readContextFormAnswer(outcome.contextKey, outcome.formAnswer.value),
        progress: outcome.progress.progress,
        completedForms: outcome.progress.completedForms,
      }, '表单答案保存成功')
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
        checkpointSequence: z.number().int().positive().optional(),
        answers: z.array(z.object({
          checkpointId: z.string().min(1).optional(),
          checkpointSequence: z.number().int().positive().optional(),
          formItemId: z.string(),
          action: z.enum(['answer', 'skip']).optional(),
          value: z.union([z.string(), z.array(z.string())]).optional(),
          expectedRevision: z.number().int().nonnegative().optional(),
        }).superRefine((input, ctx) => {
          if ((input.action || 'answer') === 'answer' && input.value === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: '回答值不能为空', path: ['value'] })
          }
        })).min(1).max(10),
      })

      const result = saveFormAnswersSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { answers } = result.data

      const outcome = await withQuestionnaireAssessmentAnswerTransaction(assessmentId, async (tx) => {
        const qa = await tx.questionnaireAssessment.findUnique({
          where: { id: assessmentId },
          include: {
            questionnaire: {
              include: {
                formItems: true,
                questionnaireScales: { select: { id: true } },
              },
            },
          },
        })

        if (!qa) return { kind: 'not-found' as const }
        if (qa.userId !== userId) return { kind: 'forbidden' as const }
        if (qa.status === 'COMPLETED') return { kind: 'completed' as const }
        if (qa.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        const formItemIds = new Set(qa.questionnaire.formItems.map((item) => item.id))
        if (answers.some((answer) => !formItemIds.has(answer.formItemId))) {
          return { kind: 'form-not-found' as const }
        }

        if (qa.contextSnapshotEncrypted || qa.contextSnapshotHash) {
          const contextIds = new Set(qa.questionnaire.formItems.filter((item) => item.contextKey).map((item) => item.id))
          if (answers.some((answer) => contextIds.has(answer.formItemId))) return { kind: 'context-frozen' as const }
        }
        for (const answer of answers) {
          const item = qa.questionnaire.formItems.find((candidate) => candidate.id === answer.formItemId)
          const action = answer.action || 'answer'
          if (action === 'skip' && (item?.required || item?.contextKey)) return { kind: 'skip-not-allowed' as const }
          if (action === 'answer' && item) {
            const validationMessage = validateQuestionnaireFormAnswer(item, answer.value)
            if (validationMessage) return { kind: 'invalid-context-answer' as const, message: validationMessage }
          }
        }

        const existingAnswers = await tx.questionnaireFormAnswer.findMany({
          where: {
            questionnaireAssessmentId: assessmentId,
            formItemId: { in: [...new Set(answers.map((answer) => answer.formItemId))] },
          },
          select: { formItemId: true, status: true, value: true, revision: true },
        })
        const revisionAnswers = existingAnswers.map((answer) => {
          const item = qa.questionnaire.formItems.find((candidate) => candidate.id === answer.formItemId)
          return {
            ...answer,
            value: answer.value === null
              ? null
              : readContextFormAnswer(item?.contextKey, answer.value),
          }
        })
        const preparedInputs = answers.map((answer) => {
          const item = qa.questionnaire.formItems.find((candidate) => candidate.id === answer.formItemId)
          if (!item) return null
          const action = answer.action || 'answer'
          const answerStatus = action === 'skip' ? 'SKIPPED' as const : 'ANSWERED' as const
          const normalizedValue = action === 'answer' && answer.value !== undefined
            ? normalizeQuestionnaireFormAnswer(item, answer.value)
            : answer.value
          const value = action === 'skip'
            ? null
            : (Array.isArray(normalizedValue) ? JSON.stringify(normalizedValue) : normalizedValue as string)
          return {
            formItemId: answer.formItemId,
            value,
            status: answerStatus,
            expectedRevision: answer.expectedRevision,
          }
        }).filter((answer): answer is NonNullable<typeof answer> => answer !== null)
        const prepared = prepareFormAnswerChanges(revisionAnswers, preparedInputs)
        if (prepared.kind === 'stale') return { kind: 'stale-answer' as const }
        let completedFormsDelta = 0

        for (const change of prepared.changes) {
          const answer = change.input
          const item = qa.questionnaire.formItems.find((candidate) => candidate.id === answer.formItemId)
          if (!item) return { kind: 'form-not-found' as const }
          if (change.replay) continue
          const wasComplete = isFormAnswerComplete(item, change.previous)
          const value = answer.value
          const formAnswer = await tx.questionnaireFormAnswer.upsert({
            where: {
              questionnaireAssessmentId_formItemId: {
                questionnaireAssessmentId: assessmentId,
                formItemId: answer.formItemId,
              },
            },
            create: {
              questionnaireAssessmentId: assessmentId,
              formItemId: answer.formItemId,
              value: value === null ? null : writeContextFormAnswer(item.contextKey, value),
              status: answer.status,
              revision: change.next.revision ?? 1,
            },
            update: {
              value: value === null ? null : writeContextFormAnswer(item.contextKey, value),
              status: answer.status,
              revision: { increment: 1 },
            },
          })
          const isComplete = isFormAnswerComplete(item, formAnswer)
          completedFormsDelta += Number(isComplete) - Number(wasComplete)
        }

        const progress = await applyQuestionnaireProgressDelta(
          tx,
          qa,
          completedFormsDelta,
          qa.questionnaire.formItems.length + qa.questionnaire.questionnaireScales.length,
        )
        return {
          kind: 'saved' as const,
          progress,
          acceptedIds: answers.flatMap((answer) => answer.checkpointId ? [answer.checkpointId] : []),
          acceptedSequences: answers.flatMap((answer) => answer.checkpointSequence ? [answer.checkpointSequence] : []),
        }
      })

      if (outcome.kind === 'not-found') return notFound(res, '问卷测评不存在')
      if (outcome.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (outcome.kind === 'completed') return error(res, '测评已完成，不能继续修改答案', -1, 409)
      if (outcome.kind === 'closed') return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      if (outcome.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (outcome.kind === 'form-not-found') return error(res, '表单题目不存在')
      if (outcome.kind === 'skip-not-allowed') return error(res, '必答题或人口学题目不能跳过', -1, 400)
      if (outcome.kind === 'context-frozen') return error(res, '人口学表单已冻结，不能继续修改答案', -1, 409)
      if (outcome.kind === 'invalid-context-answer') return error(res, outcome.message)

      logger.info('批量保存表单答案', { assessmentId, count: answers.length, userId })

      return success(res, {
        saved: answers.length,
        progress: outcome.progress.progress,
        completedForms: outcome.progress.completedForms,
        acceptedIds: outcome.acceptedIds,
        acceptedSequences: outcome.acceptedSequences,
      }, '表单答案保存成功')
    } catch (err) {
      logger.error('批量保存表单答案错误', err)
      return error(res, '保存表单答案失败')
    }
  },

  // 获取问卷所有内容项（表单题目和量表混合列表）
  async listContent(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaire = await courseQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

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
                definition: true,
                instrumentClass: true,
                instrumentVersion: true,
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

      const questionnaire = await courseQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageCourseQuestionnaire(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

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
      const questionnaire = await prisma.questionnaire.findFirst({ where: { id, type: 'COURSE' } })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限修改此问卷')
      }

      // Check every course and its owner before writing any relation. Course
      // shares are content visibility only and never grant write authority.
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
      })

      if (courses.length !== courseIds.length) {
        return error(res, '部分课程不存在')
      }
      const associationAllowed = await Promise.all(courses.map((course) => questionnaireAuth.canAssociateCourse(actorFromRequest(req), questionnaire, course)))
      if (associationAllowed.some((allowed) => !allowed)) {
        return forbidden(res, '只能关联自己创建的课程')
      }

      const created = await prisma.$transaction(async (tx) => tx.courseQuestionnaire.createMany({
        data: courseIds.map(courseId => ({ questionnaireId: id, courseId })),
        skipDuplicates: true,
      }))

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
      const questionnaire = await prisma.questionnaire.findFirst({ where: { id, type: 'COURSE' } })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageCourseQuestionnaire(req, questionnaire))) {
        return forbidden(res, '无权限修改此问卷')
      }

      // Removing a relation is also a write to the target course. A teacher
      // may only remove relations from courses they own; CourseShare grants
      // visibility, never mutation authority.
      if (userRole !== UserRole.ADMIN) {
        const course = await prisma.course.findUnique({
          where: { id: courseId },
          select: { id: true, creatorId: true },
        })
        if (!course) return notFound(res, '课程不存在')
        if (course.creatorId !== userId) return forbidden(res, '只能修改自己创建的课程关联')
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
        type: 'COURSE',
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
                  code: true,
                  name: true,
                  itemCount: true,
                  dimensionCount: true,
                instrumentClass: true,
                instrumentVersion: true,
                },
              },
            },
            orderBy: { position: 'asc' },
          },
          formItems: { select: { id: true } },
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
              formItems: true,
              questionnaireScales: true,
              assessments: true,
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
        select: { id: true, questionnaireId: true, status: true, startedAt: true, progress: true, completedAt: true },
      })

      // 建立映射：questionnaireId -> assessment
      const assessmentsByQuestionnaire = new Map<string, typeof allAssessments>()
      allAssessments.forEach((assessment) => {
        const bucket = assessmentsByQuestionnaire.get(assessment.questionnaireId) || []
        bucket.push(assessment)
        assessmentsByQuestionnaire.set(assessment.questionnaireId, bucket)
      })

      // 计算总题数（表单题目 + 量表题目）
      const questionnairesWithStatus = questionnaires.map(qn => {
        // 量表题目数量
        const scaleItemCountValue = qn.questionnaireScales.reduce(
          (sum, qs) => sum + (qs.scale.itemCount ?? scaleItemCountForScale(qs.scale)),
          0,
        )
        
        // 表单题目数量
        const formItemCount = qn._count?.formItems ?? (qn.formItems ? qn.formItems.length : 0)
        
        // 总题目数 = 表单 + 量表
        const totalItems = formItemCount + scaleItemCountValue
        
        const attempts = assessmentsByQuestionnaire.get(qn.id) || []
        const activeAttempt = attempts
          .filter((attempt) => attempt.status === 'IN_PROGRESS')
          .sort((left, right) => left.id.localeCompare(right.id))[0] || null
        const latestCompletedAttempt = attempts
          .filter((attempt) => attempt.status === 'COMPLETED')
          .sort((left, right) => (right.completedAt?.getTime() || 0) - (left.completedAt?.getTime() || 0))[0] || null
        return {
          id: qn.id,
          code: qn.code,
          name: qn.name,
          description: qn.description,
          instruction: qn.instruction,
          estimatedTime: qn.estimatedTime,
          scaleCount: qn.questionnaireScales.length,
          formItemCount,
          scaleSummaries: qn.questionnaireScales.map((qs) => ({
            id: qs.scale.id,
            name: qs.scale.name,
            itemCount: qs.scale.itemCount ?? scaleItemCountForScale(qs.scale),
            dimensionCount: qs.scale.dimensionCount ?? scaleDimensionCount(qs.scale),
          })),
          totalItems,
          courses: qn.courseQuestionnaires.map(cq => cq.course),
          completed: Boolean(latestCompletedAttempt),
          inProgress: Boolean(activeAttempt),
          completedAt: latestCompletedAttempt?.completedAt || null,
          assessmentId: latestCompletedAttempt?.id || activeAttempt?.id || null,
          activeAttempt: activeAttempt ? {
            id: activeAttempt.id,
            startedAt: activeAttempt.startedAt,
            progress: activeAttempt.progress,
          } : null,
          latestCompletedAttempt: latestCompletedAttempt ? {
            id: latestCompletedAttempt.id,
            completedAt: latestCompletedAttempt.completedAt,
          } : null,
          attemptCount: attempts.length,
          retakeAllowed: !activeAttempt,
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
  async startAssessment(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      if (req.user?.role !== UserRole.STUDENT) return forbidden(res, '仅学生可开始问卷测评')

      // Keep authorization on a small, uncached parent projection. Published
      // content is immutable and is loaded separately through the shared
      // start-content cache below.
      const questionnaireMetadata = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
        select: {
          id: true,
          type: true,
          creatorId: true,
          status: true,
          visibility: true,
          courseQuestionnaires: {
            select: { courseId: true },
          },
        },
      })

      if (!questionnaireMetadata) {
        return notFound(res, '问卷不存在')
      }

      if (!(await questionnaireAuth.canTake(actorFromRequest(req), questionnaireMetadata))) {
        return forbidden(res, '当前账号无权参加此问卷')
      }

      if (questionnaireMetadata.status !== 'PUBLISHED') {
        return error(res, '问卷未发布')
      }

      const questionnaire = {
        ...questionnaireMetadata,
        ...(await cacheService.getQuestionnaireStartContent(id)),
      }

      // 合并表单题目和量表，按 position 排序
      const contentItems = [
        ...questionnaire.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
        ...questionnaire.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
      ].sort((a, b) => a.position - b.position)

      // Check only attempt state here. The immutable questionnaire content is
      // already in the start-content cache above; joining it again would
      // multiply definition and form-item reads during a resume burst.
      const existingQARow = await prisma.questionnaireAssessment.findFirst({
        where: {
          questionnaireId: id,
          userId,
          status: 'IN_PROGRESS',
        },
        select: {
          id: true,
          status: true,
          progress: true,
          contextSnapshotEncrypted: true,
          contextSnapshotHash: true,
          contextFrozenAt: true,
          questionnaire: { select: { id: true } },
          scaleAssessments: {
            select: {
              id: true,
              scaleId: true,
              userId: true,
              status: true,
              answers: true,
              answersRevision: true,
              result: true,
              progress: true,
              startedAt: true,
              completedAt: true,
              totalTime: true,
              questionnaireAssessmentId: true,
              compositeAttemptId: true,
              compositeItemId: true,
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  status: true,
                  visibility: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  definitionHash: true,
                  itemCount: true,
                  dimensionCount: true,
                  estimatedTime: true,
                  instruction: true,
                  creatorId: true,
                  createdAt: true,
                  updatedAt: true,
                  tags: true,
                },
              },
            },
            orderBy: {
              startedAt: 'asc',
            },
          },
          formAnswers: {
            select: {
              formItemId: true,
              value: true,
              status: true,
              revision: true,
            },
          },
        },
      })
      const existingQA = existingQARow
        ? {
            ...existingQARow,
            questionnaire: {
              id: questionnaire.id,
              formItems: questionnaire.formItems,
              questionnaireScales: questionnaire.questionnaireScales,
            },
          }
        : null

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
            if (!isFormAnswerComplete(item.data, answer)) {
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
                context: assessmentContextState(existingQA),
              },
              currentFormItem: currentItem.data,
              currentFormAnswerRevision: formAnswerMap.get(currentItem.data.id)?.revision ?? 0,
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
                context: assessmentContextState(existingQA),
              },
              currentFormItem: null,
              currentScale: {
                ...questionnaireScaleRunner(currentItem.data.scale),
                scaleAssessmentId: sa?.id,
              assessment: sa ? scaleAssessmentForResponse(sa) : sa,
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

        // 所有项目都已完成，使用条件状态转换完成问卷，避免重复生成报告。
        const completionResult = await withQuestionnaireCompletionTransaction(async (tx) => {
          // The resume lookup is outside the mutation transaction. Reload the
          // authoritative minimal graph inside Serializable before freezing or
          // completing so a concurrent answer cannot be hidden by a stale
          // start/resume snapshot.
          const completionSnapshot = await tx.questionnaireAssessment.findUnique({
            where: { id: existingQA.id },
            select: questionnaireProgressSelect,
          }) as QuestionnaireProgressSnapshot | null
          if (!completionSnapshot) return { completion: null, contextState: assessmentContextState(existingQA) }
          const frozen = await freezeQuestionnaireAssessmentContextFromSnapshot(tx, completionSnapshot)
          const completion = await refreshQuestionnaireProgress(tx, existingQA.id, completionSnapshot)
          return { completion, contextState: { status: 'frozen' as const, frozenAt: frozen.context.frozenAt } }
        })

        // 所有项目都已完成，返回已完成状态
        if (!completionResult.completion?.completed) return error(res, '测评状态已变化，请刷新后重试', -1, 409)
        return success(res, {
          questionnaireAssessment: {
            id: existingQA.id,
            status: completionResult.completion?.completed ? 'COMPLETED' : existingQA.status,
            progress: completionResult.completion?.completed ? 100 : completionResult.completion?.progress ?? existingQA.progress,
            currentIndex: contentItems.length,
            context: completionResult.contextState,
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

      // 问卷主记录和量表子记录必须原子创建，避免留下半成品测评。
      const qa = await prisma.$transaction(async (tx) => {
        const created = await tx.questionnaireAssessment.create({
          data: {
            questionnaireId: id,
            userId: userId!,
            status: 'IN_PROGRESS',
            progress: 0,
          },
        })

        await tx.assessment.createMany({
          data: questionnaire.questionnaireScales.map(qs => ({
            scaleId: qs.scaleId,
            userId: userId!,
            status: 'IN_PROGRESS',
            progress: 0,
            answers: encryptScaleAnswers([]),
            questionnaireAssessmentId: created.id,
          })),
        })

        await tx.questionnaireFormAnswer.createMany({
          data: questionnaire.formItems.map((item) => ({
            questionnaireAssessmentId: created.id,
            formItemId: item.id,
            value: null,
            status: 'PENDING' as const,
          })),
          skipDuplicates: true,
        })

        return created
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
            context: assessmentContextState(qa),
          },
          currentFormItem: firstItem.data,
          currentFormAnswerRevision: 0,
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
        // Bind the child attempt by scaleId; array order is not a stable
        // authority when a questionnaire contains multiple scales.
        const firstScaleAssessment = scaleAssessments.find((sa) => sa.scaleId === firstItem?.data.scaleId)
        return success(res, {
          questionnaireAssessment: {
            id: qa.id,
            status: qa.status,
            progress: qa.progress,
            currentIndex: 0,
            context: assessmentContextState(qa),
          },
          currentFormItem: null,
          currentScale: {
            ...questionnaireScaleRunner(firstItem?.data.scale),
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
    } catch (err: any) {
      // The partial unique index is authoritative under concurrent starts. A
      // losing insert re-reads through the normal resume path so every caller
      // receives the same winning assessment instead of a duplicate/error.
      if (err?.code === 'P2002') {
        const winner = await prisma.questionnaireAssessment.findFirst({
          where: { questionnaireId: req.params.id, userId: req.user?.userId, status: 'IN_PROGRESS' },
          select: { id: true },
        })
        if (winner) return questionnaireController.startAssessment(req, res)
      }
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      logger.error('开始问卷测评错误', err)
      return error(res, '开始问卷测评失败')
    }
  },

  // 获取问卷测评状态
  async freezeContext(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params
      const result = await withQuestionnaireSerializableTransaction(async (tx) => {
        const assessment = await tx.questionnaireAssessment.findUnique({ where: { id }, select: { userId: true, status: true } })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'closed' as const }
        const frozen = await freezeQuestionnaireAssessmentContext(tx, id)
        return { kind: 'frozen' as const, frozenAt: frozen.context.frozenAt }
      })
      if (result.kind === 'not-found') return notFound(res, '问卷测评不存在')
      if (result.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (result.kind === 'closed') return error(res, '测评已关闭，不能冻结人口学上下文', -1, 409)
      return success(res, { status: 'frozen', frozenAt: result.frozenAt }, '人口学上下文已冻结')
    } catch (err) {
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      logger.error('冻结问卷人口学上下文错误', err)
      return error(res, '冻结人口学上下文失败')
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
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      status: true,
                      instrumentClass: true,
                      instrumentVersion: true,
                      definition: true,
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
          if (!isFormAnswerComplete(item.data, answer)) {
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
      let completion: Awaited<ReturnType<typeof refreshQuestionnaireProgress>> = null

      // 如果所有内容都完成了，保存单项报告集合并更新问卷测评状态
      if (allCompleted && qa.status !== 'COMPLETED') {
        completion = await withQuestionnaireCompletionTransaction(async (tx) => {
          // This GET loaded `qa` outside the mutation transaction. Reload the
          // minimal authoritative snapshot inside Serializable instead of
          // using an observation that may be stale after a concurrent answer.
          const completionSnapshot = await tx.questionnaireAssessment.findUnique({
            where: { id: qa.id },
            select: questionnaireProgressSelect,
          }) as QuestionnaireProgressSnapshot | null
          if (!completionSnapshot) return null
          await freezeQuestionnaireAssessmentContextFromSnapshot(tx, completionSnapshot)
          return refreshQuestionnaireProgress(tx, qa.id, completionSnapshot)
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
          status: completion?.completed ? 'COMPLETED' : qa.status,
          progress: completion?.completed ? 100 : progress,
          currentIndex: allCompleted ? contentItems.length : currentIndex,
          startedAt: qa.startedAt,
          completedAt: completion?.completedAt ?? qa.completedAt,
          totalTime: completion?.totalTime ?? qa.totalTime,
          context: assessmentContextState(qa),
        },
        questionnaire: {
          id: qa.questionnaire.id,
          name: qa.questionnaire.name,
          instruction: qa.questionnaire.instruction,
          totalItems: contentItems.length,
        },
        currentFormItem: currentItem?.type === 'form' ? currentItem.data : null,
        currentFormAnswerRevision: currentItem?.type === 'form'
          ? formAnswerMap.get(currentItem.data.id)?.revision ?? 0
          : null,
        currentScale: currentItem?.type === 'scale' ? {
          ...questionnaireScaleRunner(currentItem.data.scale),
          scaleAssessmentId: saMap.get(currentItem.data.scaleId)?.id,
          assessment: saMap.get(currentItem.data.scaleId)
            ? scaleAssessmentForResponse(saMap.get(currentItem.data.scaleId))
            : undefined,
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
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      logger.error('获取问卷测评状态错误', err)
      return error(res, '获取问卷测评状态失败')
    }
  },

  // 完成问卷测评
  async completeAssessment(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const result = await withQuestionnaireCompletionTransaction(async (tx) => {
        const qa = await tx.questionnaireAssessment.findUnique({
          where: { id },
          select: questionnaireProgressSelect,
        }) as QuestionnaireProgressSnapshot | null

        if (!qa) return { kind: 'not-found' as const }
        if (qa.userId !== userId) return { kind: 'forbidden' as const }

        if (qa.status === 'COMPLETED') {
          return {
            kind: 'completed' as const,
            questionnaireId: qa.questionnaireId,
            completedAt: qa.completedAt,
            totalTime: qa.totalTime,
            collectionReport: buildQuestionnaireCollectionReport(qa),
          }
        }

        await freezeQuestionnaireAssessmentContextFromSnapshot(tx, qa)

        if (qa.scaleAssessments.some((assessment) => assessment.status !== 'COMPLETED')) {
          return { kind: 'incomplete-scales' as const }
        }
        const formAnswerMap = new Map(qa.formAnswers.map((answer) => [answer.formItemId, answer]))
        const missingForms = qa.questionnaire.formItems.filter((item) => !isFormAnswerRequiredComplete(item, formAnswerMap.get(item.id)))
        if (missingForms.length > 0) return { kind: 'incomplete-forms' as const, count: missingForms.length }

        const progress = await refreshQuestionnaireProgress(tx, qa.id, qa)
        if (!progress) return { kind: 'incomplete-forms' as const, count: 0 }
        if (progress.status !== 'IN_PROGRESS' && !progress.completed) return { kind: 'closed' as const }
        if (!progress.completed) return { kind: 'incomplete-forms' as const, count: 0 }
        return {
          kind: 'completed' as const,
          questionnaireId: qa.questionnaireId,
          completedAt: progress.completedAt || new Date(),
          totalTime: progress.totalTime ?? (Date.now() - new Date(qa.startedAt).getTime()),
          collectionReport: progress?.collectionReport || buildQuestionnaireCollectionReport(qa),
        }
      })

      if (result.kind === 'not-found') return notFound(res, '问卷测评不存在')
      if (result.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续提交', -1, 409)
      if (result.kind === 'incomplete-scales') return error(res, '还有量表未完成')
      if (result.kind === 'incomplete-forms') return error(res, `还有 ${result.count} 道必答表单题未完成`, -1, 409)

      return success(res, {
        questionnaireId: result.questionnaireId,
        completedAt: result.completedAt,
        totalTime: result.totalTime,
        ...result.collectionReport,
      }, '问卷测评已完成')
    } catch (err) {
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
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
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      status: true,
                      instrumentClass: true,
                      instrumentVersion: true,
                      definition: true,
                    },
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

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
        select: { id: true, name: true, creatorId: true, type: true }
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await questionnaireAuth.canExport(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限导出此问卷数据')
      }

      // 权限控制：教师必须脱敏，只有管理员可以导出非脱敏数据
      const anonymize = userRole === UserRole.ADMIN ? requestAnonymize : true

      const countWhere: any = { questionnaireId: id, progress: { gte: minProgress } }
      if (!includeProgress) countWhere.status = 'COMPLETED'
      const countDateFilter = utcHalfOpenDateFilter(dateRange)
      if (countDateFilter) countWhere.completedAt = countDateFilter
      const recordCount = await prisma.questionnaireAssessment.count({ where: countWhere })
      if (recordCount > EXPORT_ASYNC_RECORD_THRESHOLD) {
        const queued = await enqueueExportJob({
          resourceType: 'QUESTIONNAIRE',
          resourceId: id,
          createdBy: userId!,
          anonymized: anonymize,
          format,
          options: { anonymize, includeProgress, minProgress, dateRange },
        })
        return success(res, {
          status: 'PROCESSING',
          recordCount,
          fieldCount: null,
          format,
          anonymize,
          batchId: queued.batchId,
          artifacts: queued.artifacts,
        }, '导出任务已创建')
      }

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
      }, format as 'csv' | 'sav', exportData)

      const artifacts: Array<{ id: string; format: string; fileName: string; expiresAt: string; downloadUrl: string }> = []
      const addArtifact = async (filePath: string, artifactFormat: string) => {
        const artifact = await createExportArtifact({
          resourceType: 'QUESTIONNAIRE',
          resourceId: id,
          createdBy: userId!,
          format: artifactFormat,
          anonymized: anonymize,
          storageKey: path.basename(filePath),
        })
        artifacts.push({ id: artifact.id, format: artifactFormat, fileName: path.basename(filePath), expiresAt: artifact.expiresAt.toISOString(), downloadUrl: `/api/questionnaires/exports/${artifact.id}` })
      }
      if (files.csvPath) await addArtifact(files.csvPath, 'csv')
      if (files.savPath) await addArtifact(files.savPath, 'sav')

      logger.info('问卷数据导出成功', {
        questionnaireId: questionnaire.id,
        recordCount: exportData.rows.length,
        format,
        anonymize,
      })

      const result: any = {
        recordCount: exportData.rows.length,
        fieldCount: exportData.fields.length,
        format,
        anonymize,
        artifacts,
      }

      if (files.csvPath) {
        result.fileName = path.basename(files.csvPath)
      }
      if (files.savPath) {
        result.fileName = path.basename(files.savPath)
      }

      return success(res, result, '导出成功')
    } catch (err) {
      logger.error('导出问卷数据错误', err)
      return error(res, '导出问卷数据失败')
    }
  },

  // 获取导出预览
  async getExportPreview(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'COURSE' },
        include: {
          questionnaireScales: {
            include: {
              scale: {
                select: {
                  id: true,
                  name: true,
                  definition: true,
                  instrumentVersion: true,
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

      if (!(await questionnaireAuth.canExport(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限查看此问卷')
      }

      const { exportService } = await import('../services/exportService')

      const previewData = await exportService.getQuestionnaireExportData(id, {
        anonymize: true,
        minProgress: 100
      })

      const totalItems = questionnaire.questionnaireScales.reduce(
        (sum, qs) => sum + scaleItemCountForScale(qs.scale), 0,
      )
      const totalDimensions = questionnaire.questionnaireScales.reduce(
        (sum, qs) => sum + scaleDimensionCount(qs.scale), 0,
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
          itemCount: scaleItemCountForScale(qs.scale),
          dimensionCount: scaleDimensionCount(qs.scale),
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
      const artifactId = req.params.artifactId || req.params.fileName
      const actor = req.user ? { userId: req.user.userId, role: req.user.role } : null
      if (!actor) return forbidden(res, '未授权')
      const resolved = await resolveArtifactForDownload(artifactId, actor)
      if (resolved.reason === 'forbidden') return forbidden(res, '无权限下载此文件')
      if (!resolved.filePath) return notFound(res, '文件不存在')
      return res.download(resolved.filePath)
    } catch (err) {
      logger.error('下载导出文件错误', err)
      return error(res, '下载文件失败')
    }
  },

  async exportArtifactStatus(req: Request, res: Response) {
    try {
      const actor = req.user ? { userId: req.user.userId, role: req.user.role } : null
      if (!actor) return forbidden(res, '未授权')
      const result = await getExportArtifactStatus(req.params.artifactId, actor)
      if (result.reason === 'not-found') return notFound(res, '导出任务不存在')
      if (result.reason === 'forbidden') return forbidden(res, '无权限查看此导出任务')
      return success(res, result.artifact)
    } catch (err) {
      logger.error('获取导出任务状态错误', err)
      return error(res, '获取导出任务状态失败')
    }
  },
}
