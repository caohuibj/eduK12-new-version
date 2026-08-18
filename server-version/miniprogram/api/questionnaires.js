const { get, post } = require('../utils/request')

/**
 * 获取可参与问卷列表
 * @param {string} courseId - 课程ID（可选）
 */
function getAvailableQuestionnaires(courseId) {
  const url = courseId 
    ? `/api/questionnaires/available?courseId=${courseId}`
    : '/api/questionnaires/available'
  return get(url)
}

/**
 * 获取问卷详情
 * @param {string} id - 问卷ID
 */
function getQuestionnaireDetail(id) {
  return get(`/api/questionnaires/${id}`)
}

/**
 * 开始问卷测评
 * @param {string} questionnaireId - 问卷ID
 */
function startAssessment(questionnaireId) {
  return post(`/api/questionnaires/${questionnaireId}/assessments`)
}

/**
 * 获取测评状态
 * @param {string} assessmentId - 测评ID
 */
function getAssessment(assessmentId) {
  return get(`/api/questionnaires/assessments/${assessmentId}`)
}

/**
 * 完成问卷测评
 * @param {string} assessmentId - 测评ID
 */
function completeAssessment(assessmentId) {
  return post(`/api/questionnaires/assessments/${assessmentId}/complete`)
}

/**
 * 获取测评报告
 * @param {string} assessmentId - 测评ID
 */
function getReport(assessmentId) {
  return get(`/api/questionnaires/assessments/${assessmentId}/report`)
}

/**
 * 保存表单答案
 * @param {string} assessmentId - 测评ID
 * @param {object} data - { formItemId: string, value: string }
 */
function saveFormAnswer(assessmentId, data) {
  return post(`/api/questionnaires/assessments/${assessmentId}/form-answers`, data)
}

/**
 * 批量保存表单答案
 * @param {string} assessmentId - 测评ID
 * @param {array} answers - [{ formItemId: string, value: string }]
 */
function saveFormAnswers(assessmentId, answers) {
  return post(`/api/questionnaires/assessments/${assessmentId}/form-answers/batch`, { answers })
}

module.exports = {
  getAvailableQuestionnaires,
  getQuestionnaireDetail,
  startAssessment,
  getAssessment,
  completeAssessment,
  getReport,
  saveFormAnswer,
  saveFormAnswers
}
