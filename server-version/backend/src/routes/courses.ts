import { boundedUpload, uploadPrincipalRateLimit } from '../middleware/uploadAdmission'
import { Router } from 'express'
import { courseQuestionnaires } from '../controllers/courseQuestionnairesController'
import { courseController } from '../controllers/courseController'
import { courseStudentLifecycleController } from '../controllers/courseStudentLifecycleController'
import { authenticate, requireAdmin, requireTeacher, requireStudent } from '../middleware/auth'
import { studentTaskList } from '../controllers/studentTaskController'
import { createRedisRateLimiter } from '../middleware/redisRateLimit'

const router = Router()



const allowedCoverTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const courseCodeVerifyLimiter = createRedisRateLimiter({
  name: 'course-code-ip',
  limit: 60,
  windowSeconds: 15 * 60,
})
const courseCodeVerifyCodeLimiter = createRedisRateLimiter({
  name: 'course-code-value',
  limit: 20,
  windowSeconds: 15 * 60,
  key: (req) => typeof req.body?.courseCode === 'string' ? req.body.courseCode : 'invalid',
})

// 公开接口
router.post('/verify-code', courseCodeVerifyLimiter, courseCodeVerifyCodeLimiter, courseController.verifyCourseCode)

// 需要认证的接口
router.get('/', authenticate, courseController.list)
router.post('/', authenticate, requireTeacher, courseController.create)
router.get('/my', authenticate, courseController.myCourses)
router.get('/my/tasks', authenticate, requireStudent, studentTaskList)
router.get('/shared-to-me', authenticate, courseController.getSharedToMe)

// 动态路由（:id）放在静态路由之后
router.get('/:id', authenticate, courseController.detail)
router.put('/:id', authenticate, requireTeacher, courseController.update)
router.patch('/:id', authenticate, requireTeacher, courseController.update)
router.post('/:id/rotate-code', authenticate, requireTeacher, courseController.rotateCourseCode)
router.delete('/:id', authenticate, requireTeacher, courseController.delete)
router.post('/join', authenticate, courseController.join)

// 上传课程封面
router.post('/:id/cover', authenticate, requireTeacher, uploadPrincipalRateLimit, boundedUpload('cover', 5 * 1024 * 1024, allowedCoverTypes, courseController.uploadCover))

// 结束课程
router.post('/:id/end', authenticate, requireTeacher, courseController.endCourse)

// 停止招募
router.post('/:id/stop-recruiting', authenticate, requireTeacher, courseController.stopRecruiting)

// 恢复招募
router.post('/:id/resume-recruiting', authenticate, requireTeacher, courseController.resumeRecruiting)

// 复制课程
router.post('/:id/clone', authenticate, requireTeacher, courseController.cloneCourse)

// 课程分享相关
router.post('/:id/share', authenticate, courseController.shareCourse)
router.delete('/share/:shareId', authenticate, courseController.removeShare)
router.post('/share/:shareId/clone', authenticate, courseController.cloneFromShare)

// 课程作业和打卡（学生可访问）
router.get('/:id/assignments', authenticate, courseController.getAssignments)
router.get('/:id/checkins', authenticate, courseController.getCheckins)
router.get('/:id/questionnaires', authenticate, requireTeacher, courseQuestionnaires)

// 学生管理
router.get('/:id/students', authenticate, requireTeacher, courseController.getStudents)
router.post('/batch-students', authenticate, requireTeacher, courseController.getBatchStudents)
router.post('/:courseId/students/:studentId/reset-password', authenticate, requireAdmin, courseController.resetStudentPassword)
router.delete('/:courseId/students/:studentId', authenticate, requireTeacher, courseController.removeStudent)
// Freezing makes an account unusable, so route it through the Organization
// usable-admin invariant instead of the legacy direct user update.
router.put('/:courseId/students/:studentId/freeze', authenticate, requireAdmin, courseStudentLifecycleController.setFrozen)

export default router
