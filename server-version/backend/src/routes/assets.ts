import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth'
import { issuePrivateAssetUrl, issuePublicAssetUrl, serveAsset } from '../services/assetStorage'
import {
  AssessmentMediaCapabilityError,
  AssessmentMediaDeliveryError,
  serveAssessmentMediaCapabilityContent,
} from '../modules/assessment-media/assessment-video-delivery'
import {
  assessmentVideoE2EAuthenticatedCapabilities,
  assessmentVideoE2EPublicCapabilities,
} from '../modules/assessment-media/assessment-video-e2e-fixture'

const router = Router()
export const publicAssetRouter = Router()

const assessmentMediaContent = async (req: Request, res: Response) => {
  const token = typeof req.query.cap === 'string' ? req.query.cap : ''
  if (!token) return res.status(401).end()
  try {
    return await serveAssessmentMediaCapabilityContent({ token, req, res })
  } catch (error) {
    if (error instanceof AssessmentMediaCapabilityError) return res.status(401).end()
    if (error instanceof AssessmentMediaDeliveryError) {
      return res.status(error.reason === 'IDENTITY_MISMATCH' ? 409 : 404).end()
    }
    throw error
  }
}

// Native <video>, poster, and <track> requests cannot attach assessment
// recovery headers reliably. Adapters exchange their existing authorization
// for a short-lived, scope-bound capability URL, then media GET/HEAD/Range
// requests use only that signed capability.
router.get('/assessment-media/content', assessmentMediaContent)
router.head('/assessment-media/content', assessmentMediaContent)

// CI-only issuance seam used to prove that authenticated and anonymous
// recovery credentials can be exchanged once, before native media requests.
if (process.env.ASSESSMENT_VIDEO_E2E_FIXTURE === 'true') {
  router.get('/assessment-media/e2e/auth-capabilities', authenticate, assessmentVideoE2EAuthenticatedCapabilities)
  router.get('/assessment-media/e2e/public-capabilities', assessmentVideoE2EPublicCapabilities)
}

// Public issuance and delivery both require the X-Checkin-Token header.
publicAssetRouter.get('/:id/url', issuePublicAssetUrl)
publicAssetRouter.get('/:id/content', serveAsset)

router.get('/:id/url', authenticate, issuePrivateAssetUrl)
router.get('/:id/content', serveAsset)

export default router
