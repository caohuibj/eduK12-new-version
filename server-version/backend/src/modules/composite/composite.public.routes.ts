import { Router } from 'express'
import { compositeController } from './composite.controller'

const router = Router()

router.get('/attempts/:attemptId', compositeController.publicAttempt)
router.post('/attempts/:attemptId/context/freeze', compositeController.publicFreezeContext)
router.post('/attempts/:attemptId/save', compositeController.publicSave)
router.post('/attempts/:attemptId/items/:itemId/scale/answer', compositeController.publicScaleAnswer)
router.post('/attempts/:attemptId/items/:itemId/scale/complete', compositeController.publicCompleteScale)
router.post('/attempts/:attemptId/items/:itemId/form-answer', compositeController.publicFormAnswer)
router.get('/attempts/:attemptId/report', compositeController.publicReport)
router.get('/attempts/:attemptId/analysis-export', compositeController.publicAnalysisExport)
router.get('/:token', compositeController.publicInfo)
router.post('/:token/start', compositeController.publicStart)

export default router
