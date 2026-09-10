import type { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { isValidRecoveryToken, hashRecoveryToken } from '../../services/anonymousAccess'
import { error, forbidden, notFound, success, unauthorized } from '../../utils/response'
import { mapCompositeSection, compositeFormSectionDefinitionHash } from '../assessment-runtime/form-section-definition'
import { readStoredFormAdmission } from '../assessment-runtime/form-admission.service'
import {
  compositeFormSectionImageReferences,
  publishedFormMediaOwner,
  retainFormSectionImages,
  serveFrozenFormSectionImage,
} from '../assessment-runtime/form-image.adapter'
import { decryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import {
  frozenScaleMediaOwner,
  retainScaleAssessmentImages,
  serveFrozenScaleAssessmentImage,
} from '../scale/scale-image.adapter'
import * as service from './composite.service'

const recoveryHashFromRequest = (req: Request): string | null => {
  const value = req.headers['x-recovery-token']
  return isValidRecoveryToken(value) ? hashRecoveryToken(value) : null
}

const cleanPublishedOwners = async (ownerIds: string[]): Promise<void> => {
  if (!ownerIds.length) return
  await prisma.assetReference.deleteMany({
    where: {
      entityType: 'AssessmentPublishedDefinition',
      entityId: { in: ownerIds },
      field: 'media',
    },
  })
}

const publishWithFormMedia = async (req: Request, res: Response) => {
  if (!req.user) return unauthorized(res)
  const { userId, role } = req.user
  const composite = await prisma.compositeAssessment.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      createdBy: true,
      status: true,
      formSections: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
      },
    },
  })
  if (!composite) return notFound(res, '综合测评不存在')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || composite.createdBy !== userId)) {
    return forbidden(res, '无权限发布此综合测评')
  }
  if (composite.status !== 'DRAFT') return error(res, '只有草稿状态的综合测评可以发布')

  const ownerIds: string[] = []
  try {
    for (const row of composite.formSections) {
      const definition = mapCompositeSection(row)
      const hash = compositeFormSectionDefinitionHash(definition)
      const owner = publishedFormMediaOwner('COMPOSITE', composite.id, hash)
      ownerIds.push(owner.entityId)
      await retainFormSectionImages({
        owner,
        references: compositeFormSectionImageReferences(definition),
      })
    }
    const published = await service.publishComposite(userId, role, composite.id)
    return success(res, published, '综合测评发布成功')
  } catch (cause) {
    await cleanPublishedOwners(ownerIds).catch(() => undefined)
    throw cause
  }
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

const serveScaleImage = async (req: Request, res: Response, publicMode: boolean) => {
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
  await retainScaleAssessmentImages({ owner: frozenScaleMediaOwner(child.id), definition: snapshot.definition })
  await serveFrozenScaleAssessmentImage({ snapshot, assetId: req.params.assetId, res })
  return undefined
}

const serveFormImage = async (req: Request, res: Response, publicMode: boolean) => {
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
  await serveFrozenFormSectionImage({
    admission,
    assetId: req.params.assetId,
    res,
  })
  return undefined
}

export const compositeImageController = {
  async publish(req: Request, res: Response) {
    try { return await publishWithFormMedia(req, res) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '综合测评发布失败')
    }
  },
  async authenticatedScaleImage(req: Request, res: Response) {
    try { return await serveScaleImage(req, res, false) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表图片加载失败')
    }
  },
  async publicScaleImage(req: Request, res: Response) {
    try { return await serveScaleImage(req, res, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '量表图片加载失败')
    }
  },
  async authenticatedFormImage(req: Request, res: Response) {
    try { return await serveFormImage(req, res, false) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单图片加载失败')
    }
  },
  async publicFormImage(req: Request, res: Response) {
    try { return await serveFormImage(req, res, true) } catch (cause) {
      return error(res, cause instanceof Error ? cause.message : '表单图片加载失败')
    }
  },
}

export default compositeImageController
