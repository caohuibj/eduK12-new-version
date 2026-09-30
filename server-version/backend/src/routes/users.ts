import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../middleware/passwordChangeAdmission'
import { Router } from 'express'
import { userController } from '../controllers/userController'
import { userLifecycleController } from '../controllers/userLifecycleController'
import { platformAccountController } from '../controllers/platformAccountController'
import { authenticate, requireAdmin, requireSelfOrAdmin } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, requireAdmin, userController.list)
router.post('/', authenticate, requireAdmin, userController.create)
router.get('/me', authenticate, userController.me)
router.post('/change-password', authenticate, passwordChangeRateLimit, withPasswordChangeAdmission(userController.changePassword))
router.get('/:id', authenticate, requireSelfOrAdmin, userController.detail)
router.put('/:id', authenticate, userController.update)
// Historical identity is retention-critical; DELETE now means account
// deactivation + token invalidation, never physical row deletion. Current DB
// PlatformRole authority is enforced inside userLifecycleService, so a legacy
// ADMIN that has been platform-demoted cannot use this endpoint.
router.delete('/:id', authenticate, userLifecycleController.deactivate)
// Forced credential invalidation is a platform lifecycle mutation. The service
// re-checks current DB platform_role and Organization usable-admin invariants;
// legacy User.role=ADMIN is intentionally insufficient.
router.post('/:id/reset-password', authenticate, platformAccountController.resetPassword)
router.post('/:id/approve-teacher', authenticate, requireAdmin, userController.approveTeacher)

export default router
