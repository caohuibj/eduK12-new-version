import { Router } from 'express'
import { scaleController } from '../controllers/scaleController'
import { authenticate, requireStudent, requireTeacher } from '../middleware/auth'

const router = Router()

// ==================== 导出文件下载（放在最前面避免路由冲突） ====================

// 下载导出文件
router.get('/exports/:artifactId', authenticate, scaleController.downloadExportFile)

// ==================== 公开接口（需要登录） ====================

// 学生获取可用量表列表
router.get('/available', authenticate, scaleController.available)

// 获取我的测评历史
router.get('/assessments/my', authenticate, scaleController.listMyAssessments)

// 获取量表标签列表（必须在 /:id 之前）
router.get('/tags', authenticate, scaleController.getTags)

// ==================== 测评流程（学生） ====================

// 开始测评：Scale Assessment v2 是唯一运行入口。
router.post('/:scaleId/assessments', authenticate, requireStudent, scaleController.startAssessmentV2)

// 提交答案
router.patch('/assessments/:assessmentId/answers', authenticate, requireStudent, scaleController.submitAnswerV2)

// 完成测评
router.post('/assessments/:assessmentId/complete', authenticate, requireStudent, scaleController.completeAssessmentV2)

// 获取测评结果
router.get('/assessments/:assessmentId', authenticate, requireStudent, scaleController.getAssessmentV2)

// 获取量表详情（所有登录用户可访问）
// Keep this after the two-segment assessment routes so /assessments/:id
// cannot be captured as a scale id.
router.get('/:id', authenticate, scaleController.detail)

// ==================== 管理端接口（教师和管理员） ====================

// 获取量表列表
router.get('/', authenticate, requireTeacher, scaleController.list)

// 创建量表
router.post('/', authenticate, requireTeacher, scaleController.create)

// 更新量表
router.put('/:id', authenticate, requireTeacher, scaleController.update)

// v2 聚合 definition 管理
router.put('/:id/definition', authenticate, requireTeacher, scaleController.updateDefinition)
router.post('/:id/validate', authenticate, requireTeacher, scaleController.validateDefinition)
router.post('/:id/preview', authenticate, requireTeacher, scaleController.previewDefinition)

// 删除量表
router.delete('/:id', authenticate, requireTeacher, scaleController.delete)

// 发布量表：重新执行 v2 release gate。
router.post('/:id/publish', authenticate, requireTeacher, scaleController.publishV2)

// 废弃量表
router.post('/:id/deprecate', authenticate, requireTeacher, scaleController.deprecate)

// 归档量表
router.post('/:id/archive', authenticate, requireTeacher, scaleController.archive)

// 获取量表的所有测评记录
router.get('/:scaleId/assessments', authenticate, requireTeacher, scaleController.listScaleAssessments)

// ==================== 课程关联管理 ====================

// 获取关联的课程列表
router.get('/:scaleId/courses', authenticate, requireTeacher, scaleController.listCourseScales)

// 添加课程关联
router.post('/:scaleId/courses', authenticate, requireTeacher, scaleController.addCourseScale)

// 删除课程关联
router.delete('/:scaleId/courses/:courseId', authenticate, requireTeacher, scaleController.removeCourseScale)

// ==================== 数据导出 ====================

// 获取导出预览
router.get('/:scaleId/export/preview', authenticate, requireTeacher, scaleController.getExportPreview)

// 导出量表数据
router.post('/:scaleId/export', authenticate, requireTeacher, scaleController.exportScaleData)

export default router
