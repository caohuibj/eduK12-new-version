/**
 * 公开访问路由（无需认证）
 */

import { Router } from 'express'
import { publicQuestionnaireController } from '../controllers/publicQuestionnaireController'
import { requireQuestionnaireResume } from '../middleware/publicQuestionnaireAuth'

const router = Router()

// POW 挑战
router.get('/pow/challenge', publicQuestionnaireController.getPOWChallenge)

// 问卷访问（通过令牌）
router.get('/questionnaires/:token', publicQuestionnaireController.getQuestionnaireByToken)
router.post('/questionnaires/:token/start', publicQuestionnaireController.startAssessment)

// 测评管理
router.get('/assessments/:sessionId', requireQuestionnaireResume, publicQuestionnaireController.getAssessment)
router.post('/assessments/:sessionId/context/freeze', requireQuestionnaireResume, publicQuestionnaireController.freezeContext)
router.get('/assessments/:sessionId/scale/:scaleAssessmentId', requireQuestionnaireResume, publicQuestionnaireController.getScaleAssessment)
router.patch('/assessments/:sessionId/answers/batch', requireQuestionnaireResume, publicQuestionnaireController.submitAnswers)
router.patch('/assessments/:sessionId/answers', requireQuestionnaireResume, publicQuestionnaireController.submitAnswer)
router.post('/assessments/:sessionId/form-answer', requireQuestionnaireResume, publicQuestionnaireController.submitFormAnswer)
router.patch('/assessments/:sessionId/form-answers/batch', requireQuestionnaireResume, publicQuestionnaireController.submitFormAnswers)
router.post('/assessments/:sessionId/form-answers/batch', requireQuestionnaireResume, publicQuestionnaireController.submitFormAnswers)
router.post('/assessments/:sessionId/scale/complete', requireQuestionnaireResume, publicQuestionnaireController.completeScaleAssessment)
router.post('/assessments/:sessionId/complete', requireQuestionnaireResume, publicQuestionnaireController.completeAssessment)
router.get('/assessments/:sessionId/report', requireQuestionnaireResume, publicQuestionnaireController.getReport)

export default router
