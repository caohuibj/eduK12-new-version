import { act, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  preview: vi.fn(),
  accept: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../../../api/organizationInvitations', () => ({
  organizationInvitationsApi: mock,
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'student' } }),
}))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ refresh: mock.refresh }),
}))
import OrganizationInvitationPage from '../OrganizationInvitationPage'
beforeEach(() => {
  vi.clearAllMocks()
  mock.preview.mockResolvedValue({
    organization: { id: 'invited', name: '邀请组织' },
    persona: 'STUDENT',
    alreadyMember: false,
  })
  mock.refresh.mockResolvedValue(undefined)
})
function page() {
  render(
    <MemoryRouter initialEntries={['/join']}>
      <Link to="/elsewhere">离开邀请</Link>
      <Routes>
        <Route path="/join" element={<OrganizationInvitationPage />} />
        <Route path="/elsewhere" element={<p>其他页面</p>} />
        <Route path="/organizations/:id" element={<p>加入后的组织</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
async function accept() {
  fireEvent.change(screen.getByRole('textbox', { name: '组织成员邀请码' }), {
    target: { value: 'abcdefghijklmnopqrstuvwx' },
  })
  fireEvent.click(screen.getByRole('button', { name: '核对邀请' }))
  await screen.findByText('邀请组织')
  fireEvent.click(screen.getByRole('button', { name: '确认加入这个组织' }))
}
it('does not refresh or redirect when acceptance resolves after departure', async () => {
  let finish!: (value: unknown) => void
  mock.accept.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  page()
  await accept()
  fireEvent.click(screen.getByText('离开邀请'))
  await act(async () =>
    finish({ organizationId: 'invited', membershipId: 'membership' }),
  )
  expect(screen.getByText('其他页面')).toBeInTheDocument()
  expect(mock.refresh).not.toHaveBeenCalled()
})
it('refreshes access and enters the accepted organization while still on the page', async () => {
  mock.accept.mockResolvedValue({
    organizationId: 'invited',
    membershipId: 'membership',
  })
  page()
  await accept()
  expect(await screen.findByText('加入后的组织')).toBeInTheDocument()
  expect(mock.refresh).toHaveBeenCalledOnce()
})
