import { Router } from 'express'
import { cognitiveController } from './cognitive.controller'
import { authenticate, requireTeacher, requireRole } from '../../middleware/auth'
import { UserRole } from '../../types'

/**
 * Cognitive 路由（D3 起）。
 * 注意：特定路由必须在通用路由之前（镜像 routes/assignments.ts 约定）——
 * `/assignments/my` 必须先于 `/assignments/:id` 注册。
 */
const router = Router()

router.get('/configs', authenticate, requireTeacher, cognitiveController.listConfigs)

// 我的认知测评（学生分发列表，必须在 /:id 之前）
router.get('/assignments/my', authenticate, cognitiveController.myAssignments)
router.get('/history', authenticate, requireRole(UserRole.STUDENT), cognitiveController.myHistory)

// 教师端 Assignment 管理
router.post('/assignments', authenticate, requireTeacher, cognitiveController.createAssignment)
router.get('/assignments', authenticate, requireTeacher, cognitiveController.listAssignments)
router.get('/assignments/:id', authenticate, cognitiveController.getAssignment)
router.patch('/assignments/:id', authenticate, requireTeacher, cognitiveController.updateAssignment)
router.post('/assignments/:id/publish', authenticate, requireTeacher, cognitiveController.publishAssignment)
router.post('/assignments/:id/archive', authenticate, requireTeacher, cognitiveController.archiveAssignment)

// 单个认知任务公开链接（参与者不要求登录，恢复凭证只存哈希）
router.get('/assignments/:id/public-tokens', authenticate, requireTeacher, cognitiveController.listPublicTokens)
router.post('/assignments/:id/public-tokens', authenticate, requireTeacher, cognitiveController.createPublicToken)
router.delete('/assignments/:id/public-tokens/:tokenId', authenticate, requireTeacher, cognitiveController.disablePublicToken)

// 教师端数据导出（下载路径携带 assignmentId，控制器会再次校验归属）
router.get('/assignments/:id/export/files/:fileName', authenticate, requireTeacher, cognitiveController.downloadExportFile)
router.get('/assignments/:id/export/preview', authenticate, requireTeacher, cognitiveController.getExportPreview)
router.post('/assignments/:id/export', authenticate, requireTeacher, cognitiveController.exportData)

// D4 — Session / Attempt
router.post('/sessions', authenticate, requireRole(UserRole.STUDENT), cognitiveController.createSession)
router.get('/sessions/:id', authenticate, cognitiveController.getSession)
router.post('/sessions/:id/restart', authenticate, requireRole(UserRole.STUDENT), cognitiveController.restartSession)

// D5 — Append-only Trial
router.post('/sessions/:id/trials', authenticate, requireRole(UserRole.STUDENT), cognitiveController.appendTrial)

// D6 — Completion / Scoring
router.post('/sessions/:id/complete', authenticate, requireRole(UserRole.STUDENT), cognitiveController.completeSession)

export default router
