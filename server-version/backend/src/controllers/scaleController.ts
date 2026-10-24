import { ScaleLibraryError } from '../modules/scale-library-governance/contracts'
import {canReadLibraryScale} from '../modules/scale-library-governance/readers'
import { setScalePublicDelivery } from '../modules/scale/scale-public-delivery'
import { assertTrainingScaleCollectionAllowed } from '../modules/scale/scale-collection-guard'
import { randomUUID } from 'node:crypto'
import { assertScaleReportImagesOwned } from '../modules/scale/scale-image-retention'
import { previewScaleRawScoreFeedback } from '../modules/scale/raw-score-feedback-preview'
import { assertTrainingChildSelected, TRAINING_VARIANT_PARENT_MARKER_SELECT } from '../modules/composite/training-variant-child-scope'
import { loadScaleAnswers } from '../modules/scale/scale-workflow.service'
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { scaleExportScope } from '../services/scaleExportScope'
import { success, error, forbidden, notFound, completionBusy, assessmentSubmitBusy, instrumentError } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { z } from 'zod'
import * as path from 'path'
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
  loadScaleAssessmentForResponse,
  scaleDefinitionFromRecord,
  scaleRunnerFromRecord,
} from '../modules/scale/scale-workflow.service'
import { mergeScaleAnswersWithRevision } from '../modules/scale/scale-answer-concurrency'
import { getScaleCustomScorerKeys, missingRequiredScaleItemCodes, validateScaleAnswer } from '../modules/scale/scale-scoring'
import { retainFrozenScaleAssessmentImages } from '../modules/scale/scale-image.adapter'
import { freezeQuestionnaireAssessmentContext, isAssessmentContextServiceError } from '../services/assessmentContextService'
import { getExportArtifactStatus, resolveArtifactForDownload } from '../services/exportArtifactService'
import { enqueueExportJob } from '../services/exportJobService'
import { utcHalfOpenDateFilter } from '../services/exportService'
import { restartStandaloneScaleAssessment, submitScaleAssessmentFinalWithContext, isFinalScaleSubmitError } from '../modules/scale/scale-final-submit.service'
import { persistFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart } from '../modules/assessment-runtime/runtime-snapshot'
import { standaloneAdmissionPersistence } from '../modules/scale/scale-admission.service'
import { finalScaleSubmitSchema } from '../services/scale-final-submit.schema'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  isTransientCompletionDatabaseError,
} from '../services/questionnaireCompletionAdmission'
import { isUnitSubmitAdmissionBusyError } from '../services/unitSubmitAdmission'
import { deviceInputProvenanceV1Schema } from '../modules/scale/device-input-provenance'
import { isRelationalCohortOnlyCompositeAttempt, projectRelationalUnitFinalResponse } from '../modules/assessment-relational/result-authority'
import { isLoadedCompositeParticipantFeedbackDeferred } from '../modules/assessment-policy/participant-feedback'
import { trainingFeedbackAttemptSelect, trainingFeedbackParentSelect } from '../modules/composite/training-feedback-binding'
import { copyScaleToDraft, scaleCopyEligibility, ScaleCopyError, syncCopiedScaleDraftMedia } from '../modules/scale/scale-copy.service'

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
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  name: z.string().min(1, '量表名称不能为空').optional(),
  description: z.string().optional(),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']).optional(),
  estimatedTime: z.number().int().positive().optional(),
  instruction: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional().default([]),
})

const definitionRequestSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  definition: z.unknown(),
})

const answerPreviewSchema = z.object({
  rawScores: z.record(z.string(), z.number().finite()).optional(),
  answers: z.array(z.object({
    itemCode: z.string().min(1),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().nonnegative().optional(),
    answeredAt: z.string().optional(),
    changeCount: z.number().int().nonnegative().optional(),
  })).optional(),
}).strict().refine(value => (value.answers !== undefined) !== (value.rawScores !== undefined), '请只提交回答或模拟分数')

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

      // Opt-in directory DTO; default authoring/list clients retain their full
      // contract. Resolve current visibility above for both paths, unchanged.
      if (req.query.view === 'training-catalog') {
        const [list, total] = await Promise.all([
          prisma.scale.findMany({
            where,
            select: {
              id: true, name: true, code: true, instrumentVersion: true,
              instrumentClass: true, libraryEntryId: true, status: true, description: true,
            },
            orderBy: { createdAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
          }),
          prisma.scale.count({ where }),
        ])
        return success(res, buildPaginatedResult(list, total, pagination))
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

      const withSource = scales.map((scale) => {
        const { copySource, ...allMetadata } = scale
        const {courseScales:_courses,_count:_counts,...libraryMetadata}=allMetadata
        const metadata=scale.libraryEntryId?libraryMetadata:allMetadata
        return {
          ...metadata,
          ...(scale.creatorId === userId || userRole === UserRole.ADMIN ? { copySource } : {}),
          source: scaleSource(userId as string, userRole as UserRole, scale),
        }
      })
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
        return error(res, result.error.issues[0].message)
      }

      const { code, name, description, visibility, estimatedTime, instruction, tags } = result.data
      if (visibility === 'PUBLIC') return forbidden(res, '全平台公开须由独立的平台投放授权设置，作者只能选择私有或课程')
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
          authoringFamilyId: randomUUID(), authoringVersion: 1,
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

  async copy(req: Request, res: Response) {
    try {
      if (!req.user?.userId) return forbidden(res, '未登录')
      if (!z.object({}).strict().safeParse(req.body || {}).success) return error(res, '复制请求不能覆盖来源或定义')
      const copied = await copyScaleToDraft(req.params.id, req.user.userId)
      return success(res, copied, '已复制为新的草稿，原已发布版本保持不变')
    } catch (cause) {
      if (cause instanceof ScaleCopyError) return error(res, cause.message, -1, cause.status)
      logger.error('复制量表错误', cause)
      return error(res, '复制量表失败')
    }
  },

  async versions(req: Request,res: Response){
    try {
      const source=await prisma.scale.findUnique({where:{id:req.params.id}})
      if(!source||source.creatorId!==req.user?.userId)return notFound(res,'量表不存在')
      const family=source.authoringFamilyId??source.id
      const list=await prisma.scale.findMany({where:{creatorId:source.creatorId,OR:[{authoringFamilyId:family},{id:source.id}]},
        orderBy:[{authoringVersion:'desc'},{createdAt:'desc'}],select:{id:true,name:true,status:true,instrumentVersion:true,
          authoringFamilyId:true,authoringVersion:true,sourceScaleId:true,measurementReleaseId:true,createdAt:true}})
      return success(res,{list})
    }catch{return error(res,'无法读取版本谱系')}
  },

  async publicDelivery(req: Request,res: Response){
    try {
      if(!req.user?.userId)return forbidden(res,'未登录')
      const input=z.object({grantId:z.string().guid(),enabled:z.boolean()}).strict().parse(req.body)
      return success(res,await setScalePublicDelivery(req.user.userId,req.params.id,input.grantId,input.enabled))
    } catch(cause){return error(res,cause instanceof Error?cause.message:'平台投放权限不足',-1,403)}
  },

  async revise(req: Request, res: Response) {
    try {
      if (!req.user?.userId) return forbidden(res, '未登录')
      if (!z.object({}).strict().safeParse(req.body || {}).success) return error(res, '修订请求不能覆盖来源或定义')
      return success(res, await copyScaleToDraft(req.params.id, req.user.userId, 'REVISION'), '已创建同一工具的新修订草稿，旧版本保持不变')
    } catch (cause) {
      if (cause instanceof ScaleCopyError) return error(res, cause.message, -1, cause.status)
      return error(res, '创建修订失败', -1, 409)
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
      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')
      if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') return error(res, 'STANDARD 量表 definition 由代码 package 管理，不能通过网页修改')
      if (scale.status !== 'DRAFT') return error(res, '只有草稿状态的量表可以修改 definition', -1, 409)

      const validation = validateScaleDefinition(parsedBody.data.definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
      if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
        return error(res, definitionIssuesMessage(validation.issues))
      }
      await assertScaleReportImagesOwned(validation.definition!, scale.creatorId)
      // The state predicate is part of the write: publishing between the read
      // and this update must never mutate the newly frozen definition.
      const write = (db: typeof prisma) => db.scale.update({
        where: { id, status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE',
          ...(parsedBody.data.expectedUpdatedAt ? { updatedAt: new Date(parsedBody.data.expectedUpdatedAt) } : {}) },
        data: { definition: validation.definition as any, definitionHash: hashScaleDefinition(validation.definition!), ...definitionSummary(validation.definition) },
      })
      const updated = scale.copySource == null ? await write(prisma) : await prisma.$transaction(async tx => {
        const saved = await write(tx as typeof prisma)
        await syncCopiedScaleDraftMedia(tx, id, validation.definition!)
        return saved
      })
      return success(res, { ...updated, definition: validation.definition }, 'definition 保存成功')
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2025') return error(res, '量表状态已变化，请刷新后重试', -1, 409)
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
      if (!body.success) return error(res, body.error.issues[0]?.message ?? '回答格式不正确')
      const scale = await prisma.scale.findUnique({
        where: { id },
        select: { id: true, code: true, name: true, creatorId: true, instrumentVersion: true, instrumentClass: true, definition: true, libraryEntryId: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.libraryEntryId) {
        if (!userId || !await canReadLibraryScale(userId, scale.libraryEntryId)) return forbidden(res, '无权限预览此量表')
      } else if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限预览此量表')
      if (body.data.rawScores) return success(res, previewScaleRawScoreFeedback(scaleDefinitionFromRecord(scale), body.data.rawScores))
      const result = await buildScaleResultForRecord({
        scale,
        answers: body.data.answers!,
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
      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')
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
      if(scale.libraryEntryId){
        if(!req.user?.userId||!await canReadLibraryScale(req.user.userId,scale.libraryEntryId))return notFound(res,'量表不存在')
      }else if (req.user?.role === UserRole.ADMIN) {
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
        const { definition: _definition, copySource: _copySource, ...metadata } = scale
        return success(res, { ...metadata, runner })
      }
      const { copySource, ...allMetadata } = scale
      const {courseScales:_courses,_count:_counts,...libraryMetadata}=allMetadata
      const metadata=scale.libraryEntryId?libraryMetadata:allMetadata
      return success(res, { ...metadata, runner,
        ...(scale.creatorId === req.user!.userId || req.user!.role === UserRole.ADMIN ? { copySource } : {}),
        revisionEligibility: scaleCopyEligibility(scale, req.user!.userId), copyEligibility: scaleCopyEligibility(scale, req.user!.userId) })
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
        return error(res, result.error.issues[0].message)
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

      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')
      if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') {
        return error(res, 'STANDARD 量表由代码 package 管理，网页只读')
      }
      // 已发布的量表不能修改核心配置
      if (scale.status !== 'DRAFT') {
        return error(res, '只有草稿状态的量表可以修改', -1, 409)
      }

      const { expectedUpdatedAt, ...payload } = result.data
      if (payload.visibility === 'PUBLIC') return forbidden(res, '全平台公开须独立的平台投放授权，作者不能设置 PUBLIC')

      const updated = await prisma.scale.update({
        where: { id, ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}), status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE' },
        data: { ...payload, ...(payload.visibility ? { legacyPublicAccess: false } : {}) },
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
      if ((err as { code?: string })?.code === 'P2025') return error(res, '量表状态已变化，请刷新后重试', -1, 409)
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

      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')

      // 权限检查
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此量表')
      }

      // 检查是否有关联的测评记录
      if (scale._count.assessments > 0) {
        return error(res, '该量表已有测评记录，无法删除')
      }

      if (scale.copySource == null) {
        await prisma.scale.delete({ where: { id } })
      } else {
        await prisma.$transaction(async tx => {
          await tx.scale.delete({ where: { id } })
          // Only this draft's references. Published and attempt owners stay pinned.
          await tx.assetReference.deleteMany({ where: { entityType: 'ScaleCopyDraft', entityId: id } })
        })
      }

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

      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')

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

      if (scale.libraryEntryId) return forbidden(res, '共用库授权引用只读，请通过公共量表库管理版本与状态')

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
    res.setHeader('Cache-Control', 'no-store')
    try {
      const input = finalScaleSubmitSchema.safeParse(req.body)
      if (!input.success) return error(res, input.error.issues[0].message)
      const { data, internalContext } = await submitScaleAssessmentFinalWithContext({
        assessmentId: req.params.assessmentId,
        userId: req.user?.userId ?? null,
        ...input.data,
      })
      const responseData = await projectRelationalUnitFinalResponse(internalContext.compositeAttemptId, data)
      return success(res, responseData, data.replayed ? '量表提交已确认' : '量表提交成功')
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
        select: { id: true, code: true, name: true, description: true, instruction: true, estimatedTime: true, status: true, visibility: true, libraryEntryId: true, instrumentVersion: true, instrumentClass: true, definition: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.libraryEntryId) return forbidden(res, '共用库量表请使用正式测评入口')
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
        const stored = (await loadScaleAnswers(existing.answers, existing))
        if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
        return success(res, {
          assessment: (await loadScaleAssessmentForResponse(existing)),
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
        assessment = await prisma.$transaction(async (tx) => {
          await assertTrainingScaleCollectionAllowed(tx,[scaleId])
          const created = await tx.assessment.create({
            data: {
              scaleId,
              userId: userId!,
              status: 'IN_PROGRESS',
              deliveryMode: 'FINAL_ONLY',
              runtimeGeneration: 'UNIFIED_V1',
              runtimeSnapshotEncrypted: (await persistFrozenScaleRuntimeSnapshot(runtimeSnapshot, tx)),
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
          await retainFrozenScaleAssessmentImages({ assessmentId: created.id, snapshot: runtimeSnapshot, db: tx as never })
          return created
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
        const stored = (await loadScaleAnswers(assessment.answers, assessment))
        if (stored.decryptError) return error(res, '测评答案无法读取，请联系管理员')
        return success(res, {
          assessment: (await loadScaleAssessmentForResponse(assessment)),
          scale: { id: scale.id, code: scale.code, name: scale.name, description: scale.description, instruction: scale.instruction, estimatedTime: scale.estimatedTime, definition: runner, definitionHash: hashScaleDefinition(definition) },
        }, '继续未完成的测评')
      }
      return success(res, {
        assessment: (await loadScaleAssessmentForResponse(assessment)),
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
            compositeAttempt: { select: TRAINING_VARIANT_PARENT_MARKER_SELECT },
            scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true } },
            questionnaireAssessment: { select: { contextSnapshotEncrypted: true, contextSnapshotHash: true } },
          },
        })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        await assertTrainingChildSelected(assessment, { db: tx })
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }
        await assertTrainingScaleCollectionAllowed(tx, [assessment.scaleId])
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
        const stored = (await loadScaleAnswers(assessment.answers, assessment))
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
          assessment: (await loadScaleAssessmentForResponse({
            ...assessment,
            answers,
            deviceInputProvenance: persistedProvenance,
            answersRevision: (assessment.answersRevision ?? 0) + merged.changedCount,
            progress,
            result: null,
          }, undefined, tx)),
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
      if (!parsed.success) return error(res, parsed.error.issues[0].message)

      const transactionResult = await withScaleAnswerTransaction(assessmentId, async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: assessmentId },
          include: {
            compositeAttempt: { select: TRAINING_VARIANT_PARENT_MARKER_SELECT },
            scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true, definition: true } },
            questionnaireAssessment: { select: { contextSnapshotEncrypted: true, contextSnapshotHash: true } },
          },
        })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.userId !== userId) return { kind: 'forbidden' as const }
        await assertTrainingChildSelected(assessment, { db: tx })
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }
        await assertTrainingScaleCollectionAllowed(tx, [assessment.scaleId])

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

        const stored = (await loadScaleAnswers(assessment.answers, assessment))
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
        await assertTrainingChildSelected(assessment, { db: tx })
        if (assessment.status === 'COMPLETED') {
          return { kind: 'completed' as const, assessment: (await loadScaleAssessmentForResponse(assessment, undefined, tx)) }
        }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'ended' as const }
        await assertTrainingScaleCollectionAllowed(tx, [assessment.scaleId])
        const contextSnapshot = assessment.questionnaireAssessmentId
          ? await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessmentId)
          : null
        const stored = (await loadScaleAnswers(assessment.answers, assessment))
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
            return { kind: 'completed' as const, assessment: (await loadScaleAssessmentForResponse(current, undefined, tx)) }
          }
          return { kind: 'ended' as const }
        }
        if (assessment.questionnaireAssessmentId) await refreshQuestionnaireProgress(tx, assessment.questionnaireAssessmentId)
        return {
          kind: 'completed' as const,
          assessment: (await loadScaleAssessmentForResponse({
            ...assessment,
            status: 'COMPLETED' as const,
            answers: stored.answers,
            deviceInputProvenance: stored.deviceInputProvenance,
            result,
            completedAt,
            totalTime,
            progress: 100,
          }, undefined, tx)),
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
    res.setHeader('Cache-Control', 'no-store')
    try {
      const userId = req.user?.userId
      const { assessmentId } = req.params
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: { compositeAttempt: { select: { ...TRAINING_VARIANT_PARENT_MARKER_SELECT, ...trainingFeedbackAttemptSelect,
          compositeAssessment: { select: { ...TRAINING_VARIANT_PARENT_MARKER_SELECT.compositeAssessment.select, ...trainingFeedbackParentSelect } } } }, scale: { select: { id: true, code: true, name: true, description: true, instrumentVersion: true, instrumentClass: true, definition: true } } },
      })
      if (!assessment) return notFound(res, '测评记录不存在')
      if (assessment.userId !== userId) return forbidden(res, '无权限查看此测评')
      await assertTrainingChildSelected(assessment)
      if (assessment.status === 'COMPLETED' && assessment.compositeAttemptId && await isLoadedCompositeParticipantFeedbackDeferred(assessment.compositeAttempt)) {
        return forbidden(res, '单项反馈尚未向学员开放，请查看整份测评报告状态')
      }
      if (
        assessment.status === 'COMPLETED'
        && await isRelationalCohortOnlyCompositeAttempt(assessment.compositeAttemptId)
      ) {
        return forbidden(res, '关系测评个人结果仅通过群体报告提供')
      }
      return success(res, (await loadScaleAssessmentForResponse(assessment)))
    } catch (err) {
      logger.error('获取 v2 量表结果错误', err)
      if (isFinalScaleSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return error(res, '获取测评结果失败')
    }
  },

  // 获取用户的测评历史
  async listMyAssessments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId

      const assessments = await prisma.assessment.findMany({
        where: { userId, compositeAttemptId: null },
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
        list: (await Promise.all(assessments.map(async (assessment) => (await loadScaleAssessmentForResponse(assessment))))),
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

      if (scale.libraryEntryId) return forbidden(res, '共用量表不提供跨任务数据访问，请从获授权的课程或任务报告查看')

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此量表的测评记录')
      }

      // This legacy Scale-management surface is standalone-only for every role.
      // Embedded Composite/Relational child results must stay behind their
      // parent report/disclosure authority; ADMIN is not a privacy bypass.
      const assessments = await prisma.assessment.findMany({
        where: {
          scaleId,
          compositeAttemptId: null,
        },
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
        list: (await Promise.all(assessments.map(async (assessment) => (await loadScaleAssessmentForResponse(assessment))))),
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
      if (!userId) return forbidden(res, '请先登录')
      const { scaleId } = req.params
      const parsed = z.array(z.string().min(1)).min(1).max(200).safeParse(req.body?.courseIds)
      if (!parsed.success) return error(res, '请选择有效课程')
      const courseIds = [...new Set(parsed.data)]
      const created = await prisma.$transaction(async (tx) => {
        const scale = await tx.scale.findUnique({ where: { id: scaleId } })
        if (!scale) throw new ScaleLibraryError(404, '量表不存在')
        if (scale.libraryEntryId) {
          await assertTrainingScaleCollectionAllowed(tx, [scale.id])
          if (!(await canUseScale(userId, userRole ?? '', scale, tx))) throw new ScaleLibraryError(403, '量表使用授权已失效')
        } else if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
          throw new ScaleLibraryError(403, '无权限修改此量表')
        }
        const courses = await tx.course.findMany({ where: { id: { in: courseIds } } })
        if (courses.length !== courseIds.length) throw new ScaleLibraryError(404, '部分课程不存在')
        if ((scale.libraryEntryId || userRole !== UserRole.ADMIN) && courses.some(course => course.creatorId !== userId)) {
          throw new ScaleLibraryError(403, '只能关联自己创建的课程')
        }
        return tx.courseScale.createMany({ data: courseIds.map(courseId => ({ scaleId, courseId })), skipDuplicates: true })
      }, { isolationLevel: 'Serializable' })
      return success(res, { added: created.count }, '课程关联成功')
    } catch (err) {
      if (err instanceof ScaleLibraryError) return error(res, err.message, -1, err.statusCode)
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

      if (!scale.libraryEntryId && scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此量表')
      }

      if (scale.libraryEntryId || userRole !== UserRole.ADMIN) {
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
        format = 'csv',
        requestKey,
      } = req.body || {}

      const scale = await prisma.scale.findUnique({
        where: { id: scaleId },
        select: { id: true, name: true, creatorId: true, libraryEntryId: true },
      })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.libraryEntryId) return forbidden(res, '共用量表不提供跨任务数据访问，请从获授权的课程或任务报告查看')

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出此量表数据')
      }

      const anonymize = userRole === UserRole.ADMIN ? requestAnonymize : true
      const countWhere: any = { ...scaleExportScope(scaleId, { userId: userId! }), progress: { gte: minProgress } }
      if (!includeProgress) countWhere.status = 'COMPLETED'
      const countDateFilter = utcHalfOpenDateFilter(dateRange)
      if (countDateFilter) countWhere.completedAt = countDateFilter
      const recordCount = await prisma.assessment.count({ where: countWhere })

      const queued = await enqueueExportJob({ authorityTokenVersion: req.user!.tokenVersion,
        resourceType: 'SCALE',
        resourceId: scaleId,
        createdBy: userId!,
        anonymized: anonymize,
        format,
        options: { anonymize, includeProgress, minProgress, dateRange },
        recordCount,
        requestKey: typeof requestKey === 'string' ? requestKey : undefined,
      })
      return success(res, {
        status: queued.status,
        recordCount: queued.recordCount,
        fieldCount: queued.fieldCount,
        format,
        anonymize,
        batchId: queued.batchId,
        replayed: queued.replayed,
        artifacts: queued.artifacts,
      }, queued.status === 'READY' ? '导出任务已完成' : '导出任务已创建')
    } catch (err: any) {
      logger.error('导出量表数据错误', err)
      const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
      return error(res, statusCode >= 500 ? '导出量表数据失败' : err.message, -1, statusCode)
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
            select: { assessments: { where: { ...scaleExportScope(scaleId, { userId: userId! }), status: 'COMPLETED' } } },
          },
        },
      })

      if (!scale) {
        return notFound(res, '量表不存在')
      }

      if (scale.libraryEntryId) return forbidden(res, '共用量表不提供跨任务数据访问，请从获授权的课程或任务报告查看')

      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此量表')
      }

      // 动态导入导出服务
      const { exportService } = await import('../services/exportService')

      // 获取字段预览
      const previewData = await exportService.getScaleExportData(scaleId, {
        actor: { userId: userId! },
        anonymize: true,
        minProgress: 100,
        recordLimit: 5,
      })

      // 只返回前5行数据
      const sampleRows = previewData.rows.slice(0, 5)

      return success(res, {
        scaleName: scale.name,
        totalRecords: scale._count.assessments,
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
