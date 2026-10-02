import type { Request, Response } from 'express'
import { legacyQuestionnaireDb as prisma } from '../services/legacyQuestionnaireDatabase'
import { validateContextFormItems } from '../modules/assessment-context'
import { formSectionIdentityHash } from '../modules/assessment-runtime/attempt-runtime'
import {
  publishedFormMediaOwner,
  questionnaireFormSectionImageReferences,
  retainFormSectionImages,
} from '../modules/assessment-runtime/form-image.adapter'
import {
  questionnaireFormSectionVideoPresentations,
  retainFormSectionVideos,
} from '../modules/assessment-runtime/form-video.adapter'
import * as formSectionService from '../services/questionnaire-form-section.service'
import { questionnaireAuthorizationService as questionnaireAuth } from '../services/questionnaireAuthorizationService'
import { cacheService } from '../services/cacheService'
import { error, forbidden, notFound, success } from '../utils/response'

const actorFromRequest = (req: Request) => req.user ? { userId: req.user.userId, role: req.user.role } : null

export const generalQuestionnaireImageController = {
  async publish(req: Request, res: Response) {
    try {
      const { id } = req.params
      const questionnaire = await prisma.questionnaire.findFirst({
        where: { id, type: 'GENERAL' },
        include: {
          questionnaireScales: { include: { scale: true } },
          formItems: true,
        },
      })
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await questionnaireAuth.canManageGeneral(actorFromRequest(req), questionnaire))) {
        return forbidden(res, '无权限发布此问卷')
      }

      const hasContent = questionnaire.questionnaireScales.length > 0 || questionnaire.formItems.length > 0
      if (!hasContent) return error(res, '问卷必须包含至少一个量表或表单题目')
      const unpublishedScales = questionnaire.questionnaireScales.filter((entry) => entry.scale.status !== 'PUBLISHED')
      if (unpublishedScales.length > 0) return error(res, '问卷中的所有量表必须先发布')

      const sections = await formSectionService.readQuestionnaireFormSections(id)
      const sectionedItemIds = new Set(sections.flatMap((section) => section.items.map((item) => item.id)))
      const orphanItems = questionnaire.formItems.filter((item) => !sectionedItemIds.has(item.id))
      if (orphanItems.length > 0) return error(res, '问卷包含未归属区段的表单题目，发布失败')

      const units = await formSectionService.listQuestionnaireContentUnits(id, sections)
      const contextSections = sections.filter((section) => section.contextSection || section.items.some((item) => item.contextKey))
      if (contextSections.length > 1) return error(res, '同一问卷只能有一个上下文区段')
      if (contextSections[0] && (units[0]?.type !== 'form-section' || units[0].id !== contextSections[0].id)) {
        return error(res, '人口学上下文区段必须是第一个内容单元')
      }
      const sectionByItem = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, section] as const)))
      const contextItems = questionnaire.formItems.map((item) => ({
        ...item,
        position: sectionByItem.get(item.id)?.position ?? item.position,
      }))
      const measurementPositions = units
        .filter((unit) => !(contextSections[0]?.id === unit.id && unit.type === 'form-section'))
        .map((unit) => unit.position)
      const contextIssues = validateContextFormItems(contextItems, measurementPositions)
      if (contextIssues.length > 0) return error(res, contextIssues[0].message)

      const updated = await prisma.$transaction(async (tx) => {
        for (const section of sections) {
          const owner = publishedFormMediaOwner('QUESTIONNAIRE', id, formSectionIdentityHash(section))
          await retainFormSectionImages({
            owner,
            references: questionnaireFormSectionImageReferences(section),
            db: tx as never,
          })
          await retainFormSectionVideos({
            owner,
            presentations: questionnaireFormSectionVideoPresentations(section),
            db: tx as never,
          })
        }
        return tx.questionnaire.update({ where: { id }, data: { status: 'PUBLISHED' } })
      })
      await cacheService.clearQuestionnaireCache(id)
      return success(res, updated, '问卷发布成功')
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '发布问卷失败')
    }
  },
}

export default generalQuestionnaireImageController
