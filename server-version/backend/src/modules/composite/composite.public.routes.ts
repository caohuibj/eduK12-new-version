import { Router } from 'express'
import { compositeController } from './composite.controller'
import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'

const router = Router()

router.get('/attempts/:attemptId', compositeController.publicAttempt)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId', compositeController.publicEmbeddedSituational)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/assets/:assetId/content', compositeController.publicEmbeddedSituationalAsset)
router.post('/attempts/:attemptId/restart', compositeController.publicRestart)
router.post('/attempts/:attemptId/context/freeze', legacyWriteDisabled)
router.post('/attempts/:attemptId/form-sections/:sectionId/submit', compositeController.publicSubmitFinalFormSection)
router.post('/attempts/:attemptId/items/:itemId/scale/submit', compositeController.publicSubmitFinalScale)
router.post('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit', compositeController.publicSubmitEmbeddedSituational)
router.post('/attempts/:attemptId/save', legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/answer', legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/complete', legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/form-answer', legacyWriteDisabled)
router.get('/attempts/:attemptId/report', compositeController.publicReport)
router.get('/attempts/:attemptId/analysis-export', compositeController.publicAnalysisExport)
router.get('/:token', compositeController.publicInfo)
router.post('/:token/start', compositeController.publicStart)

export default router
