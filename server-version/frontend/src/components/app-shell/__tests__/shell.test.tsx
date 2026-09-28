import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '../AppShell'
import { RouteAccess } from '../RouteAccess'
import { readReauthReturn, rememberReauthReturn } from '../access'
import type { User } from '../../../types'

const auth = vi.hoisted(() => ({
  user: null as User | null,
  isLoading: false,
  logout: vi.fn(),
  reauthReturn: null,
  clearReauthentication: vi.fn(),
}))
const organization = vi.hoisted(() => ({
  organizations: [] as Array<{ id: string; name: string; status: 'ACTIVE' | 'SUSPENDED' }>,
  total: 0,
  platformRole: null as string | null,
  active: null as any,
  isLoading: false,
  error: null as string | null,
  activeLoading: false,
  activeError: null as string | null,
  refresh: vi.fn(),
  selectOrganization: vi.fn(),
}))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: { children: React.ReactNode }) => children,
  useOrganization: () => organization,
}))
vi.mock('../../../pages/FirstLoginPasswordChange', () => ({ default: () => <p>修改临时密码</p> }))
const student = { id: 's1', role: 'STUDENT', username: 'student' } as User
beforeEach(() => {
  auth.user = student
  auth.isLoading = false
  auth.reauthReturn = null
  auth.clearReauthentication.mockReset()
  auth.clearReauthentication.mockImplementation(() => sessionStorage.removeItem('huisurvey:reauth-return'))
  organization.organizations = []
  organization.total = 0
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
    render(<MemoryRouter initialEntries={['/assignments']}><AppShell><h1>作业页面</h1></AppShell></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '主要导航' })
    expect(nav).toHaveTextContent('教学管理')
    expect(nav).toHaveTextContent('测评内容')
    expect(nav).toHaveTextContent('内容资源')
    expect(screen.getByRole('link', { name: '作业管理' })).toHaveAttribute('aria-current', 'page')
    const search = screen.getByRole('searchbox', { name: '查找管理页面' })
    await userEvent.type(search, '文档')
    expect(screen.getByRole('link', { name: '文档库' })).toBeVisible()
    expect(screen.queryByRole('link', { name: '作业管理' })).not.toBeInTheDocument()
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
