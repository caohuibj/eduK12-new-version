const { get, post } = require('../utils/request')

function getMyCourses() {
  return get('/api/courses/my')
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
