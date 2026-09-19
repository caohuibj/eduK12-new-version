import { z } from 'zod'
import type { Request, Response } from 'express'
import { error, success, unauthorized } from '../../utils/response'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from './repository'
import { publishAssessmentRun } from './publish'
import { startAssessmentRunExecution } from './startExecution'
import { readAssessmentRunProgress } from './progress'
import { cancelAssessmentRun, closeAssessmentRun } from './lifecycle'

const selectorSchema = z.record(z.unknown()).default({})
const policySchema = z.object({
  subjectRoles: z.array(z.string().min(1)).min(1),
  respondentRoles: z.array(z.string().min(1)).min(1),
  relationshipKinds: z.array(z.string().min(1)).min(1),
  perspectives: z.array(z.string().min(1)).min(1),
  analysisMode: z.string().min(1),
  visibilityPolicyKey: z.string().min(1),
  minimumRespondents: z.number().int().min(1).nullable(),
})
const createRunSchema = z.object({
  name: z.string().trim().min(1).max(200),
  intakeDeadline: z.string().datetime().nullable().optional(),
})
const addTrackSchema = z.object({
  resource: z.object({
    family: z.enum(['BUNDLE', 'SCALE', 'FORM', 'SITUATIONAL', 'COGNITIVE']),
    key: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  subjectSelector: selectorSchema.optional(),
  respondentSelector: selectorSchema.optional(),
  requestedPolicy: policySchema,
})
const publishSchema = z.object({ expectedVersion: z.number().int().min(1) })

const fail = (res: Response, err: unknown) => {
  const known = err as { code?: string; message?: string; statusCode?: number }
  if (known && typeof known.statusCode === 'number') {
    return error(res, known.message ?? known.code ?? 'Run operation failed', -1, known.statusCode)
  }
  throw err
}

export const assessmentRunController = {
  async create(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = createRunSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message, -1, 400)
    try {
      return success(res, await createAssessmentRunDraft({
        organizationId: req.params.organizationId,
        name: parsed.data.name,
        createdByUserId: req.user.userId,
        intakeDeadline: parsed.data.intakeDeadline ? new Date(parsed.data.intakeDeadline) : null,
      }))
    } catch (err) { return fail(res, err) }
  },

  async addTrack(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = addTrackSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message, -1, 400)
    try {
      return success(res, await addAssessmentRunTrackDraft({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        resource: parsed.data.resource,
        subjectSelector: parsed.data.subjectSelector ?? {},
        respondentSelector: parsed.data.respondentSelector ?? {},
        requestedPolicy: parsed.data.requestedPolicy,
      }))
    } catch (err) { return fail(res, err) }
  },

  async publish(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = publishSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message, -1, 400)
    try {
      return success(res, await publishAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        actorUserId: req.user.userId,
        expectedVersion: parsed.data.expectedVersion,
      }))
    } catch (err) { return fail(res, err) }
  },

  async startExecution(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      return success(res, await startAssessmentRunExecution({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
        executionId: req.params.executionId,
        actorUserId: req.user.userId,
      }))
    } catch (err) { return fail(res, err) }
  },

  async progress(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      return success(res, await readAssessmentRunProgress(
        req.params.organizationId,
        req.params.runId,
      ))
    } catch (err) { return fail(res, err) }
  },

  async close(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      return success(res, await closeAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
      }))
    } catch (err) { return fail(res, err) }
  },

  async cancel(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      return success(res, await cancelAssessmentRun({
        organizationId: req.params.organizationId,
        runId: req.params.runId,
      }))
    } catch (err) { return fail(res, err) }
  },
}
