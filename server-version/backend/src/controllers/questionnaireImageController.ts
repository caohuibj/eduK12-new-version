import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { validateContextFormItems } from '../modules/assessment-context'
import { formSectionIdentityHash } from '../modules/assessment-runtime/attempt-runtime'
import { decryptFrozenScaleRuntimeSnapshot } from '../modules/assessment-runtime/runtime-snapshot'
import {
  ensureQuestionnaireFormAdmissionAtDelivery,
} from '../modules/assessment-runtime/form-admission.service'
import {
  publishedFormMediaOwner,
  questionnaireFormSectionImageReferences,
  retainFormSectionImages,
  serveFrozenFormSectionImage,
} from '../modules/assessment-runtime/form-image.adapter'
import {
  questionnaireFormSectionVideoPresentations,
  retainFormSectionVideos,
} from '../modules/assessment-runtime/form-video.adapter'
import { serveFrozenScaleAssessmentImage } from '../modules/scale/scale-image.adapter'
import * as formSectionService from '../services/questionnaire-form-section.service'
import { questionnaireAuthorizationService as questionnaireAuth } from '../services/questionnaireAuthorizationService'
import { cacheService } from '../services/cacheService'
import { error, forbidden, notFound, success } from '../utils/response'

const actorFromRequest = (req: Request) => req.user ? { userId: req.user.userId, role: req.user.role } : null

const questionnaireForPublish = (id: string) => prisma.questionnaire.findFirst({
  where: { id, type: 'COURSE' },
  include: {
    questionnaireScales: { include: { scale: true } },
    formItems: true,
  },
})

const assessmentForAuthenticatedRequest = async (req: Request) => {
  const userId = req.user?.userId
  if (!userId) return null
  return prisma.questionnaireAssessment.findFirst({
    where: { id: req.params.assessmentId, userId },
    select: { id: true, questionnaireId: true, sessionId: true },
  })
}

const assessmentForPublicRequest = (req: Request) => prisma.questionnaireAssessment.findUnique({
  where: { sessionId: req.params.sessionId },
  select: { id: true, questionnaireId: true, sessionId: true },
})

const serveFormImage = async (input: {
  assessment: { id: string; questionnaireId: string } | null
  sectionId: string
  assetId: string
  res: Response
}) => {
  if (!input.assessment) return notFound(input.res, '问卷测评记录不存在')
  const sections = await formSectionService.readQuestionnaireFormSections(input.assessment.questionnaireId)
  const section = sections.find((candidate) => candidate.id === input.sectionId)
  if (!section) return notFound(input.res, '表单区段不存在')
  const admission = await ensureQuestionnaireFormAdmissionAtDelivery(input.assessment.id, section)
  await serveFrozenFormSectionImage({
    admission,
    assetId: input.assetId,
    res: input.res,
  })
  return undefined
}

const serveScaleImage = async (input: {
  assessment: { id: string } | null
  scaleAssessmentId: string
  assetId: string
  res: Response
}) => {
  if (!input.assessment) return notFound(input.res, '问卷测评记录不存在')
  const child = await prisma.assessment.findFirst({
    where: {
      id: input.scaleAssessmentId,
      questionnaireAssessmentId: input.assessment.id,
    },
    select: { id: true, runtimeSnapshotEncrypted: true },
  })
  if (!child) return notFound(input.res, '量表测评记录不存在')
  if (!child.runtimeSnapshotEncrypted) return error(input.res, '量表冻结内容不可用')
  const snapshot = decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted)
  await serveFrozenScaleAssessmentImage({ snapshot, assetId: input.assetId, res: input.res })
  return undefined
}

export const questionnaireImageController = {
  async publish(req: Request, res: Response) {
    try {
      const { id } = req.params
      const questionnaire = await questionnaireForPublish(id)
      if (!questionnaire) return notFound(res, '问卷不存在')
      if (!(await questionnaireAuth.canManage(actorFromRequest(req), questionnaire))) return forbidden(res, '无权限发布此问卷')

      const hasContent = questionnaire.questionnaireScales.length > 0 || questionnaire.formItems.length > 0
      if (!hasContent) return error(res, '问卷必须包含至少一个量表或表单题目')
      const unpublishedScales = questionnaire.questionnaireScales.filter((entry) => entry.scale.status !== 'PUBLISHED')
      if (unpublishedScales.length > 0) return error(res, '问卷中的所有量表必须先发布')

      const sections = await formSectionService.readQuestionnaireFormSections(id)
      const sectionedItemIds = new Set(sections.flatMap((section) => section.items.map((item) => item.id)))
      const orphanItems = questionnaire.formItems.filter((item) => !sectionedItemIds.has(item.id))
      if (orphanItems.length > 0) return error(res, '问卷包含未归属区段的表单题目，发布失败')

      const contentUnits = await formSectionService.listQuestionnaireContentUnits(id, sections)
      const contextSections = sections.filter((section) => section.contextSection || section.items.some((item) => item.contextKey))
      if (contextSections.length > 1) return error(res, '同一问卷只能有一个上下文区段')
      if (contextSections[0] && (contentUnits[0]?.type !== 'form-section' || contentUnits[0].id !== contextSections[0].id)) {
        return error(res, '人口学上下文区段必须是第一个内容单元')
      }
      const sectionByItem = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, section] as const)))
      const contextItems = questionnaire.formItems.map((item) => ({
        ...item,
        position: sectionByItem.get(item.id)?.position ?? item.position,
      }))
      const measurementPositions = contentUnits
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

  async authenticatedFormImage(req: Request, res: Response) {
    try {
      return await serveFormImage({
        assessment: await assessmentForAuthenticatedRequest(req),
        sectionId: req.params.sectionId,
        assetId: req.params.assetId,
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单图片加载失败')
    }
  },

  async publicFormImage(req: Request, res: Response) {
    try {
      return await serveFormImage({
        assessment: await assessmentForPublicRequest(req),
        sectionId: req.params.sectionId,
        assetId: req.params.assetId,
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单图片加载失败')
    }
  },

  async authenticatedScaleImage(req: Request, res: Response) {
    try {
      return await serveScaleImage({
        assessment: await assessmentForAuthenticatedRequest(req),
        scaleAssessmentId: req.params.scaleAssessmentId,
        assetId: req.params.assetId,
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表图片加载失败')
    }
  },

  async publicScaleImage(req: Request, res: Response) {
    try {
      return await serveScaleImage({
        assessment: await assessmentForPublicRequest(req),
        scaleAssessmentId: req.params.scaleAssessmentId,
        assetId: req.params.assetId,
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表图片加载失败')
    }
  },
}

export default questionnaireImageController
