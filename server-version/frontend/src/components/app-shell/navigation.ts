import type { Role } from './access'
export type NavigationItem = { path: string; label: string; aliases?: string[] }
const student: NavigationItem[] = [
  { path: '/student', label: '课程', aliases: ['/student/courses', '/student/assignments', '/student/checkins', '/student/classroom'] },
  { path: '/student/scales', label: '我的测评', aliases: ['/student/questionnaires', '/student/composite'] },
  { path: '/relational/tasks', label: '课堂体验', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'] },
  { path: '/student/situational', label: '情境测评' },
  { path: '/scale-library', label: '量表库' },
]
const parent: NavigationItem[] = [
  { path: '/parent', label: '家长首页' },
  { path: '/relational/tasks', label: '观察测评', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'] },
]
const staff: NavigationItem[] = [
  { path: '/dashboard', label: '课程管理', aliases: ['/courses'] },
  { path: '/students', label: '学生管理' }, { path: '/assignments', label: '作业管理' },
  { path: '/checkins', label: '打卡管理' }, { path: '/teacher/classrooms', label: '课堂互动' },
  { path: '/scales', label: '心理量表' }, { path: '/scale-library', label: '量表库' },
  { path: '/questionnaires', label: '聚合问卷' }, { path: '/composite-assessments', label: '综合测评' },
  { path: '/general-questionnaires', label: '泛化问卷' }, { path: '/videos', label: '视频库' },
  { path: '/images', label: '图片库' }, { path: '/documents', label: '文档库' },
]
export function navigationFor(role: Role | undefined, cognitive: boolean): NavigationItem[] {
  if (!role) return []
  const items = [...(role === 'STUDENT' ? student : role === 'PARENT' ? parent : staff)]
  if (cognitive && role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/cognitive' : '/cognitive-assignments', label: role === 'STUDENT' ? '认知测评' : '认知任务' })
  if (role === 'TEACHER') items.push({ path: '/relational/tasks', label: '关系测评', aliases: ['/relational/attempts', '/relational/cognitive', '/relational/composite'] })
  if (role === 'ADMIN') items.push(
    { path: '/users', label: '用户管理' }, { path: '/teacher-codes', label: '教师码' },
    { path: '/admin/material-grants', label: '材料授权' }, { path: '/admin/instrument-authorizations', label: '测评授权' },
  )
  if (role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/profile' : '/profile', label: '账户设置' })
  return items
}
export function activeNavigation(items: NavigationItem[], pathname: string): NavigationItem | undefined {
  return items.flatMap((item) => [item.path, ...(item.aliases || [])].map((path) => ({ item, path })))
    .filter(({ path }) => pathname === path || (path !== '/student' && path !== '/parent' && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.item
}
export function routeTitle(pathname: string, active?: NavigationItem): string {
  if (pathname.startsWith('/organizations/')) return '组织空间'
  if (pathname.includes('/result') || pathname.endsWith('/report')) return '测评结果'
  if (pathname.endsWith('/history')) return '测评历史'
  if (pathname.endsWith('/register')) return '注册账户'
  if (pathname.endsWith('login')) return '登录 Huisurvey'
  if (pathname.startsWith('/public/')) return '公开测评'
  return active?.label || 'Huisurvey'
}
