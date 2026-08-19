import { Router } from 'express'
import { cognitiveController } from './cognitive.controller'
import { authenticate, requireTeacher } from '../../middleware/auth'

/**
 * Cognitive 路由（D3 起）。
 * 注意：特定路由必须在通用路由之前（镜像 routes/assignments.ts 约定）——
 * `/assignments/my` 必须先于 `/assignments/:id` 注册。
 */
const router = Router()

// 我的认知测评（学生分发列表，必须在 /:id 之前）
router.get('/assignments/my', authenticate, cognitiveController.myAssignments)

// 教师端 Assignment 管理
router.post('/assignments', authenticate, requireTeacher, cognitiveController.createAssignment)
router.get('/assignments', authenticate, requireTeacher, cognitiveController.listAssignments)
router.get('/assignments/:id', authenticate, cognitiveController.getAssignment)
router.patch('/assignments/:id', authenticate, requireTeacher, cognitiveController.updateAssignment)
router.post('/assignments/:id/publish', authenticate, requireTeacher, cognitiveController.publishAssignment)
router.post('/assignments/:id/archive', authenticate, requireTeacher, cognitiveController.archiveAssignment)

export default router
