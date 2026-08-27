import { Router } from 'express'
import { compositeController } from './composite.controller'
import { authenticate, requireAdmin, requireRole, requireTeacher } from '../../middleware/auth'
import { UserRole } from '../../types'

const router = Router()

// 学生端（必须在 /:id 之前）
router.get('/available', authenticate, requireRole(UserRole.STUDENT), compositeController.available)
router.get('/attempts/:attemptId', authenticate, requireRole(UserRole.STUDENT), compositeController.getAttempt)
router.post('/attempts/:attemptId/context/freeze', authenticate, requireRole(UserRole.STUDENT), compositeController.freezeContext)
router.post('/attempts/:attemptId/save', authenticate, requireRole(UserRole.STUDENT), compositeController.saveAttempt)
router.post('/attempts/:attemptId/items/:itemId/scale/answer', authenticate, requireRole(UserRole.STUDENT), compositeController.saveScaleAnswer)
router.post('/attempts/:attemptId/items/:itemId/scale/complete', authenticate, requireRole(UserRole.STUDENT), compositeController.completeScale)
router.post('/attempts/:attemptId/items/:itemId/form-answer', authenticate, requireRole(UserRole.STUDENT), compositeController.saveFormAnswer)
router.get('/attempts/:attemptId/report', authenticate, requireRole(UserRole.STUDENT), compositeController.report)
router.get('/attempts/:attemptId/analysis-export', authenticate, requireRole(UserRole.STUDENT), compositeController.analysisExport)
router.get('/attempts/:attemptId/snapshots', authenticate, requireTeacher, compositeController.snapshots)
router.post('/attempts/:attemptId/reanalyze', authenticate, requireAdmin, compositeController.reanalyze)

// 教师端模板管理
router.get('/', authenticate, requireTeacher, compositeController.list)
router.post('/', authenticate, requireTeacher, compositeController.create)
router.get('/library', authenticate, requireTeacher, compositeController.library)
router.get('/report-packages', authenticate, requireTeacher, compositeController.reportPackages)
router.post('/:id/copy', authenticate, requireTeacher, compositeController.copy)
router.get('/:id', authenticate, requireTeacher, compositeController.detail)
router.patch('/:id', authenticate, requireTeacher, compositeController.update)
router.put('/:id/report-package', authenticate, requireTeacher, compositeController.setReportPackage)
router.post('/:id/items', authenticate, requireTeacher, compositeController.addItem)
router.delete('/:id/items/:itemId', authenticate, requireTeacher, compositeController.removeItem)
router.post('/:id/items/reorder', authenticate, requireTeacher, compositeController.reorderItems)
router.post('/:id/publish', authenticate, requireTeacher, compositeController.publish)
router.get('/:id/public-tokens', authenticate, requireTeacher, compositeController.listTokens)
router.post('/:id/public-tokens', authenticate, requireTeacher, compositeController.createToken)
router.delete('/:id/public-tokens/:tokenId', authenticate, requireTeacher, compositeController.disableToken)

// 教师导出（需再次校验模板归属）
router.get('/:id/export/preview', authenticate, requireTeacher, compositeController.exportPreview)
router.post('/:id/export', authenticate, requireTeacher, compositeController.exportData)
router.get('/:id/export/files/:fileName', authenticate, requireTeacher, compositeController.downloadExport)

// 教师结果名单 / 只读报告（必须用 :id 前缀，勿复用学生 /attempts/:attemptId/report）
router.get('/:id/attempts', authenticate, requireTeacher, compositeController.listAttempts)
router.get('/:id/attempts/:attemptId/report', authenticate, requireTeacher, compositeController.teacherReport)
router.get('/:id/attempts/:attemptId/analysis-export', authenticate, requireTeacher, compositeController.teacherAnalysisExport)

// 登录学生开始/继续某个已发布综合测评
router.post('/:id/attempts', authenticate, requireRole(UserRole.STUDENT), compositeController.startAttempt)

export default router
