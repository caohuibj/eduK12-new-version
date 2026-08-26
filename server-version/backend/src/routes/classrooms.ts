import { Router } from 'express'
import { classroomController } from '../controllers/classroomController'
import { authenticate, requireTeacher } from '../middleware/auth'
import { requireClassroomManager } from '../middleware/classroomAccess'

const router = Router()

// ==================== 公开接口 ====================

// 通过课堂码获取课堂信息（学生扫码使用，支持临时学生）
router.get('/code/:code', classroomController.getByCode)

// ==================== 教师和管理员接口 ====================

// 获取课堂列表
router.get('/', authenticate, requireTeacher, classroomController.list)

// 创建课堂
router.post('/', authenticate, requireTeacher, classroomController.create)

// 获取课堂详情
router.get('/:id', authenticate, requireClassroomManager(), classroomController.detail)

// 更新课堂
router.put('/:id', authenticate, requireTeacher, requireClassroomManager(), classroomController.update)

// 删除课堂
router.delete('/:id', authenticate, requireTeacher, requireClassroomManager(), classroomController.delete)

// 生成课堂二维码
router.get('/:id/qrcode', authenticate, requireClassroomManager(), classroomController.getQRCode)

// 复制课堂（复用题目）
router.post('/:id/duplicate', authenticate, requireTeacher, requireClassroomManager(), classroomController.duplicate)

// ==================== 题目管理 ====================

// 获取题目列表
router.get('/:id/questions', authenticate, requireClassroomManager(), classroomController.listQuestions)

// 创建题目
router.post('/:id/questions', authenticate, requireTeacher, requireClassroomManager(), classroomController.createQuestion)

// 更新题目
router.put('/:classroomId/questions/:questionId', authenticate, requireTeacher, requireClassroomManager('classroomId'), classroomController.updateQuestion)

// 删除题目
router.delete('/:classroomId/questions/:questionId', authenticate, requireTeacher, requireClassroomManager('classroomId'), classroomController.deleteQuestion)

// 获取题目历史统计
router.get('/:classroomId/questions/:questionId/stats', authenticate, requireClassroomManager('classroomId'), classroomController.getQuestionStats)

// ==================== 数据导出 ====================

// 导出课堂数据
router.get('/:id/export', authenticate, requireClassroomManager(), classroomController.exportData)

export default router
