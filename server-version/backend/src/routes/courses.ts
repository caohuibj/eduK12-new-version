import { Router } from 'express'
import { courseController } from '../controllers/courseController'
import { authenticate, requireTeacher } from '../middleware/auth'
import multer from 'multer'

const router = Router()

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('只支持 JPG、PNG、WebP、GIF 格式的图片'))
    }
  }
})

// 公开接口
router.post('/verify-code', courseController.verifyCourseCode)

// 需要认证的接口
router.get('/', authenticate, courseController.list)
router.post('/', authenticate, requireTeacher, courseController.create)
router.get('/my', authenticate, courseController.myCourses)
router.get('/shared-to-me', authenticate, courseController.getSharedToMe)

// 动态路由（:id）放在静态路由之后
router.get('/:id', authenticate, courseController.detail)
router.put('/:id', authenticate, requireTeacher, courseController.update)
router.patch('/:id', authenticate, requireTeacher, courseController.update)
router.delete('/:id', authenticate, requireTeacher, courseController.delete)
router.post('/join', authenticate, courseController.join)

// 上传课程封面
router.post('/:id/cover', authenticate, requireTeacher, coverUpload.single('cover'), courseController.uploadCover)

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
router.put('/:courseId/students/:studentId/freeze', authenticate, requireTeacher, courseController.toggleFreezeStudent)

export default router
