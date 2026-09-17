from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {rel}: {old[:80]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique replacement in {rel}: {text.count(old)}')
    path.write_text(text.replace(old, new))

replace('frontend/src/types/index.ts', "role: 'STUDENT' | 'TEACHER' | 'ADMIN'", "role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'PARENT'")
replace('frontend/src/types/shared.ts', "export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN'", "export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'PARENT'")

replace('frontend/src/components/app-shell/access.ts',
"export const homeFor = (role?: Role) => role === 'STUDENT' ? '/student' : role ? '/dashboard' : '/'\nexport const loginFor = (role?: Role) => role === 'ADMIN' ? '/admin/login' : role === 'TEACHER' ? '/teacher/account-login' : '/student/login'",
"export const homeFor = (role?: Role) => role === 'STUDENT' ? '/student' : role === 'PARENT' ? '/parent' : role ? '/dashboard' : '/'\nexport const loginFor = (role?: Role) => role === 'ADMIN' ? '/admin/login' : role === 'TEACHER' ? '/teacher/account-login' : role === 'PARENT' ? '/parent/login' : '/student/login'")
replace('frontend/src/components/app-shell/access.ts',
"export const isAuthPath = (pathname: string) => /^\\/(admin\\/login|teacher\\/(login|account-login|register)|student\\/(login|course-login|register))$/.test(pathname)",
"export const isAuthPath = (pathname: string) => /^\\/(admin\\/login|teacher\\/(login|account-login|register)|student\\/(login|course-login|register)|parent\\/login)$/.test(pathname)")
replace('frontend/src/components/app-shell/access.ts',
"  const allowed = inRoot(pathname, 'scale-library') || (role === 'STUDENT' ? inRoot(pathname, 'student')\n    : staffRoots.some((root) => inRoot(pathname, root)) || inRoot(pathname, 'teacher/classrooms') || (role === 'ADMIN' && adminRoots.some((root) => inRoot(pathname, root))))",
"  const allowed = role === 'PARENT'\n    ? inRoot(pathname, 'parent') || inRoot(pathname, 'relational')\n    : inRoot(pathname, 'scale-library') || (role === 'STUDENT' ? inRoot(pathname, 'student') || inRoot(pathname, 'relational')\n      : staffRoots.some((root) => inRoot(pathname, root)) || inRoot(pathname, 'teacher/classrooms') || inRoot(pathname, 'relational') || (role === 'ADMIN' && adminRoots.some((root) => inRoot(pathname, root))))")
replace('frontend/src/components/app-shell/access.ts',
"['STUDENT', 'TEACHER', 'ADMIN'].includes(value.role)",
"['STUDENT', 'TEACHER', 'ADMIN', 'PARENT'].includes(value.role)")

nav = ROOT / 'frontend/src/components/app-shell/navigation.ts'
nav.write_text("""import type { Role } from './access'\nexport type NavigationItem = { path: string; label: string; aliases?: string[] }\nconst student: NavigationItem[] = [\n  { path: '/student', label: '课程', aliases: ['/student/courses', '/student/assignments', '/student/checkins', '/student/classroom'] },\n  { path: '/student/scales', label: '我的测评', aliases: ['/student/questionnaires', '/student/composite', '/relational/tasks'] },\n  { path: '/student/situational', label: '情境测评' },\n  { path: '/scale-library', label: '量表库' },\n]\nconst parent: NavigationItem[] = [\n  { path: '/parent', label: '家长首页' },\n  { path: '/parent/observer', label: '观察测评', aliases: ['/relational/tasks', '/relational/reports'] },\n]\nconst staff: NavigationItem[] = [\n  { path: '/dashboard', label: '课程管理', aliases: ['/courses'] },\n  { path: '/students', label: '学生管理' }, { path: '/assignments', label: '作业管理' },\n  { path: '/checkins', label: '打卡管理' }, { path: '/teacher/classrooms', label: '课堂互动' },\n  { path: '/scales', label: '心理量表' }, { path: '/scale-library', label: '量表库' },\n  { path: '/questionnaires', label: '聚合问卷' }, { path: '/composite-assessments', label: '综合测评' },\n  { path: '/general-questionnaires', label: '泛化问卷' }, { path: '/videos', label: '视频库' },\n  { path: '/images', label: '图片库' }, { path: '/documents', label: '文档库' },\n]\nexport function navigationFor(role: Role | undefined, cognitive: boolean): NavigationItem[] {\n  if (!role) return []\n  const items = [...(role === 'STUDENT' ? student : role === 'PARENT' ? parent : staff)]\n  if (cognitive && role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/cognitive' : '/cognitive-assignments', label: role === 'STUDENT' ? '认知测评' : '认知任务' })\n  if (role === 'TEACHER' || role === 'ADMIN') items.push({ path: '/relational/observer', label: '关系测评' })\n  if (role === 'ADMIN') items.push(\n    { path: '/users', label: '用户管理' }, { path: '/teacher-codes', label: '教师码' },\n    { path: '/admin/material-grants', label: '材料授权' }, { path: '/admin/instrument-authorizations', label: '测评授权' },\n  )\n  if (role !== 'PARENT') items.push({ path: role === 'STUDENT' ? '/student/profile' : '/profile', label: '账户设置' })\n  return items\n}\nexport function activeNavigation(items: NavigationItem[], pathname: string): NavigationItem | undefined {\n  return items.flatMap((item) => [item.path, ...(item.aliases || [])].map((path) => ({ item, path })))\n    .filter(({ path }) => pathname === path || (path !== '/student' && path !== '/parent' && pathname.startsWith(`${path}/`)))\n    .sort((a, b) => b.path.length - a.path.length)[0]?.item\n}\nexport function routeTitle(pathname: string, active?: NavigationItem): string {\n  if (pathname.includes('/result') || pathname.endsWith('/report')) return '测评结果'\n  if (pathname.endsWith('/history')) return '测评历史'\n  if (pathname.endsWith('/register')) return '注册账户'\n  if (pathname.endsWith('login')) return '登录 Huisurvey'\n  if (pathname.startsWith('/public/')) return '公开测评'\n  return active?.label || 'Huisurvey'\n}\n""")

replace('frontend/src/components/app-shell/AppShell.tsx',
"{{ STUDENT: '学生', TEACHER: '教师', ADMIN: '管理员' }[user.role]}",
"{{ STUDENT: '学生', TEACHER: '教师', ADMIN: '管理员', PARENT: '家长' }[user.role]}")

replace('frontend/src/pages/Portal.tsx',
"      <Link to={authLink('/teacher/account-login')}><strong>教师入口</strong><span>管理课程与测评，查看学习情况</span></Link>\n      <Link to={authLink('/admin/login')}",
"      <Link to={authLink('/teacher/account-login')}><strong>教师入口</strong><span>管理课程与测评，查看学习情况</span></Link>\n      <Link to={authLink('/parent/login')}><strong>家长入口</strong><span>完成面向孩子的观察测评并查看自己的结果</span></Link>\n      <Link to={authLink('/admin/login')}")

app = 'frontend/src/App.tsx'
replace(app,
"import TeacherAccountLogin from './pages/TeacherAccountLogin'\nimport StudentLogin",
"import TeacherAccountLogin from './pages/TeacherAccountLogin'\nimport ParentLogin from './pages/parent/ParentLogin'\nimport StudentLogin")
replace(app,
"const CompositeReportPage = React.lazy(() => import('./modules/composite/CompositeReportPage'))",
"const CompositeReportPage = React.lazy(() => import('./modules/composite/CompositeReportPage'))\nconst ParentHome = React.lazy(() => import('./pages/parent/ParentHome'))")
replace(app,
"const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: ('STUDENT' | 'TEACHER' | 'ADMIN')[] }> = ({ children, roles = ['TEACHER', 'ADMIN'] }) => <RouteAccess roles={roles}>{children}</RouteAccess>\nconst StudentProtectedRoute",
"const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: ('STUDENT' | 'TEACHER' | 'ADMIN' | 'PARENT')[] }> = ({ children, roles = ['TEACHER', 'ADMIN'] }) => <RouteAccess roles={roles}>{children}</RouteAccess>\nconst ParentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => <RouteAccess roles={['PARENT']}>{children}</RouteAccess>\nconst StudentProtectedRoute")
replace(app,
"    if (user?.role === 'STUDENT') {\n      return <Navigate to=\"/student\" replace />\n    }\n    return <Navigate to=\"/dashboard\" replace />",
"    if (user?.role === 'STUDENT') return <Navigate to=\"/student\" replace />\n    if (user?.role === 'PARENT') return <Navigate to=\"/parent\" replace />\n    return <Navigate to=\"/dashboard\" replace />")
replace(app,
"          <Route\n            path=\"/teacher/account-login\"\n            element={<TeacherAccountLogin />}\n          />",
"          <Route\n            path=\"/teacher/account-login\"\n            element={<TeacherAccountLogin />}\n          />\n          <Route path=\"/parent/login\" element={<ParentLogin />} />")
replace(app,
"          {/* Admin/Teacher Routes */}",
"          <Route\n            path=\"/parent\"\n            element={<ParentProtectedRoute><ParentHome /></ParentProtectedRoute>}\n          />\n\n          {/* Admin/Teacher Routes */}")

parent_dir = ROOT / 'frontend/src/pages/parent'
parent_dir.mkdir(parents=True, exist_ok=True)
(parent_dir / 'ParentLogin.tsx').write_text("""import React, { useState } from 'react'\nimport { Link } from 'react-router-dom'\nimport { ArrowLeft, Loader2, Users } from 'lucide-react'\nimport LoginRecoveryNotice from '../../components/app-shell/LoginRecoveryNotice'\nimport { useLoginReturn } from '../../components/app-shell/useLoginReturn'\nimport { useAuth } from '../../contexts/AuthContext'\n\nexport default function ParentLogin() {\n  const completeLogin = useLoginReturn()\n  const { login } = useAuth()\n  const [username, setUsername] = useState('')\n  const [password, setPassword] = useState('')\n  const [loading, setLoading] = useState(false)\n  const [error, setError] = useState('')\n  const submit = async (event: React.FormEvent) => {\n    event.preventDefault()\n    setLoading(true); setError('')\n    try { await login(username, password); completeLogin() }\n    catch (err: any) { setError(err.message || '登录失败') }\n    finally { setLoading(false) }\n  }\n  return <div className=\"min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 flex items-center justify-center p-4\">\n    <div className=\"w-full max-w-md\">\n      <Link to=\"/\" className=\"inline-flex items-center text-gray-600 hover:text-gray-800 mb-6\"><ArrowLeft className=\"w-5 h-5 mr-1\" />返回入口</Link>\n      <div className=\"text-center mb-8\"><div className=\"w-16 h-16 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg\"><Users className=\"w-10 h-10 text-white\" /></div><h1 className=\"text-2xl font-bold text-gray-800\">家长登录</h1><p className=\"text-gray-500 mt-2\">使用学校为您建立的家长账号</p></div>\n      <div className=\"card\"><LoginRecoveryNotice />{error && <div role=\"alert\" className=\"mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm\">{error}</div>}\n        <form onSubmit={submit} className=\"space-y-4\">\n          <div><label htmlFor=\"parent-username\" className=\"block text-sm font-medium text-gray-700 mb-1\">用户名</label><input id=\"parent-username\" autoComplete=\"username\" className=\"input\" value={username} onChange={(event) => setUsername(event.target.value)} required /></div>\n          <div><label htmlFor=\"parent-password\" className=\"block text-sm font-medium text-gray-700 mb-1\">密码</label><input id=\"parent-password\" type=\"password\" autoComplete=\"current-password\" className=\"input\" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>\n          <button type=\"submit\" disabled={loading} className=\"w-full btn-primary flex items-center justify-center gap-2\">{loading && <Loader2 className=\"w-5 h-5 animate-spin\" />}{loading ? '登录中…' : '登录'}</button>\n        </form>\n      </div>\n    </div>\n  </div>\n}\n""")
(parent_dir / 'ParentHome.tsx').write_text("""import { Link } from 'react-router-dom'\nimport { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'\n\nexport default function ParentHome() {\n  return <ProductPage width=\"reading\">\n    <PageHeader title=\"家长首页\" description=\"完成您本人作为观察者的测评。孩子的自评、其他家长或教师的原始作答不会在这里混合展示。\" />\n    <ProductStatus kind=\"info\" title=\"关系测评\">\n      已分配给您的任务和可自助开始的已发布测评会出现在 <Link to=\"/parent/observer\">观察测评</Link>。\n    </ProductStatus>\n  </ProductPage>\n}\n""")

replace('frontend/src/components/app-shell/__tests__/access.test.ts',
"    expect(returnAfterLogin('/scale-library/key/1', 'STUDENT')).toBe('/scale-library/key/1')",
"    expect(returnAfterLogin('/scale-library/key/1', 'STUDENT')).toBe('/scale-library/key/1')\n    expect(returnAfterLogin('/dashboard', 'PARENT')).toBe('/parent')\n    expect(returnAfterLogin('/parent/observer', 'PARENT')).toBe('/parent/observer')\n    expect(returnAfterLogin('/student/scales/1', 'PARENT')).toBe('/parent')")
replace('frontend/src/components/app-shell/__tests__/access.test.ts',
"  it('keeps admin and disabled capability items out of other menus', () => {",
"  it('keeps parent navigation isolated from staff and student surfaces', () => {\n    const items = navigationFor('PARENT', true)\n    expect(items.map((item) => item.path)).toEqual(['/parent', '/parent/observer'])\n    expect(activeNavigation(items, '/parent/observer')).toBeDefined()\n  })\n  it('keeps admin and disabled capability items out of other menus', () => {")

print('RA-02 parent shell patch applied')
