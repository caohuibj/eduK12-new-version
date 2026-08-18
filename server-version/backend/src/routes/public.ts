/**
 * 公开访问路由（无需认证）
 */

import { Router } from 'express'
import { publicQuestionnaireController } from '../controllers/publicQuestionnaireController'

const router = Router()

// POW 挑战
router.get('/pow/challenge', publicQuestionnaireController.getPOWChallenge)

// 问卷访问（通过令牌）
router.get('/questionnaires/:token', publicQuestionnaireController.getQuestionnaireByToken)
router.post('/questionnaires/:token/start', publicQuestionnaireController.startAssessment)

// 测评管理
router.get('/assessments/:sessionId', publicQuestionnaireController.getAssessment)
router.get('/assessments/:sessionId/scale/:scaleAssessmentId', publicQuestionnaireController.getScaleAssessment)
router.patch('/assessments/:sessionId/answers', publicQuestionnaireController.submitAnswer)
router.post('/assessments/:sessionId/form-answer', publicQuestionnaireController.submitFormAnswer)
router.post('/assessments/:sessionId/scale/complete', publicQuestionnaireController.completeScaleAssessment)
router.post('/assessments/:sessionId/complete', publicQuestionnaireController.completeAssessment)
router.get('/assessments/:sessionId/report', publicQuestionnaireController.getReport)

export default router
