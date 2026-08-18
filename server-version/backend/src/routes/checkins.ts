import { Router } from 'express'
import { checkinController } from '../controllers/checkinController'
import { authenticate, requireTeacher } from '../middleware/auth'

const router = Router()

// ==================== 公开路由（无需登录）====================
// 公开获取打卡详情（通过令牌）
router.get('/public/:token', checkinController.getPublicCheckin)

// 公开上传图片（通过令牌）
router.post('/public/:token/upload', checkinController.uploadPublicImage)

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
router.get('/:id/my-submission', authenticate, checkinController.mySubmission)
router.post('/:id/submit', authenticate, checkinController.submit)
router.get('/:id/export', authenticate, requireTeacher, checkinController.export)
router.get('/:id/submissions', authenticate, requireTeacher, checkinController.submissions)
router.get('/:id/others-submissions', authenticate, checkinController.othersSubmissions)

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
