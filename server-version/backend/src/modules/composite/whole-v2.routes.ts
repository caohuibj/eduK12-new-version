import type { Request, Response, Router, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, instrumentError, success } from '../../utils/response'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { decodeCompositeUnitSeeds } from '../assessment-runtime/composite-final.codec'
import {
  clearCompositeCheckpoint,
  CompositeCheckpointError,
  readCompositeCheckpoint,
  saveCompositeCheckpoint,
} from '../assessment-runtime/composite-checkpoint.service'
import {
  commitCompositeWholeFinal,
  wholeV2SubmitSchema,
  type CommitCompositeWholeFinalInput,
} from '../assessment-runtime/composite-final.writer'
import {
  generateCompositeUnitSeeds,
  loadCompositePublicationPlan,
  projectWholeV2Template,
  type CompositePublicationPlanV1,
} from '../assessment-runtime/composite-publication-plan'
import {
  issueCompositeSlotVideoCapabilities,
  serveCompositeSlotImage,
} from '../assessment-runtime/composite-slot-media.service'
import type { AssessmentMediaCapabilityAudience } from '../assessment-media/assessment-media-capability'

const checkpointPutSchema = z.object({
  expectedRevision: z.number().int().min(0),
  attemptEpoch: z.number().int().min(1),
  drafts: z.record(z.string(), z.record(z.string(), z.unknown())),
  itemTimings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  lockUnit: z.object({
    slotKey: z.string().min(1).max(240),
    unit: z.discriminatedUnion('unitType', [
      z.object({
        unitType: z.literal('COGNITIVE'),
        itemId: z.string().min(1).max(240),
        randomSeed: z.string().min(1).max(240),
        trials: z.array(z.unknown()).max(20000),
        summaryMeta: z.record(z.string(), z.unknown()).optional(),
      }).strict(),
      z.object({
        unitType: z.literal('SITUATIONAL'),
        itemId: z.string().min(1).max(240),
        responses: z.record(z.string(), z.unknown()),
        researchEvents: z.array(z.unknown()).max(10000).optional(),
        totalTimeMs: z.number().finite().min(0).optional(),
      }).strict(),
    ]),
  }).strict().optional(),
}).strict()

const videoCapabilityRequestSchema = z.object({
  videoKey: z.string().min(1).max(240),
}).strict()

export interface AuthorizedWholeV2Attempt {
  attempt: CommitCompositeWholeFinalInput['attempt']
  plan: CompositePublicationPlanV1
  audience: AssessmentMediaCapabilityAudience
  educationRun?: CommitCompositeWholeFinalInput['educationRun']
  activeSlotKeys?: ReadonlySet<string>
  buildFeedback?: CommitCompositeWholeFinalInput['buildFeedback']
}

export interface WholeV2RouteAdapter {
  /** Entry-specific auth middleware(s) (e.g. authenticateSchool, authenticateTeacher, etc.). */
  middleware: RequestHandler[]
  /** Optional base path prefix before `/:attemptId/...` (default `''`). */
  prefix?: string
  /** Authorize attempt ownership and resolve its frozen CompositePublicationPlanV1. */
  authorizeAttempt: (req: Request) => Promise<AuthorizedWholeV2Attempt>
}

function respondError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof z.ZodError) {
    return error(res, err.issues[0]?.message || '请求参数格式无效', -1, 400)
  }
  if (err instanceof CompositeCheckpointError) {
    return instrumentError(res, err.code, err.message, err.statusCode)
  }
  if (isInstrumentFinalSubmitError(err)) {
    return instrumentError(res, err.code, err.message, err.statusCode)
  }
  return error(res, err instanceof Error ? err.message : fallbackMessage, -1, 500)
}

/** Zero-child-row START helper for Phase 2 single-row composite attempts.
 * Writes ONLY 1 row to composite_assessment_attempts (with publication_hash + optional unit_seeds_encrypted). */
export async function startCompositeWholeV2Attempt(
  tx: Prisma.TransactionClient,
  input: {
    id: string
    compositeAssessmentId: string
    plan: CompositePublicationPlanV1
    participantKey: string
    attemptNo: number
    userId?: string | null
    subjectUserId?: string | null
    respondentUserId?: string | null
    respondentType?: string | null
    deliveryCourseId?: string | null
    assignmentRef?: string | null
    episodeId?: string | null
    consentId?: string | null
    accessTokenId?: string | null
    recoveryTokenHash?: string | null
    anonymousCode?: string | null
    receiptOnly?: boolean
  },
): Promise<{
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  slotSetHash: string
  unitSeeds: Record<string, string> | null
}> {
  const attemptEpoch = 1
  const generatedSeeds = generateCompositeUnitSeeds(input.plan, input.id, attemptEpoch)
  await tx.compositeAssessmentAttempt.create({
    data: {
      id: input.id,
      compositeAssessmentId: input.compositeAssessmentId,
      participantKey: input.participantKey,
      attemptNo: input.attemptNo,
      attemptEpoch,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      userId: input.userId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      respondentUserId: input.respondentUserId ?? null,
      respondentType: input.respondentType ?? null,
      deliveryCourseId: input.deliveryCourseId ?? null,
      assignmentRef: input.assignmentRef ?? null,
      episodeId: input.episodeId ?? null,
      consentId: input.consentId ?? null,
      accessTokenId: input.accessTokenId ?? null,
      recoveryTokenHash: input.recoveryTokenHash ?? null,
      anonymousCode: input.anonymousCode ?? null,
      receiptOnly: Boolean(input.receiptOnly),
      publicationHash: input.plan.publicationHash,
      frozenActiveSlotSetHash: input.plan.slotSetHash,
      unitSeedsEncrypted: generatedSeeds?.encrypted ?? null,
    },
  })
  return {
    attemptId: input.id,
    attemptEpoch,
    publicationHash: input.plan.publicationHash,
    slotSetHash: input.plan.slotSetHash,
    unitSeeds: generatedSeeds?.seeds ?? null,
  }
}

/** Mounts the unified Phase 2 V2 whole-submit, checkpoint, and slot-media routes
 * onto any entry router (Training authenticated/public, School, Teacher). */
export function mountCompositeWholeV2Routes(router: Router, adapter: WholeV2RouteAdapter): void {
  const base = `${adapter.prefix ?? ''}/:attemptId`
  const mw = adapter.middleware

  router.get(`${base}/v2/whole`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const unitSeeds = ctx.attempt.unitSeedsEncrypted
        ? decodeCompositeUnitSeeds(ctx.attempt.unitSeedsEncrypted).seeds
        : null
      const checkpoint = await readCompositeCheckpoint(prisma, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
      })
      return success(res, {
        executionMode: 'WHOLE_V2',
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
        slotSetHash: ctx.plan.slotSetHash,
        templateHash: ctx.plan.publicationHash,
        receiptOnly: ctx.attempt.receiptOnly,
        unitSeeds,
        checkpoint,
      })
    } catch (err) {
      return respondError(res, err, '获取整卷定义失败')
    }
  })

  router.get(`${base}/v2/whole/template/:templateHash`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const plan = req.params.templateHash === ctx.plan.publicationHash
        ? ctx.plan
        : await loadCompositePublicationPlan(req.params.templateHash)
      if (plan.publicationHash !== ctx.plan.publicationHash) {
        return error(res, '模板摘要与当前作答冻结版本不一致', -1, 409)
      }
      res.setHeader('Cache-Control', 'private, max-age=3600, immutable')
      return success(res, projectWholeV2Template(plan))
    } catch (err) {
      return respondError(res, err, '获取整卷模板失败')
    }
  })

  router.get(`${base}/v2/checkpoint`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const snapshot = await readCompositeCheckpoint(prisma, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
      })
      return success(res, snapshot)
    } catch (err) {
      return respondError(res, err, '读取草稿失败')
    }
  })

  router.put(`${base}/v2/checkpoint`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const parsed = checkpointPutSchema.parse(req.body)
      if (parsed.attemptEpoch !== ctx.attempt.attemptEpoch) {
        return instrumentError(res, 'STALE_ATTEMPT', '作答版本已变更', 409)
      }
      const allowedSlotKeys = ctx.activeSlotKeys ?? new Set(ctx.plan.slots.map(s => s.slotKey))
      const snapshot = await prisma.$transaction(tx => saveCompositeCheckpoint(tx, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
        expectedRevision: parsed.expectedRevision,
        drafts: parsed.drafts,
        itemTimings: parsed.itemTimings,
        lockUnit: parsed.lockUnit,
        allowedSlotKeys,
      }))
      return success(res, snapshot)
    } catch (err) {
      return respondError(res, err, '保存草稿失败')
    }
  })

  router.delete(`${base}/v2/checkpoint`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const existing = await readCompositeCheckpoint(prisma, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
      })
      if (existing.lockedSlotKeys.length > 0) {
        return instrumentError(res, 'CHECKPOINT_LOCKED_UNIT_IMMUTABLE', '存在已锁定的认知或情境单元，无法清空草稿', 409)
      }
      await clearCompositeCheckpoint(prisma, ctx.attempt.id)
      return success(res, { cleared: true })
    } catch (err) {
      return respondError(res, err, '清空草稿失败')
    }
  })

  router.post(`${base}/v2/whole/submit`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const submit = wholeV2SubmitSchema.parse(req.body)
      const receipt = await prisma.$transaction(tx => commitCompositeWholeFinal(tx, {
        attempt: ctx.attempt,
        plan: ctx.plan,
        submit,
        educationRun: ctx.educationRun,
        activeSlotKeys: ctx.activeSlotKeys,
        buildFeedback: ctx.buildFeedback,
      }))
      return success(res, receipt)
    } catch (err) {
      return respondError(res, err, '提交整卷失败')
    }
  })

  router.get(`${base}/slots/:slotKey/assets/:assetId/content`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      return await serveCompositeSlotImage({
        plan: ctx.plan,
        slotKey: req.params.slotKey,
        assetId: req.params.assetId,
        res,
      })
    } catch (err) {
      return respondError(res, err, '加载测评图片失败')
    }
  })

  router.post(`${base}/slots/:slotKey/video-capabilities`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const body = videoCapabilityRequestSchema.parse(req.body)
      const sources = await issueCompositeSlotVideoCapabilities({
        plan: ctx.plan,
        attemptId: ctx.attempt.id,
        slotKey: req.params.slotKey,
        videoKey: body.videoKey,
        audience: ctx.audience,
      })
      return success(res, sources)
    } catch (err) {
      return respondError(res, err, '签发测评视频能力失败')
    }
  })
}
