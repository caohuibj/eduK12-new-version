import { streamResponse } from '../../utils/streamResponse'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { Readable } from 'node:stream'
import type { Request, Response } from 'express'
import { prisma } from '../../config/database'
import { getCOSSignedUrl } from '../../utils/cos'
import { getLocalAssetPath, type AssetDatabase, type StoredAssetContent } from '../../services/assetStorage'
import { assessmentAssetSelect } from './assessment-asset'
import {
  AssessmentMediaCapabilityError,
  verifyAssessmentMediaCapability,
  type AssessmentMediaCapabilityPayloadV1,
} from './assessment-media-capability'

type StoredAssetRecord = Pick<StoredAssetContent, 'id' | 'objectKey' | 'provider' | 'mimeType' | 'sizeBytes' | 'sha256' | 'deletedAt'>

export class AssessmentMediaDeliveryError extends Error {
  readonly reason: 'UNAVAILABLE' | 'IDENTITY_MISMATCH'

  constructor(reason: 'UNAVAILABLE' | 'IDENTITY_MISMATCH', message: string) {
    super(message)
    this.name = 'AssessmentMediaDeliveryError'
    this.reason = reason
  }
}

export class AssessmentVideoRangeError extends Error {
  constructor(message = 'Requested byte range is not satisfiable') {
    super(message)
    this.name = 'AssessmentVideoRangeError'
  }
}

export interface AssessmentByteRange {
  start: number
  end: number
}

export const parseAssessmentSingleByteRange = (
  rangeHeader: string | undefined,
  sizeBytes: number,
): AssessmentByteRange | null => {
  if (!rangeHeader) return null
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new AssessmentVideoRangeError()
  if (!rangeHeader.startsWith('bytes=') || rangeHeader.includes(',')) throw new AssessmentVideoRangeError()

  const value = rangeHeader.slice('bytes='.length).trim()
  const match = /^(\d*)-(\d*)$/u.exec(value)
  if (!match || (!match[1] && !match[2])) throw new AssessmentVideoRangeError()

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new AssessmentVideoRangeError()
    return { start: Math.max(0, sizeBytes - suffixLength), end: sizeBytes - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : sizeBytes - 1
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= sizeBytes
    || requestedEnd < start
  ) throw new AssessmentVideoRangeError()

  return { start, end: Math.min(requestedEnd, sizeBytes - 1) }
}

const findCapabilityAsset = async (
  capability: AssessmentMediaCapabilityPayloadV1,
  db: AssetDatabase,
): Promise<StoredAssetRecord> => {
  const asset = await db.storedAsset.findUnique({
    where: { id: capability.asset.assetId },
    select: assessmentAssetSelect,
  }) as StoredAssetRecord | null
  if (
    !asset
    || asset.deletedAt
    || asset.sizeBytes <= 0
    || !asset.objectKey
    || !['local', 'cos'].includes(asset.provider)
  ) {
    throw new AssessmentMediaDeliveryError('UNAVAILABLE', 'Assessment media is unavailable')
  }
  if (asset.sha256 !== capability.asset.contentHash || asset.mimeType !== capability.asset.mimeType) {
    throw new AssessmentMediaDeliveryError('IDENTITY_MISMATCH', 'Assessment media identity no longer matches StoredAsset')
  }
  return asset
}

const mediaContentType = (capability: AssessmentMediaCapabilityPayloadV1): string => (
  capability.kind === 'caption' ? 'text/vtt; charset=utf-8' : capability.asset.mimeType
)

const applyDeliveryHeaders = (
  res: Response,
  capability: AssessmentMediaCapabilityPayloadV1,
  contentLength: number,
  range: AssessmentByteRange | null,
  sizeBytes: number,
) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Type', mediaContentType(capability))
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(capability.asset.assetId)}"`)
  res.setHeader('Content-Length', String(contentLength))
  if (capability.kind === 'video') {
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Vary', 'Range')
    if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${sizeBytes}`)
  }
}

const respondRangeNotSatisfiable = (res: Response, sizeBytes: number): Response => {
  res.status(416)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Range', `bytes */${sizeBytes}`)
  res.setHeader('Content-Length', '0')
  res.setHeader('Cache-Control', 'private, no-store')
  return res.end()
}

const proxyCosContent = async (params: {
  asset: StoredAssetRecord
  capability: AssessmentMediaCapabilityPayloadV1
  range: AssessmentByteRange | null
  req: Request
  res: Response
}): Promise<Response | void> => {
  const { asset, capability, range, req, res } = params
  if (req.method === 'HEAD') {
    const length = range ? range.end - range.start + 1 : asset.sizeBytes
    applyDeliveryHeaders(res, capability, length, range, asset.sizeBytes)
    return res.status(range ? 206 : 200).end()
  }

  let upstream: globalThis.Response
  try {
    const signedUrl = await getCOSSignedUrl(asset.objectKey)
    upstream = await fetch(signedUrl, {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
    })
  } catch {
    throw new AssessmentMediaDeliveryError('UNAVAILABLE', 'Assessment media is temporarily unavailable')
  }

  const expectedStatus = range ? 206 : 200
  if (upstream.status !== expectedStatus || !upstream.body) {
    throw new AssessmentMediaDeliveryError('UNAVAILABLE', 'Assessment media is temporarily unavailable')
  }
  const length = range ? range.end - range.start + 1 : asset.sizeBytes
  applyDeliveryHeaders(res, capability, length, range, asset.sizeBytes)
  res.status(expectedStatus)
  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
  return streamResponse(stream, res)
}

const serveLocalContent = async (params: {
  asset: StoredAssetRecord
  capability: AssessmentMediaCapabilityPayloadV1
  range: AssessmentByteRange | null
  req: Request
  res: Response
}): Promise<Response | void> => {
  const { asset, capability, range, req, res } = params
  const localPath = getLocalAssetPath(asset.objectKey)
  let stat: Awaited<ReturnType<typeof fsPromises.stat>>
  try {
    stat = await fsPromises.stat(localPath)
  } catch {
    throw new AssessmentMediaDeliveryError('UNAVAILABLE', 'Assessment media is unavailable')
  }
  if (!stat.isFile() || stat.size !== asset.sizeBytes) {
    throw new AssessmentMediaDeliveryError('UNAVAILABLE', 'Assessment media is unavailable')
  }

  const length = range ? range.end - range.start + 1 : asset.sizeBytes
  applyDeliveryHeaders(res, capability, length, range, asset.sizeBytes)
  const status = range ? 206 : 200
  res.status(status)
  if (req.method === 'HEAD') return res.end()

  const stream = range
    ? fs.createReadStream(localPath, { start: range.start, end: range.end })
    : fs.createReadStream(localPath)
  return streamResponse(stream, res)
}

export const serveAssessmentMediaCapabilityContent = async (params: {
  token: string
  req: Request
  res: Response
  db?: AssetDatabase
}): Promise<Response | void> => {
  const capability = verifyAssessmentMediaCapability(params.token)
  const db = params.db || prisma
  const asset = await findCapabilityAsset(capability, db)

  let range: AssessmentByteRange | null = null
  if (capability.kind === 'video') {
    try {
      range = parseAssessmentSingleByteRange(params.req.header('Range'), asset.sizeBytes)
    } catch (error) {
      if (error instanceof AssessmentVideoRangeError) return respondRangeNotSatisfiable(params.res, asset.sizeBytes)
      throw error
    }
  } else if (params.req.header('Range')) {
    return respondRangeNotSatisfiable(params.res, asset.sizeBytes)
  }

  if (asset.provider === 'cos') {
    return proxyCosContent({ asset, capability, range, req: params.req, res: params.res })
  }
  return serveLocalContent({ asset, capability, range, req: params.req, res: params.res })
}

export const assessmentVideoDeliveryInternals = {
  applyDeliveryHeaders,
  findCapabilityAsset,
  proxyCosContent,
  respondRangeNotSatisfiable,
  serveLocalContent,
}

export { AssessmentMediaCapabilityError }
