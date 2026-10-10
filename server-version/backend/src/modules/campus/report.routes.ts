import { Router, type Request, type Response, type NextFunction } from 'express'
import { z, ZodError } from 'zod'
import { config } from '../../config'
import { authenticateSchool } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { ParentPortalError } from '../parent-portal/contracts'
import { parentPortalService } from '../parent-portal/service'
import { parentPublisher } from '../parent-portal/publisher'
import { ReportingError } from '../reporting/types'
import { readCampusStudentStatus } from './admission.service'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { listParticipantLongitudinal, readParticipantLongitudinal } from '../reporting/participantService'
import { listCampusProfessionalReports, readCampusProfessionalReport } from './professional-reports'
import { readRespondentRunSummary } from '../reporting/respondentSummary'

/**
 * SCHOOL has its own authenticated reporting surface. The legacy parent/reporting
 * routers use TRAINING credentials and must never be mounted under /api/campus.
 * Only the reviewed parent projections are exposed: not their source artifacts.
 */
const router = Router()
const id = z.string().uuid()
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
}).strict()
const commandKey = z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const mutationBudget = createRedisRateLimiter({
  name: 'campus-report-write', limit: 30, windowSeconds: 900,
  key: req => req.user?.userId ?? 'anonymous',
})
const guarded = (operation: (req: Request) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve().then(() => operation(req)).then(data => success(res, data)).catch(error => {
      if (error instanceof ReportingError) return res.status(error.statusCode).json({
        code: error.code, message: '当前校园报告不可访问', data: null,
      })
      if (error instanceof ParentPortalError) return res.status(error.status).json({
        code: error.code, message: '当前校园报告不可访问或授权已经变化', data: null,
      })
      if (error instanceof ZodError) return res.status(400).json({
        code: 'CAMPUS_REPORT_INPUT_INVALID', message: '报告操作参数不正确', data: null,
      })
      if (error?.code === 'P2034' || error?.code === 'P2002'
        || (error?.code === 'P2010' && ['40001', '40P01'].includes(error?.meta?.code))) {
        return res.status(409).json({ code: 'CAMPUS_REPORT_CONFLICT', message: '授权状态已变化，请刷新后重试', data: null })
      }
      return next(error)
    })
  }

router.use(authenticateSchool)
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
// Public to any authenticated SCHOOL role; no report, identity or student data.
router.get('/reports/availability', guarded(async () => ({
  parentReportsEnabled: config.campusParentReportEnabled,
})))

// Self-only. The existing participant engine checks current membership,
// authoritative SELF observations and frozen-vs-current disclosure contracts.
router.get('/reports/student/longitudinal', guarded(async req => {
  if (req.user!.role !== 'STUDENT' || (await readCampusStudentStatus(req.user!)).status !== 'APPROVED') {
    throw new ParentPortalError('CAMPUS_REPORT_NOT_FOUND', 404)
  }
  return listParticipantLongitudinal(req.user!.userId)
}))
router.get('/reports/student/longitudinal/:artifactId', guarded(async req => {
  if (req.user!.role !== 'STUDENT' || (await readCampusStudentStatus(req.user!)).status !== 'APPROVED') {
    throw new ParentPortalError('CAMPUS_REPORT_NOT_FOUND', 404)
  }
  return readParticipantLongitudinal(req.user!.userId, id.parse(req.params.artifactId))
}))

// The existing respondent projection is the only authority for each
// completed FINAL. It checks the exact respondent, published resources,
// current campus population and the content-owned disclosure contract.
router.get('/reports/student/executions/:executionId', guarded(async req => {
  if (req.user!.role !== 'STUDENT'
    || (await readCampusStudentStatus(req.user!)).status !== 'APPROVED') {
    throw new ParentPortalError('CAMPUS_REPORT_NOT_FOUND', 404)
  }
  return readRespondentRunSummary(req.user!.userId, id.parse(req.params.executionId))
}))

// Counselor's professional reports are separately authorized from parent
// publication and do not become visible when a student report is shared.
router.get('/reports/professional/organizations/:organizationId/artifacts', guarded(req =>
  listCampusProfessionalReports(req.user!, id.parse(req.params.organizationId))))
router.get('/reports/professional/organizations/:organizationId/artifacts/:artifactId', guarded(req =>
  readCampusProfessionalReport(req.user!, id.parse(req.params.organizationId), id.parse(req.params.artifactId))))

// Do not imply a parent educational template has been approved simply because
// a parent link exists. The existing explicit publication/consent/grant chain
// and independent CAMPUS_PARENT_REPORT_ENABLED gate remain mandatory.
router.use('/reports/parent', (_req, res, next) => config.campusParentReportEnabled
  ? next()
  : res.status(404).json({ code: 'PARENT_PORTAL_DISABLED', message: '校园家长报告尚未开放', data: null }))
router.use('/reports/relationships', (_req, res, next) => config.campusParentReportEnabled
  ? next()
  : res.status(404).json({ code: 'PARENT_PORTAL_DISABLED', message: '校园家长报告尚未开放', data: null }))
router.use('/reports/officer', (_req, res, next) => config.campusParentReportEnabled
  ? next()
  : res.status(404).json({ code: 'PARENT_PORTAL_DISABLED', message: '校园家长报告尚未开放', data: null }))

router.get('/reports/parent/children', guarded(async req => {
  const q = pagination.parse(req.query)
  const data = await parentPortalService.children(req.user!, q.page, q.pageSize)
  // Legacy parent DTOs may include the student's internal username. It is
  // never a SCHOOL parent reporting field or a legitimate identity mapping.
  return { ...data, list: data.list.map(({ childId, relationshipId }) => ({ childId, relationshipId })) }
}))
router.get('/reports/parent/children/:childId/reports', guarded(req => {
  const q = pagination.parse(req.query)
  return parentPortalService.reports(req.user!, id.parse(req.params.childId), q.page, q.pageSize)
}))
router.get('/reports/parent/children/:childId/reports/:artifactId', guarded(req =>
  parentPortalService.readReport(req.user!, id.parse(req.params.childId), id.parse(req.params.artifactId))))

router.get('/reports/relationships/:relationshipId/options', guarded(req =>
  parentPortalService.studentReportOptions(req.user!, id.parse(req.params.relationshipId))))
router.get('/reports/relationships/:relationshipId/artifacts/:artifactId/consent', guarded(req =>
  parentPortalService.reportConsentPreview(req.user!, id.parse(req.params.relationshipId), id.parse(req.params.artifactId))))
router.post('/reports/relationships/:relationshipId/artifacts/:artifactId/consent', mutationBudget, guarded(req => {
  const b = z.object({
    commandKey, consentVersion: z.string().max(128),
    publicationHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().parse(req.body)
  return parentPortalService.acceptReportConsent(
    req.user!, id.parse(req.params.relationshipId), id.parse(req.params.artifactId),
    b.commandKey, b.consentVersion, b.publicationHash,
  )
}))
router.post('/reports/relationships/:relationshipId/artifacts/:artifactId/grants', requireRecentSchoolMfa, mutationBudget, guarded(req => {
  const b = z.object({ commandKey, consentId: id }).strict().parse(req.body)
  return parentPortalService.grantReport(
    req.user!, id.parse(req.params.relationshipId), id.parse(req.params.artifactId), b.consentId, b.commandKey,
  )
}))
router.post('/reports/relationships/:relationshipId/artifacts/:artifactId/revoke', mutationBudget, guarded(req => {
  const b = z.object({ reason: z.string().min(1).max(200) }).strict().parse(req.body)
  return parentPortalService.revokeReport(req.user!, id.parse(req.params.relationshipId), id.parse(req.params.artifactId), b.reason)
}))

router.get('/reports/officer/artifacts', guarded(req => {
  const q = pagination.extend({ organizationId: id }).parse(req.query)
  return parentPublisher.list(req.user!, q.organizationId, q.page, q.pageSize)
}))
router.get('/reports/officer/artifacts/:artifactId/templates', guarded(req =>
  parentPublisher.templates(req.user!, id.parse(req.params.artifactId))))
router.get('/reports/officer/artifacts/:artifactId/consents', guarded(req =>
  parentPortalService.disclosureConsents(req.user!, id.parse(req.params.artifactId))))
router.post('/reports/officer/artifacts/:artifactId/preview', mutationBudget, guarded(req => {
  const b = z.object({
    templateKey: z.string().min(1).max(128).default('parent-report-availability'),
    templateVersion: z.string().min(1).max(128).default('1.0.0'),
  }).strict().parse(req.body)
  return parentPublisher.preview(req.user!, id.parse(req.params.artifactId), b.templateKey, b.templateVersion)
}))
router.post('/reports/officer/artifacts/:artifactId/publish', requireRecentSchoolMfa, mutationBudget, guarded(req => {
  const b = z.object({
    templateKey: z.string().min(1).max(128), templateVersion: z.string().min(1).max(128),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().min(0), commandKey,
  }).strict().parse(req.body)
  return parentPublisher.publish(req.user!, id.parse(req.params.artifactId), b)
}))

export default router
