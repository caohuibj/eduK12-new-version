import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../middleware/passwordChangeAdmission'
import { Router } from 'express'
import { authController } from '../controllers/authController'
import { authenticate, requireAdmin } from '../middleware/auth'
import { issueCsrfToken } from '../utils/authCookies'
import { loginRateLimit, withLoginAccountFailureThrottle } from '../middleware/loginRateLimit'
import { requirePositiveAccountExtension } from '../middleware/accountExtensionValidation'
import { registrationRateLimit, withRegistrationAdmission } from '../middleware/registrationAdmission'

import { trainingLogin, trainingCodeRateLimit, resolveTrainingCode } from '../modules/training/auth'

const router = Router()
// The shared legacy/Training authentication routes must not be usable via
// any of the three dedicated product frontends. Preserve the main site,
// training.eduk12.top and api.eduk12.top (including mobile/API consumers).
// Account realm checks remain the final authorization boundary.
const productHosts = new Map([
  ['school.eduk12.top', '校园版'],
  ['teacher.eduk12.top', '教师版'],
  ['survey.eduk12.top', '研究版'],
])
const localProductHosts = new Map([
  ['school.localhost', '校园版'],
  ['teacher.localhost', '教师版'],
  ['survey.localhost', '研究版'],
])
const legacyAuthDeniedProduct = (hostname: string): string | undefined => {
  const exact = hostname.toLowerCase().replace(/\.$/, '')
  return productHosts.get(exact)
    ?? (process.env.NODE_ENV === 'production' ? undefined : localProductHosts.get(exact))
}
router.use((req, res, next) => {
  // Inspect the wire Host, not X-Forwarded-Host supplied by a client.
  const host = String(req.headers.host ?? '').split(':')[0]
  const origin = req.get('Origin')
  let originHostname = ''
  if (origin) {
    try {
      const parsed = new URL(origin)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        originHostname = parsed.hostname
      }
    } catch { /* Invalid origins cannot match a product hostname. */ }
  }
  const denied = legacyAuthDeniedProduct(host) ?? legacyAuthDeniedProduct(originHostname)
  if (denied) return res.status(403).json({ code: -1, message: denied + '请使用独立账号入口' })
  next()
})

// 公开接口
router.post('/login', loginRateLimit, withLoginAccountFailureThrottle(authController.login))
router.post('/training-login', loginRateLimit, withLoginAccountFailureThrottle(trainingLogin))
router.post('/training-resolve-code', trainingCodeRateLimit, withRegistrationAdmission(resolveTrainingCode, false))
router.post('/register', registrationRateLimit, withRegistrationAdmission(authController.register))
router.post('/student-register', registrationRateLimit, withRegistrationAdmission(authController.studentRegister))
router.post('/verify-teacher-code', registrationRateLimit, withRegistrationAdmission(authController.verifyTeacherCode, false))
router.post('/teacher-register', registrationRateLimit, withRegistrationAdmission(authController.teacherRegister))

router.get('/csrf', (req, res) => {
  return res.json({ code: 0, message: '操作成功', data: { csrfToken: issueCsrfToken(req, res) } })
})

// 需要认证的接口
router.get('/me', authenticate, authController.me)
router.post('/change-password', authenticate, passwordChangeRateLimit, withPasswordChangeAdmission(authController.changePassword))
router.post('/logout', authenticate, authController.logout)

// 管理员专属接口 - 仅允许延期，不允许通过负 months 缩短有效期。
router.post('/extend-account', authenticate, requireAdmin, requirePositiveAccountExtension, authController.extendAccount)

export default router
