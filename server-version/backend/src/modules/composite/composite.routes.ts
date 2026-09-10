import { Router } from 'express'
import { compositeController } from './composite.controller'
import { compositeImageController } from './composite-image.controller'
import { compositeVideoController } from './composite-video.controller'
import { situationalVideoController } from '../situational/situational-video.controller'
import { authenticate, requireAdmin, requireRole, requireTeacher } from '../../middleware/auth'
import { UserRole } from '../../types'
import { legacyWriteDisabled } from '../../middleware/instrumentFinalOnly'

const router = Router()

// 学生端（必须在 /:id 之前）
router.get('/available', authenticate, requireRole(UserRole.STUDENT), compositeController.available)
router.get('/attempts/:attemptId', authenticate, requireRole(UserRole.STUDENT), compositeController.getAttempt)
router.get('/attempts/:attemptId/form-sections/:sectionId/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeImageController.authenticatedFormImage)
router.get('/attempts/:attemptId/items/:itemId/scale/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeImageController.authenticatedScaleImage)
router.post('/attempts/:attemptId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability', authenticate, requireRole(UserRole.STUDENT), compositeVideoController.authenticatedFormVideo)
router.post('/attempts/:attemptId/items/:itemId/scale/items/:itemCode/video-capability', authenticate, requireRole(UserRole.STUDENT), compositeVideoController.authenticatedScaleVideo)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId', authenticate, requireRole(UserRole.STUDENT), compositeController.getEmbeddedSituational)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/assets/:assetId/content', authenticate, requireRole(UserRole.STUDENT), compositeController.embeddedSituationalAsset)
router.get('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/scenes/:sceneKey/video-sources', authenticate, requireRole(UserRole.STUDENT), situationalVideoController.embeddedAuthenticated)
router.post('/attempts/:attemptId/restart', authenticate, requireRole(UserRole.STUDENT), compositeController.restartAttempt)
router.post('/attempts/:attemptId/context/freeze', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/form-sections/:sectionId/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitFinalFormSection)
router.post('/attempts/:attemptId/items/:itemId/scale/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitFinalScale)
router.post('/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit', authenticate, requireRole(UserRole.STUDENT), compositeController.submitEmbeddedSituational)
router.post('/attempts/:attemptId/save', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/answer', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/scale/complete', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
router.post('/attempts/:attemptId/items/:itemId/form-answer', authenticate, requireRole(UserRole.STUDENT), legacyWriteDisabled)
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
router.get('/:id/content', authenticate, requireTeacher, compositeController.listContent)
router.post('/:id/content/reorder', authenticate, requireTeacher, compositeController.reorderContent)
router.get('/:id/form-sections', authenticate, requireTeacher, compositeController.listFormSections)
router.get('/:id/form-items', authenticate, requireTeacher, compositeController.listFormItems)
router.post('/:id/form-sections', authenticate, requireTeacher, compositeController.createFormSection)
router.put('/:id/form-sections/:sectionId', authenticate, requireTeacher, compositeController.updateFormSection)
router.post('/:id/form-sections/reorder', authenticate, requireTeacher, compositeController.reorderFormSections)
router.post('/:id/form-sections/:sectionId/items/reorder', authenticate, requireTeacher, compositeController.reorderFormSectionItems)
router.post('/:id/form-sections/:sectionId/items/:itemId', authenticate, requireTeacher, compositeController.assignFormItemToSection)
router.delete('/:id/items/:itemId', authenticate, requireTeacher, compositeController.removeItem)
router.post('/:id/items/reorder', authenticate, requireTeacher, compositeController.reorderItems)
router.post('/:id/publish', authenticate, requireTeacher, compositeImageController.publish)
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
