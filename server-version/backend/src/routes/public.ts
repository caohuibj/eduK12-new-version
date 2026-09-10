/**
 * 公开访问路由（无需认证）
 */

import { Router } from 'express'
import { publicQuestionnaireController } from '../controllers/publicQuestionnaireController'
import { questionnaireImageController } from '../controllers/questionnaireImageController'
import { questionnaireVideoController } from '../controllers/questionnaireVideoController'
import { requireQuestionnaireResume } from '../middleware/publicQuestionnaireAuth'
import { legacyWriteDisabled } from '../middleware/instrumentFinalOnly'

const router = Router()

// POW 挑战
router.get('/pow/challenge', publicQuestionnaireController.getPOWChallenge)

// 问卷访问（通过令牌）
router.get('/questionnaires/:token', publicQuestionnaireController.getQuestionnaireByToken)
router.post('/questionnaires/:token/start', publicQuestionnaireController.startAssessment)

// 测评管理
router.get('/assessments/:sessionId', requireQuestionnaireResume, publicQuestionnaireController.getAssessment)
router.post('/assessments/:sessionId/restart', requireQuestionnaireResume, publicQuestionnaireController.restartAssessment)
router.post('/assessments/:sessionId/context/freeze', requireQuestionnaireResume, legacyWriteDisabled)
router.post('/assessments/:sessionId/form-sections/:sectionId/submit', requireQuestionnaireResume, publicQuestionnaireController.submitFinalFormSection)
router.post('/assessments/:sessionId/scale/:scaleAssessmentId/submit', requireQuestionnaireResume, publicQuestionnaireController.submitFinalScale)
router.get('/assessments/:sessionId/form-sections/:sectionId/assets/:assetId', requireQuestionnaireResume, questionnaireImageController.publicFormImage)
router.get('/assessments/:sessionId/scale/:scaleAssessmentId/assets/:assetId', requireQuestionnaireResume, questionnaireImageController.publicScaleImage)
router.post('/assessments/:sessionId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability', requireQuestionnaireResume, questionnaireVideoController.publicFormVideo)
router.post('/assessments/:sessionId/scale/:scaleAssessmentId/items/:itemCode/video-capability', requireQuestionnaireResume, questionnaireVideoController.publicScaleVideo)
router.get('/assessments/:sessionId/scale/:scaleAssessmentId', requireQuestionnaireResume, publicQuestionnaireController.getScaleAssessment)
router.patch('/assessments/:sessionId/answers/batch', requireQuestionnaireResume, legacyWriteDisabled)
router.patch('/assessments/:sessionId/answers', requireQuestionnaireResume, legacyWriteDisabled)
router.post('/assessments/:sessionId/form-answer', requireQuestionnaireResume, legacyWriteDisabled)
router.patch('/assessments/:sessionId/form-answers/batch', requireQuestionnaireResume, legacyWriteDisabled)
router.post('/assessments/:sessionId/form-answers/batch', requireQuestionnaireResume, legacyWriteDisabled)
router.post('/assessments/:sessionId/scale/complete', requireQuestionnaireResume, legacyWriteDisabled)
router.post('/assessments/:sessionId/complete', requireQuestionnaireResume, legacyWriteDisabled)
router.get('/assessments/:sessionId/report', requireQuestionnaireResume, publicQuestionnaireController.getReport)

export default router
