import { Router } from 'express'
import { teacherCodeController } from '../controllers/teacherCodeController'
import { authenticate, requireAdmin } from '../middleware/auth'
import { createRedisRateLimiter } from '../middleware/redisRateLimit'

const router = Router()

const teacherCodeVerifyIpLimiter = createRedisRateLimiter({
  name: 'teacher-code-ip',
  limit: 60,
  windowSeconds: 15 * 60,
})
const teacherCodeVerifyValueLimiter = createRedisRateLimiter({
  name: 'teacher-code-value',
  limit: 20,
  windowSeconds: 15 * 60,
  key: (req) => typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : 'invalid',
})

router.get('/', authenticate, requireAdmin, teacherCodeController.list)
router.post('/', authenticate, requireAdmin, teacherCodeController.create)
router.delete('/:id', authenticate, requireAdmin, teacherCodeController.delete)
router.post('/verify', teacherCodeVerifyIpLimiter, teacherCodeVerifyValueLimiter, teacherCodeController.verify)

export default router
