import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { error, forbidden, notFound, success } from '../utils/response'
import {
  hashScaleDefinition,
  validateScaleDefinition,
} from '../modules/scale/scale-definition'
import { getScaleCustomScorerKeys } from '../modules/scale/scale-scoring'
import { decryptFrozenScaleRuntimeSnapshot } from '../modules/assessment-runtime/runtime-snapshot'
import {
  publishedScaleMediaOwner,
  retainScaleAssessmentImages,
  serveFrozenScaleAssessmentImage,
} from '../modules/scale/scale-image.adapter'

const definitionIssuesMessage = (issues: Array<{ path: string; message: string }>): string => (
  issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`).join('；')
)

const definitionSummary = (definition: { items: unknown[]; scoring: { scores: Array<{ type: string }> } }) => ({
  itemCount: definition.items.length,
  dimensionCount: definition.scoring.scores.filter((score) => score.type === 'dimension').length,
})

export const scaleImageController = {
  async publish(req: Request, res: Response) {
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
      const definition = validation.definition
      if (!definition || validation.issues.some((issue) => issue.severity === 'error')) {
        return error(res, definitionIssuesMessage(validation.issues))
      }
      const definitionHash = hashScaleDefinition(definition)
      const updated = await prisma.$transaction(async (tx) => {
        await retainScaleAssessmentImages({
          owner: publishedScaleMediaOwner(scale.id, definitionHash),
          definition,
          db: tx as never,
        })
        return tx.scale.update({
          where: { id },
          data: {
            status: 'PUBLISHED',
            definition: definition as any,
            definitionHash,
            ...definitionSummary(definition),
          },
        })
      })
      return success(res, updated, '量表发布成功')
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '发布量表失败')
    }
  },

  async serveAssessmentImage(req: Request, res: Response) {
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
      await serveFrozenScaleAssessmentImage({
        snapshot,
        assetId: req.params.assetId,
        res,
      })
      return undefined
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表图片加载失败')
    }
  },
}

export default scaleImageController
