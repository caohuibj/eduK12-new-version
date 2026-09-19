import type { Request, Response } from 'express'
import { z } from 'zod'
import { instrumentError, unauthorized } from '../../utils/response'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  retirePlatformReportingSpec,
  reviewPlatformReportingSpec,
} from './spec'
import { generateOrganizationGroupAnalysis, readOrganizationGroupArtifact } from './service'
import { ReportingError } from './types'

const createSpecSchema = z.object({
  specKey: z.string().trim().min(1).max(160),
  version: z.number().int().min(1),
  definition: z.unknown(),
}).strict()
const analysisSchema = z.object({
  runId: z.string().uuid(),
  trackId: z.string().uuid(),
  specId: z.string().uuid(),
  options: z.object({}).strict().optional(),
}).strict()

const badRequest = (res: Response, message: string) => instrumentError(res, 'REPORT_REQUEST_INVALID', message, 400)
const fail = (res: Response, error: unknown) => {
  if (error instanceof ReportingError) return instrumentError(res, error.code, error.message, error.statusCode)
  throw error
}
const principal = (req: Request) => ({ userId: req.user!.userId, platformRole: req.user!.platformRole })

export const reportingController = {
  async createSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = createSpecSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid reporting spec')
    try {
      const spec = await createPlatformReportingSpec({
        actor: principal(req),
        specKey: parsed.data.specKey,
        version: parsed.data.version,
        definition: parsed.data.definition,
      })
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async reviewSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await reviewPlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async publishSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await publishPlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async retireSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await retirePlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async analyze(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = analysisSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid analysis request')
    try {
      const artifact = await generateOrganizationGroupAnalysis({
        principal: principal(req),
        organizationId: req.params.organizationId,
        runId: parsed.data.runId,
        trackId: parsed.data.trackId,
        specId: parsed.data.specId,
      })
      return res.json({ code: 0, message: '操作成功', data: artifact })
    } catch (error) { return fail(res, error) }
  },

  async readArtifact(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const artifact = await readOrganizationGroupArtifact({
        principal: principal(req),
        organizationId: req.params.organizationId,
        artifactId: req.params.artifactId,
      })
      return res.json({ code: 0, message: '操作成功', data: artifact })
    } catch (error) { return fail(res, error) }
  },
}
