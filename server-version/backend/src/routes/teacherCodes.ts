import { Router } from 'express'
import { teacherCodeController } from '../controllers/teacherCodeController'
import { authenticate, requireAdmin } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, requireAdmin, teacherCodeController.list)
router.post('/', authenticate, requireAdmin, teacherCodeController.create)
router.delete('/:id', authenticate, requireAdmin, teacherCodeController.delete)
router.post('/verify', teacherCodeController.verify)

export default router
