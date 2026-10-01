import { Router } from 'express'
import { situationalController } from '../controllers/situationalController'
import { situationalVideoController } from '../modules/situational/situational-video.controller'
import { authenticate, requireStudent } from '../middleware/auth'

const router = Router()

// Explicit current resource grant required; authenticated role alone grants nothing.
router.get('/attempts/:attemptId/research-export', authenticate, situationalController.researchExport)

router.get('/instruments', authenticate, requireStudent, situationalController.listInstruments)
router.get('/instruments/:instrumentKey', authenticate, requireStudent, situationalController.getInstrument)
router.get('/history', authenticate, requireStudent, situationalController.history)

// Unified start/resume surface. A second start on an active attempt returns
// that authoritative row; a completed attempt is never reopened.
router.post('/attempts', authenticate, requireStudent, situationalController.start)
router.get('/attempts/:attemptId', authenticate, requireStudent, situationalController.resume)
router.post('/attempts/:attemptId/resume', authenticate, requireStudent, situationalController.resume)
router.get('/attempts/:attemptId/result', authenticate, requireStudent, situationalController.result)
router.get('/attempts/:attemptId/assets/:assetId/content', authenticate, requireStudent, situationalController.assetContent)
router.get('/attempts/:attemptId/scenes/:sceneKey/video-sources', authenticate, requireStudent, situationalVideoController.standalone)
router.post('/attempts/:attemptId/submit', authenticate, requireStudent, situationalController.submitFinal)

// Friendly start alias for clients that prefer a resource-oriented URL.
router.post('/:instrumentKey/attempts', authenticate, requireStudent, situationalController.startByPath)

export default router
