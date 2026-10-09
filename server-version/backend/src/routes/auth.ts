import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../middleware/passwordChangeAdmission'
import { Router } from 'express'
import { authController } from '../controllers/authController'
import { authenticate, requireAdmin } from '../middleware/auth'
import { issueCsrfToken } from '../utils/authCookies'
import { loginRateLimit, withLoginAccountFailureThrottle } from '../middleware/loginRateLimit'
import { requirePositiveAccountExtension } from '../middleware/accountExtensionValidation'
import { registrationRateLimit, withRegistrationAdmission } from '../middleware/registrationAdmission'

const router = Router()
// A school-origin browser must not create legacy training sessions on the
// Huischool hostname. Product authority still comes from accountDomain/JWT.
router.use((req,res,next)=>{
  const host=String(req.headers.host??'').split(':')[0].toLowerCase()
  const origin=String(req.headers.origin??'').toLowerCase()
  if(host==='school.eduk12.top'||origin==='https://school.eduk12.top') {
    return res.status(403).json({code:-1,message:'校园版请使用独立账号入口'})
  }
  next()
})

// 公开接口
router.post('/login', loginRateLimit, withLoginAccountFailureThrottle(authController.login))
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
