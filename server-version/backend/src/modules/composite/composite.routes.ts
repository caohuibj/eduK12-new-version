import { runOrLegacyRespondentAccess } from '../assessment-run/runtimeAccess'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { compositeController } from './composite.controller'
import { compositeExportController } from './composite-export.controller'
import { compositeImageController } from './composite-image.controller'
import { compositeVideoController } from './composite-video.controller'
import { situationalVideoController } from '../situational/situational-video.controller'
import { authenticate, requireAdmin, requireRole, requireTeacher } from '../../middleware/auth'
import { UserRole } from '../../types'
import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'
import { instrumentError } from '../../utils/response'
import { RelationalAssessmentError } from '../assessment-relational/errors'
import { relationalProductReportService } from '../assessment-relational/product-report.service'
import { relationalRuntimeConsentAuthority } from '../assessment-relational/runtime-consent'

const router = Router()
// New questionnaire writes must use the revisioned product service. Runtime,
// credential and export routes retain their original authorization.
router.use('/:id', async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || /^(attempts|available|library|report-packages)$/.test(req.params.id)
      || /^\/(attempts|public-tokens|export)(\/|$)/.test(req.path)) return next()
  try {
    const { prisma } = await import('../../config/database')
    const row = await prisma.compositeAssessment.findUnique({ where: { id: req.params.id }, select: { productKind: true } })
    if (row?.productKind === 'QUESTIONNAIRE') return instrumentError(res, 'QUESTIONNAIRE_REVISION_REQUIRED', '请从问卷编制页面修改此问卷', 409)
    return next()
  } catch (e) { return next(e) }
})

const respondentAttemptAccess = runOrLegacyRespondentAccess('COMPOSITE')

const relationalGuardError = (res: Response, error: RelationalAssessmentError) => {
  const status = error.code === 'RELATIONAL_ANALYSIS_ACCESS' || error.code === 'RELATIONAL_ASSIGNMENT_ACTOR' ? 403 : 409
  return instrumentError(res, error.code, error.message, status)
}

const relationalGenericReportGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await relationalProductReportService.assertGenericCompositeReportAllowed({ attemptId: req.params.attemptId })
    return next()
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return relationalGuardError(res, error)
    return next(error)
  }
}

const relationalFinalConsentGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next()
    await relationalRuntimeConsentAuthority.assertCompositeFinal(req.params.attemptId, req.user.userId)
    return next()
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return relationalGuardError(res, error)
    return next(error)
  }
}

router.get('/available', authenticate, requireRole(UserRole.STUDENT), compositeController.available)
router.get('/attempts/:attemptId', authenticate, respondentAttemptAccess, compositeController.getAttempt)
router.get('/attempts/:attemptId/form-sections/:sectionId/assets/:assetId/content', authenticate, respondentAttemptAccess, compositeImageController.authenticatedFormImage)
router.get('/attempts/:attemptId/items/:itemId/scale/assets/:assetId/content', authenticate, respondentAttemptAccess, compositeImageController.authenticatedScaleImage)
router.post('/attempts/:attemptId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability', authenticate, respondentAttemptAccess, compositeVideoController.authenticatedFormVideo)
router.post('/attempts/:attemptId/items/:itemId/scale/items/:itemCode/video-capability', authenticate, respondentAttemptAccess, compositeVideoController.authenticatedScaleVideo)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId', authenticate, respondentAttemptAccess, compositeController.getEmbeddedSituational)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/assets/:assetId/content', authenticate, respondentAttemptAccess, compositeController.embeddedSituationalAsset)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/scenes/:sceneKey/video-sources', authenticate, respondentAttemptAccess, situationalVideoController.embeddedAuthenticated)
router.post('/attempts/:attemptId/restart', authenticate, requireRole(UserRole.STUDENT), compositeController.restartAttempt)
router.post('/attempts/:attemptId/context/freeze', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/form-sections/:sectionId/submit', authenticate, respondentAttemptAccess, relationalFinalConsentGuard, compositeController.submitFinalFormSection)
router.post('/attempts/:attemptId/items/:itemId/scale/submit', authenticate, respondentAttemptAccess, relationalFinalConsentGuard, compositeController.submitFinalScale)
router.post('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit', authenticate, respondentAttemptAccess, relationalFinalConsentGuard, compositeController.submitEmbeddedSituational)
router.post('/attempts/:attemptId/save', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/answer', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/complete', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/form-answer', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.get('/attempts/:attemptId/report', authenticate, respondentAttemptAccess, relationalGenericReportGuard, compositeController.report)
router.get('/attempts/:attemptId/analysis-export', authenticate, requireRole(UserRole.STUDENT), relationalGenericReportGuard, compositeController.analysisExport)
router.get('/attempts/:attemptId/snapshots', authenticate, requireTeacher, compositeController.snapshots)
router.post('/attempts/:attemptId/reanalyze', authenticate, requireAdmin, compositeController.reanalyze)

router.get('/', authenticate, requireTeacher, compositeController.list)
router.post('/', authenticate, requireTeacher, compositeController.create)
router.get('/library', authenticate, requireTeacher, compositeController.library)
router.get('/report-packages', authenticate, requireTeacher, compositeController.reportPackages)
router.post('/:id/copy', authenticate, requireTeacher, compositeController.copy)
router.get('/:id', authenticate, requireTeacher, compositeController.detail)
router.patch('/:id', authenticate, requireTeacher, compositeController.update)
router.put('/:id/report-package', authenticate, requireTeacher, compositeController.setReportPackage)
router.post('/:id/items', authenticate, requireTeacher, compositeController.addItem)
router.get('/:id/content', authenticate, requireTeacher, compositeController.listContent)
router.post('/:id/content/reorder', authenticate, requireTeacher, compositeController.reorderContent)
router.get('/:id/form-sections', authenticate, requireTeacher, compositeController.listFormSections)
router.get('/:id/form-items', authenticate, requireTeacher, compositeController.listFormItems)
router.post('/:id/form-sections', authenticate, requireTeacher, compositeController.createFormSection)
router.put('/:id/form-sections/:sectionId', authenticate, requireTeacher, compositeController.updateFormSection)
router.post('/:id/form-sections/reorder', authenticate, requireTeacher, compositeController.reorderFormSections)
router.post('/:id/form-sections/:sectionId/items/reorder', authenticate, requireTeacher, compositeController.reorderFormSectionItems)
router.post('/:id/form-sections/:sectionId/items/:itemId', authenticate, requireTeacher, compositeController.assignFormItemToSection)
router.delete('/:id/items/:itemId', authenticate, requireTeacher, compositeController.removeItem)
router.post('/:id/items/reorder', authenticate, requireTeacher, compositeController.reorderItems)
router.post('/:id/publish', authenticate, requireTeacher, compositeImageController.publish)
router.get('/:id/public-tokens', authenticate, requireTeacher, compositeController.listTokens)
router.post('/:id/public-tokens', authenticate, requireTeacher, compositeController.createToken)
router.delete('/:id/public-tokens/:tokenId', authenticate, requireTeacher, compositeController.disableToken)

router.get('/:id/export/preview', authenticate, requireTeacher, compositeExportController.preview)
router.post('/:id/export', authenticate, requireTeacher, compositeExportController.export)
router.get('/:id/export/files/:fileName', authenticate, requireTeacher, compositeExportController.download)

router.get('/:id/attempts', authenticate, requireTeacher, compositeController.listAttempts)
router.get('/:id/attempts/:attemptId/report', authenticate, requireTeacher, relationalGenericReportGuard, compositeController.teacherReport)
router.get('/:id/attempts/:attemptId/analysis-export', authenticate, requireTeacher, relationalGenericReportGuard, compositeController.teacherAnalysisExport)

router.post('/:id/attempts', authenticate, requireRole(UserRole.STUDENT), compositeController.startAttempt)

export default router
