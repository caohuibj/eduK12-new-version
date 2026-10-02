const { ApiError } = require('../../core/errors/index')
const FEATURES = {
  home: {label: '首页', path: '/pages/home/index'},
  tasks: {label: '任务', capability: 'canReadStudentTasks', path: '/pages/list/index?domain=tasks'},
  assessments: {label: '测评', capability: 'canReadOwnAssessments', path: '/pages/list/index?domain=assessments'},
  courses: {label: '课程', capability: 'canReadCourses', path: '/pages/list/index?domain=courses'},
  organizations: {label: '组织', capability: 'canDiscoverOrganizations', path: '/pages/list/index?domain=organizations'},
  users: {label: '用户', capability: 'canReadUsers', path: '/pages/list/index?domain=users'},
  profile: {label: '我的', capability: 'canReadProfile', path: '/pages/profile/index'},
}
const ROLE_ITEMS = {STUDENT: ['home','tasks','courses','assessments','profile'], PARENT: ['home','assessments','profile'], TEACHER: ['home','courses','assessments','profile'], ADMIN: ['home','organizations','users','assessments','profile']}
function navigationFor(session) {
  return (ROLE_ITEMS[session.activeRole] || []).filter(key => !FEATURES[key].capability || session.capabilities[FEATURES[key].capability]).map(key => Object.assign({key}, FEATURES[key]))
}
function navigate(platform, session, key) {
  const item = navigationFor(session).find(item => item.key === key)
  if (!item) throw new ApiError('forbidden', '此入口不可用')
  return platform.reLaunch({url: item.path})
}
module.exports = { FEATURES, navigationFor, navigate }
