import type { Request, Response } from 'express'
import { prisma } from '../../config/database'
import { isValidRecoveryToken, hashRecoveryToken } from '../../services/anonymousAccess'
import { error, notFound, success, unauthorized } from '../../utils/response'
import { issueFrozenAssessmentVideoCapabilities } from '../assessment-media/assessment-media-capability'
import { loadStoredFormAdmission } from '../assessment-runtime/form-admission.service'
import { frozenFormMediaOwnerFromAdmission } from '../assessment-runtime/form-image.adapter'
import { compositeFormSectionDefinitionHash } from '../assessment-runtime/form-section-definition'
import { compositeFormOptionVideoPresentation, frozenFormOptionVideoPresentation, publishedCompositeFormVideoOwner } from '../assessment-runtime/form-video.adapter'
import { loadFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { frozenScaleMediaOwner } from '../scale/scale-image-retention'
import { scaleItemVideoPresentation } from '../scale/scale-video.adapter'
import * as service from './composite.service'
import { isEducationWholeMediaUnit, loadEducationWholeFormMediaDefinition } from './education-whole-media'

const recoveryHashFromRequest = (req: Request): string | null => {
  const value = req.headers['x-recovery-token']
  return isValidRecoveryToken(value) ? hashRecoveryToken(value) : null
}

const authorizedState = async (req: Request, publicMode: boolean) => {
  const requestedUnit = req.params.sectionId
    ? { sectionId: req.params.sectionId }
    : { itemId: req.params.itemId }
  if (!publicMode) {
    if (!req.user) return null
    return service.getAttemptState(req.params.attemptId, { userId: req.user.userId }, requestedUnit)
  }
  const recoveryTokenHash = recoveryHashFromRequest(req)
  if (!recoveryTokenHash) return null
  return service.getAttemptState(req.params.attemptId, { recoveryTokenHash }, requestedUnit)
}

const parseOptionIndex = (value: string): number | null => {
  const optionIndex = Number(value)
  return Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : null
}

const issueFormVideo = async (req: Request, res: Response, publicMode: boolean, educationWhole = false) => {
  const state = await authorizedState(req, publicMode)
  if (!state) return unauthorized(res, publicMode ? '缺少有效恢复凭证' : '未登录')
  const currentUnit = state.currentItem?.type === 'FORM_SECTION' && state.currentItem.id === req.params.sectionId
  const wholeUnit = educationWhole && isEducationWholeMediaUnit(state, 'FORM_SECTION', req.params.sectionId)
  if (!currentUnit && !wholeUnit) return notFound(res, '当前冻结表单区段不存在')
  const optionIndex = parseOptionIndex(req.params.optionIndex)
  if (optionIndex === null) return notFound(res, '表单选项不存在')
  const child = await prisma.compositeFormSectionAttempt.findUnique({
    where: { attemptId_sectionId: { attemptId: req.params.attemptId, sectionId: req.params.sectionId } },
    select: { frozenAdmissionSnapshotEncrypted: true, frozenAdmissionSnapshotHash: true },
  })
  const admission = child ? await loadStoredFormAdmission(child) : null
  let presentation
  let retentionOwner
  if (admission) {
    presentation = frozenFormOptionVideoPresentation(admission, req.params.itemId, optionIndex)
    retentionOwner = frozenFormMediaOwnerFromAdmission(admission)
  } else if (wholeUnit) {
    const definition = await loadEducationWholeFormMediaDefinition(state, req.params.sectionId)
    if (!definition) return notFound(res, '表单区段冻结定义不匹配')
    presentation = compositeFormOptionVideoPresentation(definition, req.params.itemId, optionIndex)
    retentionOwner = publishedCompositeFormVideoOwner(state.assessmentId, compositeFormSectionDefinitionHash(definition))
  } else {
    return notFound(res, '表单区段冻结内容不可用')
  }
  if (!presentation) return notFound(res, '当前冻结选项没有视频内容')
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: `COMPOSITE:${req.params.attemptId}:FORM_SECTION:${req.params.sectionId}:ITEM:${req.params.itemId}:OPTION:${optionIndex}`,
    audience: publicMode ? 'public' : 'authenticated',
    presentation,
    retentionOwner,
    db: prisma,
  })
  return success(res, sources)
}

const issueScaleVideo = async (req: Request, res: Response, publicMode: boolean, educationWhole = false) => {
  const state = await authorizedState(req, publicMode)
  if (!state) return unauthorized(res, publicMode ? '缺少有效恢复凭证' : '未登录')
  const currentChildId = state.currentItem?.type === 'SCALE' && state.currentItem.id === req.params.itemId
    ? state.currentItem.scaleAssessmentId : undefined
  const wholeUnit = educationWhole && isEducationWholeMediaUnit(state, 'SCALE', req.params.itemId)
  if (!currentChildId && !wholeUnit) return notFound(res, '当前冻结量表单元不存在')
  const child = await prisma.assessment.findFirst({
    where: {
      ...(currentChildId ? { id: currentChildId } : { attemptEpoch: state.attemptEpoch, runtimeGeneration: 'UNIFIED_V1' }),
      compositeAttemptId: req.params.attemptId,
      compositeItemId: req.params.itemId,
    },
    select: { id: true, runtimeSnapshotEncrypted: true },
  })
  if (!child?.runtimeSnapshotEncrypted) return notFound(res, '量表冻结内容不可用')
  const snapshot = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted)
  const presentation = scaleItemVideoPresentation(snapshot.definition, req.params.itemCode)
  if (!presentation) return notFound(res, '当前冻结量表题目没有视频内容')
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: `COMPOSITE:${req.params.attemptId}:SCALE:${child.id}:ITEM:${req.params.itemCode}`,
    audience: publicMode ? 'public' : 'authenticated',
    presentation,
    retentionOwner: frozenScaleMediaOwner(child.id),
    db: prisma,
  })
  return success(res, sources)
}

export const compositeVideoController = {
  async authenticatedFormVideo(req: Request, res: Response) {
    try { return await issueFormVideo(req, res, false) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单视频授权失败')
    }
  },
  async educationFormVideo(req: Request, res: Response) {
    try { return await issueFormVideo(req, res, false, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单视频授权失败')
    }
  },
  async publicFormVideo(req: Request, res: Response) {
    try { return await issueFormVideo(req, res, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单视频授权失败')
    }
  },
  async authenticatedScaleVideo(req: Request, res: Response) {
    try { return await issueScaleVideo(req, res, false) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
  async educationScaleVideo(req: Request, res: Response) {
    try { return await issueScaleVideo(req, res, false, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
  async publicScaleVideo(req: Request, res: Response) {
    try { return await issueScaleVideo(req, res, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
}

export default compositeVideoController
