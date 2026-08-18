const { post, get } = require('../utils/request')

function login(data) {
  return post('/api/auth/login', data)
}

function studentRegister(data) {
  return post('/api/auth/student-register', data)
}

function getCurrentUser() {
  return get('/api/auth/me')
}

module.exports = {
  login,
  studentRegister,
  getCurrentUser
}
