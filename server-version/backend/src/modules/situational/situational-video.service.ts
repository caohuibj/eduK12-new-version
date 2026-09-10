import { createHash } from 'node:crypto'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
} from '../assessment-media/assessment-asset'
import {
  AssessmentMediaCapabilityError,
  issueFrozenAssessmentVideoCapabilities,
  type AssessmentMediaCapabilityAudience,
  type AssessmentVideoCapabilitySourcesV1,
} from '../assessment-media/assessment-media-capability'
import type { FrozenSituationalRuntimeSnapshotV1 } from '../assessment-runtime/situational-runtime-snapshot'
import type { AssessmentVideoPresentationV1 } from '../assessment-media/assessment-video'

const sceneScope = (attemptId: string, sceneKey: string): string => (
  `SITUATIONAL:${attemptId}:${createHash('sha256').update(sceneKey, 'utf8').digest('hex')}`
)

export const frozenSituationalVideoPresentation = (
  snapshot: FrozenSituationalRuntimeSnapshotV1,
  sceneKey: string,
): AssessmentVideoPresentationV1 => {
  const scene = snapshot.definition.scenes.find((candidate) => candidate.sceneKey === sceneKey)
  if (!scene) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视频情境不属于当前冻结题面', 404)
  }
  if (scene.stimulus.type !== 'VIDEO') {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '当前情境不是视频题面', 404)
  }
  return scene.stimulus.presentation
}

/**
 * Authorization is completed by the caller before this boundary. This service
 * only accepts presentation copied from the authoritative frozen snapshot and
 * delegates immutable catalog/retention verification to MEDIA-4.
 */
export const issueFrozenSituationalVideoCapabilities = async (params: {
  snapshot: FrozenSituationalRuntimeSnapshotV1
  attemptId: string
  sceneKey: string
  audience: AssessmentMediaCapabilityAudience
  db?: AssetDatabase
}): Promise<AssessmentVideoCapabilitySourcesV1> => {
  const presentation = frozenSituationalVideoPresentation(params.snapshot, params.sceneKey)
  try {
    return await issueFrozenAssessmentVideoCapabilities({
      scopeId: sceneScope(params.attemptId, params.sceneKey),
      audience: params.audience,
      presentation,
      retentionOwner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: `SITUATIONAL:${params.attemptId}`,
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      db: params.db || prisma,
    })
  } catch (error) {
    if (error instanceof AssessmentMediaCapabilityError) {
      throw new InstrumentFinalSubmitError(
        'INSTRUMENT_NOT_AVAILABLE',
        error.reason === 'NOT_FROZEN'
          ? '视频题面未被当前冻结运行时保留'
          : '视频题面资产已失效或身份不匹配',
        409,
      )
    }
    throw error
  }
}

export const situationalVideoInternals = { sceneScope }
