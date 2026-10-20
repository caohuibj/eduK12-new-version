import { publishScaleMeasurement } from '../modules/measurement-content/scale'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { assertScaleCopyPublishSource, ScaleCopyError } from '../modules/scale/scale-copy.service'
import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { error, forbidden, notFound, success } from '../utils/response'
import { hashScaleDefinition } from '../modules/scale/scale-definition'
import { validateScaleProductDefinition } from '../modules/scale/product-definition-readiness'
import { loadFrozenScaleRuntimeSnapshot } from '../modules/assessment-runtime/runtime-snapshot'
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
      const request = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }).optional() }).safeParse(req.body || {})
      if (!request.success) return error(res, '发布版本参数无效')
      const scale = await prisma.scale.findUnique({ where: { id } })
      if (!scale) return notFound(res, '量表不存在')
      if (scale.creatorId !== userId && userRole !== UserRole.ADMIN) return forbidden(res, '无权限发布此量表')
      if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') return error(res, 'STANDARD 量表必须由代码 package 发布，网页只读')
      if (scale.status !== 'DRAFT') return error(res, '只有草稿状态的量表可以发布', -1, 409)
      if (request.data.expectedUpdatedAt && new Date(request.data.expectedUpdatedAt).getTime() !== scale.updatedAt.getTime()) return error(res, '量表草稿已变化，请刷新后重新发布', -1, 409)

      const validation = validateScaleProductDefinition(scale.definition, 'CUSTOM_DESCRIPTIVE')
      const definition = validation.definition
      if (!definition || !validation.valid) {
        return error(res, definitionIssuesMessage(validation.issues))
      }
      const definitionHash = hashScaleDefinition(definition)
      const updated = await prisma.$transaction(async (tx) => {
        await assertScaleCopyPublishSource(tx, scale)
        await retainScaleAssessmentImages({
          owner: publishedScaleMediaOwner(scale.id, definitionHash),
          definition,
          db: tx as never,
        })
        // Publish exactly the draft that passed validation. A concurrent save
        // or publication invalidates this predicate and rolls back media pins.
        const published = await tx.scale.update({
          where: { id, status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE',
            updatedAt: scale.updatedAt, definitionHash: scale.definitionHash },
          data: {
            status: 'PUBLISHED',
            definition: definition as any,
            definitionHash,
            ...definitionSummary(definition),
          },
        })
        const release = await publishScaleMeasurement(tx, {
          localId: scale.id, version: scale.updatedAt.toISOString(),
          instrumentVersion: scale.instrumentVersion, definition, instrumentClass: 'CUSTOM_DESCRIPTIVE',
          provenance: scale.copySource ? { copySource: scale.copySource } : {},
          scope: { kind: 'PRIVATE', ownerId: scale.creatorId, product: 'TRAINING', resourceId: scale.id },
        }, userId!)
        await tx.$executeRaw(Prisma.sql`UPDATE scales SET measurement_release_id=${release.releaseId} WHERE id=${scale.id}`)
        if (scale.copySource != null) await tx.assetReference.deleteMany({ where: { entityType: 'ScaleCopyDraft', entityId: id } })
        return { ...published, measurementReleaseId: release.releaseId }
      })
      return success(res, updated, '量表发布成功')
    } catch (cause) {
      if (cause instanceof ScaleCopyError) return error(res, cause.message, -1, cause.status)
      if ((cause as { code?: string })?.code === 'P2025') return error(res, '量表草稿已变化，请刷新后重新发布', -1, 409)
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
      const snapshot = (await loadFrozenScaleRuntimeSnapshot(assessment.runtimeSnapshotEncrypted))
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
