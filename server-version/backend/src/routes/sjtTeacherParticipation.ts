import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { UserRole } from '../types'
import { getSituationalInstrument } from '../modules/situational/situational-runtime.service'
import { availableSjtPackages } from '../modules/situational/authoring/service'
import { situationalController } from '../controllers/situationalController'

// A separate teacher participant surface. Student routes and research grants stay unchanged.
const router = Router()
router.use(authenticate, requireRole(UserRole.TEACHER))
router.get('/instruments', situationalController.listInstruments)
router.get('/instruments/:instrumentKey', situationalController.getInstrument)
router.get('/history', situationalController.history)
router.post(
  '/attempts',
  async (req, res, next) => {
    try {
      getSituationalInstrument(
        req.body?.instrumentKey,
        req.body?.instrumentVersion,
        (await availableSjtPackages()).filter(
          (p) => p.definition.respondentType === 'teacher_self_report',
        ),
      )
      next()
    } catch {
      res.status(404).json({ code: 'INSTRUMENT_NOT_AVAILABLE', message: '教师题包不存在或已停用' })
    }
  },
  situationalController.start,
)
router.get('/attempts/:attemptId', situationalController.resume)
router.get('/attempts/:attemptId/result', situationalController.result)
router.post('/attempts/:attemptId/submit', situationalController.submitFinal)
export default router
