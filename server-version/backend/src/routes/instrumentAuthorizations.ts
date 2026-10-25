import { Router } from 'express'
import { instrumentAuthorizationController } from '../controllers/instrumentAuthorizationController'

const router = Router()
// Old URLs remain explicit and side-effect free; historical rows are not deleted.
router.use(instrumentAuthorizationController.retired)
export default router
