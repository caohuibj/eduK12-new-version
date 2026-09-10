import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound, completionBusy, assessmentSubmitBusy, instrumentError } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { z } from 'zod'
import * as path from 'path'
import * as fs from 'fs'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { encryptField } from '../utils/encryption'
import { canUseScale, scaleSource, scaleWhereForViewer } from '../services/materialGrant'
import {
  refreshQuestionnaireProgress,
  withScaleAnswerTransaction,
  withScaleCompletionTransaction,
} from '../services/questionnaireProgressService'
import {
  createCustomScaleDefinition,
  hashScaleDefinition,
  validateScaleDefinition,
  type ScaleDefinitionV2,
} from '../modules/scale/scale-definition'
import { getScalePackage, validateScalePackage } from '../modules/scale/scale-package.registry'
import { canStudentAccessScale } from '../modules/scale/scale-access'
import {
  buildScaleResultForRecord,
  encryptScaleAnswers,
  encryptScaleResult,
  readScaleAnswers,
  readScaleResult,
  scaleAssessmentForResponse,
  scaleDefinitionFromRecord,
  scaleRunnerFromRecord,
} from '../modules/scale/scale-workflow.service'
import { mergeScaleAnswersWithRevision } from '../modules/scale/scale-answer-concurrency'
import { getScaleCustomScorerKeys, missingRequiredScaleItemCodes, validateScaleAnswer } from '../modules/scale/scale-scoring'
import { freezeQuestionnaireAssessmentContext, isAssessmentContextServiceError } from '../services/assessmentContextService'
import { createExportArtifact, getExportArtifactStatus, resolveArtifactForDownload } from '../services/exportArtifactService'
import { enqueueExportJob, EXPORT_ASYNC_RECORD_THRESHOLD } from '../services/exportJobService'
import { utcHalfOpenDateFilter } from '../services/exportService'
import { restartStandaloneScaleAssessment, submitScaleAssessmentFinal, isFinalScaleSubmitError } from '../modules/scale/scale-final-submit.service'
import { encryptFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart } from '../modules/assessment-runtime/runtime-snapshot'
import { standaloneAdmissionPersistence } from '../modules/scale/scale-admission.service'
import { finalScaleSubmitSchema } from '../services/scale-final-submit.schema'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  isTransientCompletionDatabaseError,
} from '../services/questionnaireCompletionAdmission'
import { isUnitSubmitAdmissionBusyError } from '../services/unitSubmitAdmission'
import { deviceInputProvenanceV1Schema } from '../modules/scale/device-input-provenance'

// ==================== Validation Schemas ====================

const createScaleSchema = z.object({
  code: z.string().min(1, '量表编码不能为空'),
  name: z.string().min(1, '量表名称不能为空'),
  description: z.string().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  estimatedTime: z.number().int().positive().optional(),
  instruction: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
})

const updateScaleSchema = z.object({
  name: z.string().min(1, '量表名称不能为空').optional(),
  description: z.string().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  estimatedTime: z.number().int().positive().optional(),
  instruction: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
})

const definitionRequestSchema = z.object({
  definition: z.unknown(),
})

const answerPreviewSchema = z.object({
  answers: z.array(z.object({
    itemCode: z.string().min(1),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().nonnegative().optional(),
    answeredAt: z.string().optional(),
    changeCount: z.number().int().nonnegative().optional(),
  })),
})

const scaleBatchAnswerSchema = z.object({
  checkpointSequence: z.number().int().positive().optional(),
  deviceInputProvenance: deviceInputProvenanceV1Schema.optional(),
  answers: z.array(z.object({
    checkpointId: z.string().min(1).optional(),
    checkpointSequence: z.number().int().positive().optional(),
    itemCode: z.string().min(1),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().nonnegative().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })).min(1).max(10),
})

const definitionIssuesMessage = (issues: Array<{ path: string; message: string }>): string => (
  issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`).join('；')
)

const definitionSummary = (definition: unknown): { itemCount: number; dimensionCount: number } => {
  const value = definition && typeof definition === 'object' ? definition as any : null
  const items = Array.isArray(value?.items) ? value.items : []
  const scores = Array.isArray(value?.scoring?.scores) ? value.scoring.scores : []
  return { itemCount: items.length, dimensionCount: scores.filter((score: any) => score?.type === 'dimension').length }
}

// ==================== Controller ====================

export const scaleController = {
  // 获取量表列表（管理端）
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, status } = req.query
      const pagination = getPaginationParams(req)

      const extra: Record<string, unknown> = {}

      // 按课程筛选
      if (courseId) {
        extra.courseScales = { some: { courseId: courseId as string } }
      }

      // 按状态筛选
      if (status) {
        extra.status = status as string
      }

      const where = await scaleWhereForViewer(userId as string, userRole as UserRole, extra)

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

      const withSource = scales.map((scale) => ({
        ...scale,
        source: scaleSource(userId as string, userRole as UserRole, scale),
      }))
      const result = buildPaginatedResult(withSource, total, pagination)
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

      const { code, name, description, visibility, estimatedTime, instruction, tags } = result.data
      const definition = createCustomScaleDefinition()
      const summary = definitionSummary(definition)

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
          instrumentClass: 'CUSTOM_DESCRIPTIVE',
          instrumentVersion: '2.0.0',
          definition: definition as any,
          definitionHash: hashScaleDefinition(definition),
          ...summary,
          estimatedTime,
          instruction,
          creatorId: userId,
          tags,
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

  // 原子保存完整的 ScaleDefinitionV2。新建的教师量表只能是描述性自定义量表。
  async updateDefinition(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const parsedBody = definitionRequestSchema.safeParse(req.body)
      if (!parsedBody.success) return error(res, '请提供完整的 definition')

      const scale = await prisma.scale.findUnique({ where: { id } })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限修改此量表')
      if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') return error(res, 'STANDARD 量表 definition 由代码 package 管理，不能通过网页修改')
      if (scale.status !== 'DRAFT') return error(res, '只有草稿状态的量表可以修改 definition')

      const validation = validateScaleDefinition(parsedBody.data.definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
      if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
        return error(res, definitionIssuesMessage(validation.issues))
      }
      const updated = await prisma.scale.update({
        where: { id },
        data: { definition: validation.definition as any, definitionHash: hashScaleDefinition(validation.definition), ...definitionSummary(validation.definition) },
      })
      return success(res, { ...updated, definition: validation.definition }, 'definition 保存成功')
    } catch (err) {
      logger.error('保存量表 definition 错误', err)
      return error(res, '保存量表 definition 失败')
    }
  },

  // 发布前返回可定位的 release gate 问题；不会修改数据库。
  async validateDefinition(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const scale = await prisma.scale.findUnique({ where: { id } })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限校验此量表')
      if (scale.instrumentClass === 'STANDARD') {
        const scalePackage = getScalePackage(scale.code, scale.instrumentVersion)
        if (!scalePackage) return success(res, { valid: false, issues: [{ path: 'package', message: 'STANDARD package 未注册', severity: 'error' }], definitionHash: scale.definitionHash })
        const packageValidation = validateScalePackage(scalePackage)
        return success(res, packageValidation)
      }
      const validation = validateScaleDefinition(scale.definition, {
        instrumentClass: scale.instrumentClass,
        forPublish: true,
        scorerKeys: getScaleCustomScorerKeys(),
        requireGoldenFixture: false,
        hasGoldenFixture: false,
      })
      return success(res, {
        valid: Boolean(validation.definition) && validation.issues.every((issue) => issue.severity !== 'error'),
        issues: validation.issues,
        definitionHash: validation.definition ? hashScaleDefinition(validation.definition) : null,
      })
    } catch (err) {
      logger.error('校验量表 definition 错误', err)
      return error(res, '校验量表 definition 失败')
    }
  },

  // 用给定回答执行同一套权威 scorer，不写入测评记录。
  async previewDefinition(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const body = answerPreviewSchema.safeParse(req.body)
      if (!body.success) return error(res, body.error.errors[0]?.message ?? '回答格式不正确')
      const scale = await prisma.scale.findUnique({
        where: { id },
        select: { id: true, code: true, name: true, creatorId: true, instrumentVersion: true, instrumentClass: true, definition: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限预览此量表')
      const result = await buildScaleResultForRecord({
        scale,
        answers: body.data.answers,
      })
      return success(res, result)
    } catch (err) {
      logger.error('预览量表计分错误', err)
      return error(res, err instanceof Error ? err.message : '预览量表计分失败')
    }
  },

  async publishV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const scale = await prisma.scale.findUnique({ where: { id } })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限发布此量表')
      if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') return error(res, 'STANDARD 量表必须由代码 package 发布，网页只读')
      if (scale.status !== 'DRAFT') return error(res, '只有草稿状态的量表可以发布')

      const validation = validateScaleDefinition(scale.definition, {
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        forPublish: true,
        scorerKeys: getScaleCustomScorerKeys(),
      })
      if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
        return error(res, definitionIssuesMessage(validation.issues))
      }
      const updated = await prisma.scale.update({
        where: { id },
        data: { status: 'PUBLISHED', definition: validation.definition as any, definitionHash: hashScaleDefinition(validation.definition), ...definitionSummary(validation.definition) },
      })
      return success(res, updated, '量表发布成功')
    } catch (err) {
      logger.error('发布 v2 量表错误', err)
      return error(res, '发布量表失败')
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

      let runner = null
      if (req.user?.role === UserRole.ADMIN) {
        // Administrators can inspect every scale for management and support.
      } else if (req.user?.role === UserRole.TEACHER) {
        if (!(await canUseScale(req.user.userId, req.user.role, scale))) return notFound(res, '量表不存在')
      } else if (req.user?.role === UserRole.STUDENT) {
        if (!(await canStudentAccessScale(scale, req.user.userId))) return notFound(res, '量表不存在')
      } else {
        return forbidden(res, '无权限查看此量表')
      }
      if (scale.definition) {
        try {
          runner = scaleRunnerFromRecord(scale)
        } catch {
          runner = null
        }
      }
      if (req.user?.role === UserRole.STUDENT) {
        const { definition: _definition, ...metadata } = scale
        return success(res, { ...metadata, runner })
      }
      return success(res, { ...scale, runner })
    } catch (err) {
      logger.error('获取量表详情错误', err)
      return error(res, '获取量表详情失败')
    }
  },

  // 更新量表元数据
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

      const payload = result.data

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
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          visibility: true,
          estimatedTime: true,
          itemCount: true,
          dimensionCount: true,
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
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 批量查询所有尝试（消除 N+1 查询）。PR25 只限制同时一个
      // IN_PROGRESS 尝试，历史完成/放弃记录仍用于稳定的列表 DTO。
      const assessments = await prisma.assessment.findMany({
        where: {
          userId,
          scaleId: { in: scales.map(s => s.id) },
          questionnaireAssessmentId: null,
          compositeAttemptId: null,
        },
        select: { id: true, scaleId: true, status: true, startedAt: true, progress: true, completedAt: true }
      })

      const assessmentsByScale = new Map<string, typeof assessments>()
      assessments.forEach((assessment) => {
        const bucket = assessmentsByScale.get(assessment.scaleId) || []
        bucket.push(assessment)
        assessmentsByScale.set(assessment.scaleId, bucket)
      })

      const scalesWithStatus = scales.map(scale => {
        const attempts = assessmentsByScale.get(scale.id) || []
        const activeAttempt = attempts
          .filter((attempt) => attempt.status === 'IN_PROGRESS')
          .sort((left, right) => left.id.localeCompare(right.id))[0] || null
        const latestCompletedAttempt = attempts
          .filter((attempt) => attempt.status === 'COMPLETED')
          .sort((left, right) => (right.completedAt?.getTime() || 0) - (left.completedAt?.getTime() || 0))[0] || null
        return {
          id: scale.id,
          code: scale.code,
          name: scale.name,
          description: scale.description,
          visibility: scale.visibility,
          estimatedTime: scale.estimatedTime,
          courses: scale.courseScales.map(cs => cs.course),
          itemCount: scale.itemCount,
          dimensionCount: scale.dimensionCount,
          completed: Boolean(latestCompletedAttempt),
          inProgress: Boolean(activeAttempt),
          completedAt: latestCompletedAttempt?.completedAt || null,
          assessmentId: activeAttempt?.id || latestCompletedAttempt?.id || null,
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
        list: scalesWithStatus,
        total: scalesWithStatus.length,
      })
    } catch (err) {
      logger.error('获取可用量表列表错误', err)
      return error(res, '获取可用量表列表失败')
    }
  },

  // ==================== Scale Assessment v2 workflow ====================

  async submitFinalAssessment(req: Request, res: Response) {
    try {
      const input = finalScaleSubmitSchema.safeParse(req.body)
      if (!input.success) return error(res, input.error.errors[0].message)
      const data = await submitScaleAssessmentFinal({
        assessmentId: req.params.assessmentId,
        userId: req.user?.userId ?? null,
        ...input.data,
      })
      return success(res, data, data.replayed ? '量表提交已确认' : '量表提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isFinalScaleSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      logger.error('最终提交量表错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, err instanceof Error ? err.message : '提交量表失败')
    }
  },

  async restartAssessmentV2(req: Request, res: Response) {
    try {
      if (!req.user?.userId) return forbidden(res, '请先登录')
      const data = await restartStandaloneScaleAssessment(req.params.assessmentId, req.user.userId)
      return success(res, data, '量表测评已重启')
    } catch (err) {
      if (isFinalScaleSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      logger.error('重启量表测评错误', err)
      return error(res, err instanceof Error ? err.message : '重启量表测评失败')
    }
  },

  async startAssessmentV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { scaleId } = req.params
      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        select: { id: true, code: true, name: true, description: true, instruction: true, estimatedTime: true, status: true, visibility: true, instrumentVersion: true, instrumentClass: true, definition: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (req.user?.role === UserRole.STUDENT && !(await canStudentAccessScale(scale, userId!))) {
        return notFound(res, '量表不存在')
      }
      if (scale.status !== 'PUBLISHED') return error(res, '量表未发布')
      const definition = scaleDefinitionFromRecord(scale)
      const runner = scaleRunnerFromRecord(scale)

      const existing = await prisma.assessment.findFirst({
        where: {
          scaleId,
          userId,
          status: 'IN_PROGRESS',
          questionnaireAssessmentId: null,
          compositeAttemptId: null,
        },
      })
      if (existing) {
        const stored = readScaleAnswers(existing.answers)
        if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
        return success(res, {
          assessment: scaleAssessmentForResponse(existing),
          scale: { id: scale.id, code: scale.code, name: scale.name, description: scale.description, instruction: scale.instruction, estimatedTime: scale.estimatedTime, definition: runner, definitionHash: hashScaleDefinition(definition) },
        }, '继续未完成的测评')
      }

      let assessment
      const runtimeSnapshot = await freezeScaleRuntimeAtAttemptStart(prisma as any, {
        instrumentKey: scale.code,
        instrumentVersion: scale.instrumentVersion,
        definition,
      })
      try {
        assessment = await prisma.assessment.create({
          data: {
            scaleId,
            userId: userId!,
            status: 'IN_PROGRESS',
            deliveryMode: 'FINAL_ONLY',
            runtimeGeneration: 'UNIFIED_V1',
            runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtimeSnapshot),
            compiledRuntimeHash: runtimeSnapshot.compiledRuntime.compiledRuntimeHash,
            ...standaloneAdmissionPersistence({
              attemptEpoch: 1,
              userId: userId!,
              scale: {
                id: scale.id,
                code: scale.code,
                name: scale.name,
                instrumentVersion: scale.instrumentVersion,
              },
            }),
            attemptEpoch: 1,
            progress: 0,
            answers: encryptField([]),
            startedAt: new Date(),
          },
        })
      } catch (err: any) {
        // The partial unique index is the final concurrency boundary. If a
        // competing request won the insert, return that authoritative row.
        if (err?.code !== 'P2002') throw err
        assessment = await prisma.assessment.findFirst({
          where: {
            scaleId,
            userId,
            status: 'IN_PROGRESS',
            questionnaireAssessmentId: null,
            compositeAttemptId: null,
          },
        })
        if (!assessment) throw err
        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
        return success(res, {
          assessment: scaleAssessmentForResponse(assessment),
          scale: { id: scale.id, code: scale.code, name: scale.name, description: scale.description, instruction: scale.instruction, estimatedTime: scale.estimatedTime, definition: runner, definitionHash: hashScaleDefinition(definition) },
        }, '继续未完成的测评')
      }
      return success(res, {
        assessment: scaleAssessmentForResponse(assessment),
        scale: { id: scale.id, code: scale.code, name: scale.name, description: scale.description, instruction: scale.instruction, estimatedTime: scale.estimatedTime, definition: runner, definitionHash: hashScaleDefinition(definition) },
      }, '测评已开始')
    } catch (err) {
      logger.error('开始 v2 量表测评错误', err)
      return error(res, err instanceof Error ? err.message : '开始测评失败')
    }
  },

  async submitAnswerV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const itemCode = typeof req.body?.itemCode === 'string' ? req.body.itemCode : ''
      const responseValue = req.body?.responseValue as string | number
      const responseTimeMs = req.body?.responseTimeMs ?? req.body?.responseTime
      const expectedRevisionResult = z.number().int().nonnegative().optional().safeParse(req.body?.expectedRevision)
      const deviceInputProvenanceResult = deviceInputProvenanceV1Schema.optional().safeParse(req.body?.deviceInputProvenance)
      if (!itemCode || (typeof responseValue !== 'string' && typeof responseValue !== 'number')) return error(res, 'itemCode 和 responseValue 不能为空')
      if (!expectedRevisionResult.success) return error(res, 'expectedRevision 必须是非负整数')
      if (!deviceInputProvenanceResult.success) return error(res, 'deviceInputProvenance 无效')
      const expectedRevision = expectedRevisionResult.data
      const deviceInputProvenance = deviceInputProvenanceResult.data

      const transactionResult = await withScaleAnswerTransaction(assessmentId, async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: assessmentId },
          include: {
            scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true } },
            questionnaireAssessment: { select: { contextSnapshotEncrypted: true, contextSnapshotHash: true } },
          },
        })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }
        const definition = scaleDefinitionFromRecord(assessment.scale)
        const answer = { itemCode, responseValue, responseTimeMs: responseTimeMs === undefined ? undefined : Number(responseTimeMs), answeredAt: new Date().toISOString() }
        try {
          validateScaleAnswer(definition, answer)
        } catch (err) {
          return { kind: 'invalid-answer' as const, message: err instanceof Error ? err.message : '回答不合法' }
        }
        if (
          assessment.questionnaireAssessmentId
          && (!assessment.questionnaireAssessment?.contextSnapshotEncrypted || !assessment.questionnaireAssessment?.contextSnapshotHash)
        ) {
          await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessmentId)
        }
        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const persistedProvenance = deviceInputProvenance ?? stored.deviceInputProvenance
        const merged = mergeScaleAnswersWithRevision(stored.answers, [{ ...answer, expectedRevision }])
        if (merged.kind === 'stale') return { kind: 'stale-answer' as const }
        const answers = merged.answers
        const progress = definition.items.length === 0 ? 100 : Math.round((new Set(answers.map((candidate) => candidate.itemCode)).size / definition.items.length) * 100)
        const updated = await tx.assessment.updateMany({
          where: { id: assessmentId, userId, status: 'IN_PROGRESS', answersRevision: assessment.answersRevision ?? 0 },
          data: {
            answers: encryptScaleAnswers(answers, persistedProvenance),
            progress,
            ...(merged.changedCount > 0 ? { answersRevision: { increment: merged.changedCount } } : {}),
          },
        })
        if (updated.count !== 1) return { kind: 'stale-answer' as const }
        return {
          kind: 'saved' as const,
          assessment: scaleAssessmentForResponse({
            ...assessment,
            answers,
            deviceInputProvenance: persistedProvenance,
            answersRevision: (assessment.answersRevision ?? 0) + merged.changedCount,
            progress,
            result: null,
          }),
        }
      })

      if (transactionResult.kind === 'not-found') return notFound(res, '测评记录不存在')
      if (transactionResult.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (transactionResult.kind === 'ended') return error(res, '测评已结束')
      if (transactionResult.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (transactionResult.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员')
      if (transactionResult.kind === 'invalid-answer') return error(res, transactionResult.message)
      return success(res, transactionResult.assessment, '答案已保存')
    } catch (err) {
      logger.error('提交 v2 量表答案错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, err instanceof Error ? err.message : '提交答案失败')
    }
  },

  async submitAnswersBatchV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const parsed = scaleBatchAnswerSchema.safeParse(req.body)
      if (!parsed.success) return error(res, parsed.error.errors[0].message)

      const transactionResult = await withScaleAnswerTransaction(assessmentId, async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: assessmentId },
          include: {
            scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true } },
            questionnaireAssessment: { select: { contextSnapshotEncrypted: true, contextSnapshotHash: true } },
          },
        })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }

        const definition = scaleDefinitionFromRecord(assessment.scale)
        const answers = parsed.data.answers.map((input) => ({
          itemCode: input.itemCode,
          responseValue: input.responseValue,
          responseTimeMs: input.responseTimeMs,
          answeredAt: new Date().toISOString(),
          expectedRevision: input.expectedRevision,
        }))
        for (const answer of answers) {
          try {
            validateScaleAnswer(definition, answer)
          } catch (err) {
            return { kind: 'invalid-answer' as const, message: err instanceof Error ? err.message : '回答不合法' }
          }
        }

        if (
          assessment.questionnaireAssessmentId
          && (!assessment.questionnaireAssessment?.contextSnapshotEncrypted || !assessment.questionnaireAssessment?.contextSnapshotHash)
        ) {
          await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessmentId)
        }

        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const persistedProvenance = parsed.data.deviceInputProvenance ?? stored.deviceInputProvenance
        const mergedResult = mergeScaleAnswersWithRevision(stored.answers, answers)
        if (mergedResult.kind === 'stale') return { kind: 'stale-answer' as const }
        const merged = mergedResult.answers
        const progress = definition.items.length === 0
          ? 100
          : Math.round((new Set(merged.map((candidate) => candidate.itemCode)).size / definition.items.length) * 100)
        const updated = await tx.assessment.updateMany({
          where: { id: assessmentId, userId, status: 'IN_PROGRESS', answersRevision: assessment.answersRevision ?? 0 },
          data: {
            answers: encryptScaleAnswers(merged, persistedProvenance),
            progress,
            ...(mergedResult.changedCount > 0 ? { answersRevision: { increment: mergedResult.changedCount } } : {}),
          },
        })
        if (updated.count !== 1) return { kind: 'stale-answer' as const }
        return {
          kind: 'saved' as const,
          progress,
          acceptedIds: parsed.data.answers.flatMap((answer) => answer.checkpointId ? [answer.checkpointId] : []),
          acceptedSequences: parsed.data.answers.flatMap((answer) => answer.checkpointSequence ? [answer.checkpointSequence] : []),
        }
      })

      if (transactionResult.kind === 'not-found') return notFound(res, '测评记录不存在')
      if (transactionResult.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (transactionResult.kind === 'ended') return error(res, '测评已结束')
      if (transactionResult.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (transactionResult.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员')
      if (transactionResult.kind === 'invalid-answer') return error(res, transactionResult.message)
      return success(res, {
        saved: parsed.data.answers.length,
        progress: transactionResult.progress,
        acceptedIds: transactionResult.acceptedIds,
        acceptedSequences: transactionResult.acceptedSequences,
      }, '答案已保存')
    } catch (err) {
      logger.error('批量提交 v2 量表答案错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, err instanceof Error ? err.message : '提交答案失败')
    }
  },

  async completeAssessmentV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const transactionResult = await withScaleCompletionTransaction(async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: assessmentId },
          include: { scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true } } },
        })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        if (assessment.status === 'COMPLETED') {
          return { kind: 'completed' as const, assessment: scaleAssessmentForResponse(assessment) }
        }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }
        const contextSnapshot = assessment.questionnaireAssessmentId
          ? await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessmentId)
          : null
        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const definition = scaleDefinitionFromRecord(assessment.scale)
        const missingRequiredItems = missingRequiredScaleItemCodes(definition, stored.answers)
        if (missingRequiredItems.length > 0) return { kind: 'missing-required' as const, count: missingRequiredItems.length }
        const result = await buildScaleResultForRecord({
          scale: assessment.scale,
          answers: stored.answers,
          participantContext: contextSnapshot?.context.values,
          participantContextHash: contextSnapshot?.hash,
        })
        const completedAt = new Date()
        const totalTime = completedAt.getTime() - new Date(assessment.startedAt).getTime()
        const updated = await tx.assessment.updateMany({
          where: { id: assessmentId, userId, status: 'IN_PROGRESS' },
          data: {
            status: 'COMPLETED',
            answers: encryptScaleAnswers(stored.answers, stored.deviceInputProvenance),
            result: encryptScaleResult(result),
            completedAt,
            totalTime,
            progress: 100,
          },
        })
        if (updated.count !== 1) {
          const current = await tx.assessment.findUnique({ where: { id: assessmentId } })
          if (current?.status === 'COMPLETED') {
            return { kind: 'completed' as const, assessment: scaleAssessmentForResponse(current) }
          }
          return { kind: 'ended' as const }
        }
        if (assessment.questionnaireAssessmentId) await refreshQuestionnaireProgress(tx, assessment.questionnaireAssessmentId)
        return {
          kind: 'completed' as const,
          assessment: scaleAssessmentForResponse({
            ...assessment,
            status: 'COMPLETED' as const,
            answers: stored.answers,
            deviceInputProvenance: stored.deviceInputProvenance,
            result,
            completedAt,
            totalTime,
            progress: 100,
          }),
        }
      })

      if (transactionResult.kind === 'not-found') return notFound(res, '测评记录不存在')
      if (transactionResult.kind === 'forbidden') return forbidden(res, '无权限操作此测评')
      if (transactionResult.kind === 'ended') return error(res, '测评已结束')
      if (transactionResult.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员')
      if (transactionResult.kind === 'missing-required') return error(res, `还有 ${transactionResult.count} 道必答题未作答`, -1, 409)
      return success(res, transactionResult.assessment, '测评已完成')
    } catch (err) {
      logger.error('完成 v2 量表测评错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, err instanceof Error ? err.message : '完成测评失败')
    }
  },

  async getAssessmentV2(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: { scale: { select: { id: true, code: true, name: true, description: true, instrumentVersion: true, instrumentClass: true, definition: true } } },
      })
      if (!assessment) return notFound(res, '测评记录不存在')
      if (assessment.userId !== userId) return forbidden(res, '无权限查看此测评')
      return success(res, scaleAssessmentForResponse(assessment))
    } catch (err) {
      logger.error('获取 v2 量表结果错误', err)
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
        list: assessments.map((assessment) => scaleAssessmentForResponse(assessment)),
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
        list: assessments.map((assessment) => scaleAssessmentForResponse(assessment)),
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
      const userId = req.user?.userId
      const userRole = req.user?.role

      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        select: { id: true, creatorId: true, status: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (!userId || !userRole || !(await canUseScale(userId, userRole, scale))) {
        return forbidden(res, '无权限查看此量表的课程关联')
      }

      const courseScales = await prisma.courseScale.findMany({
        where: { scaleId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
              status: true,
              creatorId: true,
            }
          }
        }
      })

      return success(res, {
        list: courseScales.map(cs => ({
          id: cs.course.id,
          title: cs.course.title,
          status: cs.course.status,
          // A granted teacher may use the scale but must not enumerate a
          // course's join code unless they own that course (admins may see
          // all codes).
          ...(userRole === UserRole.ADMIN || cs.course.creatorId === userId
            ? { courseCode: cs.course.courseCode }
            : {}),
        })),
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

      // A share grants content visibility, not write access. Teachers may
      // associate a scale only with courses they own; validate the whole
      // batch before creating any relation.
      if (userRole !== UserRole.ADMIN && courses.some((course) => course.creatorId !== userId)) {
        return forbidden(res, '只能关联自己创建的课程')
      }

      // 批量创建关联（忽略已存在的）
      const created = await prisma.$transaction(async (tx) => tx.courseScale.createMany({
        data: courseIds.map(courseId => ({ scaleId, courseId })),
        skipDuplicates: true,
      }))

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

      if (userRole !== UserRole.ADMIN) {
        const course = await prisma.course.findUnique({
          where: { id: courseId },
          select: { id: true, creatorId: true },
        })
        if (!course) return notFound(res, '课程不存在')
        if (course.creatorId !== userId) return forbidden(res, '只能修改自己创建的课程关联')
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

      const countWhere: any = { scaleId, progress: { gte: minProgress } }
      if (!includeProgress) countWhere.status = 'COMPLETED'
      const countDateFilter = utcHalfOpenDateFilter(dateRange)
      if (countDateFilter) countWhere.completedAt = countDateFilter
      const recordCount = await prisma.assessment.count({ where: countWhere })
      if (recordCount > EXPORT_ASYNC_RECORD_THRESHOLD) {
        const queued = await enqueueExportJob({
          resourceType: 'SCALE',
          resourceId: scaleId,
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
      }, format as 'csv' | 'sav' | 'spss', exportData)

      const artifacts: Array<{ id: string; format: string; fileName: string; expiresAt: string; downloadUrl: string }> = []
      const addArtifact = async (filePath: string, artifactFormat: string) => {
        const artifact = await createExportArtifact({
          resourceType: 'SCALE',
          resourceId: scaleId,
          createdBy: userId!,
          format: artifactFormat,
          anonymized: anonymize,
          storageKey: path.basename(filePath),
        })
        artifacts.push({
          id: artifact.id,
          format: artifactFormat,
          fileName: path.basename(filePath),
          expiresAt: artifact.expiresAt.toISOString(),
          downloadUrl: `/api/scales/exports/${artifact.id}`,
        })
      }
      if (files.csvPath) await addArtifact(files.csvPath, 'csv')
      if (files.savPath) await addArtifact(files.savPath, 'sav')
      if (files.spsPath) await addArtifact(files.spsPath, 'sps')

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
        anonymize,
        artifacts,
      }

      // 只向客户端返回可下载的文件名，不暴露服务器文件系统路径。
      if (files.csvPath) {
        result.fileName = path.basename(files.csvPath)
      }
      if (files.savPath) {
        result.fileName = path.basename(files.savPath)
      }
      if (files.spsPath) {
        result.additionalFileNames = [path.basename(files.spsPath)]
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
          _count: {
            select: { assessments: { where: { status: 'COMPLETED' } } },
          },
        },
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
        itemCount: Array.isArray((scale.definition as any)?.items) ? (scale.definition as any).items.length : 0,
        dimensionCount: Array.isArray((scale.definition as any)?.scoring?.scores)
          ? (scale.definition as any).scoring.scores.filter((score: any) => score.type === 'dimension').length
          : 0,
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
      const artifactId = req.params.artifactId || req.params.fileName
      const actor = req.user ? { userId: req.user.userId, role: req.user.role } : null
      if (!actor) return forbidden(res, '未授权')
      const resolved = await resolveArtifactForDownload(artifactId, actor)
      if (resolved.reason === 'forbidden') return forbidden(res, '无权限下载此文件')
      if (!resolved.filePath) return notFound(res, '文件不存在')
      logger.info('下载导出文件', { artifactId, userId: actor.userId })
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

  // 获取所有量表标签（去重）
  async getTags(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      const where = await scaleWhereForViewer(userId as string, userRole as UserRole)

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
