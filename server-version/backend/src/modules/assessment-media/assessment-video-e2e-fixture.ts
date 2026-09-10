import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Request, Response } from 'express'
import { prisma } from '../../config/database'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
} from './assessment-asset'
import { assessmentVideoPresentationSchema } from './assessment-video'
import {
  issueFrozenAssessmentVideoCapabilities,
  type AssessmentMediaCapabilityAudience,
} from './assessment-media-capability'

const fixtureSchema = z.object({
  scopeId: z.string().min(1),
  student: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
  }).strict(),
  publicRecoveryToken: z.string().min(1),
  publicRecoveryTokenHash: z.string().regex(/^[0-9a-f]{64}$/u),
  presentation: assessmentVideoPresentationSchema,
}).strict()

const fixturePath = () => process.env.ASSESSMENT_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-assessment-video-fixture.json'

const readFixture = () => fixtureSchema.parse(JSON.parse(readFileSync(fixturePath(), 'utf8')))

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const equalDigest = (left: string, right: string): boolean => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const issueSources = async (audience: AssessmentMediaCapabilityAudience) => {
  const fixture = readFixture()
  const sources = await issueFrozenAssessmentVideoCapabilities({
    scopeId: fixture.scopeId,
    audience,
    presentation: fixture.presentation,
    retentionOwner: {
      entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
      entityId: fixture.scopeId,
      field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
    },
    db: prisma,
  })
  return { presentation: fixture.presentation, sources }
}

export const assessmentVideoE2EAuthenticatedCapabilities = async (req: Request, res: Response) => {
  const fixture = readFixture()
  if (!req.user || req.user.userId !== fixture.student.id) return res.status(403).end()
  return res.json({ code: 0, message: 'ok', data: await issueSources('authenticated') })
}

export const assessmentVideoE2EPublicCapabilities = async (req: Request, res: Response) => {
  const fixture = readFixture()
  const token = req.header('X-Recovery-Token') || ''
  if (!token || !equalDigest(sha256(token), fixture.publicRecoveryTokenHash)) return res.status(401).end()
  return res.json({ code: 0, message: 'ok', data: await issueSources('public') })
}
