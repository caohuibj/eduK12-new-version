import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { instrumentError, unauthorized } from '../../utils/response'
import { listRegisteredResources, registerDescriptiveResource, transitionDescriptiveResource } from '../assessment-run/registeredResources'
import { createPlatformReportingSpec, listPlatformReportingSpecs } from './spec'
import { ReportingError, reportingFail, type ReportingAnalysisSpecDefinitionV1 } from './types'

const actor = (req: Request) => ({ userId: req.user!.userId, platformRole: req.user!.platformRole })
const send = (res: Response, data: unknown) => { res.setHeader('Cache-Control', 'no-store'); return res.json({ code: 0, message: '操作成功', data }) }
const handle = (work: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  if (!req.user) return unauthorized(res)
  try { return send(res, await work(req)) } catch (e) {
    if (e instanceof ReportingError) return instrumentError(res, e.code, e.message, e.statusCode)
    if (e instanceof z.ZodError) return instrumentError(res, 'CONTENT_INPUT_INVALID', '请检查输入内容', 400)
    throw e
  }
}

export function descriptiveReportingDefinition(entry: { applicability: { resourceKey: string; resourceVersion: string }; definitionHash: string; resultDisclosure?: { audiences: { SUBJECT: { metricKeys: string[] } } } }, kind: 'INDIVIDUAL_LONGITUDINAL' | 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL', minimumN: number): ReportingAnalysisSpecDefinitionV1 {
  const keys = entry.resultDisclosure?.audiences.SUBJECT.metricKeys ?? []
  if (!keys.length || !Number.isInteger(minimumN) || minimumN < 3) reportingFail('REPORT_SPEC_INVALID', '资源没有计分指标或群体保护人数不足', 400)
  const metricRules = keys.map(key => ({
    metricId: key, sourceMetricKey: key, acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
    missingnessRule: 'EXCLUDE', observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
    sourceFamily: 'SCALE', sourceResourceKey: entry.applicability.resourceKey, valueType: 'NUMBER', longitudinalMetricKey: key,
    ...(kind === 'INDIVIDUAL_LONGITUDINAL' ? {} : { aggregations: ['MEAN'], minimumMetricN: minimumN }),
  }))
  // EXACT means the same registered scoring definition, not scientific validity.
  const comparabilityRules = keys.map(key => ({ schemaVersion: 1, metricId: key, resourceFamily: 'SCALE', resourceKey: entry.applicability.resourceKey,
    fromVersion: entry.applicability.resourceVersion, toVersion: entry.applicability.resourceVersion, level: 'EXACT',
    evidenceRef: `registered-definition:${entry.definitionHash}`, evidenceHash: entry.definitionHash }))
  return { schemaVersion: 1, engineVersion: '1.0.0', analysisKind: kind, engineKey: `ORG_${kind}_V1`,
    privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT', reportEvidenceCeiling: 'PILOT', metricRules, comparabilityRules,
    ...(kind === 'INDIVIDUAL_LONGITUDINAL' ? {} : { minimumContributorN: minimumN, minimumCohortN: minimumN }),
  } as ReportingAnalysisSpecDefinitionV1
}

export const reportingContentController = {
  listResources: handle(req => listRegisteredResources(actor(req))),
  registerResource: handle(req => { const input = z.object({ scaleId: z.string().uuid(), mode: z.enum(['INDIVIDUAL','GROUP']).default('INDIVIDUAL') }).strict().parse(req.body); return registerDescriptiveResource(actor(req), input.scaleId, input.mode) }),
  transitionResource: handle(req => transitionDescriptiveResource(actor(req), req.params.resourceId, z.enum(['review', 'publish', 'retire']).parse(req.params.action))),
  listSpecs: handle(req => listPlatformReportingSpecs(actor(req), z.coerce.number().int().min(1).default(1).parse(req.query.page))),
  createDescriptiveSpec: handle(async req => {
    const input = z.object({ resourceId: z.string().uuid(), specKey: z.string().trim().min(1).max(160), version: z.number().int().min(1),
      analysisKind: z.enum(['INDIVIDUAL_LONGITUDINAL', 'REPEATED_COHORT', 'MATCHED_LONGITUDINAL']), minimumN: z.number().int().min(3).max(1000) }).strict().parse(req.body)
    const resources = await listRegisteredResources(actor(req))
    const resource = resources.list.find(r => r.id === input.resourceId && r.status === 'PUBLISHED')
    if (!resource) return reportingFail('RESOURCE_NOT_PUBLISHED', '请先审核并发布测量资源', 409)
    if ((input.analysisKind === 'INDIVIDUAL_LONGITUDINAL') !== (resource.entry.applicability.analysisMode === 'INDIVIDUAL_ONLY')) reportingFail('REPORT_SPEC_SCOPE', '个人方案须选择个人自评资源，群体方案须选择群体资源', 400)
    const scale = await prisma.scale.findUnique({ where: { id: resource.scale_id } })
    if (!scale || scale.definitionHash !== resource.definition_hash || scale.status !== 'PUBLISHED') reportingFail('RESOURCE_INTEGRITY', '量表版本已变化，请刷新资源目录', 409)
    return createPlatformReportingSpec({ actor: actor(req), specKey: input.specKey, version: input.version,
      definition: descriptiveReportingDefinition({ ...resource.entry, definitionHash: resource.definition_hash }, input.analysisKind, input.minimumN) })
  }),
}
