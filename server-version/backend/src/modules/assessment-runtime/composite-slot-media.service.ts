import { createHash } from 'node:crypto'
import type { Response } from 'express'
import { prisma } from '../../config/database'
import type { AssetDatabase } from '../../services/assetStorage'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  AssessmentImageDeliveryError,
  serveAssessmentImageContent,
} from '../assessment-media/assessment-image-delivery'
import {
  AssessmentMediaCapabilityError,
  issueFrozenAssessmentVideoCapabilities,
  type AssessmentMediaCapabilityAudience,
  type AssessmentVideoCapabilitySourcesV1,
} from '../assessment-media/assessment-media-capability'
import type { CompositePublicationPlanV1 } from './composite-publication-plan'

function findSlot(plan: CompositePublicationPlanV1, slotKey: string) {
  const slot = plan.slots.find(candidate => candidate.slotKey === slotKey)
  if (!slot) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', `槽位不属于当前冻结发布：${slotKey}`, 404)
  }
  return slot
}

/** Unified slot-based image delivery for Scale / Form / SJT / Cognitive under a composite attempt.
 * Authorizes via parent attempt + frozen publicationHash + slotKey (zero child-table queries). */
export async function serveCompositeSlotImage(params: {
  plan: CompositePublicationPlanV1
  slotKey: string
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<Response | void> {
  const slot = findSlot(params.plan, params.slotKey)
  const reference = slot.imageAssets?.[params.assetId]
  if (!reference) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产不属于当前冻结槽位', 404)
  }
  try {
    return await serveAssessmentImageContent({
      reference,
      res: params.res,
      db: params.db ?? (prisma as unknown as AssetDatabase),
    })
  } catch (error) {
    if (error instanceof AssessmentImageDeliveryError) {
      throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产已失效或身份不匹配', 404)
    }
    throw error
  }
}

/** Unified slot-based video capability issuance for Scale / Form / SJT / Cognitive. */
export async function issueCompositeSlotVideoCapabilities(params: {
  plan: CompositePublicationPlanV1
  attemptId: string
  slotKey: string
  videoKey: string
  audience: AssessmentMediaCapabilityAudience
  db?: AssetDatabase
}): Promise<AssessmentVideoCapabilitySourcesV1> {
  const slot = findSlot(params.plan, params.slotKey)
  const entry = slot.videoPresentations?.[params.videoKey]
    ?? Object.values(slot.videoPresentations ?? {}).find(
      candidate => candidate.presentation.video.assetId === params.videoKey,
    )
  if (!entry) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视频资产不属于当前冻结槽位', 404)
  }
  const scopeDigest = createHash('sha256')
    .update(`${params.slotKey}:${params.videoKey}`, 'utf8')
    .digest('hex')
  try {
    return await issueFrozenAssessmentVideoCapabilities({
      scopeId: `COMPOSITE_SLOT:${params.attemptId}:${scopeDigest}`,
      audience: params.audience,
      presentation: entry.presentation,
      retentionOwner: entry.retentionOwner,
      db: params.db ?? (prisma as unknown as AssetDatabase),
    })
  } catch (error) {
    if (error instanceof AssessmentMediaCapabilityError) {
      throw new InstrumentFinalSubmitError(
        'INSTRUMENT_NOT_AVAILABLE',
        error.reason === 'NOT_FROZEN'
          ? '视频资产未被当前冻结发布保留'
          : '视频资产已失效或身份不匹配',
        409,
      )
    }
    throw error
  }
}
