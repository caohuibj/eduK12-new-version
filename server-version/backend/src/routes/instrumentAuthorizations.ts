import { Router } from 'express'
import { instrumentAuthorizationController } from '../controllers/instrumentAuthorizationController'

const router = Router()

router.get('/', instrumentAuthorizationController.list)
router.post('/', instrumentAuthorizationController.create)
router.post('/publish-preview/scale', instrumentAuthorizationController.publishPreviewScale)
router.post('/:authorizationId/approve', instrumentAuthorizationController.approve)
router.post('/:authorizationId/revoke', instrumentAuthorizationController.revoke)
router.post('/:authorizationId/attach-evidence', instrumentAuthorizationController.attachEvidence)

export default router
