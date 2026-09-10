import { Router } from 'express'
import { cognitiveController } from './cognitive.controller'
import { cognitiveImageController } from './cognitive-image.controller'
import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'

const router = Router()

router.get('/assignments/:token', cognitiveController.getPublicAssignment)
router.post('/assignments/:token/start', cognitiveController.startPublicSession)
router.get('/sessions/:id', cognitiveController.getPublicSession)
router.get('/sessions/:id/assets/:assetId/content', cognitiveImageController.publicContent)
router.post('/sessions/:id/restart', cognitiveController.restartPublicSession)
router.post('/sessions/:id/submit', cognitiveController.submitPublicSession)
router.post('/sessions/:id/trials/batch', legacyWriteDisabled)
router.post('/sessions/:id/trials', legacyWriteDisabled)
router.post('/sessions/:id/complete', legacyWriteDisabled)

export default router
