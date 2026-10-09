import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), csrf: vi.fn(), logout: vi.fn() }))
vi.mock('../api/auth', () => ({ authApi: mocks }))
vi.mock('../training/context', () => ({ isTrainingHost: () => true }))
import { AuthProvider } from '../contexts/AuthContext'
import StudentLogin from './StudentLogin'

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mocks.me.mockResolvedValue({ code: -1, data: null })
  mocks.csrf.mockResolvedValue({ code: 0, data: { csrfToken: 'test' } })
})
function renderLogin() {
  render(<MemoryRouter initialEntries={['/student/login']}><AuthProvider><Routes>
    <Route path="/student/login" element={<StudentLogin />} />
    <Route path="/student" element={<h1>学员课程页面</h1>} />
    <Route path="/dashboard" element={<h1>培训师管理页面</h1>} />
  </Routes></AuthProvider></MemoryRouter>)
}
async function submit(username: string) {
  await screen.findByRole('heading', { name: '学员登录' })
  fireEvent.change(screen.getByRole('textbox', { name: '用户名' }), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('密码', { exact: true }), { target: { value: 'test-password-1' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
}
describe('learner login entrance', () => {
  it('stays on the learner entrance when the server rejects the account role', async () => {
    mocks.login.mockRejectedValue({ status: 403, message: '此账号不是学员账号，请使用对应身份的登录入口。' })
    renderLogin()
    await submit('trainer-test')
    expect(await screen.findByRole('alert')).toHaveTextContent('此账号不是学员账号')
    expect(mocks.login).toHaveBeenCalledWith({ username: 'trainer-test', password: 'test-password-1', expectedRole: 'STUDENT' })
    expect(screen.getByRole('heading', { name: '学员登录' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '培训师管理页面' })).not.toBeInTheDocument()
  })
  it('continues to learner courses after a valid learner login', async () => {
    mocks.login.mockResolvedValue({ code: 0, data: { user: { id: 'learner-test', username: 'learner-test', role: 'STUDENT' } } })
    renderLogin()
    await submit('learner-test')
    expect(await screen.findByRole('heading', { name: '学员课程页面' })).toBeInTheDocument()
  })
})
