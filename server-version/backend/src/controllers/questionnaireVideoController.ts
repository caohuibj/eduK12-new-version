import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { issueFrozenAssessmentVideoCapabilities } from '../modules/assessment-media/assessment-media-capability'
import { ensureQuestionnaireFormAdmissionAtDelivery } from '../modules/assessment-runtime/form-admission.service'
import { frozenFormMediaOwnerFromAdmission } from '../modules/assessment-runtime/form-image.adapter'
import { frozenFormOptionVideoPresentation } from '../modules/assessment-runtime/form-video.adapter'
import { decryptFrozenScaleRuntimeSnapshot } from '../modules/assessment-runtime/runtime-snapshot'
import { frozenScaleMediaOwner } from '../modules/scale/scale-image-retention'
import { scaleItemVideoPresentation } from '../modules/scale/scale-video.adapter'
import * as formSectionService from '../services/questionnaire-form-section.service'
import { error, notFound, success } from '../utils/response'

const assessmentForAuthenticatedRequest = async (req: Request) => {
  const userId = req.user?.userId
  if (!userId) return null
  return prisma.questionnaireAssessment.findFirst({
    where: { id: req.params.assessmentId, userId },
    select: { id: true, questionnaireId: true, sessionId: true },
  })
}

// Public routes use requireQuestionnaireResume before entering this controller.
const assessmentForPublicRequest = (req: Request) => prisma.questionnaireAssessment.findUnique({
  where: { sessionId: req.params.sessionId },
  select: { id: true, questionnaireId: true, sessionId: true },
})

const parseOptionIndex = (value: string): number | null => {
  const optionIndex = Number(value)
  return Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : null
}

const issueFormVideo = async (input: {
  assessment: { id: string; questionnaireId: string } | null
  sectionId: string
  itemId: string
  optionIndex: number | null
  audience: 'authenticated' | 'public'
  res: Response
}) => {
  if (!input.assessment) return notFound(input.res, '问卷测评记录不存在')
  if (input.optionIndex === null) return notFound(input.res, '表单选项不存在')
  const sections = await formSectionService.readQuestionnaireFormSections(input.assessment.questionnaireId)
  const section = sections.find((candidate) => candidate.id === input.sectionId)
  if (!section) return notFound(input.res, '表单区段不存在')
  const admission = await ensureQuestionnaireFormAdmissionAtDelivery(input.assessment.id, section)
  const presentation = frozenFormOptionVideoPresentation(admission, input.itemId, input.optionIndex)
  if (!presentation) return notFound(input.res, '当前冻结选项没有视频内容')
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: `QUESTIONNAIRE:${input.assessment.id}:FORM_SECTION:${input.sectionId}:ITEM:${input.itemId}:OPTION:${input.optionIndex}`,
    audience: input.audience,
    presentation,
    retentionOwner: frozenFormMediaOwnerFromAdmission(admission),
    db: prisma,
  })
  return success(input.res, sources)
}

const issueScaleVideo = async (input: {
  assessment: { id: string } | null
  scaleAssessmentId: string
  itemCode: string
  audience: 'authenticated' | 'public'
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
  if (!child?.runtimeSnapshotEncrypted) return notFound(input.res, '量表冻结内容不可用')
  const snapshot = decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted)
  const presentation = scaleItemVideoPresentation(snapshot.definition, input.itemCode)
  if (!presentation) return notFound(input.res, '当前冻结量表题目没有视频内容')
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: `QUESTIONNAIRE:${input.assessment.id}:SCALE:${child.id}:ITEM:${input.itemCode}`,
    audience: input.audience,
    presentation,
    retentionOwner: frozenScaleMediaOwner(child.id),
    db: prisma,
  })
  return success(input.res, sources)
}

export const questionnaireVideoController = {
  async authenticatedFormVideo(req: Request, res: Response) {
    try {
      return await issueFormVideo({
        assessment: await assessmentForAuthenticatedRequest(req),
        sectionId: req.params.sectionId,
        itemId: req.params.itemId,
        optionIndex: parseOptionIndex(req.params.optionIndex),
        audience: 'authenticated',
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单视频授权失败')
    }
  },
  async publicFormVideo(req: Request, res: Response) {
    try {
      return await issueFormVideo({
        assessment: await assessmentForPublicRequest(req),
        sectionId: req.params.sectionId,
        itemId: req.params.itemId,
        optionIndex: parseOptionIndex(req.params.optionIndex),
        audience: 'public',
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单视频授权失败')
    }
  },
  async authenticatedScaleVideo(req: Request, res: Response) {
    try {
      return await issueScaleVideo({
        assessment: await assessmentForAuthenticatedRequest(req),
        scaleAssessmentId: req.params.scaleAssessmentId,
        itemCode: req.params.itemCode,
        audience: 'authenticated',
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
  async publicScaleVideo(req: Request, res: Response) {
    try {
      return await issueScaleVideo({
        assessment: await assessmentForPublicRequest(req),
        scaleAssessmentId: req.params.scaleAssessmentId,
        itemCode: req.params.itemCode,
        audience: 'public',
        res,
      })
    } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
}

export default questionnaireVideoController
