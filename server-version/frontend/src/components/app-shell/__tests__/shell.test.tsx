vi.mock('../../AssessmentTaskShortcut', () => ({ default: () => null }))
vi.mock('../../../api/relational', () => ({ relationalApi: { catalog: async () => [], tasks: async () => [] } }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '../AppShell'
import { RouteAccess,RouteLoading } from '../RouteAccess'
import { readReauthReturn, rememberReauthReturn } from '../access'
import type { User } from '../../../types'

const auth = vi.hoisted(() => ({
  user: null as User | null,
  isLoading: false,
  logout: vi.fn(),
  reauthReturn: null,
  clearReauthentication: vi.fn(),
}))
const presentation = vi.hoisted(() => ({ training: false }))
vi.mock('../../../training/context', async importOriginal => ({
  ...await importOriginal<typeof import('../../../training/context')>(),
  isTrainingHost: () => presentation.training,
}))
const organization = vi.hoisted(() => ({
  organizations: [] as Array<{ id: string; name: string; status: 'ACTIVE' | 'SUSPENDED' }>,
  total: 0,
  allowedActions: [] as string[],
  platformRole: null as string | null,
  active: null as any,
  isLoading: false,
  error: null as string | null,
  activeLoading: false,
  activeError: null as string | null,
  refresh: vi.fn(),
  selectOrganization: vi.fn(),
}))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth,AccountViewProvider:({children}:{children:import('react').ReactNode})=>children }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true, useCapabilities: () => ({cognitiveEnabled:true,parentPortalEnabled:false}) }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: { children: React.ReactNode }) => children,
  useOrganization: () => organization,
}))
vi.mock('../../../pages/FirstLoginPasswordChange', () => ({ default: () => <p>修改临时密码</p> }))
const student = { id: 's1', role: 'STUDENT', username: 'student' } as User
beforeEach(() => {
  presentation.training = false
  auth.user = student
  auth.isLoading = false
  auth.reauthReturn = null
  auth.clearReauthentication.mockReset()
  auth.clearReauthentication.mockImplementation(() => sessionStorage.removeItem('huisurvey:reauth-return'))
  organization.organizations = []
  organization.total = 0
  organization.allowedActions = []
  organization.platformRole = null
  organization.active = null
  organization.isLoading = false
  organization.error = null
  organization.activeLoading = false
  organization.activeError = null
  organization.refresh.mockReset()
  organization.refresh.mockResolvedValue(undefined)
  organization.selectOrganization.mockReset()
  sessionStorage.clear()
})

describe('Training administrator workspace presentation',()=>{
  it.each([false,true])('uses Training navigation for its explicit entry grant, Training host=%s',training=>{
    presentation.training=training
    auth.user={id:'training-manager',role:'STUDENT',businessRole:'STUDENT',username:'training-manager',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING',version:1}]} as User
    const view=render(<MemoryRouter initialEntries={['/admin/training']}><AppShell><h1>培训管理内容</h1></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-management-frame')).not.toBeNull()
    expect(screen.getByRole('link',{name:'Training 首页'}).querySelector('img')).toHaveAttribute('alt','Training @EduK12.top')
    const nav=screen.getByRole('navigation',{name:'主要导航'})
    expect(nav).toHaveTextContent('用户管理课程监管资源与授权')
    expect(nav.querySelector('a[href*="workspace=business"]')).toBeNull()
    expect(screen.queryByRole('searchbox',{name:'查找管理页面'})).not.toBeInTheDocument()
    expect(screen.queryByText(/业务身份：/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading',{name:'培训管理内容'}))
    expect(screen.getByRole('link',{name:'账户设置'})).toHaveAttribute('href','/admin/training/profile')
    expect(screen.getByRole('button',{name:'退出登录'})).toBeEnabled()
    const appearance=screen.getByRole('button',{name:/^外观：/}),logout=screen.getByRole('button',{name:'退出登录'})
    expect(logout.compareDocumentPosition(appearance)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(appearance.closest('.training-management-account')?.lastElementChild).toContainElement(appearance)
  })
})

describe('Training vector tab icon',()=>{
  it.each(['/admin/training','/admin/training/accounts','/admin/training/courses','/admin/training/resources','/admin/training/profile','/admin/login?returnTo=%2Fadmin%2Ftraining','/admin/security/enroll?returnTo=%2Fadmin%2Ftraining'])('uses the cache-versioned vector mark on %s',path=>{
    auth.user={id:'manager',username:'manager',role:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}]} as User
    const icon=document.createElement('link');icon.rel='icon';icon.type='image/svg+xml';document.head.append(icon)
    try{
      render(<MemoryRouter initialEntries={[path]}><AppShell><p>Training 页面</p></AppShell></MemoryRouter>)
      expect(icon).toHaveAttribute('href','/training/favicon.svg?v=20261023-compact')
      expect(icon).toHaveAttribute('type','image/svg+xml')
    }finally{icon.remove()}
  })
})

describe('Training management appearance on the admin origin',()=>{
  it('keeps Training startup colors and loading copy while the administrator session is loading',()=>{
    const boot='training:appearance:boot:v1',key='training:appearance:v1:loading-admin'
    localStorage.setItem(boot,'dark');localStorage.setItem(key,'light')
    auth.user=null;auth.isLoading=true
    try{
      const view=render(<MemoryRouter initialEntries={['/admin/training/resources']}><AppShell><RouteLoading/></AppShell></MemoryRouter>)
      expect(document.title).toBe('Training')
      expect(view.container.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','dark')
      expect(screen.getByRole('status')).toHaveTextContent('正在加载 Training 管理')
      expect(view.container.querySelector('.hui-product-header')).toBeNull()
      auth.user={id:'loading-admin',username:'manager',role:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}]} as User;auth.isLoading=false
      view.rerender(<MemoryRouter initialEntries={['/admin/training/resources']}><AppShell><p>账号读取完成</p></AppShell></MemoryRouter>)
      expect(view.container.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','light')
      expect(localStorage.getItem(boot)).toBe('light')
    }finally{localStorage.removeItem(boot);localStorage.removeItem(key)}
  })

  it.each(['accounts','courses','resources'])('shows the appearance control and remembers its choice on %s',async page=>{
    presentation.training=false
    const id='theme-admin-'+page,key='training:appearance:v1:'+id
    auth.user={id,username:'theme-admin',role:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}]} as User
    localStorage.setItem(key,'light')
    try{
      const view=render(<MemoryRouter initialEntries={['/admin/training/'+page]}><AppShell><h1>管理内容</h1></AppShell></MemoryRouter>)
      expect(view.container.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','light')
      await userEvent.click(screen.getByRole('button',{name:'外观：浅色，点击切换为深色'}))
      expect(view.container.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','dark')
      expect(localStorage.getItem(key)).toBe('dark')
      view.unmount()
      const reopened=render(<MemoryRouter initialEntries={['/admin/training/'+page]}><AppShell><h1>管理内容</h1></AppShell></MemoryRouter>)
      expect(reopened.container.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','dark')
      expect(screen.getByRole('button',{name:'外观：深色，点击切换为自动'})).toBeVisible()
    }finally{localStorage.removeItem(key)}
  })
  it('loads the saved Training preference when entering from another admin-origin page',async()=>{
    presentation.training=false
    auth.user={id:'theme-route-admin',username:'manager',role:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}]} as User
    const key='training:appearance:v1:theme-route-admin';localStorage.setItem(key,'dark')
    try{
      render(<MemoryRouter initialEntries={['/student']}><AppShell><Link to="/admin/training/resources">进入培训管理</Link><Link to="/student">返回学员页</Link></AppShell></MemoryRouter>)
      expect(screen.queryByRole('button',{name:/^外观：/})).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('link',{name:'进入培训管理'}))
      expect(document.querySelector('.training-management-frame')).toHaveAttribute('data-training-theme','dark')
      expect(screen.getByRole('button',{name:'外观：深色，点击切换为自动'})).toBeVisible()
      await userEvent.click(screen.getByRole('link',{name:'返回学员页'}))
      expect(document.querySelector('.training-management-frame')).toBeNull()
      expect(screen.queryByRole('button',{name:/^外观：/})).not.toBeInTheDocument()
    }finally{localStorage.removeItem(key)}
  })
})

describe('Training nested-page auth branding',()=>{
  it.each(['/admin/login','/admin/security/enroll'])('keeps Training tab branding for a resource return through %s',path=>{
    auth.user=null
    render(<MemoryRouter initialEntries={[path+'?returnTo=%2Fadmin%2Ftraining%2Fresources']}><AppShell><p>身份验证</p></AppShell></MemoryRouter>)
    expect(document.title).toBe('Training')
  })
})

describe('Training management section context',()=>{
  it('keeps the administrator banner and account location on the dedicated profile page',()=>{
    auth.user={id:'manager',username:'manager',role:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}]} as User
    render(<MemoryRouter initialEntries={['/admin/training/profile']}><AppShell><h1>个人信息</h1></AppShell></MemoryRouter>)
    expect(document.querySelector('.training-management-frame')).not.toBeNull()
    expect(screen.getByRole('link',{name:'账户设置'})).toHaveAttribute('aria-current','page')
    expect(screen.getByRole('navigation',{name:'主要导航'}).querySelectorAll('[aria-current=page]')).toHaveLength(0)
    expect(document.title).toBe('Training')
  })

  it('marks the resource page and uses only banner tabs',()=>{
    auth.user={id:'training-manager',role:'STUDENT',username:'training-manager',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING',version:1}]} as User
    render(<MemoryRouter initialEntries={['/admin/training/resources']}><AppShell><p>管理内容</p></AppShell></MemoryRouter>)
    expect(screen.getByRole('link',{name:'资源与授权'})).toHaveAttribute('aria-current','page')
    expect(screen.queryByRole('link',{name:'管理概览'})).not.toBeInTheDocument()
    expect(document.querySelector('.training-management-rail')).toBeNull()
    const tabs=screen.getByRole('navigation',{name:'主要导航'})
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(tabs.querySelectorAll('a')).toHaveLength(3)
    expect(screen.getByRole('link',{name:'资源与授权'})).toHaveAttribute('href','/admin/training/resources')
    expect(screen.getByRole('banner')).toContainElement(tabs)
    expect(screen.getByRole('link',{name:'京ICP备2026001512号-2'})).toHaveAttribute('href','https://beian.miit.gov.cn/')
  })
})

describe('Survey administrator presentation',()=>{
  it('keeps Survey tab branding through enrollment and clears it when leaving the Survey login context',async()=>{
    auth.user=null
    const icon=document.createElement('link');icon.rel='icon';icon.href='/vite.svg';document.head.append(icon)
    try{
      render(<MemoryRouter initialEntries={['/admin/login']}><AppShell>
        <Link to="/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers">Survey 登录</Link>
        <Link to="/admin/security/enroll?returnTo=%2Fadmin%2Fsurvey-researchers">Survey 绑定</Link>
        <Link to="/admin/login">通用登录</Link>
      </AppShell></MemoryRouter>)
      expect(document.title).not.toBe('Research')
      for(const name of ['Survey 登录','Survey 绑定']){
        await userEvent.click(screen.getByRole('link',{name}))
        expect(document.title).toBe('Research')
        expect(icon).toHaveAttribute('href','/survey/huisurvey-w2-emblem.svg')
      }
      await userEvent.click(screen.getByRole('link',{name:'通用登录'}))
      expect(document.title).not.toBe('Research')
      expect(icon).toHaveAttribute('href','/vite.svg')
    }finally{icon.remove()}
  })
  it.each(['/admin/survey-researchers','/admin/scale-library-governance?workspace=survey'])(
    'keeps scoped management navigation on the canonical Training host at %s',path=>{
      presentation.training=true
      auth.user={id:'survey-manager',role:'STUDENT',businessRole:'STUDENT',username:'manager',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]} as User
      render(<MemoryRouter initialEntries={[path]}><AppShell><p>研究管理内容</p></AppShell></MemoryRouter>)
      const navigation=screen.getByRole('navigation',{name:'主要导航'})
      expect(screen.queryByRole('searchbox',{name:'查找管理页面'})).not.toBeInTheDocument()
      expect(navigation).toHaveTextContent('研究者与授权')
      expect(navigation).toHaveTextContent('工具公库与审批')
      expect(navigation).not.toHaveTextContent('Survey 首页')
      expect(navigation.querySelector('a[href*="workspace=business"]')).toBeNull()
      expect(screen.queryByText(/业务身份：/)).not.toBeInTheDocument()
      expect(navigation).not.toHaveTextContent('Training 培训管理')
      expect(navigation).not.toHaveTextContent('系统治理与入口授权')
    })
  it.each([
    ['STUDENT','/admin/survey-researchers'],
    ['TEACHER','/admin/survey-researchers'],
    ['STUDENT','/admin/scale-library-governance?workspace=survey'],
    ['TEACHER','/admin/scale-library-governance?workspace=survey'],
  ])('uses independent Survey management authority for the %s business identity at %s',(role,path)=>{
    presentation.training=true
    auth.user={id:'entry-manager',role,businessRole:role,username:'manager',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]} as User
    const view=render(<MemoryRouter initialEntries={[path]}><AppShell><h1>获授权的研究管理页面</h1></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.hui-survey-admin-shell')).not.toBeNull()
    expect(view.container.querySelector('.hui-training,.training-workspace-shell')).toBeNull()
    expect(screen.getByRole('banner').querySelector('.survey-brand img')).toHaveAttribute('src','/survey/huisurvey-w2-emblem.svg')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Research · 观风知微')
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading',{name:'获授权的研究管理页面'}))
  })
  it.each([
    ['/admin/survey-researchers',false],
    ['/admin/survey-researchers',true],
    ['/admin/scale-library-governance?workspace=survey',false],
    ['/admin/scale-library-governance?workspace=survey',true],
  ])('retains Survey branding and the actual page on %s, Training host=%s',(path,training)=>{
    presentation.training=training
    auth.user={id:'survey-admin',role:'ADMIN',username:'manager',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]} as User
    const view=render(<MemoryRouter initialEntries={[path]}><AppShell><h1>既有管理内容</h1></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.hui-survey-admin-shell')).not.toBeNull()
    expect(view.container.querySelector('.hui-training')).toBeNull()
    expect(screen.getByRole('banner').querySelector('.survey-brand img')).toHaveAttribute('src','/survey/huisurvey-w2-emblem.svg')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Research · 观风知微')
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading',{name:'既有管理内容'}))
  })
  it.each(['/admin/permissions?workspace=survey','/admin/training','/admin/scale-library-governance?workspace=training'])(
    'does not restyle another management context at %s',path=>{
      presentation.training=true
      auth.user={id:'admin',role:'ADMIN',username:'manager',platformRole:'SYSTEM_ADMIN'} as User
      const view=render(<MemoryRouter initialEntries={[path]}><AppShell><p>原管理内容</p></AppShell></MemoryRouter>)
      expect(view.container.querySelector('.hui-survey-admin-shell')).toBeNull()
      expect(view.container.querySelector('.hui-training')).not.toBeNull()
      expect(screen.getByText('原管理内容')).toBeVisible()
    })
})

describe('Training assessment presentation boundary', () => {
  it.each([
    '/student/scales/scale-1', '/student/questionnaires/questionnaire-1',
    '/student/composite/attempts/attempt-1', '/student/cognitive/sessions/session-1',
    '/student/composite/situational/attempt-1', '/student/scales/result/result-1',
  ])('uses Training presentation on %s while preserving the existing content', path => {
    presentation.training = true
    const view = render(<MemoryRouter initialEntries={[path]}><AppShell><button>既有作答操作</button><div data-cognitive-task-root>既有刺激</div></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.hui-training.training-assessment-visual')).not.toBeNull()
    expect(view.container.querySelector('.hui-brand')).toContainElement(screen.getByRole('img', { name: 'Training @EduK12.top' }))
    expect(screen.getByRole('button', { name: '既有作答操作' })).toBeEnabled()
    expect(view.container.querySelector('[data-cognitive-task-root]')).toHaveTextContent('既有刺激')
  })
  it('keeps the Survey runner brand and presentation unchanged', () => {
    const view = render(<MemoryRouter initialEntries={['/student/composite/attempts/a']}><AppShell><p>Survey 作答内容</p></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-assessment-visual')).toBeNull()
    expect(view.container.querySelector('.hui-brand')).toHaveTextContent('Huisurvey')
  })
})

describe('Training learner header', () => {
  it.each(['/student', '/student/', '/student/courses/course-1', '/student/checkins/checkin-1?courseId=course-1&courseSection=checkins', '/student/assignments/assignment-1', '/student/profile'])('omits navigation on %s and keeps account settings and logout', path => {
    presentation.training = true
    const view = render(<MemoryRouter initialEntries={[path]}><AppShell><h1>我的课程</h1></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-workspace-menu')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '主要导航' })).toBeNull()
    expect(screen.getByRole('link', { name: /个人账号设置/ })).toHaveAttribute('href', '/student/profile')
    expect(screen.getByRole('button', { name: '退出登录' })).toBeEnabled()
  })

})

describe('Training teacher visual boundary', () => {
  it.each(['/student/cognitive', '/scale-library/tool/v1'])('redirects a Training student discovery route before its page mounts: %s', async path => {
    presentation.training = true
    auth.user = { id: 'student', role: 'STUDENT', username: 'learner' } as User
    const Discovery = vi.fn(() => <p>自由选测</p>)
    render(<MemoryRouter initialEntries={[path]}><AppShell><Routes>
      <Route path="/student" element={<h1>我的课程内容</h1>} />
      <Route path="*" element={<Discovery />} />
    </Routes></AppShell></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: '我的课程内容' })).toBeInTheDocument()
    expect(Discovery).not.toHaveBeenCalled()
  })
  it.each(['/dashboard', '/courses/c1/detail?section=assessments', '/questionnaire-products/new?courseId=c1'])('omits the global menu inside the teacher course workspace at %s', path => {
    presentation.training = true
    auth.user = { id: 'teacher', role: 'TEACHER', username: 'trainer' } as User
    const view = render(<MemoryRouter initialEntries={[path]}><AppShell><p>课程内容</p></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-workspace-menu')).toBeNull()
    expect(screen.getByRole('link', { name: /个人账号设置/ })).toBeInTheDocument()
    if (path.startsWith('/questionnaire-products')) expect(screen.getByRole('navigation', { name: '课程管理内容' })).toBeInTheDocument()
  })
  it.each([
    ['/dashboard', 'courses'],
    ['/courses/c1/students', 'roster'],
    ['/assignments', 'teaching'],
    ['/images', 'resources'],
    ['/questionnaire-products/draft', 'assessments'],
    ['/composite-assessments/draft/results', 'reports'],
    ['/profile', 'account'],
    ['/teacher/classrooms/room/control', 'classroom'],
  ])('applies the common teacher presentation on %s without replacing the page', (path, family) => {
    presentation.training = true
    auth.user = { id: 't1', role: 'TEACHER', username: 'trainer' } as User
    const view = render(<MemoryRouter initialEntries={[path]}><AppShell><h1>当前业务页面</h1><button>既有操作</button></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-teacher-visual')).not.toBeNull()
    expect(screen.getByRole('main')).toHaveAttribute('data-training-family', family)
    expect(screen.getByRole('heading', { name: '当前业务页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '既有操作' })).toBeEnabled()
    expect(screen.queryByRole('navigation', { name: '主要导航' })).toBeNull()
    const workspace = screen.getByRole('navigation', { name: '教师工作台' })
    expect(screen.getByRole('banner')).toContainElement(workspace)
    expect(screen.getByRole('main')).not.toContainElement(workspace)
    expect(workspace).toHaveTextContent('课程')
    expect(workspace).toHaveTextContent('媒体')
    expect(workspace).toHaveTextContent('工具')
  })
  it.each([
    ['/dashboard', '课程'], ['/media-library', '媒体'], ['/toolkit', '工具'],
  ])('keeps one active workspace link with account actions in the header: %s', (path, label) => {
    presentation.training = true
    auth.user = { id: 't1', role: 'TEACHER', username: 'trainer' } as User
    render(<MemoryRouter initialEntries={[path]}><AppShell><p>工作台内容</p></AppShell></MemoryRouter>)
    const header = screen.getByRole('banner')
    const workspace = screen.getByRole('navigation', { name: '教师工作台' })
    expect(workspace.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    expect(header).toContainElement(screen.getByRole('link', { name: /个人账号设置/ }))
    expect(header).toContainElement(screen.getByRole('button', { name: '退出登录' }))
  })
  it.each([
    ['STUDENT', true, '/student'],
    ['ADMIN', true, '/admin/training'],
    ['TEACHER', false, '/dashboard'],
    ['TEACHER', true, '/teacher/situational/example'],
    ['TEACHER', true, '/teacher/situational/attempts/run-id'],
    ['TEACHER', true, '/student/cognitive/sessions/run-id'],
  ] as const)('keeps %s/%s/%s outside the teacher skin', (role, training, path) => {
    presentation.training = training
    auth.user = { id: 'principal', role, username: 'principal' } as User
    const view = render(<MemoryRouter initialEntries={[path]}><AppShell><p>原有内容</p></AppShell></MemoryRouter>)
    expect(view.container.querySelector('.training-teacher-visual')).toBeNull()
    expect(screen.getByRole('main')).not.toHaveAttribute('data-training-family')
    expect(screen.getByText('原有内容')).toBeInTheDocument()
  })
})
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output> }
it('preserves protected deep-link query and hash through sign-in redirect', () => {
  auth.user = null
  render(<MemoryRouter initialEntries={['/student/scales/1?attempt=a#answer']}><Routes><Route path="/student/scales/:id" element={<RouteAccess roles={['STUDENT']}><p>private</p></RouteAccess>} /><Route path="/student/login" element={<Location />} /></Routes></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('/student/login?returnTo=%2Fstudent%2Fscales%2F1%3Fattempt%3Da%23answer')
  expect(screen.queryByText('private')).not.toBeInTheDocument()
})
it('never mounts protected children for another account after expiry', () => {
  rememberReauthReturn({ id: 'original', role: 'STUDENT' }, '/student/scales/1?returnTo=%2Fstudent')
  const child = vi.fn(() => <p>draft contents</p>)
  const Child = child
  render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><Child /></RouteAccess></MemoryRouter>)
  expect(screen.getByText('请使用原账户继续')).toBeInTheDocument()
  expect(child).not.toHaveBeenCalled()
})
it('consumes the matching reauth hint after the original account safely resumes', async () => {
  rememberReauthReturn(student, '/student/scales/1')
  const first = render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><p>authorized page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('authorized page')).toBeInTheDocument()
  await waitFor(() => expect(auth.clearReauthentication).toHaveBeenCalledTimes(1))
  expect(readReauthReturn()).toBeNull()
  first.unmount()

  auth.user = { ...student, id: 's2', username: 'second-student' }
  render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><p>second account page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('second account page')).toBeInTheDocument()
  expect(screen.queryByText('请使用原账户继续')).not.toBeInTheDocument()
})
it('does not let an unrelated reauth hint choose the login role for a shared route', () => {
  rememberReauthReturn(student, '/student/scales/1')
  auth.user = null
  render(<MemoryRouter initialEntries={['/scale-library/test/v1']}><Routes>
    <Route path="/scale-library/:key/:version" element={<RouteAccess roles={['STUDENT', 'TEACHER', 'ADMIN']}><p>library</p></RouteAccess>} />
    <Route path="/" element={<Location />} />
    <Route path="/teacher/account-login" element={<p>teacher login</p>} />
  </Routes></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('/?returnTo=%2Fscale-library%2Ftest%2Fv1')
  expect(screen.queryByText('teacher login')).not.toBeInTheDocument()
})
it('resumes the original account and retains mandatory password change', () => {
  rememberReauthReturn(student, '/student/scales/1')
  auth.user = { ...student, mustChangePassword: true }
  const { rerender } = render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><p>authorized page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('修改临时密码')).toBeInTheDocument()
  expect(auth.clearReauthentication).not.toHaveBeenCalled()
  expect(readReauthReturn()).not.toBeNull()

  auth.user = student
  rerender(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><p>authorized page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('authorized page')).toBeInTheDocument()
})
describe('one shared chrome', () => {
  it('selects one active nav item and returns focus on Escape', async () => {
    render(<MemoryRouter initialEntries={['/student/cognitive/history']}><AppShell><h1>历史</h1></AppShell></MemoryRouter>)
    const primaryNav = screen.getByRole('navigation', { name: '主要导航' })
    expect(primaryNav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(primaryNav).toHaveTextContent('认知测评')
    const toggle = screen.getByRole('button', { name: '导航菜单' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const nav = screen.getByRole('navigation', { name: '主要导航' })
    nav.querySelector('a')?.focus()
    await userEvent.keyboard('{Escape}')
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
  it('shows server-projected Organization scope independently of legacy user role', async () => {
    organization.organizations = [
      { id: 'org-a', name: '组织 A', status: 'ACTIVE' },
      { id: 'org-b', name: '组织 B', status: 'SUSPENDED' },
    ]
    organization.total = 2
    organization.total = 2
    organization.selectOrganization.mockResolvedValue(null)
    render(<MemoryRouter initialEntries={['/student']}><AppShell><h1>学生首页</h1></AppShell></MemoryRouter>)
    const selector = screen.getByRole('combobox', { name: '当前组织' })
    expect(selector).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '组织 B（已暂停）' })).toBeInTheDocument()
    await userEvent.selectOptions(selector, 'org-b')
    expect(organization.selectOrganization).toHaveBeenCalledWith('org-b')
  })
  it('hides Delivery when an explicit export deny overrides an export capability', () => {
    organization.organizations = [{ id: 'org-a', name: '组织 A', status: 'ACTIVE' }]
    organization.active = {
      organization: { id: 'org-a', name: '组织 A', status: 'ACTIVE' },
      access: {
        membershipId: 'membership-a',
        orgRole: 'MEMBER',
        capabilities: ['REPORT_EXPORT'],
        personas: [],
        explicitDenies: ['REPORT_EXPORT'],
        canGovern: false,
      },
    } as any
    render(<MemoryRouter initialEntries={['/student']}><AppShell><h1>学生首页</h1></AppShell></MemoryRouter>)
    expect(screen.queryByRole('link', { name: '安全事项与导出' })).not.toBeInTheDocument()
  })
  it('keeps Safety responsibility discoverable for a suspended teacher owner', () => {
    organization.organizations = [{ id: 'org-a', name: '组织 A', status: 'SUSPENDED' }]
    organization.active = {
      allowedActions: ['SAFETY', 'DELIVERY'],
      organization: { id: 'org-a', name: '组织 A', status: 'SUSPENDED' },
      access: {
        membershipId: 'membership-a',
        orgRole: 'MEMBER',
        capabilities: [],
        personas: ['TEACHER'],
        explicitDenies: [],
        canGovern: false,
      },
    } as any
    render(<MemoryRouter initialEntries={['/student']}><AppShell><h1>学生首页</h1></AppShell></MemoryRouter>)
    expect(screen.getByRole('link', { name: '安全事项与导出' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '报告分析' })).not.toBeInTheDocument()
  })
  it('renders grouped staff navigation without changing the active destination', async () => {
    auth.user = { id: 't1', role: 'TEACHER', username: 'teacher' } as User
    render(<MemoryRouter initialEntries={['/assignments']}><AppShell><h1>练习页面</h1></AppShell></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '主要导航' })
    expect(nav).toHaveTextContent('教学管理')
    expect(nav).toHaveTextContent('测评内容')
    expect(nav).toHaveTextContent('内容资源')
    expect(screen.getByRole('link', { name: '练习管理' })).toHaveAttribute('aria-current', 'page')
    const search = screen.getByRole('searchbox', { name: '查找管理页面' })
    await userEvent.type(search, '文档')
    expect(screen.getByRole('link', { name: '文档库' })).toBeVisible()
    expect(screen.queryByRole('link', { name: '练习管理' })).not.toBeInTheDocument()
  })
  it('keeps focused player descendants outside product token scope', () => {
    render(<MemoryRouter initialEntries={['/public/cognitive/sessions/s1']}><AppShell><button>task control</button></AppShell></MemoryRouter>)
    expect(screen.queryByRole('navigation', { name: '主要导航' })).not.toBeInTheDocument()
    expect(screen.getByText('公开参与')).toBeInTheDocument()
    expect(screen.getByText('task control').closest('.hui-product')).toBeNull()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
it('uses authentication and reauth identity without legacy-role gating for shared runtimes', () => {
  auth.user = { id: 'admin-respondent', role: 'ADMIN', username: 'admin' } as User
  render(<MemoryRouter initialEntries={['/relational/attempts/run-attempt']}><RouteAccess><p>assigned runtime</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('assigned runtime')).toBeInTheDocument()
})

it('hides creation without server permission and legacy archive for a standard platform principal', () => {
  auth.user = { ...student, role: 'ADMIN' }
  organization.platformRole = 'STANDARD'
  render(<MemoryRouter initialEntries={['/users']}><AppShell><p>用户管理内容</p></AppShell></MemoryRouter>)
  expect(screen.queryByRole('link', { name: '创建组织' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '历史归档（只读）' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '组织概览' })).not.toBeInTheDocument()
})

it('requires explicit directory creation permission even for SYSTEM_ADMIN', async () => {
  auth.user = { ...student, role: 'ADMIN' }
  organization.platformRole = 'SYSTEM_ADMIN'
  const view = render(<MemoryRouter initialEntries={['/dashboard']}><AppShell><p>业务工作台内容</p></AppShell></MemoryRouter>)
  expect(screen.queryByRole('link', { name: '创建组织' })).not.toBeInTheDocument()
  organization.allowedActions = ['CREATE_ORGANIZATION']
  view.rerender(<MemoryRouter initialEntries={['/dashboard']}><AppShell><p>业务工作台内容</p></AppShell></MemoryRouter>)
  await userEvent.click(screen.getByRole('button',{name:'系统管理'}))
  expect(screen.getByRole('link', { name: '创建组织' })).toHaveAttribute('href', '/organizations/new')
})

it.each([
  ['ADMIN', 'SYSTEM_ADMIN', false], ['ADMIN', 'STANDARD', false],
  ['TEACHER', 'STANDARD', true], ['STUDENT', 'STANDARD', true],
] as const)('shows Survey management only with an explicit entry grant (%s/%s)', (role, platformRole, visible) => {
  auth.user = { id: 'synthetic', username: 'synthetic', role, platformRole,entryGrants:visible?[{entry:'SURVEY',version:1}]:[] } as User
  organization.platformRole = platformRole
  render(<MemoryRouter initialEntries={['/admin/entrances']}><AppShell><p>content</p></AppShell></MemoryRouter>)
  const links = screen.queryAllByRole('link', { name: 'Survey 研究管理' })
  expect(links.length > 0).toBe(visible)
  for (const link of links) expect(link).toHaveAttribute('href', '/admin/survey-researchers')
})

it('routes anonymous direct Survey governance entry to administrator login without changing role authorization', () => {
  auth.user = null
  render(<MemoryRouter initialEntries={['/admin/survey-researchers']}><Routes>
    <Route path="/admin/survey-researchers" element={<RouteAccess><p>governance</p></RouteAccess>} />
    <Route path="/admin/login" element={<Location />} />
  </Routes></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
  expect(screen.queryByText('governance')).not.toBeInTheDocument()
})
