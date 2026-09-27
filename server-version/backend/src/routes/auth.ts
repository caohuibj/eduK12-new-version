import { Router } from 'express'
import { authController } from '../controllers/authController'
import { authenticate, requireAdmin } from '../middleware/auth'
import { issueCsrfToken } from '../utils/authCookies'
import { loginRateLimit, withLoginAccountFailureThrottle } from '../middleware/loginRateLimit'
import { requirePositiveAccountExtension } from '../middleware/accountExtensionValidation'
import rateLimit from 'express-rate-limit'

const router = Router()

// 注册及公开验证限流，避免批量账号创建和验证码枚举
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      code: -1,
      message: '请求过于频繁，请15分钟后再试'
    })
  },
  skip: (req) => process.env.NODE_ENV === 'development'
})

// 公开接口
router.post('/login', loginRateLimit, withLoginAccountFailureThrottle(authController.login))
router.post('/register', registrationLimiter, authController.register)
router.post('/student-register', registrationLimiter, authController.studentRegister)
router.post('/verify-teacher-code', registrationLimiter, authController.verifyTeacherCode)
router.post('/teacher-register', registrationLimiter, authController.teacherRegister)

router.get('/csrf', (req, res) => {
  return res.json({ code: 0, message: '操作成功', data: { csrfToken: issueCsrfToken(req, res) } })
})

// 需要认证的接口
router.get('/me', authenticate, authController.me)
router.post('/change-password', authenticate, authController.changePassword)
router.post('/logout', authenticate, authController.logout)

// 管理员专属接口 - 仅允许延期，不允许通过负 months 缩短有效期。
router.post('/extend-account', authenticate, requireAdmin, requirePositiveAccountExtension, authController.extendAccount)

export default router
