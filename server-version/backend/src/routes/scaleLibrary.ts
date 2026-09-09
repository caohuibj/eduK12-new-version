import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { scaleLibraryController } from '../controllers/scaleLibraryController'

const router = Router()

// Read-only discovery/governance projection. Starting and submitting a scale
// continues through the existing /api/scales runtime routes.
router.get('/', authenticate, scaleLibraryController.list)
router.get('/:instrumentKey/:instrumentVersion', authenticate, scaleLibraryController.detail)

export default router
