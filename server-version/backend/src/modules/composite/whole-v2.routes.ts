import type { Request, Response, Router, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, instrumentError, success } from '../../utils/response'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { isWholeSubmitAdmissionBusyError, withWholeSubmitAdmission } from '../../services/wholeSubmitAdmission'
import { decodeCompositeUnitSeeds } from '../assessment-runtime/composite-final.codec'
import {
  CompositeCheckpointError,
  deleteUnlockedCompositeCheckpoint,
  readCompositeCheckpoint,
  saveCompositeCheckpoint,
} from '../assessment-runtime/composite-checkpoint.service'
import {
  commitCompositeWholeFinal,
  validateCompositeCheckpointLockUnit,
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
  attempt: CommitCompositeWholeFinalInput['attempt'] & { status?: string }
  plan: CompositePublicationPlanV1
  audience: AssessmentMediaCapabilityAudience
  educationRun?: CommitCompositeWholeFinalInput['educationRun']
  activeSlotKeys?: ReadonlySet<string>
  verifyAuthorityInTx?: CommitCompositeWholeFinalInput['verifyAuthorityInTx']
  buildFeedback?: CommitCompositeWholeFinalInput['buildFeedback']
}

export interface WholeV2RouteAdapter {
  /** Entry-specific auth middleware(s) (e.g. authenticateSchool, authenticateTeacher, etc.). */
  middleware: RequestHandler[]
  /** Optional extra middleware(s) applied specifically to POST /v2/whole/submit (e.g. final consent). */
  submitMiddleware?: RequestHandler[]
  /** Optional base path prefix before `/:attemptId/...` (default `''`). */
  prefix?: string
  /** Authorize attempt ownership and resolve its frozen CompositePublicationPlanV1. */
  authorizeAttempt: (req: Request) => Promise<AuthorizedWholeV2Attempt>
}

function respondError(res: Response, err: unknown, fallbackMessage: string) {
  if (isWholeSubmitAdmissionBusyError(err)) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds))
    return error(res, '系统交卷繁忙，请稍后重试', -1, 503)
  }
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
      let existingReceipt: {
        status: 'COMPLETED'
        attemptId: string
        attemptEpoch: number
        submissionId: string
        payloadHash: string
        aggregateHash: string
        factsHash: string
        rawHash: string
        completedAt: string
        replayed: true
        receiptOnly: boolean
        feedbackAvailable: boolean
      } | null = null
      if (ctx.attempt.status === 'COMPLETED') {
        const finalRows = await prisma.$queryRaw<Array<{
          attemptId: string
          attemptEpoch: number
          submissionId: string
          payloadHash: string
          aggregateHash: string
          factsHash: string
          rawHash: string
          hasFeedback: boolean
          completedAt: Date
        }>>(Prisma.sql`
          SELECT attempt_id AS "attemptId",
            attempt_epoch AS "attemptEpoch",
            submission_id AS "submissionId",
            payload_hash AS "payloadHash",
            aggregate_hash AS "aggregateHash",
            facts_hash AS "factsHash",
            raw_hash AS "rawHash",
            (feedback_cipher IS NOT NULL) AS "hasFeedback",
            completed_at AS "completedAt"
          FROM composite_attempt_finals
          WHERE attempt_id = ${ctx.attempt.id} AND attempt_epoch = ${ctx.attempt.attemptEpoch}
          LIMIT 1
        `)
        const row = finalRows[0]
        if (row) {
          existingReceipt = {
            status: 'COMPLETED',
            attemptId: row.attemptId,
            attemptEpoch: row.attemptEpoch,
            submissionId: row.submissionId,
            payloadHash: row.payloadHash,
            aggregateHash: row.aggregateHash,
            factsHash: row.factsHash,
            rawHash: row.rawHash,
            completedAt: row.completedAt.toISOString(),
            replayed: true,
            receiptOnly: ctx.attempt.receiptOnly,
            feedbackAvailable: row.hasFeedback,
          }
        }
      }
      return success(res, {
        executionMode: 'WHOLE_V2',
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        status: ctx.attempt.status ?? 'IN_PROGRESS',
        publicationHash: ctx.plan.publicationHash,
        slotSetHash: ctx.plan.slotSetHash,
        templateHash: ctx.plan.publicationHash,
        activeSlotKeys: ctx.activeSlotKeys ? [...ctx.activeSlotKeys] : null,
        receiptOnly: ctx.attempt.receiptOnly,
        unitSeeds,
        checkpoint,
        ...(existingReceipt ? { existingReceipt } : {}),
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
      if (parsed.lockUnit) {
        if (!allowedSlotKeys.has(parsed.lockUnit.slotKey)) {
          return instrumentError(res, 'DEFINITION_MISMATCH', `锁定槽位不在本次作答范围：${parsed.lockUnit.slotKey}`, 409)
        }
        validateCompositeCheckpointLockUnit({
          plan: ctx.plan,
          unitSeedsEncrypted: ctx.attempt.unitSeedsEncrypted,
          slotKey: parsed.lockUnit.slotKey,
          unit: parsed.lockUnit.unit,
        })
      }
      const snapshot = await prisma.$transaction(tx => saveCompositeCheckpoint(tx, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
        expectedRevision: parsed.expectedRevision,
        drafts: parsed.drafts,
        itemTimings: parsed.itemTimings,
        lockUnit: parsed.lockUnit,
        allowedSlotKeys,
        verifyAttemptActive: true,
      }))
      return success(res, snapshot)
    } catch (err) {
      return respondError(res, err, '保存草稿失败')
    }
  })

  router.delete(`${base}/v2/checkpoint`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const rawRev = req.query.expectedRevision
      const expectedRevision = typeof rawRev === 'string' && /^\d+$/.test(rawRev) ? Number(rawRev) : undefined
      const result = await prisma.$transaction(tx => deleteUnlockedCompositeCheckpoint(tx, {
        attemptId: ctx.attempt.id,
        attemptEpoch: ctx.attempt.attemptEpoch,
        publicationHash: ctx.plan.publicationHash,
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        verifyAttemptActive: true,
      }))
      return success(res, result)
    } catch (err) {
      return respondError(res, err, '清空草稿失败')
    }
  })

  const submitMw = [...mw, ...(adapter.submitMiddleware ?? [])]
  router.post(`${base}/v2/whole/submit`, ...submitMw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      const submit = wholeV2SubmitSchema.parse(req.body)
      const receipt = await withWholeSubmitAdmission(
        () => prisma.$transaction(tx => commitCompositeWholeFinal(tx, {
          attempt: ctx.attempt,
          plan: ctx.plan,
          submit,
          educationRun: ctx.educationRun,
          activeSlotKeys: ctx.activeSlotKeys,
          verifyAuthorityInTx: ctx.verifyAuthorityInTx,
          buildFeedback: ctx.buildFeedback,
        })),
        ctx.audience === 'public',
      )
      return success(res, receipt)
    } catch (err) {
      return respondError(res, err, '提交整卷失败')
    }
  })

  router.get(`${base}/slots/:slotKey/assets/:assetId/content`, ...mw, async (req: Request, res: Response) => {
    try {
      const ctx = await adapter.authorizeAttempt(req)
      if (ctx.activeSlotKeys && !ctx.activeSlotKeys.has(req.params.slotKey)) {
        return error(res, '无权访问未激活槽位的媒体资源', -1, 403)
      }
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
      if (ctx.activeSlotKeys && !ctx.activeSlotKeys.has(req.params.slotKey)) {
        return error(res, '无权访问未激活槽位的视频资源', -1, 403)
      }
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
