import { matchPath } from 'react-router-dom'
import type { Role } from './access'

export type NavigationSection = 'teaching' | 'assessment' | 'organization' | 'content' | 'system' | 'account'
export type NavigationItem = { path: string; label: string; aliases?: string[]; section?: NavigationSection }
export const navigationSections: Array<{ id: NavigationSection; label: string }> = [
  { id: 'teaching', label: '教学管理' }, { id: 'assessment', label: '测评内容' },
  { id: 'organization', label: '组织工作区' }, { id: 'content', label: '内容资源' },
  { id: 'system', label: '系统管理' }, { id: 'account', label: '我的账户' },
]
const student: NavigationItem[] = [
  { path: '/student', label: '课程', aliases: ['/student/courses', '/student/assignments', '/student/checkins', '/student/classroom'] },
  { path: '/student/scales', label: '我的测评', aliases: ['/student/questionnaires', '/student/composite'] },
  { path: '/relational/tasks', label: '课堂体验', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'] },
  { path: '/student/situational', label: '情境测评' }, { path: '/scale-library', label: '量表库' },
]
const parent: NavigationItem[] = [
  { path: '/parent', label: '家长首页' },
  { path: '/relational/tasks', label: '观察测评', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'] },
]
const staff: NavigationItem[] = [
  { path: '/dashboard', label: '课程管理', aliases: ['/courses'], section: 'teaching' },
  { path: '/students', label: '学生管理', section: 'teaching' },
  { path: '/assignments', label: '作业管理', section: 'teaching' },
  { path: '/checkins', label: '打卡管理', section: 'teaching' },
  { path: '/teacher/classrooms', label: '课堂互动', section: 'teaching' },
  { path: '/scales', label: '心理量表', section: 'assessment' },
  { path: '/scale-library', label: '量表库', section: 'assessment' },
  { path: '/questionnaires', label: '聚合问卷', aliases: ['/questionnaire-products'], section: 'assessment' },
  { path: '/composite-assessments', label: '综合测评', section: 'assessment' },
  { path: '/bundle-products', label: '综合测评包', section: 'assessment' },
  { path: '/general-questionnaires', label: '泛化问卷', section: 'assessment' },
  { path: '/videos', label: '视频库', section: 'content' }, { path: '/images', label: '图片库', section: 'content' },
  { path: '/documents', label: '文档库', section: 'content' },
]
export function navigationFor(role: Role | undefined, cognitive: boolean): NavigationItem[] {
  if (!role) return []
  const items = [...(role === 'STUDENT' ? student : role === 'PARENT' ? parent : staff)]
  if (cognitive && role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/cognitive' : '/cognitive-assignments', label: role === 'STUDENT' ? '认知测评' : '认知任务', section: 'assessment' })
  if (role === 'TEACHER') items.push({ path: '/relational/tasks', label: '关系测评', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'], section: 'assessment' })
  if (role === 'ADMIN') items.push(
    { path: '/users', label: '用户管理', section: 'system' }, { path: '/teacher-codes', label: '教师码', section: 'system' },
    { path: '/admin/material-grants', label: '材料授权', section: 'system' }, { path: '/admin/instrument-authorizations', label: '测评授权', section: 'system' },
  )
  if (role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/profile' : '/profile', label: '账户设置', section: 'account' })
  return items
}
export function organizationNavigation(organizationId: string | undefined, allowedActions: readonly string[] = [], platformRole?: string | null): NavigationItem[] {
  const items: NavigationItem[] = [
    { path: '/organizations', label: '组织空间', section: 'organization' },
    { path: '/organization-tasks', label: '组织测评任务', section: 'organization' },
  ]
  if (organizationId) {
    const root = `/organizations/${encodeURIComponent(organizationId)}`
    items.push({ path: root, label: '组织概览', section: 'organization' })
    if (allowedActions.includes('RUNS')) items.push({ path: `${root}/runs`, label: '测评批次', section: 'organization' })
    if (allowedActions.includes('REPORTING')) items.push({ path: `${root}/reporting`, label: '报告分析', section: 'organization' })
    if (allowedActions.includes('DELIVERY')) items.push({ path: `${root}/delivery`, label: '安全事项与导出', section: 'organization' })
  }
  if (platformRole === 'SYSTEM_ADMIN') items.push({ path: '/organizations/new', label: '创建组织', section: 'system' })
  return items
}
export function activeNavigation(items: NavigationItem[], pathname: string): NavigationItem | undefined {
  return items.flatMap((item) => [item.path, ...(item.aliases || [])].map((path) => ({ item, path })))
    .filter(({ path }) => pathname === path || (path !== '/student' && path !== '/parent' && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.item
}
const staffTitles: Array<[string, string]> = [
  ['/organizations/new', '创建组织'], ['/organization-tasks', '组织测评任务'],
  ['/organizations/:organizationId/runs/:runId', '测评批次详情'], ['/organizations/:organizationId/runs', '测评批次'],
  ['/organizations/:organizationId/reporting', '报告分析'], ['/organizations/:organizationId/delivery', '安全事项与导出'],
  ['/organizations/:organizationId', '组织概览'], ['/organizations', '组织空间'],
  ['/courses/:courseId/students', '课程学生'], ['/courses/:courseId/detail', '课程详情'],
  ['/questionnaire-products/new', '创建聚合问卷'], ['/questionnaire-products/:id', '编辑聚合问卷'],
  ['/questionnaires/legacy', '历史问卷'], ['/questionnaires/:id', '编辑历史问卷'],
  ['/general-questionnaires/create', '创建泛化问卷'], ['/general-questionnaires/:id/edit', '编辑泛化问卷'],
  ['/scales/:id', '量表详情与编辑'], ['/bundle-products/:id', '测评包详情'],
  ['/composite-assessments/:id/results', '作答与报告'], ['/composite-assessments/:id', '综合测评配置'],
  ['/cognitive-assignments/:id', '认知任务配置'], ['/teacher/classrooms/create', '创建课堂'],
  ['/teacher/classrooms/:id/control', '课堂控制'], ['/teacher/classrooms/:id/edit', '编辑课堂'],
  ['/teacher/classrooms/:id/questions', '课堂题目'], ['/teacher/classrooms/:id/qrcode', '课堂参与码'], ['/profile', '账户设置'],
]
export function routeTitle(pathname: string, active?: NavigationItem): string {
  const staffTitle = staffTitles.find(([path]) => matchPath(path, pathname))
  if (staffTitle) return staffTitle[1]
  if (pathname.startsWith('/organizations/')) return '组织页面不可用'
  if (pathname.includes('/result') || pathname.endsWith('/report')) return '测评结果'
  if (pathname.endsWith('/history')) return '测评历史'
  if (pathname === '/teacher/login') return '教师邀请码注册'
  if (pathname.endsWith('/register')) return '注册账户'
  if (pathname.endsWith('login')) return '登录 Huisurvey'
  if (pathname.startsWith('/public/')) return '公开测评'
  return active?.label || 'Huisurvey'
}
export type BreadcrumbItem = { label: string; path?: string }
export function breadcrumbsFor(pathname: string, home: string, active?: NavigationItem, organizationName?: string): BreadcrumbItem[] {
  const title = routeTitle(pathname, active)
  const crumbs: BreadcrumbItem[] = [{ label: '首页', path: home }]
  if (pathname === '/organizations') { crumbs.push({ label: title }); return crumbs }
  if (pathname.startsWith('/organizations/')) {
    crumbs.push({ label: '组织空间', path: '/organizations' })
    const match = matchPath('/organizations/:organizationId/*', pathname)
    const id = match?.params.organizationId
    if (id && id !== 'new') {
      const root = `/organizations/${encodeURIComponent(id)}`
      if (pathname !== root) crumbs.push({ label: organizationName || '组织概览', path: root })
      if (matchPath('/organizations/:organizationId/runs/:runId', pathname)) crumbs.push({ label: '测评批次', path: `${root}/runs` })
    }
  } else if (active && active.path !== pathname && pathname !== '/organization-tasks') {
    crumbs.push({ label: active.label, path: active.path })
    const course = matchPath('/courses/:courseId/students', pathname)
    if (course) crumbs.push({ label: '课程详情', path: `/courses/${encodeURIComponent(course.params.courseId || '')}/detail` })
  }
  crumbs.push({ label: title })
  return crumbs.filter((item, index) => index === 0 || item.label !== crumbs[index - 1].label)
}
export function isStaffWorkspacePath(pathname: string): boolean {
  if (pathname.endsWith('/report')) return false
  return ['/dashboard','/courses','/students','/assignments','/checkins','/scales','/scale-library','/questionnaires','/questionnaire-products',
    '/general-questionnaires','/composite-assessments','/bundle-products','/cognitive-assignments','/teacher/classrooms','/videos','/images','/documents',
    '/users','/teacher-codes','/admin/material-grants','/admin/instrument-authorizations','/profile','/organizations','/organization-tasks']
    .some(root => pathname === root || pathname.startsWith(`${root}/`))
}
