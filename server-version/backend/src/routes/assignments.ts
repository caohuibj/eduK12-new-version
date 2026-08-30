import { Router } from 'express'
import { UserRole } from '../types'
import { assignmentController } from '../controllers/assignmentController'
import { authenticate, requireRole, requireTeacher } from '../middleware/auth'
import { createRedisRateLimiter } from '../middleware/redisRateLimit'

const router = Router()

// A keyed submission creates both a mutable row and an immutable receipt.
// Bound the write rate per authenticated student before it reaches Prisma.
const studentSubmissionLimiter = createRedisRateLimiter({
  name: 'student-submissions',
  limit: 60,
  windowSeconds: 15 * 60,
  key: (req) => `student:${req.user?.userId || 'unknown'}`,
})

// 注意：特定路由必须在通用路由之前
// 我的作业（必须在 /:id 之前）
router.get('/my', authenticate, assignmentController.myAssignments)

// 作业标签（必须在 /:id 之前）
router.get('/tags', authenticate, assignmentController.getTags)

// 作业列表和详情
router.get('/', authenticate, assignmentController.list)
router.post('/', authenticate, requireTeacher, assignmentController.create)
router.get('/:id', authenticate, assignmentController.detail)
router.put('/:id', authenticate, requireTeacher, assignmentController.update)
router.delete('/:id', authenticate, requireTeacher, assignmentController.delete)

// 提交相关
router.post('/:id/submit', authenticate, requireRole(UserRole.STUDENT), studentSubmissionLimiter, assignmentController.submit)
router.get('/:id/my-submission', authenticate, requireRole(UserRole.STUDENT), assignmentController.mySubmission)
router.get('/:id/submissions', authenticate, requireTeacher, assignmentController.submissions)

// 批改
router.post('/:id/submissions/:submissionId/grade', authenticate, requireTeacher, assignmentController.grade)
router.post('/:id/batch-grade', authenticate, requireTeacher, assignmentController.batchGrade)

// 导出
router.get('/:id/export', authenticate, requireTeacher, assignmentController.export)

export default router
