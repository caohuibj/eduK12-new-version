import { Router } from 'express'
import { userController } from '../controllers/userController'
import { authenticate, requireAdmin, requireSelfOrAdmin } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, requireAdmin, userController.list)
router.post('/', authenticate, requireAdmin, userController.create)
router.get('/me', authenticate, userController.me)
router.post('/change-password', authenticate, userController.changePassword)
router.get('/:id', authenticate, requireSelfOrAdmin, userController.detail)
router.put('/:id', authenticate, userController.update)
router.delete('/:id', authenticate, requireAdmin, userController.delete)
router.post('/:id/reset-password', authenticate, requireAdmin, userController.resetPassword)
router.post('/:id/approve-teacher', authenticate, requireAdmin, userController.approveTeacher)

export default router
