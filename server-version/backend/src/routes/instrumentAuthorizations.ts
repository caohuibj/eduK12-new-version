import { Router } from 'express'
import { instrumentAuthorizationController } from '../controllers/instrumentAuthorizationController'

const router = Router()

router.get('/', instrumentAuthorizationController.list)
router.post('/', instrumentAuthorizationController.create)
router.post('/publish-preview/who5', instrumentAuthorizationController.publishPreviewWho5)
router.post('/:authorizationId/approve', instrumentAuthorizationController.approve)

export default router
