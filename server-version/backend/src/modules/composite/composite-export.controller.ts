import { enqueueExportJob } from '../../services/exportJobService'
import { registerAssessmentExport, resolveAssessmentExport } from '../../services/assessmentExportArtifact'
import { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import * as path from 'path'
import { z } from 'zod'
import { error, notFound, success, unauthorized } from '../../utils/response'
import * as service from './composite.service'
import { compositeExportQuerySchema, compositeExportRequestSchema } from './composite.schema'
import { compositeExportService } from './composite-export.service'
import {
  bindCompositeExportFilePath,
  compositeExportFileNameMatchesProjection,
  projectCompositeExportData,
  resolveCompositeExportProjectionBinding,
} from './composite-export-projection'

const handleError = (res: Response, err: unknown): Response => {
  if (err instanceof z.ZodError) return error(res, err.issues.map((item) => item.message).join('; '), -1, 400)
  if (service.isCompositeError(err)) {
    return err.statusCode < 500
      ? error(res, err.message, -1, err.statusCode)
      : error(res, '服务器内部错误', -1, 500)
  }
  const maybe = err as { statusCode?: unknown; message?: unknown }
  if (typeof maybe.statusCode === 'number' && maybe.statusCode >= 400 && maybe.statusCode < 500) {
    return error(res, typeof maybe.message === 'string' ? maybe.message : 'Request failed', -1, maybe.statusCode)
  }
  return error(res, '服务器内部错误', -1, 500)
}

/**
 * HTTP boundary for Composite wide exports. The legacy builder remains an
 * internal complete-data producer; no route serializes or stores its output
 * until Scale fields have passed the disclosure projector.
 */
export const compositeExportController = {
  async preview(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = compositeExportQuerySchema.parse(req.query)
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const [raw, binding] = await Promise.all([
        compositeExportService.getExportData(req.params.id, {
          previewLimit: 1, detail: query.detail,
          anonymize: true,
          actor: { userId: req.user.userId, role: req.user.role },
        }),
        resolveCompositeExportProjectionBinding(req.params.id, 'teacher'),
      ])
      const data = projectCompositeExportData(raw, binding)
      return success(res, {
        sampled: true, sampleSize: data.rows.length,
        assessmentId: data.assessmentId,
        assessmentName: data.assessmentName,
        detail: data.detail,
        recordCount: data.totalCount ?? data.rows.length,
        fieldsAreSampled: true,
        fieldCount: data.fields.length,
        fields: data.fields,
      })
    } catch (err) { return handleError(res, err) }
  },

  async export(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = compositeExportRequestSchema.parse(req.body || {})
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const anonymize = req.user.role === UserRole.ADMIN ? input.anonymize : true
      const binding = await resolveCompositeExportProjectionBinding(req.params.id, 'teacher')
      return success(res, await enqueueExportJob({ resourceType: 'COMPOSITE', resourceId: req.params.id,
        createdBy: req.user.userId, anonymized: anonymize, format: input.format, recordCount: 0,
        requestKey: req.get('X-Export-Request-Key'), options: { detail: input.detail, anonymize, dateRange: input.dateRange,
          creatorRole: req.user.role as 'ADMIN' | 'TEACHER', projectionFingerprint: binding.fingerprint } }), '导出已排队')
    } catch (err) { return handleError(res, err) }
  },

  async download(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await service.getExportContext(req.user.userId, req.user.role, req.params.id)
      const binding = await resolveCompositeExportProjectionBinding(req.params.id, 'teacher')
      const fileName = req.params.fileName
      const safeName = path.basename(fileName) === fileName
        && fileName.startsWith(`composite_${req.params.id.substring(0, 8)}_`)
        && /^composite_[a-zA-Z0-9-]+_(summary|full)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_[a-f0-9-]{36}\.(csv|sav)$/.test(fileName)
      if (!safeName || !compositeExportFileNameMatchesProjection(fileName, binding)) {
        return notFound(res, '文件不存在')
      }
      const filePath = await resolveAssessmentExport({
        resourceType: 'COMPOSITE', resourceId: req.params.id, fileName,
        actor: { userId: req.user.userId, role: req.user.role },
        projectionFingerprint: binding.fingerprint,
      })
      if (!filePath) return notFound(res, '文件不存在')
      return res.download(filePath)
    } catch (err) { return handleError(res, err) }
  },
}
