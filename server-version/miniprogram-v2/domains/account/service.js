function createAccountService(api) {
  return {
    me: () => api.get('/auth/me', {retry: false}), capabilities: () => api.get('/capabilities'),
    login: values => api.post('/auth/login', values), logout: () => api.post('/auth/logout'),
    register(kind, values) {
      const paths = {student: '/auth/student-register', teacher: '/auth/teacher-register'}
      if (!paths[kind]) throw new Error('不支持此注册入口')
      return api.post(paths[kind], values)
    },
    changePassword: values => api.post('/auth/change-password', values),
  }
}
module.exports = { createAccountService }
