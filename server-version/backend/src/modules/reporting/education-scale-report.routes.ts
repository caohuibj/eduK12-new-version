import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { authenticateSchool, authenticateHuiteacher } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { readCampusStudentStatus } from '../campus/admission.service'
import { readEducationRespondentScaleReport } from './education-scale-personal-report.service'
import { serveProjectedReportImage } from './report-image-delivery'
import { assessmentAssetIdSchema } from '../assessment-media/assessment-asset-identity'

const executionId = z.string().uuid()
const assetId = assessmentAssetIdSchema

/** Mount only under the corresponding authenticated product base. Publication
 * and START readiness are separate gates and are not enabled by this module. */
function createReportRouter(product: 'SCHOOL' | 'TEACHER') {
  const router = Router()
  router.use(product === 'SCHOOL' ? authenticateSchool : authenticateHuiteacher)
  const handle: RequestHandler = asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (!req.user || (product === 'SCHOOL' && (req.user.role !== 'STUDENT'
      || (await readCampusStudentStatus(req.user)).status !== 'APPROVED'))) return res.status(404).end()
    const parsedExecution = executionId.safeParse(req.params.executionId)
    const parsedAsset = req.params.assetId === undefined ? null : assetId.safeParse(req.params.assetId)
    if (!parsedExecution.success || (parsedAsset && !parsedAsset.success)) return res.status(404).end()
    const report = await readEducationRespondentScaleReport({ actorUserId: req.user.userId,
      executionId: parsedExecution.data, product })
    if (!report) return res.status(404).end()
    // This re-runs the same current authorization as JSON on every image fetch;
    // only images present in the audience-filtered projection may be delivered.
    if (parsedAsset?.success) return serveProjectedReportImage(report, parsedAsset.data, res)
    return success(res, report)
  })
  router.get('/library-scale/executions/:executionId/report', handle)
  router.get('/library-scale/executions/:executionId/report/images/:assetId', handle)
  return router
}
export const educationSchoolScaleReportRouter = createReportRouter('SCHOOL')
export const educationTeacherScaleReportRouter = createReportRouter('TEACHER')
