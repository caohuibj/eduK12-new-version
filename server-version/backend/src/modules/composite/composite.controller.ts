import { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { success, error, notFound, unauthorized, completionBusy, assessmentSubmitBusy, instrumentError } from '../../utils/response'
import * as service from './composite.service'
import {
  addCompositeItemSchema,
  compositeExportQuerySchema,
  compositeExportRequestSchema,
  compositeAnalysisExportQuerySchema,
  compositeParticipantAnalysisExportQuerySchema,
  compositeFormAnswerSchema,
  compositeReanalysisBodySchema,
  compositeReportQuerySchema,
  compositeSaveSchema,
  compositeScaleAnswerSchema,
  createCompositeSchema,
  copyCompositeSchema,
  createCompositeTokenSchema,
  listCompositeAttemptsQuerySchema,
  publicRecoverySchema,
  reorderCompositeContentUnitsSchema,
  reorderCompositeItemsSchema,
  setCompositeReportPackageSchema,
  updateCompositeSchema,
} from './composite.schema'
import { z } from 'zod'
import { isValidRecoveryToken, hashRecoveryToken } from '../../services/anonymousAccess'
import { getPaginationParams } from '../../utils/pagination'
import * as path from 'path'
import * as fs from 'fs'
import { listReportPackageCatalog } from '../cognitive-analysis'
import { buildCompositeAnalysisExport } from './composite-export.service'
import { finalScaleSubmitSchema } from '../../services/scale-final-submit.schema'
import { finalQuestionnaireFormSectionSubmitSchema } from '../../services/questionnaire-final-submit.schema'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  isTransientCompletionDatabaseError,
} from '../../services/questionnaireCompletionAdmission'
import { isUnitSubmitAdmissionBusyError } from '../../services/unitSubmitAdmission'
import { withUnitSubmitAdmission } from '../../services/unitSubmitAdmission'
import {
  loadEmbeddedSituationalAttemptRuntime,
  situationalAttemptForResponse,
  type SituationalEmbeddedAccess,
} from '../situational/situational-runtime.service'
import { serveFrozenSituationalAsset } from '../situational/situational-asset.service'
import { submitSituationalAttemptFinal } from '../situational/situational-final-submit.service'
import { situationalFinalSubmitSchema } from '../situational/situational-final-submit.schema'
import { compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { isRelationalCohortOnlyCompositeAttempt, projectRelationalUnitFinalResponse } from '../assessment-relational/result-authority'
import {
  assignCompositeFormItemToSection,
  createCompositeFormSection,
  listCompositeFormItems,
  listCompositeFormSections,
  reorderCompositeFormSectionItems,
  reorderCompositeFormSections,
  updateCompositeFormSection,
  submitCompositeFormSectionFinal,
} from './final-submit.service'

const recoveryFromRequest = (req: Request): string => {
  const value = req.headers['x-recovery-token']
  if (!isValidRecoveryToken(value)) throw new z.ZodError([{ code: 'custom', path: ['recoveryToken'], message: '缺少有效恢复凭证' }])
  return value
}

const embeddedSituationalAccess = (
  req: Request,
  authorization: Pick<SituationalEmbeddedAccess, 'userId' | 'recoveryTokenHash'>,
): SituationalEmbeddedAccess => ({
  compositeAttemptId: req.params.attemptId,
  compositeItemId: req.params.itemId,
  compositeSlotKey: compositeItemSlotKey(req.params.itemId, 'SITUATIONAL'),
  ...authorization,
})

const firstSituationalValidationMessage = (value: { issues?: Array<{ message: string }> }): string => (
  value.issues?.[0]?.message || '请求参数不合法'
)

const sendAnalysisExport = async (
  res: Response,
  context: Awaited<ReturnType<typeof service.getAnalysisExportForParticipant>>,
  format: 'json' | 'zip' | 'xlsx',
): Promise<Response> => {
  const file = await buildCompositeAnalysisExport(context, format)
  res.setHeader('Content-Type', file.contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`)
  res.setHeader('Content-Length', String(file.body.length))
  return res.status(200).send(file.body)
}

export const compositeController = {
  async reportPackages(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, { list: await listReportPackageCatalog(req.user.userId, req.user.role) })
    } catch (err) { return handleError(res, err) }
  },

  async list(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, { list: await service.listComposites(req.user.userId, req.user.role) })
    } catch (err) { return handleError(res, err) }
  },

  async create(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await service.createComposite(req.user.userId, req.user.role, createCompositeSchema.parse(req.body))
      return success(res, data, '综合测评创建成功')
    } catch (err) { return handleError(res, err) }
  },

  async detail(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id))
    } catch (err) { return handleError(res, err) }
  },

  async library(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, { list: await service.listLibraryTemplates(req.user.userId, req.user.role) })
    } catch (err) { return handleError(res, err) }
  },

  async copy(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await service.copyComposite(req.user.userId, req.user.role, req.params.id, copyCompositeSchema.parse(req.body || {}))
      return success(res, data, '综合测评已复制为草稿')
    } catch (err) { return handleError(res, err) }
  },

  async update(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.updateComposite(req.user.userId, req.user.role, req.params.id, updateCompositeSchema.parse(req.body)), '综合测评已更新')
    } catch (err) { return handleError(res, err) }
  },

  async setReportPackage(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = setCompositeReportPackageSchema.parse(req.body)
      return success(
        res,
        await service.setCompositeReportPackage(req.user.userId, req.user.role, req.params.id, input),
        '报告包已更新',
      )
    } catch (err) { return handleError(res, err) }
  },

  async addItem(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.addItem(req.user.userId, req.user.role, req.params.id, addCompositeItemSchema.parse(req.body)), '模块已添加')
    } catch (err) { return handleError(res, err) }
  },

  async listFormSections(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      return success(res, { list: await listCompositeFormSections(req.params.id) })
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async listFormItems(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      return success(res, { list: await listCompositeFormItems(req.params.id) })
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async listContent(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      return success(res, { units: await service.listCompositeContentUnits(req.params.id) })
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async reorderContent(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = reorderCompositeContentUnitsSchema.parse(req.body || {})
      const units = await service.reorderCompositeContentUnits(
        req.user.userId,
        req.user.role,
        req.params.id,
        input.units,
      )
      return success(res, { units }, '内容单元顺序已更新')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async createFormSection(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const composite = await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      if (composite.status !== 'DRAFT') return error(res, '已发布的综合测评不能修改')
      const input = z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(2000).optional(),
        position: z.number().int().min(0).optional(),
        contextSection: z.boolean().optional(),
      }).strict().parse(req.body || {})
      return success(res, await createCompositeFormSection(req.params.id, input), '表单区段创建成功')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async updateFormSection(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const composite = await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      if (composite.status !== 'DRAFT') return error(res, '已发布的综合测评不能修改')
      const input = z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        contextSection: z.boolean().optional(),
      }).strict().parse(req.body || {})
      return success(res, await updateCompositeFormSection(req.params.id, req.params.sectionId, input), '表单区段已更新')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async reorderFormSections(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const composite = await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      if (composite.status !== 'DRAFT') return error(res, '已发布的综合测评不能修改')
      const input = z.object({ sectionIds: z.array(z.string().min(1)).min(1) }).strict().parse(req.body || {})
      return success(res, { list: await reorderCompositeFormSections(req.params.id, input.sectionIds) }, '表单区段顺序已更新')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async reorderFormSectionItems(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const composite = await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      if (composite.status !== 'DRAFT') return error(res, '已发布的综合测评不能修改')
      const input = z.object({ itemIds: z.array(z.string().min(1)).min(1) }).strict().parse(req.body || {})
      return success(res, { list: await reorderCompositeFormSectionItems(req.params.id, req.params.sectionId, input.itemIds) }, '区段字段顺序已更新')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async assignFormItemToSection(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const composite = await service.getCompositeForTeacher(req.user.userId, req.user.role, req.params.id)
      if (composite.status !== 'DRAFT') return error(res, '已发布的综合测评不能修改')
      const input = z.object({ sectionPosition: z.number().int().min(0).optional() }).strict().parse(req.body || {})
      return success(res, { list: await assignCompositeFormItemToSection(req.params.id, req.params.sectionId, req.params.itemId, input.sectionPosition) }, '字段已加入区段')
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async removeItem(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.removeItem(req.user.userId, req.user.role, req.params.id, req.params.itemId)
      return success(res, null, '模块已移除')
    } catch (err) { return handleError(res, err) }
  },

  async reorderItems(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = reorderCompositeItemsSchema.parse(req.body)
      await service.reorderItems(req.user.userId, req.user.role, req.params.id, input.items)
      return success(res, null, '模块顺序已更新')
    } catch (err) { return handleError(res, err) }
  },

  async publish(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.publishComposite(req.user.userId, req.user.role, req.params.id), '综合测评发布成功')
    } catch (err) { return handleError(res, err) }
  },

  async listTokens(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const list = await service.listAccessTokens(req.user.userId, req.user.role, req.params.id)
      return success(res, { list, total: list.length })
    } catch (err) { return handleError(res, err) }
  },

  async createToken(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = createCompositeTokenSchema.parse(req.body)
      const data = await service.createAccessTokenForComposite(req.user.userId, req.user.role, req.params.id, input.expiresAt, input.maxUses)
      return success(res, data, '公开链接创建成功')
    } catch (err) { return handleError(res, err) }
  },

  async disableToken(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.disableAccessToken(req.user.userId, req.user.role, req.params.id, req.params.tokenId)
      return success(res, null, '公开链接已停用')
    } catch (err) { return handleError(res, err) }
  },

  async available(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, { list: await service.listAvailableForStudent(req.user.userId) })
    } catch (err) { return handleError(res, err) }
  },

  async startAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await service.startUserAttempt(req.user.userId, req.params.id)
      return success(res, data, '综合测评已开始')
    } catch (err) { return handleError(res, err) }
  },

  async restartAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await service.restartUserAttempt(req.user.userId, req.params.attemptId)
      return success(res, data, '综合测评已重启')
    } catch (err) { return handleError(res, err) }
  },

  async getAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.getAttemptState(req.params.attemptId, { userId: req.user.userId }))
    } catch (err) { return handleError(res, err) }
  },

  async getEmbeddedSituational(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedSituationalAccess(req, { userId: req.user.userId }),
      )
      const suppressResult = runtime.row.status === 'COMPLETED'
        && await isRelationalCohortOnlyCompositeAttempt(req.params.attemptId)
      return success(res, situationalAttemptForResponse(runtime.row, runtime.snapshot, { suppressResult }))
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async embeddedSituationalAsset(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedSituationalAccess(req, { userId: req.user.userId }),
      )
      return serveFrozenSituationalAsset({
        snapshot: runtime.snapshot,
        assetId: req.params.assetId,
        res,
      })
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async submitEmbeddedSituational(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const parsed = situationalFinalSubmitSchema.safeParse(req.body)
      if (!parsed.success) return error(res, firstSituationalValidationMessage(parsed.error))
      const data = await withUnitSubmitAdmission(() => submitSituationalAttemptFinal({
        attemptId: req.params.situationalAttemptId,
        userId: req.user!.userId,
        embedded: embeddedSituationalAccess(req, { userId: req.user!.userId }),
        ...parsed.data,
      }))
      const responseData = await projectRelationalUnitFinalResponse(req.params.attemptId, data)
      return success(res, responseData, data.replayed ? '综合测评情境化模块提交已确认' : '综合测评情境化模块提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async freezeContext(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.freezeContext(req.params.attemptId, { userId: req.user.userId }), '人口学上下文已冻结')
    } catch (err) { return handleError(res, err) }
  },

  async saveAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = compositeSaveSchema.parse(req.body || {})
      const draft = input.itemId !== undefined && input.value !== undefined ? { itemId: input.itemId, value: input.value } : undefined
      return success(res, await service.saveAttempt(req.params.attemptId, { userId: req.user.userId }, draft), '进度已保存')
    } catch (err) { return handleError(res, err) }
  },

  async saveScaleAnswer(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = compositeScaleAnswerSchema.parse(req.body)
      return success(res, await service.saveScaleAnswer(req.params.attemptId, req.params.itemId, input, { userId: req.user.userId }), '答案已保存')
    } catch (err) { return handleError(res, err) }
  },

  async completeScale(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.completeScale(req.params.attemptId, req.params.itemId, { userId: req.user.userId }), '量表模块已完成')
    } catch (err) { return handleError(res, err) }
  },

  async saveFormAnswer(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = compositeFormAnswerSchema.parse(req.body)
      return success(res, await service.saveFormAnswer(req.params.attemptId, req.params.itemId, input.value, { userId: req.user.userId }), '表单已保存')
    } catch (err) { return handleError(res, err) }
  },

  async submitFinalFormSection(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = finalQuestionnaireFormSectionSubmitSchema.parse(req.body)
      const data = await submitCompositeFormSectionFinal({
        attemptId: req.params.attemptId,
        sectionId: req.params.sectionId,
        ...input,
        userId: req.user.userId,
      })
      return success(res, data, data.replayed ? '表单区段提交已确认' : '表单区段提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async submitFinalScale(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = finalScaleSubmitSchema.parse(req.body)
      const { submitCompositeScaleFinal } = await import('../scale/scale-final-submit.service')
      const data = await submitCompositeScaleFinal(
        req.params.attemptId,
        req.params.itemId,
        input,
        { userId: req.user.userId },
      )
      const responseData = await projectRelationalUnitFinalResponse(req.params.attemptId, data)
      return success(res, responseData, data.replayed ? '量表提交已确认' : '量表提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async report(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.getReport(req.params.attemptId, { userId: req.user.userId }))
    } catch (err) { return handleError(res, err) }
  },

  async analysisExport(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeParticipantAnalysisExportQuerySchema.parse(req.query)
      const context = await service.getAnalysisExportForParticipant(req.params.attemptId, { userId: req.user.userId })
      return await sendAnalysisExport(res, context, query.format)
    } catch (err) { return handleError(res, err) }
  },

  async snapshots(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.listPackageAnalysisSnapshotsForTeacher(
        req.user.userId,
        req.user.role,
        req.params.attemptId,
      ))
    } catch (err) { return handleError(res, err) }
  },

  async reanalyze(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      compositeReanalysisBodySchema.parse(req.body === undefined ? {} : req.body)
      return success(res, await service.reanalyzePackageAttempt(
        req.user.userId,
        req.user.role,
        req.params.attemptId,
      ), '综合分析已重新生成')
    } catch (err) { return handleError(res, err) }
  },

  async listAttempts(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = listCompositeAttemptsQuerySchema.parse(req.query)
      const pagination = getPaginationParams(req)
      return success(res, await service.listAttemptsForTeacher(req.user.userId, req.user.role, req.params.id, {
        status: query.status,
        q: query.q,
        page: pagination.page,
        pageSize: pagination.pageSize,
      }))
    } catch (err) { return handleError(res, err) }
  },

  async teacherReport(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeReportQuerySchema.parse(req.query)
      return success(res, await service.getReportForTeacher(
        req.user.userId,
        req.user.role,
        req.params.id,
        req.params.attemptId,
        query.snapshotId,
      ))
    } catch (err) { return handleError(res, err) }
  },

  async teacherAnalysisExport(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeAnalysisExportQuerySchema.parse(req.query)
      const context = await service.getAnalysisExportForTeacher(
        req.user.userId,
        req.user.role,
        req.params.id,
        req.params.attemptId,
        query.snapshotId,
      )
      return await sendAnalysisExport(res, context, query.format)
    } catch (err) { return handleError(res, err) }
  },

  async exportPreview(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeExportQuerySchema.parse(req.query)
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const { compositeExportService } = await import('./composite-export.service')
      const data = await compositeExportService.getExportData(req.params.id, {
        detail: query.detail,
        anonymize: true,
        actor: { userId: req.user.userId, role: req.user.role },
      })
      return success(res, { assessmentId: data.assessmentId, assessmentName: data.assessmentName, detail: data.detail, recordCount: data.rows.length, fieldCount: data.fields.length, fields: data.fields })
    } catch (err) { return handleError(res, err) }
  },

  async exportData(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = compositeExportRequestSchema.parse(req.body || {})
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const anonymize = req.user.role === UserRole.ADMIN ? input.anonymize : true
      const { compositeExportService } = await import('./composite-export.service')
      const exportOptions = {
        detail: input.detail,
        anonymize,
        dateRange: input.dateRange,
        actor: { userId: req.user.userId, role: req.user.role },
      }
      const data = await compositeExportService.getExportData(req.params.id, exportOptions)
      const files = await compositeExportService.saveExportFiles(req.params.id, exportOptions, input.format, data)
      return success(res, { assessmentId: data.assessmentId, detail: input.detail, format: input.format, anonymize, recordCount: data.rows.length, fieldCount: data.fields.length, fileName: path.basename(files.filePath) }, '导出成功')
    } catch (err) { return handleError(res, err) }
  },

  async downloadExport(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const fileName = req.params.fileName
      if (path.basename(fileName) !== fileName || !fileName.startsWith(`composite_${req.params.id.substring(0, 8)}_`) || !/^composite_[a-zA-Z0-9-]+_(summary|full)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_[a-f0-9-]{36}\.(csv|sav)$/.test(fileName)) return notFound(res, '文件不存在')
      const filePath = path.join(__dirname, '../../../exports', fileName)
      if (!fs.existsSync(filePath)) return notFound(res, '文件不存在')
      return res.download(filePath)
    } catch (err) { return handleError(res, err) }
  },

  async publicInfo(req: Request, res: Response) {
    try { return success(res, await service.getPublicCompositeInfo(req.params.token)) } catch (err) { return handleError(res, err) }
  },

  async publicStart(req: Request, res: Response) {
    try {
      const input = z.object({ recoveryToken: z.string().min(20).max(200).optional() }).strict().parse(req.body || {})
      const data = await service.startPublicAttempt(req.params.token, input.recoveryToken)
      return success(res, data, data.recoveryToken ? '匿名综合测评已开始，请保存恢复凭证' : '已恢复综合测评')
    } catch (err) { return handleError(res, err) }
  },

  async publicRestart(req: Request, res: Response) {
    try {
      const data = await service.restartPublicAttempt(req.params.attemptId, hashRecoveryToken(recoveryFromRequest(req)))
      return success(res, data, '匿名综合测评已重启')
    } catch (err) { return handleError(res, err) }
  },

  async publicAttempt(req: Request, res: Response) {
    try { return success(res, await service.getAttemptState(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) })) } catch (err) { return handleError(res, err) }
  },

  async publicEmbeddedSituational(req: Request, res: Response) {
    try {
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedSituationalAccess(req, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }),
      )
      return success(res, situationalAttemptForResponse(runtime.row, runtime.snapshot))
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async publicEmbeddedSituationalAsset(req: Request, res: Response) {
    try {
      const runtime = await loadEmbeddedSituationalAttemptRuntime(
        req.params.situationalAttemptId,
        embeddedSituationalAccess(req, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }),
      )
      return serveFrozenSituationalAsset({
        snapshot: runtime.snapshot,
        assetId: req.params.assetId,
        res,
      })
    } catch (err) {
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async publicSubmitEmbeddedSituational(req: Request, res: Response) {
    try {
      const parsed = situationalFinalSubmitSchema.safeParse(req.body)
      if (!parsed.success) return error(res, firstSituationalValidationMessage(parsed.error))
      const data = await withUnitSubmitAdmission(() => submitSituationalAttemptFinal({
        attemptId: req.params.situationalAttemptId,
        userId: undefined,
        embedded: embeddedSituationalAccess(req, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }),
        ...parsed.data,
      }))
      return success(res, data, data.replayed ? '匿名综合测评情境化模块提交已确认' : '匿名综合测评情境化模块提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async publicFreezeContext(req: Request, res: Response) {
    try {
      return success(res, await service.freezeContext(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }), '人口学上下文已冻结')
    } catch (err) { return handleError(res, err) }
  },

  async publicSave(req: Request, res: Response) {
    try {
      const input = compositeSaveSchema.parse(req.body || {})
      const draft = input.itemId !== undefined && input.value !== undefined ? { itemId: input.itemId, value: input.value } : undefined
      return success(res, await service.saveAttempt(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }, draft), '进度已保存')
    } catch (err) { return handleError(res, err) }
  },

  async publicScaleAnswer(req: Request, res: Response) {
    try {
      const recoveryToken = recoveryFromBody(req)
      const { recoveryToken: _recoveryToken, ...answerBody } = req.body || {}
      const input = compositeScaleAnswerSchema.parse(answerBody)
      return success(res, await service.saveScaleAnswer(req.params.attemptId, req.params.itemId, input, { recoveryTokenHash: hashRecoveryToken(recoveryToken) }), '答案已保存')
    } catch (err) { return handleError(res, err) }
  },

  async publicCompleteScale(req: Request, res: Response) {
    try { return success(res, await service.completeScale(req.params.attemptId, req.params.itemId, { recoveryTokenHash: hashRecoveryToken(recoveryFromBody(req)) }), '量表模块已完成') } catch (err) { return handleError(res, err) }
  },

  async publicFormAnswer(req: Request, res: Response) {
    try {
      const recoveryToken = recoveryFromBody(req)
      const { recoveryToken: _recoveryToken, ...answerBody } = req.body || {}
      const input = compositeFormAnswerSchema.parse(answerBody)
      return success(res, await service.saveFormAnswer(req.params.attemptId, req.params.itemId, input.value, { recoveryTokenHash: hashRecoveryToken(recoveryToken) }), '表单已保存')
    } catch (err) { return handleError(res, err) }
  },

  async publicSubmitFinalFormSection(req: Request, res: Response) {
    try {
      const input = finalQuestionnaireFormSectionSubmitSchema.parse(req.body)
      const data = await submitCompositeFormSectionFinal({
        attemptId: req.params.attemptId,
        sectionId: req.params.sectionId,
        ...input,
        recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)),
        userId: null,
      })
      return success(res, data, data.replayed ? '匿名表单区段提交已确认' : '匿名表单区段提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async publicSubmitFinalScale(req: Request, res: Response) {
    try {
      const input = finalScaleSubmitSchema.parse(req.body)
      const { submitCompositeScaleFinal } = await import('../scale/scale-final-submit.service')
      const data = await submitCompositeScaleFinal(
        req.params.attemptId,
        req.params.itemId,
        input,
        { userId: null, recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) },
      )
      return success(res, data, data.replayed ? '匿名量表提交已确认' : '匿名量表提交成功')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async publicReport(req: Request, res: Response) {
    try { return success(res, await service.getReport(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) })) } catch (err) { return handleError(res, err) }
  },

  async publicAnalysisExport(req: Request, res: Response) {
    try {
      const query = compositeParticipantAnalysisExportQuerySchema.parse(req.query)
      const context = await service.getAnalysisExportForParticipant(
        req.params.attemptId,
        { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) },
      )
      return await sendAnalysisExport(res, context, query.format)
    } catch (err) { return handleError(res, err) }
  },
}

const recoveryFromBody = (req: Request): string => {
  const parsed = publicRecoverySchema.parse({ recoveryToken: req.body?.recoveryToken })
  return parsed.recoveryToken
}

const handleError = (res: Response, err: unknown): Response => {
  if (err instanceof z.ZodError) return error(res, err.issues.map((item) => item.message).join('; '), -1, 400)
  if (service.isCompositeError(err)) {
    return err.statusCode < 500
      ? error(res, err.message, -1, err.statusCode)
      : error(res, '服务器内部错误', -1, 500)
  }
  const maybe = err as { statusCode?: unknown; message?: unknown }
  if (typeof maybe.statusCode === 'number' && maybe.statusCode >= 400 && maybe.statusCode < 500) return error(res, typeof maybe.message === 'string' ? maybe.message : 'Request failed', -1, maybe.statusCode)
  return error(res, '服务器内部错误', -1, 500)
}
