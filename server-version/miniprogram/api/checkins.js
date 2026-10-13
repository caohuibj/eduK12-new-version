const { get, post } = require('../utils/request')

function getMyCheckins(cursor) {
  return get('/api/checkins/my' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
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

function getOthersSubmissions(id, cursor) {
  return get(`/api/checkins/${id}/others-submissions` + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
}

module.exports = {
  getMyCheckins,
  getCheckinDetail,
  getMySubmission,
  submitCheckin,
  getOthersSubmissions
}
