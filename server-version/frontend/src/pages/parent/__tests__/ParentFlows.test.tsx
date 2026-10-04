import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  auth: {
    setUser: vi.fn(),
    user: { id: 'student', role: 'STUDENT', platformRole: 'STANDARD' },
  },
  cap: {
    status: 'ready',
    isLoading: false,
    parentPortalEnabled: true,
    retry: vi.fn(),
  },
  organization: { active: null, platformRole: 'STANDARD' },
  parents: {
    previewConsent: vi.fn(),
    acceptConsent: vi.fn(),
    withdraw: vi.fn(),
    report: vi.fn(),
  },
  accounts: { list: vi.fn() },
}))
const passwordApi = vi.hoisted(() => ({ changePassword: vi.fn() }))
vi.mock('../../../api/auth', () => ({ authApi: passwordApi }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => state.auth }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({
  useCapabilities: () => state.cap,
}))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => state.organization,
}))
vi.mock('../../../api/parents', () => ({ parentsApi: state.parents }))
vi.mock('../../../api/parentAccounts', () => ({
  parentAccountsApi: state.accounts,
}))
import ParentConsentPage from '../ParentConsentPage'
import ParentProfile from '../ParentProfile'
import ParentChildReportPage from '../ParentChildReportPage'
import ParentAccountsPage from '../ParentAccountsPage'
import ParentReportView from '../ParentReportView'
const preview = {
  relationshipId: 'link',
  artifactId: 'report',
  parentName: '确认家长',
  projection: {
    audience: 'PARENT',
    title: '家长专用摘要',
    summary: '本次可披露内容',
    blocks: [],
  },
  publicationHash: 'f'.repeat(64),
  consentVersion: 'exact-v1',
  consentText: '同意本份内容',
  commandKey: 'exact-command',
  canConsent: true,
  canRevoke: false,
  consentStatus: 'NOT_ACCEPTED',
}
const consent = () =>
  render(
    <MemoryRouter
      initialEntries={['/student/parent-links/link/reports/report']}
    >
      <Routes>
        <Route
          path="/student/parent-links/:relationshipId/reports/:artifactId"
          element={<ParentConsentPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
describe('parent operation boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.auth.user = {
      id: 'student',
      role: 'STUDENT',
      platformRole: 'STANDARD',
    }
    state.organization.platformRole = 'STANDARD'
    state.cap.status = 'ready'
    state.cap.parentPortalEnabled = true
    state.parents.previewConsent.mockResolvedValue(preview)
    state.parents.acceptConsent.mockResolvedValue({})
  })
  it('requires explicit checkbox and submits the exact displayed publication and command', async () => {
    consent()
    await screen.findByText('确认家长')
    const button = screen.getByRole('button', { name: /同意/ })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(button)
    await waitFor(() =>
      expect(state.parents.acceptConsent).toHaveBeenCalledWith(preview),
    )
  })
  it('requires fresh consent when focus refresh replaces the displayed publication', async () => {
    consent()
    await screen.findByText('确认家长')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '同意这份报告' })).toBeEnabled()
    const next = { ...preview, parentName: '刷新后家长', publicationHash: 'a'.repeat(64), commandKey: 'new-exact-command' }
    state.parents.previewConsent.mockResolvedValue(next)
    fireEvent(window, new Event('focus'))
    await screen.findByText('刷新后家长')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: '同意这份报告' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '同意这份报告' }))
    await waitFor(() => expect(state.parents.acceptConsent).toHaveBeenCalledWith(next))
  })
  it('normal parent password change clears session and requires login again', async () => {
    passwordApi.changePassword.mockResolvedValue({ code: 0 })
    render(
      <MemoryRouter initialEntries={['/parent/profile']}>
        <Routes>
          <Route path="/parent/profile" element={<ParentProfile />} />
          <Route path="/parent/login" element={<p>家长重新登录</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('当前密码'), {
      target: { value: 'OldPassword123' },
    })
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'NewPassword456' },
    })
    fireEvent.change(screen.getByLabelText('再次输入新密码'), {
      target: { value: 'NewPassword456' },
    })
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
    await screen.findByText('家长重新登录')
    expect(state.auth.setUser).toHaveBeenCalledWith(null)
  })
  it('late password response after leaving cannot clear a newer session', async () => {
    let resolve: (v: { code: number }) => void = () => {}
    passwordApi.changePassword.mockImplementationOnce(
      () =>
        new Promise<{ code: number }>((r) => {
          resolve = r
        }),
    )
    const { unmount } = render(
      <MemoryRouter>
        <ParentProfile />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('当前密码'), {
      target: { value: 'OldPassword123' },
    })
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'NewPassword456' },
    })
    fireEvent.change(screen.getByLabelText('再次输入新密码'), {
      target: { value: 'NewPassword456' },
    })
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
    unmount()
    await act(async () => resolve({ code: 0 }))
    expect(state.auth.setUser).not.toHaveBeenCalled()
  })
  it('closed entry never loads report contents', () => {
    state.cap.parentPortalEnabled = false
    consent()
    expect(screen.getByText('家长入口尚未开放')).toBeTruthy()
    expect(state.parents.previewConsent).not.toHaveBeenCalled()
  })
  it('legacy administrator cannot load parent account directory', () => {
    state.auth.user = { id: 'legacy', role: 'ADMIN', platformRole: 'STANDARD' }
    render(
      <MemoryRouter>
        <ParentAccountsPage />
      </MemoryRouter>,
    )
    expect(state.accounts.list).not.toHaveBeenCalled()
    expect(screen.getByText(/平台管理员权限/)).toBeTruthy()
  })
  it('refuses staff audience or malformed blocks without rendering report contents', () => {
    const { rerender } = render(
      <ParentReportView
        report={{ ...preview.projection, audience: 'STAFF' } as any}
      />,
    )
    expect(screen.queryByText('本次可披露内容')).toBeNull()
    rerender(
      <ParentReportView
        report={{ ...preview.projection, blocks: null } as any}
      />,
    )
    expect(screen.getByText('报告格式暂不支持')).toBeTruthy()
  })
})

it('lets a parent withdraw the exact displayed report after confirmation while keeping the relationship', async () => {
  vi.clearAllMocks()
  state.cap.status = 'ready'
  state.cap.parentPortalEnabled = true
  state.auth.user = { id: 'parent', role: 'PARENT', platformRole: 'STANDARD' }
  state.parents.report.mockResolvedValue({
    ...preview.projection,
    schemaVersion: 1,
    artifactId: 'exact-artifact',
    relationshipId: 'exact-link',
    mode: 'COMPLETION_ONLY',
    canRevoke: true,
  })
  state.parents.withdraw.mockResolvedValue({ revoked: true })
  render(
    <MemoryRouter
      initialEntries={['/parent/children/child/reports/exact-artifact']}
    >
      <Routes>
        <Route
          path="/parent/children/:childId/reports/:artifactId"
          element={<ParentChildReportPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('家长专用摘要')
  fireEvent.click(screen.getByRole('button', { name: '停止查看本份报告' }))
  expect(state.parents.withdraw).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认停止查看' }))
  await waitFor(() =>
    expect(state.parents.withdraw).toHaveBeenCalledWith(
      'exact-link',
      'exact-artifact',
    ),
  )
  expect(await screen.findByText('本份报告授权已撤回')).toBeInTheDocument()
  expect(screen.queryByText('家长专用摘要')).toBeNull()
})
