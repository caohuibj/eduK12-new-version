import crypto from 'node:crypto'
import { z } from 'zod'
import { config } from '../../config'
import { assessmentAssetIdentitySchema, type AssessmentAssetIdentityV1 } from './assessment-asset-identity'
import {
  assessmentStaticImageAssetIdentitySchema,
} from './assessment-image'
import {
  assessmentVideoAssetIdentitySchema,
  assessmentVttAssetIdentitySchema,
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

export class AssessmentMediaCapabilityError extends Error {
  readonly reason: 'INVALID' | 'EXPIRED'

  constructor(reason: 'INVALID' | 'EXPIRED', message: string) {
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

export const createAssessmentMediaCapability = (params: {
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
