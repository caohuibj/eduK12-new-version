import { Router } from 'express'
import { capabilityController } from '../controllers/capabilityController'

const router = Router()

// Public: the client needs this before it knows which authenticated routes to render.
router.get('/', capabilityController.getCapabilities)

export default router
