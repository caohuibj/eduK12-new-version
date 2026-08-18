import { Router } from 'express'
import { scaleController } from '../controllers/scaleController'
import { authenticate, requireTeacher } from '../middleware/auth'

const router = Router()

// ==================== 导出文件下载（放在最前面避免路由冲突） ====================

// 下载导出文件
router.get('/exports/:fileName', authenticate, scaleController.downloadExportFile)

// ==================== 公开接口（需要登录） ====================

// 学生获取可用量表列表
router.get('/available', authenticate, scaleController.available)

// 获取我的测评历史
router.get('/assessments/my', authenticate, scaleController.listMyAssessments)

// 获取量表标签列表（必须在 /:id 之前）
router.get('/tags', authenticate, scaleController.getTags)

// 获取量表详情（所有登录用户可访问）
router.get('/:id', authenticate, scaleController.detail)

// ==================== 测评流程（学生） ====================

// 开始测评
router.post('/:scaleId/assessments', authenticate, scaleController.startAssessment)

// 提交答案
router.patch('/assessments/:assessmentId/answers', authenticate, scaleController.submitAnswer)

// 完成测评
router.post('/assessments/:assessmentId/complete', authenticate, scaleController.completeAssessment)

// 获取测评结果
router.get('/assessments/:assessmentId', authenticate, scaleController.getAssessment)

// ==================== 管理端接口（教师和管理员） ====================

// 获取量表列表
router.get('/', authenticate, requireTeacher, scaleController.list)

// 创建量表
router.post('/', authenticate, requireTeacher, scaleController.create)

// 更新量表
router.put('/:id', authenticate, requireTeacher, scaleController.update)

// 删除量表
router.delete('/:id', authenticate, requireTeacher, scaleController.delete)

// 发布量表
router.post('/:id/publish', authenticate, requireTeacher, scaleController.publish)

// 废弃量表
router.post('/:id/deprecate', authenticate, requireTeacher, scaleController.deprecate)

// 归档量表
router.post('/:id/archive', authenticate, requireTeacher, scaleController.archive)

// 获取量表的所有测评记录
router.get('/:scaleId/assessments', authenticate, requireTeacher, scaleController.listScaleAssessments)

// ==================== 维度管理 ====================

// 获取维度列表
router.get('/:scaleId/dimensions', authenticate, requireTeacher, scaleController.listDimensions)

// 创建维度
router.post('/:scaleId/dimensions', authenticate, requireTeacher, scaleController.createDimension)

// 更新维度
router.put('/:scaleId/dimensions/:dimensionId', authenticate, requireTeacher, scaleController.updateDimension)

// 删除维度
router.delete('/:scaleId/dimensions/:dimensionId', authenticate, requireTeacher, scaleController.deleteDimension)

// 获取维度反馈配置
router.get('/:scaleId/dimensions/:dimensionId/feedback', authenticate, requireTeacher, scaleController.getDimensionFeedback)

// 更新维度反馈配置
router.put('/:scaleId/dimensions/:dimensionId/feedback', authenticate, requireTeacher, scaleController.updateDimensionFeedback)

// ==================== 题目管理 ====================

// 获取题目列表
router.get('/:scaleId/items', authenticate, requireTeacher, scaleController.listItems)

// 创建题目
router.post('/:scaleId/items', authenticate, requireTeacher, scaleController.createItem)

// 更新题目
router.put('/:scaleId/items/:itemId', authenticate, requireTeacher, scaleController.updateItem)

// 删除题目
router.delete('/:scaleId/items/:itemId', authenticate, requireTeacher, scaleController.deleteItem)

// 批量排序题目
router.post('/:scaleId/items/reorder', authenticate, requireTeacher, scaleController.reorderItems)

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
