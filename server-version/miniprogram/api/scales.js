const { get, post, patch } = require('../utils/request')

/**
 * 获取可参与量表列表
 * @param {string} courseId - 课程ID（可选）
 */
function getAvailableScales(courseId) {
  const url = courseId 
    ? `/api/scales/available?courseId=${courseId}`
    : '/api/scales/available'
  return get(url)
}

/**
 * 获取量表详情
 * @param {string} id - 量表ID
 */
function getScaleDetail(id) {
  return get(`/api/scales/${id}`)
}

/**
 * 开始量表测评
 * @param {string} scaleId - 量表ID
 */
function startAssessment(scaleId) {
  return post(`/api/scales/${scaleId}/assessments`)
}

/**
 * 提交答案
 * @param {string} assessmentId - 测评ID
 * @param {string} scaleId - 量表ID
 * @param {object} answers - 答案对象
 */
function submitAnswers(assessmentId, scaleId, answers) {
  return patch(`/api/scales/assessments/${assessmentId}/answers`, {
    scaleId,
    answers
  })
}

/**
 * 提交单个答案
 * @param {string} assessmentId - 测评ID
 * @param {object} answer - { itemId, value, responseTime? }
 */
function submitAnswer(assessmentId, answer) {
  return patch(`/api/scales/assessments/${assessmentId}/answers`, answer)
}

/**
 * 完成量表测评
 * @param {string} assessmentId - 测评ID
 */
function completeAssessment(assessmentId) {
  return post(`/api/scales/assessments/${assessmentId}/complete`)
}

/**
 * 获取测评结果
 * @param {string} assessmentId - 测评ID
 */
function getAssessment(assessmentId) {
  return get(`/api/scales/assessments/${assessmentId}`)
}

/**
 * 获取我的测评历史
 */
function getMyAssessments() {
  return get('/api/scales/assessments/my')
}

module.exports = {
  getAvailableScales,
  getScaleDetail,
  startAssessment,
  submitAnswers,
  submitAnswer,
  completeAssessment,
  getAssessment,
  getMyAssessments
}
