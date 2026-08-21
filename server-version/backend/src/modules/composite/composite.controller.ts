import { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { success, error, notFound, unauthorized } from '../../utils/response'
import * as service from './composite.service'
import {
  addCompositeItemSchema,
  compositeExportQuerySchema,
  compositeExportRequestSchema,
  compositeFormAnswerSchema,
  compositeScaleAnswerSchema,
  createCompositeSchema,
  createCompositeTokenSchema,
  publicRecoverySchema,
  reorderCompositeItemsSchema,
  updateCompositeSchema,
} from './composite.schema'
import { z } from 'zod'
import { isValidRecoveryToken, hashRecoveryToken } from '../../services/anonymousAccess'
import * as path from 'path'
import * as fs from 'fs'

const recoveryFromRequest = (req: Request): string => {
  const value = req.headers['x-recovery-token']
  if (!isValidRecoveryToken(value)) throw new z.ZodError([{ code: 'custom', path: ['recoveryToken'], message: '缺少有效恢复凭证' }])
  return value
}

export const compositeController = {
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

  async update(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.updateComposite(req.user.userId, req.user.role, req.params.id, updateCompositeSchema.parse(req.body)), '综合测评已更新')
    } catch (err) { return handleError(res, err) }
  },

  async addItem(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.addItem(req.user.userId, req.user.role, req.params.id, addCompositeItemSchema.parse(req.body)), '模块已添加')
    } catch (err) { return handleError(res, err) }
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

  async getAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.getAttemptState(req.params.attemptId, { userId: req.user.userId }))
    } catch (err) { return handleError(res, err) }
  },

  async saveAttempt(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.saveAttempt(req.params.attemptId, { userId: req.user.userId }), '进度已保存')
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

  async report(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      return success(res, await service.getReport(req.params.attemptId, { userId: req.user.userId }))
    } catch (err) { return handleError(res, err) }
  },

  async exportPreview(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeExportQuerySchema.parse(req.query)
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const { compositeExportService } = await import('./composite-export.service')
      const data = await compositeExportService.getExportData(req.params.id, { detail: query.detail, anonymize: true })
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
      const data = await compositeExportService.getExportData(req.params.id, { detail: input.detail, anonymize, dateRange: input.dateRange })
      const files = await compositeExportService.saveExportFiles(req.params.id, { detail: input.detail, anonymize, dateRange: input.dateRange }, input.format, data)
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

  async publicAttempt(req: Request, res: Response) {
    try { return success(res, await service.getAttemptState(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) })) } catch (err) { return handleError(res, err) }
  },

  async publicSave(req: Request, res: Response) {
    try { return success(res, await service.saveAttempt(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) }), '进度已保存') } catch (err) { return handleError(res, err) }
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

  async publicReport(req: Request, res: Response) {
    try { return success(res, await service.getReport(req.params.attemptId, { recoveryTokenHash: hashRecoveryToken(recoveryFromRequest(req)) })) } catch (err) { return handleError(res, err) }
  },
}

const recoveryFromBody = (req: Request): string => {
  const parsed = publicRecoverySchema.parse({ recoveryToken: req.body?.recoveryToken })
  return parsed.recoveryToken
}

const handleError = (res: Response, err: unknown): Response => {
  if (err instanceof z.ZodError) return error(res, err.issues.map((item) => item.message).join('; '), -1, 400)
  if (service.isCompositeError(err)) return error(res, err.message, -1, err.statusCode)
  const maybe = err as { statusCode?: unknown; message?: unknown }
  if (typeof maybe.statusCode === 'number') return error(res, typeof maybe.message === 'string' ? maybe.message : 'Request failed', -1, maybe.statusCode)
  return error(res, err instanceof Error ? err.message : 'Internal server error', -1, 500)
}
