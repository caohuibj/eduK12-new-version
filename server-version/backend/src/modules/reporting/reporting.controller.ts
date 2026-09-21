import type { Request, Response } from 'express'
import { z } from 'zod'
import { instrumentError, unauthorized } from '../../utils/response'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  retirePlatformReportingSpec,
  reviewPlatformReportingSpec,
} from './spec'
import { generateOrganizationGroupAnalysis } from './service'
import {
  bindOrganizationReportingWave,
  createOrganizationReportingSeries,
  generateOrganizationLongitudinalAnalysis,
  generateOrganizationProtectedFeedback,
  readOrganizationReportingArtifact,
} from './pr4Service'
import { ReportingError } from './types'
import { createReportingExport, downloadReportingExport } from './export'
import { readOrganizationSafetyCase } from '../assessment-safety/organization-view'
import { listOrganizationSafetyCases } from '../assessment-safety/organization-discovery'

const createSpecSchema = z.object({
  specKey: z.string().trim().min(1).max(160),
  version: z.number().int().min(1),
  definition: z.unknown(),
}).strict()

const resourceFamily = z.enum(['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL'])
const createSeriesSchema = z.object({
  seriesKey: z.string().trim().min(1).max(160),
  scope: z.object({
    resourceFamily,
    resourceKey: z.string().trim().min(1).max(240),
  }).strict(),
}).strict()
const bindWaveSchema = z.object({
  waveKey: z.string().trim().min(1).max(160),
  ordinal: z.number().int().min(1),
  runId: z.string().uuid(),
  trackId: z.string().uuid(),
}).strict()

const legacyGroupAnalysisSchema = z.object({
  runId: z.string().uuid(),
  trackId: z.string().uuid(),
  specId: z.string().uuid(),
  options: z.object({}).strict().optional(),
}).strict()
const repeatedAnalysisSchema = z.object({
  analysisKind: z.literal('REPEATED_COHORT'),
  seriesId: z.string().uuid(),
  waveKeys: z.array(z.string().trim().min(1).max(160)).min(2).max(50),
  specId: z.string().uuid(),
}).strict()
const matchedAnalysisSchema = z.object({
  analysisKind: z.literal('MATCHED_LONGITUDINAL'),
  seriesId: z.string().uuid(),
  waveKeys: z.array(z.string().trim().min(1).max(160)).min(2).max(50),
  specId: z.string().uuid(),
  options: z.object({ mode: z.enum(['PAIRWISE', 'FULL_CASE']) }).strict(),
}).strict()
const protectedAnalysisSchema = z.object({
  analysisKind: z.literal('PROTECTED_FEEDBACK'),
  runId: z.string().uuid(),
  trackId: z.string().uuid(),
  subjectUserId: z.string().uuid(),
  relationshipKind: z.string().trim().min(1).max(120),
  perspective: z.enum(['SELF_REPORT', 'OBSERVER_REPORT', 'RELATIONAL_EXPERIENCE']),
  specId: z.string().uuid(),
}).strict()
const analysisSchema = z.union([
  legacyGroupAnalysisSchema,
  repeatedAnalysisSchema,
  matchedAnalysisSchema,
  protectedAnalysisSchema,
])

const exportSchema = z.union([
  z.object({ kind: z.enum(['AGGREGATE', 'MEMBER']), artifactId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('SAFETY'), caseId: z.string().uuid() }).strict(),
])

const badRequest = (res: Response, message: string) => instrumentError(res, 'REPORT_REQUEST_INVALID', message, 400)
const fail = (res: Response, error: unknown) => {
  if (error instanceof ReportingError) return instrumentError(res, error.code, error.message, error.statusCode)
  throw error
}
const principal = (req: Request) => ({ userId: req.user!.userId, platformRole: req.user!.platformRole })

export const reportingController = {
  async createExport(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = exportSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, 'invalid export request')
    try {
      const data = await createReportingExport({ principal: principal(req), organizationId: req.params.organizationId, target: parsed.data })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data })
    } catch (error) { return fail(res, error) }
  },
  async downloadExport(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const result = await downloadReportingExport({ principal: principal(req), organizationId: req.params.organizationId, exportId: req.params.exportId })
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      return res.type('text/csv').send(result.csv)
    } catch (error) { return fail(res, error) }
  },
  async listSafetyCases(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const data = await listOrganizationSafetyCases({ principal: principal(req), organizationId: req.params.organizationId })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data })
    } catch (error) { return fail(res, error) }
  },
  async readSafetyCase(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const data = await readOrganizationSafetyCase({ principal: principal(req), organizationId: req.params.organizationId, caseId: req.params.caseId })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data })
    } catch (error) { return fail(res, error) }
  },
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
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async reviewSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await reviewPlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async publishSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await publishPlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async retireSpec(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const spec = await retirePlatformReportingSpec({ actor: principal(req), specId: req.params.specId })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: spec })
    } catch (error) { return fail(res, error) }
  },

  async createSeries(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = createSeriesSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid reporting series')
    try {
      const series = await createOrganizationReportingSeries({
        principal: principal(req),
        organizationId: req.params.organizationId,
        seriesKey: parsed.data.seriesKey,
        resourceFamily: parsed.data.scope.resourceFamily,
        resourceKey: parsed.data.scope.resourceKey,
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: series })
    } catch (error) { return fail(res, error) }
  },

  async bindWave(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = bindWaveSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid reporting Wave')
    try {
      const wave = await bindOrganizationReportingWave({
        principal: principal(req),
        organizationId: req.params.organizationId,
        seriesId: req.params.seriesId,
        ...parsed.data,
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: wave })
    } catch (error) { return fail(res, error) }
  },

  async analyze(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = analysisSchema.safeParse(req.body)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid analysis request')
    try {
      const data = parsed.data
      if (!('analysisKind' in data)) {
        const artifact = await generateOrganizationGroupAnalysis({
          principal: principal(req),
          organizationId: req.params.organizationId,
          runId: data.runId,
          trackId: data.trackId,
          specId: data.specId,
        })
        res.setHeader('Cache-Control', 'no-store')
        return res.json({ code: 0, message: '操作成功', data: artifact })
      }
      if (data.analysisKind === 'REPEATED_COHORT') {
        const artifact = await generateOrganizationLongitudinalAnalysis({
          principal: principal(req), organizationId: req.params.organizationId,
          seriesId: data.seriesId, waveKeys: data.waveKeys, specId: data.specId,
          analysisKind: data.analysisKind,
        })
        res.setHeader('Cache-Control', 'no-store')
        return res.json({ code: 0, message: '操作成功', data: artifact })
      }
      if (data.analysisKind === 'MATCHED_LONGITUDINAL') {
        const artifact = await generateOrganizationLongitudinalAnalysis({
          principal: principal(req), organizationId: req.params.organizationId,
          seriesId: data.seriesId, waveKeys: data.waveKeys, specId: data.specId,
          analysisKind: data.analysisKind, mode: data.options.mode,
        })
        res.setHeader('Cache-Control', 'no-store')
        return res.json({ code: 0, message: '操作成功', data: artifact })
      }
      const artifact = await generateOrganizationProtectedFeedback({
        principal: principal(req), organizationId: req.params.organizationId,
        runId: data.runId, trackId: data.trackId, subjectUserId: data.subjectUserId,
        relationshipKind: data.relationshipKind, perspective: data.perspective, specId: data.specId,
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: artifact })
    } catch (error) { return fail(res, error) }
  },

  async readArtifact(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const artifact = await readOrganizationReportingArtifact({
        principal: principal(req),
        organizationId: req.params.organizationId,
        artifactId: req.params.artifactId,
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ code: 0, message: '操作成功', data: artifact })
    } catch (error) { return fail(res, error) }
  },
}
