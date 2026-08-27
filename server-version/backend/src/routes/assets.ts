import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { issuePrivateAssetUrl, issuePublicAssetUrl, serveAsset } from '../services/assetStorage'

const router = Router()
export const publicAssetRouter = Router()

// Public issuance and delivery both require the X-Checkin-Token header.
publicAssetRouter.get('/:id/url', issuePublicAssetUrl)
publicAssetRouter.get('/:id/content', serveAsset)

router.get('/:id/url', authenticate, issuePrivateAssetUrl)
router.get('/:id/content', serveAsset)

export default router
