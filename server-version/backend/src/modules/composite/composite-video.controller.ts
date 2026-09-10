import type { Request, Response } from 'express'
import { prisma } from '../../config/database'
import { isValidRecoveryToken, hashRecoveryToken } from '../../services/anonymousAccess'
import { error, notFound, success, unauthorized } from '../../utils/response'
import { issueFrozenAssessmentVideoCapabilities } from '../assessment-media/assessment-media-capability'
import { readStoredFormAdmission } from '../assessment-runtime/form-admission.service'
import { frozenFormMediaOwnerFromAdmission } from '../assessment-runtime/form-image.adapter'
import { frozenFormOptionVideoPresentation } from '../assessment-runtime/form-video.adapter'
import { decryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { frozenScaleMediaOwner } from '../scale/scale-image-retention'
import { scaleItemVideoPresentation } from '../scale/scale-video.adapter'
import * as service from './composite.service'

const recoveryHashFromRequest = (req: Request): string | null => {
  const value = req.headers['x-recovery-token']
  return isValidRecoveryToken(value) ? hashRecoveryToken(value) : null
}

const authorizedState = async (req: Request, publicMode: boolean) => {
  if (!publicMode) {
    if (!req.user) return null
    return service.getAttemptState(req.params.attemptId, { userId: req.user.userId })
  }
  const recoveryTokenHash = recoveryHashFromRequest(req)
  if (!recoveryTokenHash) return null
  return service.getAttemptState(req.params.attemptId, { recoveryTokenHash })
}

const parseOptionIndex = (value: string): number | null => {
  const optionIndex = Number(value)
  return Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : null
}

const issueFormVideo = async (req: Request, res: Response, publicMode: boolean) => {
  const state = await authorizedState(req, publicMode)
  if (!state) return unauthorized(res, publicMode ? '缺少有效恢复凭证' : '未登录')
  if (state.currentItem?.type !== 'FORM_SECTION' || state.currentItem.id !== req.params.sectionId) {
    return notFound(res, '当前冻结表单区段不存在')
  }
  const child = await prisma.compositeFormSectionAttempt.findUnique({
    where: { attemptId_sectionId: { attemptId: req.params.attemptId, sectionId: req.params.sectionId } },
    select: { frozenAdmissionSnapshotEncrypted: true, frozenAdmissionSnapshotHash: true },
  })
  if (!child) return notFound(res, '表单区段冻结记录不存在')
  const admission = readStoredFormAdmission(child)
  if (!admission) return notFound(res, '表单区段冻结内容不可用')
  const optionIndex = parseOptionIndex(req.params.optionIndex)
  if (optionIndex === null) return notFound(res, '表单选项不存在')
  const presentation = frozenFormOptionVideoPresentation(admission, req.params.itemId, optionIndex)
  if (!presentation) return notFound(res, '当前冻结选项没有视频内容')
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: `COMPOSITE:${req.params.attemptId}:FORM_SECTION:${req.params.sectionId}:ITEM:${req.params.itemId}:OPTION:${optionIndex}`,
    audience: publicMode ? 'public' : 'authenticated',
    presentation,
    retentionOwner: frozenFormMediaOwnerFromAdmission(admission),
    db: prisma,
  })
  return success(res, sources)
}

const issueScaleVideo = async (req: Request, res: Response, publicMode: boolean) => {
  const state = await authorizedState(req, publicMode)
  if (!state) return unauthorized(res, publicMode ? '缺少有效恢复凭证' : '未登录')
  if (state.currentItem?.type !== 'SCALE' || state.currentItem.id !== req.params.itemId || !state.currentItem.scaleAssessmentId) {
    return notFound(res, '当前冻结量表单元不存在')
  }
  const child = await prisma.assessment.findFirst({
    where: {
      id: state.currentItem.scaleAssessmentId,
      compositeAttemptId: req.params.attemptId,
      compositeItemId: req.params.itemId,
    },
    select: { id: true, runtimeSnapshotEncrypted: true },
  })
  if (!child?.runtimeSnapshotEncrypted) return notFound(res, '量表冻结内容不可用')
  const snapshot = decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted)
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
  async publicScaleVideo(req: Request, res: Response) {
    try { return await issueScaleVideo(req, res, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表视频授权失败')
    }
  },
}

export default compositeVideoController
