/**
 * 泛化问卷管理路由（教师端）
 */

import { Router } from 'express'
import { generalQuestionnaireController } from '../controllers/generalQuestionnaireController'
import { generalQuestionnaireImageController } from '../controllers/generalQuestionnaireImageController'
import { authenticate, requireTeacher } from '../middleware/auth'

const router = Router()

// 所有路由需要教师/管理员权限
router.use(authenticate)
router.use(requireTeacher)

// 问卷管理
router.get('/', generalQuestionnaireController.list)
router.post('/', generalQuestionnaireController.create)
router.get('/:id', generalQuestionnaireController.detail)
router.put('/:id', generalQuestionnaireController.update)
router.get('/:id/scales', generalQuestionnaireController.listScales)
router.post('/:id/scales', generalQuestionnaireController.addScale)
router.delete('/:id/scales/:scaleId', generalQuestionnaireController.removeScale)
router.post('/:id/publish', generalQuestionnaireImageController.publish)
router.post('/:id/deprecate', generalQuestionnaireController.deprecate)
router.post('/:id/duplicate', generalQuestionnaireController.duplicate)

// ==================== 表单题目管理 ====================

// 获取表单题目列表
router.get('/:id/form-items', generalQuestionnaireController.listFormItems)

// 添加表单题目
router.post('/:id/form-items', generalQuestionnaireController.addFormItem)

// 更新表单题目
router.put('/:id/form-items/:itemId', generalQuestionnaireController.updateFormItem)

// 删除表单题目
router.delete('/:id/form-items/:itemId', generalQuestionnaireController.removeFormItem)

// 统一排序（表单题目和量表混合排序）
router.get('/:id/content', generalQuestionnaireController.listContent)
router.post('/:id/content/reorder', generalQuestionnaireController.reorderContent)

// 表单区段管理
router.get('/:id/form-sections', generalQuestionnaireController.listFormSections)
router.post('/:id/form-sections', generalQuestionnaireController.createFormSection)
router.put('/:id/form-sections/:sectionId', generalQuestionnaireController.updateFormSection)
router.post('/:id/form-sections/reorder', generalQuestionnaireController.reorderFormSections)
router.post('/:id/form-sections/:sectionId/items/reorder', generalQuestionnaireController.reorderFormSectionItems)
router.post('/:id/form-sections/:sectionId/items/:itemId', generalQuestionnaireController.assignFormItemToSection)

// 访问令牌管理
router.get('/:id/tokens', generalQuestionnaireController.listTokens)
router.post('/:id/tokens', generalQuestionnaireController.createToken)
router.delete('/:id/tokens/:tokenId', generalQuestionnaireController.disableToken)

// 数据管理
router.get('/:id/anonymous-assessments', generalQuestionnaireController.getAnonymousAssessments)
router.get('/:id/export', generalQuestionnaireController.exportData)

export default router
