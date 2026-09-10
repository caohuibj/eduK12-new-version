import crypto from 'node:crypto'
import { z } from 'zod'
import { config } from '../../config'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  assertAssessmentAssetReferencesReady,
  type AssessmentAssetRetentionOwner,
} from './assessment-asset'
import { assessmentAssetIdentitySchema, type AssessmentAssetIdentityV1 } from './assessment-asset-identity'
import { assessmentStaticImageAssetIdentitySchema } from './assessment-image'
import {
  assessmentVideoAssetIdentitySchema,
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
  assessmentVttAssetIdentitySchema,
  type AssessmentVideoPresentationV1,
} from './assessment-video'

export const ASSESSMENT_MEDIA_CAPABILITY_TTL_SECONDS = 10 * 60

export const assessmentMediaCapabilityKindSchema = z.enum(['video', 'poster', 'caption'])
export const assessmentMediaCapabilityAudienceSchema = z.enum(['authenticated', 'public'])

export const assessmentMediaCapabilityPayloadSchema = z.object({
  version: z.literal(1),
  scopeId: z.string().min(1).max(300),
  audience: assessmentMediaCapabilityAudienceSchema,
  kind: assessmentMediaCapabilityKindSchema,
  asset: assessmentAssetIdentitySchema,
  expiresAt: z.number().int().positive(),
}).strict()

export type AssessmentMediaCapabilityPayloadV1 = z.infer<typeof assessmentMediaCapabilityPayloadSchema>
export type AssessmentMediaCapabilityKind = z.infer<typeof assessmentMediaCapabilityKindSchema>
export type AssessmentMediaCapabilityAudience = z.infer<typeof assessmentMediaCapabilityAudienceSchema>

export interface AssessmentVideoCapabilitySourcesV1 {
  videoUrl: string
  posterUrl?: string
  captions: Array<{
    assetId: string
    src: string
    kind: 'captions' | 'subtitles'
    srcLang: string
    label: string
    default?: boolean
  }>
  expiresAt: number
}

export class AssessmentMediaCapabilityError extends Error {
  readonly reason: 'INVALID' | 'EXPIRED' | 'NOT_FROZEN'

  constructor(reason: 'INVALID' | 'EXPIRED' | 'NOT_FROZEN', message: string) {
    super(message)
    this.name = 'AssessmentMediaCapabilityError'
    this.reason = reason
  }
}

const capabilitySecret = crypto
  .createHmac('sha256', config.assetSigningSecret)
  .update('assessment-media-capability-v1')
  .digest()

const assertKindMatchesAsset = (kind: AssessmentMediaCapabilityKind, asset: AssessmentAssetIdentityV1) => {
  if (kind === 'video') return assessmentVideoAssetIdentitySchema.parse(asset)
  if (kind === 'poster') return assessmentStaticImageAssetIdentitySchema.parse(asset)
  return assessmentVttAssetIdentitySchema.parse(asset)
}

const signatureFor = (encodedPayload: string): string => crypto
  .createHmac('sha256', capabilitySecret)
  .update(encodedPayload)
  .digest('base64url')

const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const createAssessmentMediaCapability = (params: {
  scopeId: string
  audience: AssessmentMediaCapabilityAudience
  kind: AssessmentMediaCapabilityKind
  asset: AssessmentAssetIdentityV1
  ttlSeconds?: number
  nowSeconds?: number
}): { token: string; url: string; expiresAt: number } => {
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  const ttlSeconds = params.ttlSeconds ?? ASSESSMENT_MEDIA_CAPABILITY_TTL_SECONDS
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 60 * 60) {
    throw new AssessmentMediaCapabilityError('INVALID', 'Assessment media capability TTL is invalid')
  }

  const asset = assertKindMatchesAsset(params.kind, params.asset)
  const payload = assessmentMediaCapabilityPayloadSchema.parse({
    version: 1,
    scopeId: params.scopeId,
    audience: params.audience,
    kind: params.kind,
    asset,
    expiresAt: nowSeconds + ttlSeconds,
  })
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const token = `${encodedPayload}.${signatureFor(encodedPayload)}`
  return {
    token,
    url: `/api/assets/assessment-media/content?cap=${encodeURIComponent(token)}`,
    expiresAt: payload.expiresAt,
  }
}

export const verifyAssessmentMediaCapability = (
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AssessmentMediaCapabilityPayloadV1 => {
  if (!token || token.length > 8_192) {
    throw new AssessmentMediaCapabilityError('INVALID', 'Assessment media capability is invalid')
  }
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1] || !safeEqual(parts[1], signatureFor(parts[0]))) {
    throw new AssessmentMediaCapabilityError('INVALID', 'Assessment media capability is invalid')
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    throw new AssessmentMediaCapabilityError('INVALID', 'Assessment media capability is invalid')
  }

  const parsed = assessmentMediaCapabilityPayloadSchema.safeParse(decoded)
  if (!parsed.success) {
    throw new AssessmentMediaCapabilityError('INVALID', 'Assessment media capability is invalid')
  }
  assertKindMatchesAsset(parsed.data.kind, parsed.data.asset)
  if (parsed.data.expiresAt <= nowSeconds) {
    throw new AssessmentMediaCapabilityError('EXPIRED', 'Assessment media capability has expired')
  }
  return parsed.data
}

const assertPresentationIsRetained = async (params: {
  presentation: AssessmentVideoPresentationV1
  retentionOwner: AssessmentAssetRetentionOwner
  db: AssetDatabase
}): Promise<AssessmentVideoPresentationV1> => {
  const presentation = assessmentVideoPresentationSchema.parse(params.presentation)
  const references = assessmentVideoPresentationAssetReferences(presentation)
  await assertAssessmentAssetReferencesReady(references, params.db)
  const assetIds = [...new Set(references.map((reference) => reference.assetId))]
  const retained = await params.db.assetReference.findMany({
    where: {
      entityType: params.retentionOwner.entityType,
      entityId: params.retentionOwner.entityId,
      field: params.retentionOwner.field,
      assetId: { in: assetIds },
    },
    select: { assetId: true },
  })
  const retainedIds = new Set(retained.map((reference) => reference.assetId))
  if (assetIds.some((assetId) => !retainedIds.has(assetId))) {
    throw new AssessmentMediaCapabilityError('NOT_FROZEN', 'Assessment media is not retained by the authorized frozen runtime')
  }
  return presentation
}

/**
 * Exchange an already-authorized frozen runtime for short-lived native-media
 * URLs. The caller owns user/recovery authorization; this helper owns frozen
 * membership, immutable catalog validation, and capability binding.
 */
export const issueFrozenAssessmentVideoCapabilities = async (params: {
  scopeId: string
  audience: AssessmentMediaCapabilityAudience
  presentation: AssessmentVideoPresentationV1
  retentionOwner: AssessmentAssetRetentionOwner
  db: AssetDatabase
  ttlSeconds?: number
  nowSeconds?: number
}): Promise<AssessmentVideoCapabilitySourcesV1> => {
  const presentation = await assertPresentationIsRetained(params)
  const issue = (kind: AssessmentMediaCapabilityKind, asset: AssessmentAssetIdentityV1) => createAssessmentMediaCapability({
    scopeId: params.scopeId,
    audience: params.audience,
    kind,
    asset,
    ttlSeconds: params.ttlSeconds,
    nowSeconds: params.nowSeconds,
  })

  const video = issue('video', presentation.video)
  const poster = presentation.poster ? issue('poster', presentation.poster) : undefined
  const captions = (presentation.captions || []).map((track) => {
    const capability = issue('caption', track.asset)
    return {
      assetId: track.asset.assetId,
      src: capability.url,
      kind: track.kind,
      srcLang: track.srcLang,
      label: track.label,
      default: track.default,
      expiresAt: capability.expiresAt,
    }
  })
  const expiries = [video.expiresAt, ...(poster ? [poster.expiresAt] : []), ...captions.map((track) => track.expiresAt)]
  return {
    videoUrl: video.url,
    ...(poster ? { posterUrl: poster.url } : {}),
    captions: captions.map(({ expiresAt: _expiresAt, ...track }) => track),
    expiresAt: Math.min(...expiries),
  }
}

export const assessmentMediaCapabilityInternals = {
  assertPresentationIsRetained,
  createAssessmentMediaCapability,
}
