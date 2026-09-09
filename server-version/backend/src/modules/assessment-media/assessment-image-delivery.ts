import { Readable } from 'node:stream'
import type { Response } from 'express'
import { prisma } from '../../config/database'
import { assessmentAssetSelect } from './assessment-asset'
import {
  assessmentStaticImageAssetIdentitySchema,
  type AssessmentStaticImageAssetIdentityV1,
} from './assessment-image'
import {
  serveStoredAssetContent,
  type AssetDatabase,
  type StoredAssetContent,
} from '../../services/assetStorage'
import { getCOSSignedUrl } from '../../utils/cos'

type StoredAssetRecord = Pick<StoredAssetContent, 'id' | 'objectKey' | 'provider' | 'mimeType' | 'sizeBytes' | 'sha256' | 'deletedAt'>

export class AssessmentImageDeliveryError extends Error {
  readonly reason: 'UNAVAILABLE' | 'IDENTITY_MISMATCH'

  constructor(reason: 'UNAVAILABLE' | 'IDENTITY_MISMATCH', message: string) {
    super(message)
    this.name = 'AssessmentImageDeliveryError'
    this.reason = reason
  }
}

const proxyCosImage = async (asset: StoredAssetRecord, res: Response): Promise<Response | void> => {
  let upstream: globalThis.Response
  try {
    const signedUrl = await getCOSSignedUrl(asset.objectKey)
    upstream = await fetch(signedUrl)
  } catch {
    throw new AssessmentImageDeliveryError('UNAVAILABLE', 'Assessment image is temporarily unavailable')
  }
  if (!upstream.ok || !upstream.body) {
    throw new AssessmentImageDeliveryError('UNAVAILABLE', 'Assessment image is temporarily unavailable')
  }

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', asset.mimeType)
  res.setHeader('Content-Length', String(asset.sizeBytes))
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.id)}"`)
  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
  stream.on('error', () => res.destroy())
  return stream.pipe(res)
}

export const serveAssessmentImageContent = async (params: {
  reference: AssessmentStaticImageAssetIdentityV1
  res: Response
  db?: AssetDatabase
}): Promise<Response | void> => {
  const reference = assessmentStaticImageAssetIdentitySchema.parse(params.reference)
  const db = params.db || prisma
  const asset = await db.storedAsset.findUnique({
    where: { id: reference.assetId },
    select: assessmentAssetSelect,
  })
  if (
    !asset
    || asset.deletedAt
    || asset.sizeBytes <= 0
    || !asset.objectKey
    || !['local', 'cos'].includes(asset.provider)
  ) {
    throw new AssessmentImageDeliveryError('UNAVAILABLE', 'Assessment image is unavailable')
  }
  if (asset.sha256 !== reference.contentHash || asset.mimeType !== reference.mimeType) {
    throw new AssessmentImageDeliveryError('IDENTITY_MISMATCH', 'Assessment image identity no longer matches StoredAsset')
  }
  if (asset.provider === 'cos') return proxyCosImage(asset, params.res)
  return serveStoredAssetContent(asset, params.res)
}

export const assessmentImageInternals = { proxyCosImage }
