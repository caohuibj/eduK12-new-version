import { Router } from 'express'
import { questionnaireController } from '../controllers/questionnaireController'
import { authenticate, requireTeacher } from '../middleware/auth'
import { legacyWriteDisabled } from '../middleware/instrumentFinalOnly'

const router = Router()

// ==================== 学生端接口（需要登录） ====================

// 学生获取可用问卷列表
router.get('/available', authenticate, questionnaireController.available)

// 获取问卷测评状态（必须在 /:id 之前）
router.get('/assessments/:id', authenticate, questionnaireController.getAssessment)
router.post('/assessments/:id/restart', authenticate, questionnaireController.restartAssessment)
router.post('/assessments/:id/context/freeze', authenticate, legacyWriteDisabled)

router.post('/assessments/:assessmentId/form-sections/:sectionId/submit', authenticate, questionnaireController.submitFinalFormSection)
router.post('/assessments/:assessmentId/scales/:scaleAssessmentId/submit', authenticate, questionnaireController.submitFinalScale)

// 完成问卷测评 (O4 load-once dispatch inside the controller: UNIFIED_V1 ->
// unified finalizer with the preloaded parent; legacy attempts keep 410)
router.post('/assessments/:id/complete', authenticate, questionnaireController.completeAssessment)

// 获取聚合报告
router.get('/assessments/:id/report', authenticate, questionnaireController.getReport)

// 下载导出文件（必须在 /:id 之前）
router.get('/exports/:artifactId', authenticate, questionnaireController.downloadExportFile)
router.get('/exports/:artifactId/status', authenticate, questionnaireController.exportArtifactStatus)

// 获取问卷详情
router.get('/:id', authenticate, questionnaireController.detail)

// 开始问卷测评
router.post('/:id/assessments', authenticate, questionnaireController.startAssessment)

// ==================== 表单答案 ====================

// 保存单个表单答案
router.post('/assessments/:assessmentId/form-answers', authenticate, legacyWriteDisabled)

// 批量保存表单答案
router.patch('/assessments/:assessmentId/form-answers/batch', authenticate, legacyWriteDisabled)
router.post('/assessments/:assessmentId/form-answers/batch', authenticate, legacyWriteDisabled)

// ==================== 管理端接口（教师和管理员） ====================

// 获取问卷列表
router.get('/', authenticate, requireTeacher, questionnaireController.list)

// 创建问卷
router.post('/', authenticate, requireTeacher, questionnaireController.create)

// 更新问卷
router.put('/:id', authenticate, requireTeacher, questionnaireController.update)

// 删除问卷
router.delete('/:id', authenticate, requireTeacher, questionnaireController.delete)

// 发布问卷
router.post('/:id/publish', authenticate, requireTeacher, questionnaireController.publish)

// 废弃问卷
router.post('/:id/deprecate', authenticate, requireTeacher, questionnaireController.deprecate)

// 复制问卷
router.post('/:id/duplicate', authenticate, requireTeacher, questionnaireController.duplicate)

// ==================== 数据导出 ====================

// 获取导出预览
router.get('/:id/export/preview', authenticate, requireTeacher, questionnaireController.getExportPreview)

// 导出数据
router.post('/:id/export', authenticate, requireTeacher, questionnaireController.exportData)

// ==================== 量表关联管理 ====================

// 获取关联的量表列表
router.get('/:id/scales', authenticate, requireTeacher, questionnaireController.listScales)

// 添加量表
router.post('/:id/scales', authenticate, requireTeacher, questionnaireController.addScale)

// 移除量表
router.delete('/:id/scales/:scaleId', authenticate, requireTeacher, questionnaireController.removeScale)

// 量表排序
router.post('/:id/scales/reorder', authenticate, requireTeacher, questionnaireController.reorderScales)

// ==================== 表单题目管理 ====================

// 获取表单题目列表
router.get('/:id/form-items', authenticate, requireTeacher, questionnaireController.listFormItems)
router.get('/:id/form-sections', authenticate, requireTeacher, questionnaireController.listFormSections)
router.post('/:id/form-sections', authenticate, requireTeacher, questionnaireController.createFormSection)
router.put('/:id/form-sections/:sectionId', authenticate, requireTeacher, questionnaireController.updateFormSection)
router.post('/:id/form-sections/reorder', authenticate, requireTeacher, questionnaireController.reorderFormSections)
router.post('/:id/form-sections/:sectionId/items/reorder', authenticate, requireTeacher, questionnaireController.reorderFormSectionItems)
router.post('/:id/form-sections/:sectionId/items/:itemId', authenticate, requireTeacher, questionnaireController.assignFormItemToSection)

// 获取问卷所有内容项（表单题目和量表混合列表）
router.get('/:id/content', authenticate, requireTeacher, questionnaireController.listContent)

// 添加表单题目
router.post('/:id/form-items', authenticate, requireTeacher, questionnaireController.addFormItem)

// 更新表单题目
router.put('/:id/form-items/:itemId', authenticate, requireTeacher, questionnaireController.updateFormItem)

// 删除表单题目
router.delete('/:id/form-items/:itemId', authenticate, requireTeacher, questionnaireController.removeFormItem)

// 统一排序（表单题目和量表混合排序）
router.post('/:id/content/reorder', authenticate, requireTeacher, questionnaireController.reorderContent)

// ==================== 课程关联管理 ====================

// 获取关联的课程列表
router.get('/:id/courses', authenticate, requireTeacher, questionnaireController.listCourses)

// 添加课程关联
router.post('/:id/courses', authenticate, requireTeacher, questionnaireController.addCourses)

// 移除课程关联
router.delete('/:id/courses/:courseId', authenticate, requireTeacher, questionnaireController.removeCourse)

export default router
