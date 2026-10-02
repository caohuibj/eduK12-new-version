const { ApiError } = require('../../core/errors/index')
const FEATURES = {
  home: {label: '首页', path: '/pages/home/index'},
  tasks: {label: '任务', capability: 'canReadStudentTasks', path: '/pages/list/index?domain=tasks'},
  assessments: {label: '测评', capability: 'canReadOwnAssessments', path: '/pages/list/index?domain=assessments'},
  courses: {label: '课程', capability: 'canReadCourses', path: '/pages/list/index?domain=courses'},
  organizations: {label: '组织', capability: 'canDiscoverOrganizations', path: '/pages/organizations/index'},
  users: {label: '用户', capability: 'canReadUsers', path: '/pages/list/index?domain=users'},
  children: {label: '孩子', capability: 'canReadChildren', path: '/pages/parents/index?view=children'},
  childReports: {label: '报告', capability: 'canReadChildReports', path: '/pages/parents/index?view=children&next=reports'},
  students: {label:'学生',capability:'canReadStudents',path:'/pages/list/index?domain=students'},
  assignments: {label:'作业',capability:'canReadAssignments',path:'/pages/list/index?domain=assignments'},
  checkins: {label:'打卡',capability:'canReadCheckins',path:'/pages/list/index?domain=checkins'},
  classrooms: {label:'课堂',capability:'canReadClassrooms',path:'/pages/list/index?domain=classrooms'},
  catalog: {label:'内容',capability:'canReadCatalog',path:'/pages/list/index?domain=catalog'},
  teacherCodes: {label:'教师邀请',capability:'canReadTeacherCodes',path:'/pages/list/index?domain=teacherCodes'},
  joinClassroom:{label:'加入课堂',capability:'canJoinClassroom',path:'/pages/classroom/index'},
  profile: {label: '我的', capability: 'canReadProfile', path: '/pages/profile/index'},
}
const ROLE_ITEMS = {STUDENT: ['home','tasks','courses','assessments','profile'], PARENT: ['home','children','childReports','assessments','profile'], TEACHER: ['home','courses','students','assessments','profile'], ADMIN: ['home','organizations','users','catalog','profile']}
function navigationFor(session) {
  return (ROLE_ITEMS[session.activeRole] || []).filter(key => !FEATURES[key].capability || session.capabilities[FEATURES[key].capability]).map(key => Object.assign({key}, FEATURES[key]))
}
function navigate(platform, session, key) {
  const item = Object.entries(FEATURES).filter(([,f])=>!f.capability||session.capabilities[f.capability]).map(([key,f])=>Object.assign({key},f)).find(item => item.key === key)
  if (!item) throw new ApiError('forbidden', '此入口不可用')
  return platform.reLaunch({url: item.path})
}
function shortcutsFor(session){return Object.entries(FEATURES).filter(([key,f])=>!['home','profile'].includes(key)&&!navigationFor(session).some(item=>item.key===key)&&f.capability&&session.capabilities[f.capability]).map(([key,f])=>Object.assign({key},f))}
module.exports = { FEATURES, navigationFor, navigate,shortcutsFor }
