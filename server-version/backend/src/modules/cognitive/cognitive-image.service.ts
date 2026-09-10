import type { Response } from 'express'
import { prisma } from '../../config/database'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  findFrozenAssessmentAssetReference,
} from '../assessment-media/assessment-asset'
import {
  AssessmentImageDeliveryError,
  serveAssessmentImageContent,
} from '../assessment-media/assessment-image-delivery'
import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/assessment-image'
import { decryptCognitivePayload } from './cognitive.security'
import { FORBIDDEN, NOT_FOUND } from './cognitive.errors'
import { parseSessionConfigSnapshot } from './v2/session-snapshot'
import { cognitivePresentationAssetReferences } from './v2/presentation'
import type { SessionConfigSnapshot } from './v2/types'

export const findFrozenCognitiveImageReference = (
  snapshot: SessionConfigSnapshot,
  assetId: string,
): AssessmentStaticImageAssetIdentityV1 | undefined => findFrozenAssessmentAssetReference(
  cognitivePresentationAssetReferences(snapshot.presentation),
  assetId,
) as AssessmentStaticImageAssetIdentityV1 | undefined

const snapshotFromEncrypted = (encrypted: string): SessionConfigSnapshot => {
  try {
    return parseSessionConfigSnapshot(decryptCognitivePayload<unknown>(encrypted))
  } catch {
    throw NOT_FOUND('Cognitive frozen presentation is unavailable')
  }
}

export const serveFrozenCognitiveImage = async (params: {
  snapshot: SessionConfigSnapshot
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<Response | void> => {
  const reference = findFrozenCognitiveImageReference(params.snapshot, params.assetId)
  if (!reference) throw NOT_FOUND('Image does not belong to this frozen Cognitive session')
  try {
    return await serveAssessmentImageContent({
      reference,
      res: params.res,
      db: params.db || prisma,
    })
  } catch (error) {
    if (error instanceof AssessmentImageDeliveryError) {
      throw NOT_FOUND('Cognitive image is unavailable or its immutable identity no longer matches')
    }
    throw error
  }
}

export const serveCognitiveSessionImage = async (params: {
  userId: string
  sessionId: string
  assetId: string
  res: Response
}): Promise<Response | void> => {
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: params.sessionId },
    select: { userId: true, configSnapshotEncrypted: true },
  })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== params.userId) throw FORBIDDEN('Not the owner of this Cognitive session')
  return serveFrozenCognitiveImage({
    snapshot: snapshotFromEncrypted(session.configSnapshotEncrypted),
    assetId: params.assetId,
    res: params.res,
  })
}

export const servePublicCognitiveSessionImage = async (params: {
  recoveryToken: string
  sessionId: string
  assetId: string
  res: Response
}): Promise<Response | void> => {
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
  return serveFrozenCognitiveImage({
    snapshot: snapshotFromEncrypted(session.configSnapshotEncrypted),
    assetId: params.assetId,
    res: params.res,
  })
}
