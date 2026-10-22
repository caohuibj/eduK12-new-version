const { ApiError } = require('../../core/errors/index')
function createAccountService(api, {studentOnly = false} = {}) {
  return {
    me: () => api.get('/auth/me', {retry: false}), capabilities: () => api.get('/capabilities'),
    async login(values) {
      const result = await api.post(studentOnly ? '/auth/training-login' : '/auth/login', studentOnly ? {...values, expectedRole:'STUDENT'} : values)
      if (result && result.adminKeyRequired) throw new ApiError('forbidden', '管理账号需要安全密钥验证，请使用 Web 管理入口登录。', {status: 403})
      return result
    },
    logout: () => api.post('/auth/logout'),
    register(kind, values) {
      if (studentOnly && kind !== 'student') throw new ApiError('forbidden', '此小程序仅开放学员注册')
      const paths = {student: '/auth/student-register', teacher: '/auth/teacher-register'}
      if (!paths[kind]) throw new Error('不支持此注册入口')
      return api.post(paths[kind], values)
    },
    changePassword: values => api.post('/auth/change-password', values),
  }
}
module.exports = { createAccountService }
