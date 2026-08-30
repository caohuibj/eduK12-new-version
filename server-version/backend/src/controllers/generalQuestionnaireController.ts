/**
 * 泛化问卷管理控制器（教师端）
 * 
 * 功能：
 * - 创建和管理泛化问卷
 * - 生成和管理访问令牌
 * - 查看匿名测评数据
 * - 导出数据
 */

import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { serializeQuestionnaireAccessToken, tokenService } from '../services/tokenService'
import { logger } from '../utils/logger'
import { UserRole } from '../types'
import { canUseScale } from '../services/materialGrant'
import { z } from 'zod'
import { validateContextFormItem, validateContextFormItems } from '../modules/assessment-context'
import { questionnaireAuthorizationService as questionnaireAuth } from '../services/questionnaireAuthorizationService'
import { MAX_TOKEN_USES } from '../constants'

const actorFromRequest = (req: Request) => req.user ? { userId: req.user.userId, role: req.user.role } : null

const generalQuestionnaire = async (id: string, include: any = undefined) => {
  const model: any = prisma.questionnaire as any
  if (typeof model.findFirst === 'function') return model.findFirst({ where: { id, type: 'GENERAL' }, ...(include ? { include } : {}) })
  return model.findUnique({ where: { id }, ...(include ? { include } : {}) })
}

const canManageGeneral = async (req: Request, questionnaire: any) => (
  Boolean(questionnaire && await questionnaireAuth.canManageGeneral(actorFromRequest(req), questionnaire))
)

// ==================== Validation Schemas ====================

const createQuestionnaireSchema = z.object({
  code: z.string().min(1, '问卷编码不能为空'),
  name: z.string().min(1, '问卷名称不能为空'),
  description: z.string().optional(),
  instruction: z.string().optional(),
  estimatedTime: z.number().int().positive().optional(),
})

const createTokenSchema = z.object({
  expiresDays: z.number().int().min(1).max(365).default(30),
  maxUses: z.number().int().min(0).max(MAX_TOKEN_USES).default(0), // 0表示无限制
})

// ==================== Controller ====================

export const generalQuestionnaireController = {
  /**
   * 获取泛化问卷列表
   * GET /api/general-questionnaires
   */
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      let where: any = {
        type: 'GENERAL', // 只查询泛化问卷
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
          _count: {
            select: {
              assessments: true,
              accessTokens: true,
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
          const scaleItemCount = qn.questionnaireScales.reduce((sum, qs) => {
            const definition = qs.scale.definition as any
            return sum + (Array.isArray(definition?.items) ? definition.items.length : 0)
          }, 0)
          
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
      logger.error('获取泛化问卷列表错误', err)
      return error(res, '获取问卷列表失败')
    }
  },

  /**
   * 创建泛化问卷
   * POST /api/general-questionnaires
   */
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

      const { code, name, description, instruction, estimatedTime } = result.data

      // 检查编码是否已存在
      const existingQuestionnaire = await prisma.questionnaire.findUnique({
        where: { code },
      })

      if (existingQuestionnaire) {
        return error(res, '问卷编码已存在')
      }

      // 创建泛化问卷（强制 type 为 GENERAL）
      const questionnaire = await prisma.questionnaire.create({
        data: {
          code,
          name,
          description,
          instruction,
          type: 'GENERAL', // 强制为泛化问卷
          visibility: 'HIDDEN', // 泛化问卷不需要 visibility
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

      logger.info('创建泛化问卷', {
        questionnaireId: questionnaire.id,
        code,
        name,
        creatorId: userId,
      })

      return success(res, questionnaire, '问卷创建成功')
    } catch (err) {
      logger.error('创建泛化问卷错误', err)
      return error(res, '创建问卷失败')
    }
  },

  /**
   * 获取访问令牌列表
   * GET /api/general-questionnaires/:id/tokens
   */
  async listTokens(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaire = await generalQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageGeneral(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

      const tokens = await tokenService.getTokensByQuestionnaire(id, { reveal: true })

      return success(res, {
        list: tokens,
        total: tokens.length,
      })
    } catch (err) {
      logger.error('获取访问令牌列表错误', err)
      return error(res, '获取令牌列表失败')
    }
  },

  /**
   * 创建访问令牌
   * POST /api/general-questionnaires/:id/tokens
   */
  async createToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      if (!userId) {
        return error(res, '未登录')
      }

      const result = createTokenSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { expiresDays, maxUses } = result.data

      // 验证问卷是否存在
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (!(await questionnaireAuth.canIssueToken(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限操作此问卷')
      }

      // 检查问卷是否已发布
      if (questionnaire.status !== 'PUBLISHED') {
        return error(res, '问卷未发布，无法生成访问令牌')
      }

      // 计算过期时间
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiresDays)

      // 创建令牌
      const token = await tokenService.createToken({
        questionnaireId: id,
        createdBy: userId,
        expiresAt,
        maxUses,
      })

      logger.info('创建访问令牌', {
        tokenId: token.id,
        questionnaireId: id,
        expiresAt,
        maxUses,
        createdBy: userId,
      })

      return success(res, token, '访问令牌创建成功')
    } catch (err) {
      logger.error('创建访问令牌错误', err)
      return error(res, '创建令牌失败')
    }
  },

  /**
   * 禁用令牌
   * DELETE /api/general-questionnaires/:id/tokens/:tokenId
   */
  async disableToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id, tokenId } = req.params

      // 验证问卷权限
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
        return forbidden(res, '无权限操作此问卷')
      }

      if (!(await questionnaireAuth.hasTokenBinding(id, tokenId))) return notFound(res, '令牌不存在')
      await tokenService.disableToken(tokenId)

      return success(res, null, '令牌已禁用')
    } catch (err) {
      logger.error('禁用令牌错误', err)
      return error(res, '禁用令牌失败')
    }
  },

  /**
   * 获取匿名测评数据
   * GET /api/general-questionnaires/:id/anonymous-assessments
   */
  async getAnonymousAssessments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      // 验证问卷权限
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await questionnaireAuth.canReadResponses(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限查看此问卷数据')
      }

      // 获取匿名测评数据
      const assessments = await prisma.questionnaireAssessment.findMany({
        where: {
          questionnaireId: id,
          tokenId: { not: null }, // 只查询匿名测评
        },
        include: {
          token: {
            select: {
              id: true,
              expiresAt: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      })

      return success(res, {
        list: assessments,
        total: assessments.length,
      })
    } catch (err) {
      logger.error('获取匿名测评数据错误', err)
      return error(res, '获取数据失败')
    }
  },

  /**
   * 导出匿名测评数据
   * GET /api/general-questionnaires/:id/export
   */
  async exportData(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      // 验证问卷权限
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await questionnaireAuth.canExport(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限导出此问卷数据')
      }

      // 调用导出服务
      const { exportQuestionnaireToCSV } = await import('../services/exportService')
      
      const csvData = await exportQuestionnaireToCSV(id, {
        anonymize: true, // 匿名数据默认脱敏
      })

      // 设置响应头
      const timestamp = Date.now()
      const safeCode = questionnaire.code.replace(/[^a-zA-Z0-9_-]/g, '_') // 移除特殊字符
      const filename = `general_questionnaire_${safeCode}_${timestamp}.csv`
      const encodedFilename = encodeURIComponent(filename) // URL编码中文
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`)

      logger.info('导出泛化问卷数据', {
        questionnaireId: id,
        filename,
        userId,
      })

      return res.send(csvData)
    } catch (err) {
      logger.error('导出数据错误', err)
      return error(res, '导出失败')
    }
  },

  /**
   * 获取问卷关联的量表列表
   * GET /api/general-questionnaires/:id/scales
   */
  async listScales(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaire = await generalQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageGeneral(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

      const scales = await prisma.questionnaireScale.findMany({
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
        orderBy: { position: 'asc' },
      })

      return success(res, {
        list: scales,
        total: scales.length,
      })
    } catch (err) {
      logger.error('获取问卷量表列表错误', err)
      return error(res, '获取量表列表失败')
    }
  },

  /**
   * 添加量表到问卷
   * POST /api/general-questionnaires/:id/scales
   */
  async addScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params
      const { scaleId, position } = req.body

      if (!scaleId) {
        return error(res, '量表ID不能为空')
      }

      // 验证问卷权限
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
        return forbidden(res, '无权限操作此问卷')
      }

      // 检查量表是否存在
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (!userId || !(await canUseScale(userId, req.user?.role as UserRole, scale))) {
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
        return error(res, '该量表已添加到问卷')
      }

      // 添加关联
      const questionnaireScale = await prisma.questionnaireScale.create({
        data: {
          questionnaireId: id,
          scaleId,
          position: position ?? 0,
        },
      })

      logger.info('添加量表到泛化问卷', {
        questionnaireId: id,
        scaleId,
        userId,
      })

      return success(res, questionnaireScale, '量表添加成功')
    } catch (err) {
      logger.error('添加量表错误', err)
      return error(res, '添加量表失败')
    }
  },

  /**
   * 从问卷移除量表
   * DELETE /api/general-questionnaires/:id/scales/:scaleId
   */
  async removeScale(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id, scaleId } = req.params

      // 验证问卷权限
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
        return forbidden(res, '无权限操作此问卷')
      }

      // 删除关联
      await prisma.questionnaireScale.delete({
        where: {
          questionnaireId_scaleId: {
            questionnaireId: id,
            scaleId,
          },
        },
      })

      logger.info('从泛化问卷移除量表', {
        questionnaireId: id,
        scaleId,
        userId,
      })

      return success(res, null, '量表已移除')
    } catch (err) {
      logger.error('移除量表错误', err)
      return error(res, '移除量表失败')
    }
  },

  /**
   * 获取泛化问卷详情
   * GET /api/general-questionnaires/:id
   */
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findFirst({
        where: {
          id,
          type: 'GENERAL',
        },
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
          accessTokens: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 10, // 只返回最近10个令牌
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

      if (!(await canManageGeneral(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

      return success(res, {
        ...questionnaire,
        accessTokens: questionnaire.accessTokens.map((token: any) => serializeQuestionnaireAccessToken(token, true)),
      })
    } catch (err) {
      logger.error('获取泛化问卷详情错误', err)
      return error(res, '获取问卷详情失败')
    }
  },

  /**
   * 发布泛化问卷
   * POST /api/general-questionnaires/:id/publish
   */
  async publish(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'GENERAL' },
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

      if (!(await canManageGeneral(req, questionnaire))) {
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
          (qs) => qs.scale.status !== 'PUBLISHED'
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

      logger.info('发布泛化问卷', {
        questionnaireId: id,
        userId,
      })

      return success(res, updated, '问卷发布成功')
    } catch (err) {
      logger.error('发布泛化问卷错误', err)
      return error(res, '发布问卷失败')
    }
  },

  /**
   * 废弃泛化问卷
   * POST /api/general-questionnaires/:id/deprecate
   */
  async deprecate(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
        return forbidden(res, '无权限废弃此问卷')
      }

      const updated = await prisma.questionnaire.update({
        where: { id },
        data: { status: 'DEPRECATED' },
      })

      return success(res, updated, '问卷已废弃')
    } catch (err) {
      logger.error('废弃泛化问卷错误', err)
      return error(res, '废弃问卷失败')
    }
  },

  /**
   * 复制问卷
   * POST /api/general-questionnaires/:id/duplicate
   */
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
        where: { id, type: 'GENERAL' },
        include: {
          formItems: true,
          questionnaireScales: true,
        },
      })

      if (!original) {
        return notFound(res, '问卷不存在')
      }

      // 权限检查
      if (!(await canManageGeneral(req, original))) {
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
            type: 'GENERAL',
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

      logger.info('泛化问卷复制成功', {
        originalId: id,
        newId: newQuestionnaire.id,
        userId,
      })

      return success(res, newQuestionnaire, '问卷复制成功')
    } catch (err: any) {
      logger.error('泛化问卷复制错误', err)

      // 处理唯一性冲突
      if (err.code === 'P2002') {
        return error(res, '问卷编码重复，请稍后重试')
      }

      return error(res, '复制失败，请稍后重试')
    }
  },

  // ==================== 表单题目管理 ====================

  /**
   * 获取表单题目列表
   * GET /api/general-questionnaires/:id/form-items
   */
  async listFormItems(req: Request, res: Response) {
    try {
      const { id } = req.params

      // Form items are questionnaire configuration, not a public resource.
      // Keep the same object/type authorization boundary as the other
      // general-questionnaire endpoints before querying by the foreign key.
      const questionnaire = await generalQuestionnaire(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await canManageGeneral(req, questionnaire))) return forbidden(res, '无权限查看此问卷')

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

  /**
   * 添加表单题目
   * POST /api/general-questionnaires/:id/form-items
   */
  async addFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const addFormItemSchema = z.object({
        type: z.enum(['fill_blank', 'single_choice', 'multiple_choice', 'text_input', 'year_month']),
        label: z.string().min(1, '题目标签不能为空'),
        placeholder: z.string().optional(),
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
        where: { id, type: 'GENERAL' },
        include: { formItems: true },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
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

      logger.info('添加表单题目到泛化问卷', { questionnaireId: id, formItemId: formItem.id, userId })

      return success(res, formItem, '表单题目添加成功')
    } catch (err) {
      logger.error('添加表单题目错误', err)
      return error(res, '添加表单题目失败')
    }
  },

  /**
   * 更新表单题目
   * PUT /api/general-questionnaires/:id/form-items/:itemId
   */
  async updateFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
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

      // 检查表单题目是否存在
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

      if (!(await canManageGeneral(req, formItem.questionnaire)) || formItem.questionnaire.type !== 'GENERAL') {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      const contextIssues = validateContextFormItem({
        id: formItem.id,
        type: result.data.type ?? formItem.type,
        label: result.data.label ?? formItem.label,
        required: result.data.required ?? formItem.required,
        position: result.data.position ?? formItem.position,
        contextKey: result.data.contextKey !== undefined ? result.data.contextKey : formItem.contextKey,
        options: result.data.options !== undefined ? result.data.options : formItem.options,
      })
      if (contextIssues.length > 0) return error(res, contextIssues[0].message)

      // 处理 options 字段
      const updateData: any = { ...result.data }
      if (updateData.options !== undefined) {
        updateData.options = updateData.options ? JSON.parse(JSON.stringify(updateData.options)) : null
      }

      const updated = await prisma.questionnaireFormItem.update({
        where: { id: itemId },
        data: updateData,
      })

      logger.info('更新泛化问卷表单题目', { questionnaireId: id, formItemId: itemId, userId })

      return success(res, updated, '表单题目更新成功')
    } catch (err) {
      logger.error('更新表单题目错误', err)
      return error(res, '更新表单题目失败')
    }
  },

  /**
   * 删除表单题目
   * DELETE /api/general-questionnaires/:id/form-items/:itemId
   */
  async removeFormItem(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id, itemId } = req.params

      // 检查表单题目是否存在
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

      if (!(await canManageGeneral(req, formItem.questionnaire)) || formItem.questionnaire.type !== 'GENERAL') {
        return forbidden(res, '无权限修改此问卷')
      }

      if (formItem.questionnaire.status === 'PUBLISHED') {
        return error(res, '已发布的问卷不能修改')
      }

      await prisma.questionnaireFormItem.delete({
        where: { id: itemId },
      })

      logger.info('删除泛化问卷表单题目', { questionnaireId: id, formItemId: itemId, userId })

      return success(res, null, '表单题目删除成功')
    } catch (err) {
      logger.error('删除表单题目错误', err)
      return error(res, '删除表单题目失败')
    }
  },

  /**
   * 统一排序（表单题目和量表混合排序）
   * POST /api/general-questionnaires/:id/content/reorder
   */
  async reorderContent(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
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
      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
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

      logger.info('泛化问卷内容排序更新', { questionnaireId: id, userId })

      return success(res, null, '内容排序更新成功')
    } catch (err) {
      logger.error('内容排序错误', err)
      return error(res, '内容排序失败')
    }
  },

  /**
   * 更新泛化问卷基本信息
   * PUT /api/general-questionnaires/:id
   */
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const updateSchema = z.object({
        name: z.string().min(1, '问卷名称不能为空').optional(),
        description: z.string().optional(),
        instruction: z.string().optional(),
        estimatedTime: z.number().int().positive().optional(),
      })

      const result = updateSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const questionnaire = await generalQuestionnaire(id)

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      if (!(await canManageGeneral(req, questionnaire))) {
        return forbidden(res, '无权限修改此问卷')
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

      logger.info('更新泛化问卷', { questionnaireId: id, userId })

      return success(res, updated, '问卷更新成功')
    } catch (err) {
      logger.error('更新泛化问卷错误', err)
      return error(res, '更新问卷失败')
    }
  },
}
