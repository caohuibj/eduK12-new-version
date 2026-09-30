import { Router } from 'express'
import { courseController } from '../controllers/courseController'
import { courseStudentLifecycleController } from '../controllers/courseStudentLifecycleController'
import { authenticate, requireTeacher, requireStudent } from '../middleware/auth'
import { studentTaskList } from '../controllers/studentTaskController'
import multer from 'multer'
import { validateUploadedFile } from '../utils/fileValidator'
import { createRedisRateLimiter } from '../middleware/redisRateLimit'

const router = Router()

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  // Client MIME is only a hint; validateUploadedFile checks magic bytes.
  fileFilter: (_req, _file, cb) => cb(null, true),
})

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
router.post('/:id/cover', authenticate, requireTeacher, coverUpload.single('cover'), validateUploadedFile(allowedCoverTypes), courseController.uploadCover)

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

// 学生管理
router.get('/:id/students', authenticate, requireTeacher, courseController.getStudents)
router.post('/batch-students', authenticate, requireTeacher, courseController.getBatchStudents)
router.post('/:courseId/students/:studentId/reset-password', authenticate, requireTeacher, courseController.resetStudentPassword)
router.delete('/:courseId/students/:studentId', authenticate, requireTeacher, courseController.removeStudent)
// Freezing makes an account unusable, so route it through the Organization
// usable-admin invariant instead of the legacy direct user update.
router.put('/:courseId/students/:studentId/freeze', authenticate, requireTeacher, courseStudentLifecycleController.setFrozen)

export default router
