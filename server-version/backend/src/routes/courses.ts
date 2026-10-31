import { trainingAnalysisController } from '../controllers/trainingAnalysisController'
import { assessmentExportHttp } from '../services/assessmentExportHttp'
import { boundedUpload, uploadPrincipalRateLimit } from '../middleware/uploadAdmission'
import { Router } from 'express'
import { prisma } from '../config/database'
import { notFound } from '../utils/response'
import { courseQuestionnaires } from '../controllers/courseQuestionnairesController'
import { courseTrainingAssessments } from '../controllers/courseTrainingAssessmentsController'
import { courseController } from '../controllers/courseController'
import { courseStudentLifecycleController } from '../controllers/courseStudentLifecycleController'
import { authenticate, requireAdmin, requireTeacher, requireStudent } from '../middleware/auth'
import { trainingTeachingOverview } from '../controllers/trainingTeachingController'
import { trainingLearningInbox } from '../controllers/trainingLearningController'
import { studentTaskList } from '../controllers/studentTaskController'
import { createRedisRateLimiter } from '../middleware/redisRateLimit'

const router = Router()

// All /:id and /:courseId training endpoints, including mutations and
// incidental detail/read routes, reject CAMPUS_ACTIVITY before controllers.
// Legacy student enrollments never authorize Activity access.
const rejectCampusCourse = async (req: import('express').Request,
  res: import('express').Response, next: import('express').NextFunction, id: string) => {
  try {
    const course=await prisma.course.findUnique({where:{id},select:{courseType:true}})
    if (course?.courseType==='CAMPUS_ACTIVITY') return notFound(res,'课程不存在')
    next()
  } catch (err) { next(err) }
}
router.param('id',rejectCampusCourse)
router.param('courseId',rejectCampusCourse)



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
router.get('/my/learning-inbox', authenticate, requireStudent, trainingLearningInbox)
router.get('/my/teaching-overview', authenticate, requireTeacher, trainingTeachingOverview)
router.get('/shared-to-me', authenticate, courseController.getSharedToMe)

// 动态路由（:id）放在静态路由之后
router.get('/:id', authenticate, courseController.detail)
router.put('/:id', authenticate, requireTeacher, courseController.update)
router.patch('/:id', authenticate, requireTeacher, courseController.update)
router.post('/:id/rotate-code', authenticate, requireTeacher, courseController.rotateCourseCode)
router.delete('/:id', authenticate, requireTeacher, courseController.delete)
router.post('/join', authenticate, requireStudent, courseController.join)

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
router.get('/:id/training-assessments', authenticate, requireTeacher, courseTrainingAssessments)

// Analysis has its own source-level authorization; course shares never grant raw data.
router.get('/:id/training-group-longitudinal/:taskId',authenticate,requireTeacher,trainingAnalysisController.groupLongCatalog)
router.post('/:id/training-group-longitudinal/:taskId',authenticate,requireTeacher,trainingAnalysisController.groupLongGenerate)
router.get('/:id/training-group-longitudinal/:taskId/:artifactId',authenticate,requireTeacher,trainingAnalysisController.groupLongRead)
router.get('/:id/training-group-reports', authenticate, requireTeacher, trainingAnalysisController.groupIndex)
router.get('/:id/training-group-reports/sources/:taskId', authenticate, requireTeacher, trainingAnalysisController.groupTools)
router.post('/:id/training-group-reports', authenticate, requireTeacher, trainingAnalysisController.groupGenerate)
router.get('/:id/training-group-reports/:taskId/:artifactId', authenticate, requireTeacher, trainingAnalysisController.groupRead)
router.get('/:id/training-analysis/sources', authenticate, requireTeacher, trainingAnalysisController.sources)
router.post('/:id/training-analysis', authenticate, requireTeacher, trainingAnalysisController.analyze)
router.post('/:id/training-analysis/quality/list', authenticate, requireTeacher, trainingAnalysisController.qualityList)
router.post('/:id/training-analysis/quality', authenticate, requireTeacher, trainingAnalysisController.quality)
router.post('/:id/training-analysis/exports', authenticate, requireTeacher, trainingAnalysisController.exports)
router.get('/:id/training-analysis/export/artifacts/:artifactId/status', authenticate, requireTeacher, assessmentExportHttp('TRAINING_ANALYSIS', true))
router.get('/:id/training-analysis/export/artifacts/:artifactId', authenticate, requireTeacher, assessmentExportHttp('TRAINING_ANALYSIS', false))

// 学生管理
router.get('/:id/students', authenticate, requireTeacher, courseController.getStudents)
router.post('/batch-students', authenticate, requireTeacher, courseController.getBatchStudents)
// Teacher reset is limited to an owned active enrollment by the service;
// global account freeze remains SYSTEM_ADMIN-only. Share the platform reset
// rate budget, and add a per-target fuse to limit repeated resets.
const platformResetRateLimit = createRedisRateLimiter({
  name: 'platform_password_reset',
  limit: 10,
  windowSeconds: 900,
  key: req => req.user!.userId,
})
const courseResetTargetRateLimit = createRedisRateLimiter({
  name: 'course_password_reset_target',
  limit: 4,
  windowSeconds: 60 * 60,
  key: req => req.params.studentId || 'invalid',
})
router.post(
  '/:courseId/students/:studentId/reset-password',
  authenticate,
  requireTeacher,
  platformResetRateLimit,
  courseResetTargetRateLimit,
  courseController.resetStudentPassword,
)
router.delete('/:courseId/students/:studentId', authenticate, requireTeacher, courseController.removeStudent)
// Freezing makes an account unusable, so route it through the Organization
// usable-admin invariant instead of the legacy direct user update.
router.put('/:courseId/students/:studentId/freeze', authenticate, requireAdmin, courseStudentLifecycleController.setFrozen)

export default router
