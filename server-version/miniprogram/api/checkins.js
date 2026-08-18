const { get, post } = require('../utils/request')

function getMyCheckins() {
  return get('/api/checkins/my')
}

function getCheckinDetail(id) {
  return get(`/api/checkins/${id}`)
}

function getMySubmission(id) {
  return get(`/api/checkins/${id}/my-submission`)
}

function submitCheckin(id, data) {
  return post(`/api/checkins/${id}/submit`, data)
}

function getOthersSubmissions(id) {
  return get(`/api/checkins/${id}/others-submissions`)
}

module.exports = {
  getMyCheckins,
  getCheckinDetail,
  getMySubmission,
  submitCheckin,
  getOthersSubmissions
}
