import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Request, Response } from 'express'
import { assessmentVideoPresentationSchema } from './assessment-video'
import { createAssessmentMediaCapability, type AssessmentMediaCapabilityAudience } from './assessment-media-capability'

const fixtureSchema = z.object({
  scopeId: z.string().min(1),
  studentUserId: z.string().min(1),
  publicRecoveryTokenHash: z.string().regex(/^[0-9a-f]{64}$/u),
  presentation: assessmentVideoPresentationSchema,
}).strict()

const fixturePath = () => process.env.ASSESSMENT_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-assessment-video-fixture.json'

const readFixture = () => fixtureSchema.parse(JSON.parse(readFileSync(fixturePath(), 'utf8')))

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const issueSources = (audience: AssessmentMediaCapabilityAudience) => {
  const fixture = readFixture()
  const video = createAssessmentMediaCapability({
    scopeId: fixture.scopeId,
    audience,
    kind: 'video',
    asset: fixture.presentation.video,
  })
  const poster = fixture.presentation.poster
    ? createAssessmentMediaCapability({
        scopeId: fixture.scopeId,
        audience,
        kind: 'poster',
        asset: fixture.presentation.poster,
      })
    : null
  const captions = (fixture.presentation.captions || []).map((track) => {
    const issued = createAssessmentMediaCapability({
      scopeId: fixture.scopeId,
      audience,
      kind: 'caption',
      asset: track.asset,
    })
    return {
      assetId: track.asset.assetId,
      src: issued.url,
      kind: track.kind,
      srcLang: track.srcLang,
      label: track.label,
      default: track.default,
      expiresAt: issued.expiresAt,
    }
  })
  return {
    presentation: fixture.presentation,
    sources: {
      videoUrl: video.url,
      posterUrl: poster?.url,
      captions,
      expiresAt: Math.min(video.expiresAt, poster?.expiresAt || video.expiresAt, ...captions.map((track) => track.expiresAt)),
    },
  }
}

export const assessmentVideoE2EAuthenticatedCapabilities = (req: Request, res: Response) => {
  const fixture = readFixture()
  if (!req.user || req.user.userId !== fixture.studentUserId) return res.status(403).end()
  return res.json({ code: 0, message: 'ok', data: issueSources('authenticated') })
}

export const assessmentVideoE2EPublicCapabilities = (req: Request, res: Response) => {
  const fixture = readFixture()
  const token = req.header('X-Recovery-Token') || ''
  if (!token || sha256(token) !== fixture.publicRecoveryTokenHash) return res.status(401).end()
  return res.json({ code: 0, message: 'ok', data: issueSources('public') })
}
