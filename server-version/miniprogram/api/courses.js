const { get, post } = require('../utils/request')

function getMyCourses(cursor) {
  return get('/api/courses/my' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
}

function getCourseDetail(id) {
  return get(`/api/courses/${id}`)
}

function joinCourse(courseCode) {
  return post('/api/courses/join', { courseCode })
}

function getCourseAssignments(courseId) {
  return get(`/api/courses/${courseId}/assignments`)
}

function getCourseCheckins(courseId) {
  return get(`/api/courses/${courseId}/checkins`)
}

module.exports = {
  getMyCourses,
  getCourseDetail,
  joinCourse,
  getCourseAssignments,
  getCourseCheckins
}
