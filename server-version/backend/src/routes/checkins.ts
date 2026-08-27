import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { UserRole } from '../types'
import { checkinController, submissionImageUpload } from '../controllers/checkinController'
import { authenticate, requireRole, requireTeacher } from '../middleware/auth'

const router = Router()

const publicUploadIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const publicUploadTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = req.params.token
    return typeof token === 'string' && /^ck_[a-z0-9]{16}$/.test(token)
      ? `checkin-token:${token}`
      : 'checkin-token:invalid'
  },
})

// ==================== 公开路由（无需登录）====================
// 公开获取打卡详情（通过令牌）
router.get('/public/:token', checkinController.getPublicCheckin)

// 公开上传图片（通过令牌）
router.post('/public/:token/upload', publicUploadIpLimiter, publicUploadTokenLimiter, checkinController.uploadPublicImage)

// 公开提交打卡（通过令牌）
router.post('/public/:token/submit', checkinController.submitPublicCheckin)

// ==================== 需要登录的路由 ====================
// 注意：特定路由必须在通用路由之前
// 我的打卡（必须在 /:id 之前）
router.get('/my', authenticate, checkinController.myCheckins)

// 打卡标签（必须在 /:id 之前）
router.get('/tags', authenticate, checkinController.getTags)

router.get('/', authenticate, checkinController.list)
router.post('/', authenticate, requireTeacher, checkinController.create)

// 特定路由必须在 /:id 之前
router.get('/:id/my-submission', authenticate, requireRole(UserRole.STUDENT), checkinController.mySubmission)
router.post(
  '/:id/submission-image',
  authenticate,
  requireRole(UserRole.STUDENT),
  submissionImageUpload.single('image'),
  checkinController.uploadStudentSubmissionImage,
)
router.post('/:id/submit', authenticate, requireRole(UserRole.STUDENT), checkinController.submit)
router.get('/:id/export', authenticate, requireTeacher, checkinController.export)
router.get('/:id/submissions', authenticate, requireTeacher, checkinController.submissions)
router.get('/:id/others-submissions', authenticate, requireRole(UserRole.STUDENT), checkinController.othersSubmissions)

// 匿名打卡相关路由
router.post('/:id/tokens', authenticate, requireTeacher, checkinController.createAccessToken)
router.get('/:id/tokens', authenticate, requireTeacher, checkinController.getAccessTokens)
router.put('/:id/allow-anonymous', authenticate, requireTeacher, checkinController.toggleAllowAnonymous)

// 删除令牌路由（单独的路由，避免冲突）
router.delete('/tokens/:tokenId', authenticate, requireTeacher, checkinController.deleteAccessToken)

// 通用路由放在最后
router.get('/:id', authenticate, checkinController.detail)
router.put('/:id', authenticate, requireTeacher, checkinController.update)
router.delete('/:id', authenticate, requireTeacher, checkinController.delete)

export default router
