const { get, put, post } = require('../utils/request')

function getUserInfo() {
  return get('/api/users/me')
}

function updateUserInfo(id, data) {
  return put(`/api/users/${id}`, data)
}

function changePassword(data) {
  return post('/api/users/change-password', data)
}

module.exports = {
  getUserInfo,
  updateUserInfo,
  changePassword
}
