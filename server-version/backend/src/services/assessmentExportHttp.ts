import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { resolveAssessmentExport } from './assessmentExportArtifact'
import { exportArtifactUrl } from './exportJobService'
import { success, notFound, unauthorized } from '../utils/response'
import * as assignmentService from '../modules/cognitive/assignment.service'
import { isCompositeWrapper } from '../modules/cognitive/assignment.access'
import { getExportContext } from '../modules/composite/composite.service'
import { resolveCompositeExportProjectionBinding } from '../modules/composite/composite-export-projection'
export const assessmentExportHttp = (type: 'COGNITIVE' | 'COMPOSITE' | 'TRAINING_ANALYSIS', metadataOnly: boolean) => async (req: Request, res: Response) => {
  if (!req.user) return unauthorized(res)
  try {
    const resourceId = req.params.courseId ?? req.params.id
    let fingerprint = 'cognitive-frozen-export-v1'
    if (type === 'COGNITIVE') {
      const assignment = await assignmentService.getAssignmentForTeacher(req.user.userId, req.user.role, resourceId)
      if (isCompositeWrapper(assignment)) return notFound(res, '文件不存在')
    } else if (type === 'COMPOSITE') {
      await getExportContext(req.user.userId, req.user.role, resourceId)
      fingerprint = (await resolveCompositeExportProjectionBinding(resourceId, 'teacher')).fingerprint
    }
    const artifact = await prisma.exportArtifact.findUnique({ where: { id: req.params.artifactId } })
    if (!artifact || artifact.resourceType !== type || artifact.resourceId !== resourceId) return notFound(res, '文件不存在')
    const resolved = await resolveAssessmentExport({ resourceType: type, resourceId: resourceId,
      actor: req.user, fileName: artifact.storageKey, projectionFingerprint: fingerprint, metadataOnly })
    if (!resolved) return notFound(res, '文件不存在')
    if (!metadataOnly) return res.download(resolved)
    return success(res, { id: artifact.id, batchId: artifact.batchId, status: artifact.status, errorCode: artifact.errorCode,
      format: artifact.format, fileName: artifact.storageKey, expiresAt: artifact.expiresAt,
      downloadUrl: exportArtifactUrl(type, resourceId, artifact.id) })
  } catch { return notFound(res, '文件不存在') }
}
