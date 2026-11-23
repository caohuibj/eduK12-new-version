import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import { error, success, forbidden } from '../utils/response'
import { logger } from '../utils/logger'
import { ScaleImportValidationError } from '../modules/assessment-core/scale/import-parser'
import { scaleFullTemplateWorkbook } from '../modules/scale/scale-full-workbook'
import { importScaleCsv, importScaleFullWorkbook, ScaleImportError } from '../modules/scale/scale-import.service'
import { ScaleCopyError } from '../modules/scale/scale-copy.service'

const handleError = (res: Response, cause: unknown, fallbackFormatMessage: string) => {
  if (cause instanceof ScaleImportError || cause instanceof ScaleCopyError) return error(res, cause.message, -1, cause.status)
  if (cause instanceof ScaleImportValidationError) return error(res, cause.issues.map(issue => `第 ${issue.line} 行：${issue.message}`).join('；'))
  if (cause instanceof ZodError) return error(res, fallbackFormatMessage)
  if (['P2025', 'P2034'].includes((cause as { code?: string })?.code || '')) return error(res, '量表版本已变化，请重新预检', -1, 409)
  logger.error('量表导入失败', { name: cause instanceof Error ? cause.name : 'UnknownError' })
  return error(res, '量表导入失败，输入已保留')
}

const run = (confirm: boolean) => async (req: Request, res: Response) => {
  if (!req.user?.userId) return forbidden(res, '未登录')
  try { return success(res, await importScaleCsv(req.params.id, req.user, req.body, confirm), confirm ? '导入已保存' : '预检完成') }
  catch (cause) { return handleError(res, cause, '导入请求格式无效，必须提供 CSV 内容及预检版本') }
}

const runFull = (confirm: boolean) => async (req: Request, res: Response) => {
  if (!req.user?.userId) return forbidden(res, '未登录')
  if (!req.file?.buffer) return error(res, '请选择 .xlsx 量表模板文件', -1, 400)
  try { return success(res, await importScaleFullWorkbook(req.params.id, req.user, req.file.buffer, req.body, confirm), confirm ? '完整量表导入已保存' : '完整量表预检完成') }
  catch (cause) { return handleError(res, cause, '完整量表导入请求格式无效，必须提供 .xlsx 文件及预检版本') }
}

const fullTemplate = async (_req: Request, res: Response) => {
  try {
    const buffer = await scaleFullTemplateWorkbook()
    res.setHeader('Content-Disposition', 'attachment; filename="scale-full-import-v1.xlsx"')
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer)
  } catch (cause) {
    logger.error('量表模板生成失败', { name: cause instanceof Error ? cause.name : 'UnknownError' })
    return error(res, '无法生成量表导入模板', -1, 500)
  }
}

export const scaleImportController = {
  preview: run(false),
  confirm: run(true),
  fullTemplate,
  fullPreview: runFull(false),
  fullConfirm: runFull(true),
}
