import { prisma } from '../../config/database'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  AssessmentAssetValidationError,
} from '../assessment-media/assessment-asset'
import {
  AssessmentMediaCapabilityError,
  issueFrozenAssessmentVideoCapabilities,
  type AssessmentMediaCapabilityAudience,
  type AssessmentVideoCapabilitySourcesV1,
} from '../assessment-media/assessment-media-capability'
import type { AssessmentVideoPresentationV1 } from '../assessment-media/assessment-video'
import { decryptCognitivePayload } from './cognitive.security'
import { FORBIDDEN, NOT_FOUND } from './cognitive.errors'
import { cognitiveVideoPresentationEntries } from './v2/presentation'
import { parseSessionConfigSnapshot } from './v2/session-snapshot'
import type { SessionConfigSnapshot } from './v2/types'

const snapshotFromEncrypted = (encrypted: string): SessionConfigSnapshot => {
  try {
    return parseSessionConfigSnapshot(decryptCognitivePayload<unknown>(encrypted))
  } catch {
    throw NOT_FOUND('Cognitive frozen presentation is unavailable')
  }
}

export const findFrozenCognitiveVideoPresentation = (
  snapshot: SessionConfigSnapshot,
  videoKey: string,
): AssessmentVideoPresentationV1 | undefined => cognitiveVideoPresentationEntries(snapshot.presentation)
  .find((entry) => entry.key === videoKey)?.presentation

export const issueFrozenCognitiveVideoCapabilities = async (params: {
  snapshot: SessionConfigSnapshot
  sessionId: string
  videoKey: string
  audience: AssessmentMediaCapabilityAudience
  db?: AssetDatabase
}): Promise<AssessmentVideoCapabilitySourcesV1> => {
  const presentation = findFrozenCognitiveVideoPresentation(params.snapshot, params.videoKey)
  if (!presentation) throw NOT_FOUND('Video does not belong to this frozen Cognitive session')
  const compiledRuntimeHash = params.snapshot.compiledRuntime?.compiledRuntimeHash
  if (params.snapshot.runtimeGeneration !== 'UNIFIED_V1' || !compiledRuntimeHash) {
    throw NOT_FOUND('Cognitive video requires a unified frozen runtime')
  }

  try {
    return await issueFrozenAssessmentVideoCapabilities({
      scopeId: `cognitive-session:${params.sessionId}:${params.videoKey}`,
      audience: params.audience,
      presentation,
      retentionOwner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: `COGNITIVE:${compiledRuntimeHash}`,
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      db: params.db ?? (prisma as unknown as AssetDatabase),
    })
  } catch (reason) {
    if (reason instanceof AssessmentMediaCapabilityError || reason instanceof AssessmentAssetValidationError) {
      throw NOT_FOUND('Cognitive video is unavailable or its frozen identity no longer matches')
    }
    throw reason
  }
}

export const issueCognitiveSessionVideoCapabilities = async (params: {
  userId: string
  sessionId: string
  videoKey: string
}): Promise<AssessmentVideoCapabilitySourcesV1> => {
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: params.sessionId },
    select: { userId: true, configSnapshotEncrypted: true },
  })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== params.userId) throw FORBIDDEN('Not the owner of this Cognitive session')
  return issueFrozenCognitiveVideoCapabilities({
    snapshot: snapshotFromEncrypted(session.configSnapshotEncrypted),
    sessionId: params.sessionId,
    videoKey: params.videoKey,
    audience: 'authenticated',
  })
}

export const issuePublicCognitiveSessionVideoCapabilities = async (params: {
  recoveryToken: string
  sessionId: string
  videoKey: string
}): Promise<AssessmentVideoCapabilitySourcesV1> => {
  const recoveryTokenHash = hashRecoveryToken(params.recoveryToken)
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: params.sessionId },
    select: {
      userId: true,
      recoveryTokenHash: true,
      configSnapshotEncrypted: true,
      compositeAttempt: { select: { recoveryTokenHash: true } },
    },
  })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  const allowed = session.userId === null && (
    session.recoveryTokenHash === recoveryTokenHash
    || session.compositeAttempt?.recoveryTokenHash === recoveryTokenHash
  )
  if (!allowed) throw FORBIDDEN('Recovery credential does not own this Cognitive session')
  return issueFrozenCognitiveVideoCapabilities({
    snapshot: snapshotFromEncrypted(session.configSnapshotEncrypted),
    sessionId: params.sessionId,
    videoKey: params.videoKey,
    audience: 'public',
  })
}
