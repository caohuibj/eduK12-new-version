import { legacyQuestionnaireAuthoring } from '../middleware/legacyQuestionnaireAuthoring'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { questionnaireController } from '../controllers/questionnaireController'
import { questionnaireImageController } from '../controllers/questionnaireImageController'
import { questionnaireVideoController } from '../controllers/questionnaireVideoController'
import { authenticate, requireTeacher } from '../middleware/auth'
import { legacyWriteDisabled } from '../middleware/instrumentFinalOnly'
import { instrumentError } from '../utils/response'
import { RelationalAssessmentError } from '../modules/assessment-relational/errors'
import { relationalProductReportService } from '../modules/assessment-relational/product-report.service'

const router = Router()

const relationalGenericQuestionnaireReportGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await relationalProductReportService.assertGenericScaleReportAllowed({ assessmentId: req.params.id })
    return next()
  } catch (error) {
    if (error instanceof RelationalAssessmentError) {
      const status = error.code === 'RELATIONAL_ANALYSIS_ACCESS' ? 403 : 409
      return instrumentError(res, error.code, error.message, status)
    }
    return next(error)
  }
}

router.get('/available', authenticate, questionnaireController.available)
router.get('/assessments/:id', authenticate, questionnaireController.getAssessment)
router.post('/assessments/:id/restart', authenticate, questionnaireController.restartAssessment)
router.post('/assessments/:id/context/freeze', authenticate, legacyWriteDisabled)
router.post('/assessments/:assessmentId/form-sections/:sectionId/submit', authenticate, questionnaireController.submitFinalFormSection)
router.post('/assessments/:assessmentId/scales/:scaleAssessmentId/submit', authenticate, questionnaireController.submitFinalScale)
router.get('/assessments/:assessmentId/form-sections/:sectionId/assets/:assetId', authenticate, questionnaireImageController.authenticatedFormImage)
router.get('/assessments/:assessmentId/scales/:scaleAssessmentId/assets/:assetId', authenticate, questionnaireImageController.authenticatedScaleImage)
router.post('/assessments/:assessmentId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability', authenticate, questionnaireVideoController.authenticatedFormVideo)
router.post('/assessments/:assessmentId/scales/:scaleAssessmentId/items/:itemCode/video-capability', authenticate, questionnaireVideoController.authenticatedScaleVideo)
router.post('/assessments/:id/complete', authenticate, questionnaireController.completeAssessment)
router.get('/assessments/:id/report', authenticate, relationalGenericQuestionnaireReportGuard, questionnaireController.getReport)
router.get('/exports/:artifactId', authenticate, questionnaireController.downloadExportFile)
router.get('/exports/:artifactId/status', authenticate, questionnaireController.exportArtifactStatus)
router.get('/:id', authenticate, questionnaireController.detail)
router.post('/:id/assessments', authenticate, questionnaireController.startAssessment)
router.post('/assessments/:assessmentId/form-answers', authenticate, legacyWriteDisabled)
router.patch('/assessments/:assessmentId/form-answers/batch', authenticate, legacyWriteDisabled)
router.post('/assessments/:assessmentId/form-answers/batch', authenticate, legacyWriteDisabled)
router.get('/', authenticate, requireTeacher, questionnaireController.list)
router.post('/', authenticate, requireTeacher, questionnaireController.create)
router.put('/:id', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.update))
router.delete('/:id', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.delete, false))
router.post('/:id/publish', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireImageController.publish))
router.post('/:id/deprecate', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.deprecate, false))
router.post('/:id/duplicate', authenticate, requireTeacher, questionnaireController.duplicate)
router.get('/:id/export/preview', authenticate, requireTeacher, questionnaireController.getExportPreview)
router.post('/:id/export', authenticate, requireTeacher, questionnaireController.exportData)
router.get('/:id/scales', authenticate, requireTeacher, questionnaireController.listScales)
router.post('/:id/scales', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.addScale))
router.delete('/:id/scales/:scaleId', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.removeScale))
router.post('/:id/scales/reorder', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.reorderScales))
router.get('/:id/form-items', authenticate, requireTeacher, questionnaireController.listFormItems)
router.get('/:id/form-sections', authenticate, requireTeacher, questionnaireController.listFormSections)
router.post('/:id/form-sections', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.createFormSection))
router.put('/:id/form-sections/:sectionId', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.updateFormSection))
router.post('/:id/form-sections/reorder', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.reorderFormSections))
router.post('/:id/form-sections/:sectionId/items/reorder', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.reorderFormSectionItems))
router.post('/:id/form-sections/:sectionId/items/:itemId', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.assignFormItemToSection))
router.get('/:id/content', authenticate, requireTeacher, questionnaireController.listContent)
router.post('/:id/form-items', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.addFormItem))
router.put('/:id/form-items/:itemId', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.updateFormItem))
router.delete('/:id/form-items/:itemId', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.removeFormItem))
router.post('/:id/content/reorder', authenticate, requireTeacher, legacyQuestionnaireAuthoring('COURSE', questionnaireController.reorderContent))
router.get('/:id/courses', authenticate, requireTeacher, questionnaireController.listCourses)
router.post('/:id/courses', authenticate, requireTeacher, questionnaireController.addCourses)
router.delete('/:id/courses/:courseId', authenticate, requireTeacher, questionnaireController.removeCourse)

export default router
