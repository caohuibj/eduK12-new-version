import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authController } from '../controllers/authController'
import { authenticate, requireAdmin } from '../middleware/auth'

const router = Router()

// 登录限流配置：15分钟内最多5次
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      code: -1,
      message: '登录尝试次数过多，请15分钟后再试'
    })
  },
  skip: (req) => {
    // 开发环境可以跳过限流
    return process.env.NODE_ENV === 'development'
  }
})

// 公开接口
router.post('/login', loginLimiter, authController.login)
router.post('/register', authController.register)
router.post('/student-register', authController.studentRegister)
router.post('/verify-teacher-code', authController.verifyTeacherCode)
router.post('/teacher-register', authController.teacherRegister)

// 需要认证的接口
router.get('/me', authenticate, authController.me)
router.post('/change-password', authenticate, authController.changePassword)

// 管理员专属接口 - 账号延期
router.post('/extend-account', authenticate, requireAdmin, authController.extendAccount)

export default router
