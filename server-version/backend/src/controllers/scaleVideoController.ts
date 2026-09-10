import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { issueFrozenAssessmentVideoCapabilities } from '../modules/assessment-media/assessment-media-capability'
import { decryptFrozenScaleRuntimeSnapshot } from '../modules/assessment-runtime/runtime-snapshot'
import { frozenScaleMediaOwner } from '../modules/scale/scale-image-retention'
import { scaleItemVideoPresentation } from '../modules/scale/scale-video.adapter'
import { error, forbidden, notFound, success } from '../utils/response'

export const scaleVideoController = {
  async issueAssessmentVideo(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) return forbidden(res, '未登录')
      const assessment = await prisma.assessment.findFirst({
        where: {
          id: req.params.assessmentId,
          userId,
          questionnaireAssessmentId: null,
          compositeAttemptId: null,
        },
        select: { id: true, runtimeSnapshotEncrypted: true },
      })
      if (!assessment) return notFound(res, '量表测评记录不存在')
      if (!assessment.runtimeSnapshotEncrypted) return error(res, '量表冻结内容不可用')

      const snapshot = decryptFrozenScaleRuntimeSnapshot(assessment.runtimeSnapshotEncrypted)
      const presentation = scaleItemVideoPresentation(snapshot.definition, req.params.itemCode)
      if (!presentation) return notFound(res, '当前冻结题目没有视频内容')

      const sources = await issueFrozenAssessmentVideoCapabilities({
        scopeId: `SCALE:${assessment.id}:ITEM:${req.params.itemCode}`,
        audience: 'authenticated',
        presentation,
        retentionOwner: frozenScaleMediaOwner(assessment.id),
        db: prisma,
      })
      return success(res, sources)
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
}

export default scaleVideoController
