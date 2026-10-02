const { ApiError } = require('../../core/errors/index')
const DOMAINS = {
  tasks: {capability: 'canReadStudentTasks', path: '/courses/my/tasks', title: '我的任务'},
  assessments: {capability: 'canReadOwnAssessments', path: '/my-assessments', title: '我的测评'},
  courses: {capability: 'canReadCourses', path: '/courses', studentPath: '/courses/my', title: '课程'},
  organizations: {capability: 'canDiscoverOrganizations', path: '/organizations', title: '组织'},
  users: {capability: 'canReadUsers', path: '/users', title: '用户'},
}
// Presentation only: preserve server state/actions; never derive eligibility from dates/scores.
const labels = {PENDING:'待完成', IN_PROGRESS:'进行中', UPCOMING:'即将开始', EXPIRED:'已过期', COMPLETED:'已完成', UNAVAILABLE:'不可用', ASSIGNED:'已分配', OPEN:'开放', STARTED:'进行中', ACTIVE:'有效', SUSPENDED:'已暂停', DRAFT:'草稿', PUBLISHED:'已发布'}
function rows(domain, data) {
  if (!data || !Array.isArray(data.list)) throw new ApiError('invalidResponse','列表响应无效，请重试')
  return data.list.map(item => {
    const id = item.id || item.taskId
    if (typeof id !== 'string') throw new ApiError('invalidResponse','列表标识无效，请重试')
    return {id, title: item.title || item.name || item.nickname || item.username || '未命名',
      status: labels[item.state || item.status] || item.state || item.status || '',
      detail: domain === 'tasks' ? (item.courses || []).map(course => course.title).join('、') : '',
      // Only actual detail adapters expose navigation; runner/report land in later phases.
      canOpen: domain === 'courses' || domain === 'organizations' || domain === 'users',
      domain, canStart: item.canStart === true, canContinue: item.canContinue === true,
      resultAvailability: item.resultAvailability || null}
  })
}
function createDomainService(api, session) {
  function authorize(domain) {
    const spec = DOMAINS[domain]
    if (!spec || session.get().capabilities[spec.capability] !== true) throw new ApiError('forbidden','您无权访问此内容')
    return spec
  }
  return {
    async list(domain, page = 1) {
      const spec = authorize(domain)
      const path = domain === 'courses' && session.get().capabilities.canReadStudentTasks ? spec.studentPath : spec.path
      const data = await api.get(path + '?page=' + page + '&pageSize=20')
      return {title: spec.title, list: rows(domain,data), total: typeof data.total === 'number' ? data.total : null, page, truncated: data.truncated === true,
        hasMore: domain !== 'assessments' && typeof data.total === 'number' && page * 20 < data.total && !(domain === 'courses' && path === spec.studentPath)}
    },
    async detail(domain, id) {
      authorize(domain)
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new ApiError('invalidRequest','内容标识无效')
      const paths = {courses:'/courses/', organizations:'/organizations/',users:'/users/'}
      if (!paths[domain]) throw new ApiError('notFound','此内容尚无详情入口')
      const data = await api.get(paths[domain] + encodeURIComponent(id) + (domain === 'organizations' ? '/context' : ''))
      const entity = domain === 'organizations' ? data.organization : data
      if (!entity || typeof entity !== 'object') throw new ApiError('invalidResponse','详情响应无效')
      return {title: entity.title || entity.name || entity.nickname || entity.username || '详情',
        status: labels[entity.status] || entity.status || '', description: entity.description || '',
        // Organization controls come only from its resource context, never ADMIN role.
        availableActions: Array.isArray(data.allowedActions) ? data.allowedActions : []}
    },
  }
}
module.exports = { DOMAINS, rows, createDomainService }
