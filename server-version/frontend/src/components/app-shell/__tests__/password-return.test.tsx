import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import FirstLoginPasswordChange from '../../../pages/FirstLoginPasswordChange'
const mocks = vi.hoisted(() => ({
  remember: vi.fn(),
  setUser: vi.fn(),
  change: vi.fn(),
  csrf: vi.fn(),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 's1', role: 'STUDENT' },
    prepareReauthentication: mocks.remember,
    setUser: mocks.setUser,
    logout: vi.fn(),
  }),
}))
vi.mock('../../../api/auth', () => ({
  authApi: { csrf: mocks.csrf, changePassword: mocks.change },
}))
function Destination() {
  const location = useLocation()
  return (
    <output>
      {location.pathname}
      {location.search}
    </output>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.csrf.mockResolvedValue({ code: 0 })
  mocks.change.mockResolvedValue({ code: 0 })
})
afterEach(() => vi.unstubAllGlobals())
it('preserves the complete attempt URL through forced password change and reauthentication', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
  )
  const target = '/student/scales/1?attempt=a#answer'
  render(
    <MemoryRouter initialEntries={[target]}>
      <Routes>
        <Route
          path="/student/scales/:id"
          element={<FirstLoginPasswordChange />}
        />
        <Route path="/student/login" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  )
  await userEvent.type(screen.getByLabelText('临时密码'), 'OldPassword123')
  await userEvent.type(
    screen.getByLabelText('新密码', { exact: true }),
    'NewPassword456',
  )
  await userEvent.type(screen.getByLabelText('确认新密码'), 'NewPassword456')
  await userEvent.click(
    screen.getByRole('button', { name: '修改密码并重新登录' }),
  )
  await waitFor(() => expect(mocks.remember).toHaveBeenCalledWith(target))
  expect(mocks.change).toHaveBeenCalledWith('OldPassword123', 'NewPassword456')
  expect(mocks.setUser).toHaveBeenCalledWith(null)
  expect(screen.getByRole('status')).toHaveTextContent(
    `/student/login?returnTo=${encodeURIComponent(target)}`,
  )
})

function pendingChange() {
  const rendered = render(
    <MemoryRouter>
      <FirstLoginPasswordChange />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('临时密码'), {
    target: { value: 'OldPassword123' },
  })
  fireEvent.change(screen.getByLabelText('新密码', { exact: true }), {
    target: { value: 'NewPassword456' },
  })
  fireEvent.change(screen.getByLabelText('确认新密码'), {
    target: { value: 'NewPassword456' },
  })
  fireEvent.click(screen.getByRole('button', { name: '修改密码并重新登录' }))
  return rendered
}

it('does not clear or redirect the new account when an old password response arrives after leaving', async () => {
  let resolve: (response: { code: number }) => void = () => {}
  mocks.change.mockReturnValueOnce(
    new Promise<{ code: number }>((r) => {
      resolve = r
    }),
  )
  const view = pendingChange()
  await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1))
  view.unmount()
  await act(async () => resolve({ code: 0 }))
  expect(mocks.setUser).not.toHaveBeenCalled()
  expect(mocks.remember).not.toHaveBeenCalled()
})

it('does not issue a password mutation after the old account leaves while CSRF is loading', async () => {
  let resolve: (response: { code: number }) => void = () => {}
  mocks.csrf.mockReturnValueOnce(
    new Promise<{ code: number }>((r) => {
      resolve = r
    }),
  )
  const view = pendingChange()
  view.unmount()
  await act(async () => resolve({ code: 0 }))
  expect(mocks.change).not.toHaveBeenCalled()
  expect(mocks.setUser).not.toHaveBeenCalled()
})
