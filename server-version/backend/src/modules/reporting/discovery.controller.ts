import type { Request, Response } from 'express'
import { z } from 'zod'
import { instrumentError, unauthorized } from '../../utils/response'
import {
  listReportingCohortOptions,
  listOrganizationReportingSeries,
  listOrganizationReportingSources,
  listProtectedReportingSources,
  listPublishedReportingSpecs,
} from './discovery'
import { ReportingError } from './types'

const analysisKind = z.enum(['GROUP', 'REPEATED_COHORT', 'MATCHED_LONGITUDINAL', 'PROTECTED_FEEDBACK'])
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}
const specQuery = z.object({ ...pagination, analysisKind: analysisKind.optional() })
const seriesQuery = z.object(pagination)

const principal = (req: Request) => ({ userId: req.user!.userId, platformRole: req.user!.platformRole })
const badRequest = (res: Response, message: string) => instrumentError(res, 'REPORT_DISCOVERY_INVALID', message, 400)
const fail = (res: Response, error: unknown) => {
  if (error instanceof ReportingError) return instrumentError(res, error.code, error.message, error.statusCode)
  throw error
}
const noStore = (res: Response, data: unknown) => {
  res.setHeader('Cache-Control', 'no-store')
  return res.json({ code: 0, message: '操作成功', data })
}

export const reportingDiscoveryController = {
  async cohortOptions(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try { return noStore(res, await listReportingCohortOptions({ principal: principal(req), organizationId: req.params.organizationId })) }
    catch (error) { return fail(res, error) }
  },
  async listSpecs(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = specQuery.safeParse(req.query)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid reporting spec discovery request')
    try {
      return noStore(res, await listPublishedReportingSpecs({
        principal: principal(req),
        organizationId: req.params.organizationId,
        ...parsed.data,
      }))
    } catch (error) { return fail(res, error) }
  },

  async listSources(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = seriesQuery.safeParse(req.query)
    if (!parsed.success) return badRequest(res, 'invalid source pagination')
    try {
      return noStore(res, await listOrganizationReportingSources({
        ...parsed.data,
        principal: principal(req),
        organizationId: req.params.organizationId,
      }))
    } catch (error) { return fail(res, error) }
  },

  async listProtectedSources(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      return noStore(res, await listProtectedReportingSources({
        principal: principal(req),
        organizationId: req.params.organizationId,
      }))
    } catch (error) { return fail(res, error) }
  },

  async listSeries(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    const parsed = seriesQuery.safeParse(req.query)
    if (!parsed.success) return badRequest(res, parsed.error.errors[0]?.message ?? 'invalid reporting series discovery request')
    try {
      return noStore(res, await listOrganizationReportingSeries({
        principal: principal(req),
        organizationId: req.params.organizationId,
        ...parsed.data,
      }))
    } catch (error) { return fail(res, error) }
  },
}
