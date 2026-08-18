const { get, post } = require('../utils/request')

function getMyAssignments() {
  return get('/api/assignments/my')
}

function getAssignmentDetail(id) {
  return get(`/api/assignments/${id}`)
}

function getMySubmission(id) {
  return get(`/api/assignments/${id}/my-submission`)
}

function submitAssignment(id, data) {
  return post(`/api/assignments/${id}/submit`, data)
}

module.exports = {
  getMyAssignments,
  getAssignmentDetail,
  getMySubmission,
  submitAssignment
}
