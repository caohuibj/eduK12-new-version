import { Router } from 'express'
import { cognitiveController } from './cognitive.controller'

const router = Router()

router.get('/assignments/:token', cognitiveController.getPublicAssignment)
router.post('/assignments/:token/start', cognitiveController.startPublicSession)
router.get('/sessions/:id', cognitiveController.getPublicSession)
router.post('/sessions/:id/trials', cognitiveController.appendPublicTrial)
router.post('/sessions/:id/complete', cognitiveController.completePublicSession)

export default router
